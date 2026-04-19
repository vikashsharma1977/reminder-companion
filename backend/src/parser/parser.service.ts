import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface ParsedReminder {
  title: string;
  scheduledAt?: string;
  recurrence?: string;
  recurrenceConfig?: object;
  category?: string;
  notes?: string;
}

@Injectable()
export class ParserService {
  constructor(private readonly config: ConfigService) {}

  async parseNaturalLanguage(text: string, userTimezone = 'UTC'): Promise<ParsedReminder> {
    const apiKey = this.config.get<string>('ANTHROPIC_API_KEY');

    if (!apiKey) {
      return this.regexParse(text);
    }

    const prompt = `You are a reminder parsing assistant. Parse the user's reminder request into structured JSON.

User timezone: ${userTimezone}
Current UTC time: ${new Date().toISOString()}
User input: "${text}"

Return ONLY valid JSON (no markdown, no explanation) in this shape:
{
  "title": "short action title",
  "scheduledAt": "ISO8601 datetime or null",
  "recurrence": "none|daily|weekly|custom",
  "recurrenceConfig": { "durationDays": number } or null,
  "category": "work|personal|health|other",
  "notes": "any extra details or null"
}

Rules:
- "after dinner" → 20:00 local time
- "morning" → 08:00 local time
- "tonight" → 20:00 local time
- For recurrence, set durationDays if mentioned ("for 5 days")`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 512,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      // API key invalid / no credits — fall back to regex parser
      console.warn('[Parser] Anthropic API failed, using regex fallback');
      return this.regexParse(text);
    }

    const data = await response.json() as any;
    const rawText = data.content?.[0]?.text ?? '';

    try {
      return JSON.parse(rawText) as ParsedReminder;
    } catch {
      return this.regexParse(text);
    }
  }

  // Regex-based offline parser — covers the most common natural language patterns
  private regexParse(text: string): ParsedReminder {
    const lower = text.toLowerCase();
    const now = new Date();

    // ── Clean title ───────────────────────────────────────────
    let title = text
      .replace(/^remind me (to )?/i, '')
      .replace(/\b(every (day|daily|monday|tuesday|wednesday|thursday|friday|saturday|sunday))\b/gi, '')
      .replace(/\b(today|tomorrow|tonight)\b/gi, '')
      .replace(/\bat\s+\d{1,2}(:\d{2})?\s*(am|pm)?\b/gi, '')
      .replace(/\bafter (dinner|lunch|breakfast)\b/gi, '')
      .replace(/\b(in the )?(morning|evening|afternoon|night)\b/gi, '')
      .replace(/\bfor \d+ days?\b/gi, '')
      .replace(/\bfrom today\b/gi, '')
      .trim()
      .replace(/\s+/g, ' ');

    // ── Detect date ───────────────────────────────────────────
    const date = new Date(now);
    if (/\btomorrow\b/.test(lower)) {
      date.setDate(date.getDate() + 1);
    }
    // "next monday" style
    const dayNames = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
    const nextDayMatch = lower.match(/\b(next\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/);
    if (nextDayMatch) {
      const targetDay = dayNames.indexOf(nextDayMatch[2]);
      const daysAhead = (targetDay - date.getDay() + 7) % 7 || 7;
      date.setDate(date.getDate() + daysAhead);
    }

    // ── Detect time ───────────────────────────────────────────
    let hour = 9; // default morning
    let minute = 0;
    let timeSet = false;

    const timeMatch = lower.match(/\bat\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/);
    if (timeMatch) {
      hour = parseInt(timeMatch[1]);
      minute = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
      const period = timeMatch[3];
      if (period === 'pm' && hour < 12) hour += 12;
      if (period === 'am' && hour === 12) hour = 0;
      timeSet = true;
    } else if (/after dinner|evening|tonight/.test(lower)) {
      hour = 20; timeSet = true;
    } else if (/after lunch|afternoon/.test(lower)) {
      hour = 13; timeSet = true;
    } else if (/after breakfast|morning/.test(lower)) {
      hour = 8; timeSet = true;
    } else if (/\bnight\b/.test(lower)) {
      hour = 21; timeSet = true;
    }

    if (timeSet || /today|tomorrow|next/.test(lower) || nextDayMatch) {
      date.setHours(hour, minute, 0, 0);
    }

    const scheduledAt = timeSet || /today|tomorrow/.test(lower) || nextDayMatch
      ? date.toISOString()
      : undefined;

    // ── Detect recurrence ─────────────────────────────────────
    let recurrence = 'none';
    let recurrenceConfig: object | undefined;

    if (/every day|daily/.test(lower)) {
      recurrence = 'daily';
    } else if (/every week|weekly/.test(lower)) {
      recurrence = 'weekly';
    } else if (/every (monday|tuesday|wednesday|thursday|friday|saturday|sunday)/.test(lower)) {
      recurrence = 'weekly';
    }

    const durationMatch = lower.match(/for (\d+) days?/);
    if (durationMatch) {
      recurrenceConfig = { durationDays: parseInt(durationMatch[1]) };
      if (recurrence === 'none') recurrence = 'daily';
    }

    // ── Detect category ───────────────────────────────────────
    let category = 'personal';
    if (/medicine|doctor|hospital|health|gym|exercise|workout|pill|tablet/.test(lower)) {
      category = 'health';
    } else if (/meeting|standup|call|email|work|office|project|deadline|client/.test(lower)) {
      category = 'work';
    }

    return {
      title: title || text.trim(),
      scheduledAt,
      recurrence,
      recurrenceConfig,
      category,
    };
  }
}
