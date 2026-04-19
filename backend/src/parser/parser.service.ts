import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface ParsedReminder {
  title: string;
  scheduledAt?: string;       // ISO 8601
  recurrence?: string;        // 'none' | 'daily' | 'weekly'
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
      // Dev fallback: return a basic parsed result without AI
      return this.devFallbackParse(text);
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
      throw new BadRequestException('AI parser unavailable');
    }

    const data = await response.json() as any;
    const rawText = data.content?.[0]?.text ?? '';

    try {
      return JSON.parse(rawText) as ParsedReminder;
    } catch {
      throw new BadRequestException('Failed to parse AI response');
    }
  }

  private devFallbackParse(text: string): ParsedReminder {
    // Minimal offline parse for local dev without API key
    return {
      title: text.replace(/^remind me (to )?/i, '').trim(),
      scheduledAt: null,
      recurrence: 'none',
      category: 'personal',
      notes: null,
    };
  }
}
