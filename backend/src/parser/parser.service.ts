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
      return this.regexParse(text, userTimezone);
    }

    const localNow = new Date().toLocaleString('en-US', { timeZone: userTimezone });
    const prompt = `You are a reminder parsing assistant. Parse the user's reminder request into structured JSON.

User timezone: ${userTimezone}
Current UTC time: ${new Date().toISOString()}
Current local time for user: ${localNow}
User input: "${text}"

Return ONLY valid JSON (no markdown, no explanation) in this shape:
{
  "title": "short action title",
  "scheduledAt": "ISO8601 datetime in UTC or null",
  "recurrence": "none|daily|weekly|custom",
  "recurrenceConfig": { "durationDays": number } or null,
  "category": "work|personal|health|other",
  "notes": "any extra details or null"
}

Rules:
- Convert all times to UTC before returning scheduledAt
- "after dinner" → 20:00 local time → convert to UTC
- "morning" → 08:00 local time → convert to UTC
- "in X minutes/hours" or "X minutes/hours from now" → current UTC + X
- "from X minutes from now" → current UTC + X
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
      console.warn('[Parser] Anthropic API failed, using regex fallback');
      return this.regexParse(text, userTimezone);
    }

    const data = await response.json() as any;
    const rawText = data.content?.[0]?.text ?? '';

    try {
      return JSON.parse(rawText) as ParsedReminder;
    } catch {
      return this.regexParse(text, userTimezone);
    }
  }

  /**
   * Returns how many minutes the timezone is ahead of UTC.
   * Uses sv-SE locale which gives "YYYY-MM-DD HH:MM:SS" — unambiguously parseable.
   * IST (+5:30) → +330, EST (-5) → -300
   */
  private getTzOffsetMs(timezone: string): number {
    const ref = new Date();
    const toMs = (s: string) => new Date(s + 'Z').getTime();
    const tzMs  = toMs(ref.toLocaleString('sv-SE', { timeZone: timezone }).replace(' ', 'T'));
    const utcMs = toMs(ref.toLocaleString('sv-SE', { timeZone: 'UTC' }).replace(' ', 'T'));
    return tzMs - utcMs; // positive → ahead of UTC
  }

  /**
   * Given a local date string "YYYY-MM-DD" (in the user's timezone) and an hour/minute,
   * returns the corresponding UTC ISO string.
   */
  private localToUTC(localDate: string, hour: number, minute: number, offsetMs: number): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    // Treat localDate + time as UTC, then subtract the offset to get real UTC
    const fakeUTC = new Date(`${localDate}T${pad(hour)}:${pad(minute)}:00.000Z`);
    return new Date(fakeUTC.getTime() - offsetMs).toISOString();
  }

  private regexParse(text: string, userTimezone = 'UTC'): ParsedReminder {
    const lower = text.toLowerCase();

    // Offset of user's timezone from UTC, in milliseconds
    const offsetMs = this.getTzOffsetMs(userTimezone);

    // Current date string in user's local timezone "YYYY-MM-DD"
    const nowInTz = new Date(Date.now() + offsetMs);
    const localDateStr = nowInTz.toISOString().slice(0, 10);   // "2026-04-19"
    const localDayOfWeek = nowInTz.getUTCDay();                // 0=Sun…6=Sat (local weekday)

    // ── Relative time ("in 5 minutes", "5 mins from now", "in an hour") ──
    // Match these first so we can also strip them from the title below
    const inMinMatch      = lower.match(/\bin\s+(\d+)\s*min(?:s|utes?)?\b/);
    const inHrMatch       = lower.match(/\bin\s+(\d+)\s*hours?\b/);
    const inAnHr          = /\bin\s+(?:a|an)\s+hour\b/.test(lower);
    const inHalfHr        = /\bin\s+half\s+an?\s+hour\b/.test(lower);
    const fromNowMinMatch = lower.match(/(?:from\s+)?(\d+)\s*min(?:s|utes?)?\s+from\s+now\b/);
    const fromNowHrMatch  = lower.match(/(?:from\s+)?(\d+)\s*hours?\s+from\s+now\b/);

    // ── Clean title ──────────────────────────────────────────────────────
    const title = text
      .replace(/^(remind me (to )?|set (a )?reminder (to )?)/i, '')
      .replace(/\bin\s+(?:a|an)\s+hour\b/gi, '')
      .replace(/\bin\s+half\s+an?\s+hour\b/gi, '')
      .replace(/\bin\s+\d+\s*(?:min(?:s|utes?)?|hours?)\b/gi, '')
      .replace(/(?:from\s+)?\d+\s*min(?:s|utes?)?\s+from\s+now\b/gi, '')
      .replace(/(?:from\s+)?\d+\s*hours?\s+from\s+now\b/gi, '')
      .replace(/\bfrom\s+now\b/gi, '')
      .replace(/\bevery\s+(?:day|daily|week|weekly|morning|evening|night|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi, '')
      .replace(/\bevery\b/gi, '')
      .replace(/\b(today|tomorrow|tonight)\b/gi, '')
      .replace(/\bat\s+\d{1,2}(?::\d{2}|\d{2})?\s*(?:am|pm)?\b/gi, '')
      .replace(/\bafter\s+(?:dinner|lunch|breakfast)\b/gi, '')
      .replace(/\b(?:in the\s+)?(?:morning|evening|afternoon|night)\b/gi, '')
      .replace(/\bfor\s+\d+\s+days?\b/gi, '')
      .replace(/\bfrom today\b/gi, '')
      .replace(/\bnext\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi, '')
      .trim()
      .replace(/\s+/g, ' ');

    if (inMinMatch || inHrMatch || inAnHr || inHalfHr || fromNowMinMatch || fromNowHrMatch) {
      let addMs = 0;
      if (fromNowMinMatch)    addMs = parseInt(fromNowMinMatch[1]) * 60_000;
      else if (fromNowHrMatch) addMs = parseInt(fromNowHrMatch[1]) * 3_600_000;
      else if (inMinMatch)    addMs = parseInt(inMinMatch[1]) * 60_000;
      else if (inHrMatch)     addMs = parseInt(inHrMatch[1]) * 3_600_000;
      else if (inAnHr)        addMs = 3_600_000;
      else                    addMs = 1_800_000;

      return {
        title: title || text.trim(),
        scheduledAt: new Date(Date.now() + addMs).toISOString(),
        recurrence: 'none',
        category: this.detectCategory(lower),
      };
    }

    // ── Date offset (tomorrow, next monday…) ─────────────────────────────
    let dateParts = localDateStr.split('-').map(Number); // [year, month, day]
    const localDateObj = new Date(Date.UTC(dateParts[0], dateParts[1] - 1, dateParts[2]));

    if (/\btomorrow\b/.test(lower)) {
      localDateObj.setUTCDate(localDateObj.getUTCDate() + 1);
    }

    const DAY_NAMES = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
    const wdMatch = lower.match(/\b(?:next\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/);
    if (wdMatch) {
      const target = DAY_NAMES.indexOf(wdMatch[1]);
      const ahead = (target - localDayOfWeek + 7) % 7 || 7;
      localDateObj.setUTCDate(localDateObj.getUTCDate() + ahead);
    }

    const workDateStr = localDateObj.toISOString().slice(0, 10); // "YYYY-MM-DD" (local)

    // ── Time ─────────────────────────────────────────────────────────────
    let hour = 9;
    let minute = 0;
    let timeSet = false;

    // Matches: "at 10:45pm", "at 10:45", "at 1045pm", "at 1045", "at 9pm", "at 9 pm"
    const atMatch = lower.match(/\bat\s+(\d{1,2})(?::(\d{2})|(\d{2}))?\s*(am|pm)?\b/);
    if (atMatch) {
      hour   = parseInt(atMatch[1]);
      // Group 2: colon-style "10:45" · Group 3: run-on "1045"
      minute = atMatch[2] ? parseInt(atMatch[2]) : atMatch[3] ? parseInt(atMatch[3]) : 0;
      const period = atMatch[4];
      if (period === 'pm' && hour < 12) hour += 12;
      if (period === 'am' && hour === 12) hour = 0;
      // No explicit am/pm: treat 1–6 as PM (e.g. "at 3" → 3 PM)
      if (!period && hour >= 1 && hour <= 6) hour += 12;
      timeSet = true;
    } else if (/after dinner|evening|tonight/.test(lower)) {
      hour = 20; timeSet = true;
    } else if (/after lunch|afternoon/.test(lower)) {
      hour = 13; timeSet = true;
    } else if (/after breakfast|morning/.test(lower)) {
      hour = 8;  timeSet = true;
    } else if (/\bnight\b/.test(lower)) {
      hour = 21; timeSet = true;
    }

    const hasDateClue = timeSet || /\b(today|tomorrow)\b/.test(lower) || !!wdMatch;
    const scheduledAt = hasDateClue
      ? this.localToUTC(workDateStr, hour, minute, offsetMs)
      : undefined;

    // ── Recurrence ────────────────────────────────────────────────────────
    let recurrence = 'none';
    let recurrenceConfig: object | undefined;

    if (/every\s*day|daily/.test(lower))       recurrence = 'daily';
    else if (/every\s*week|weekly/.test(lower)) recurrence = 'weekly';
    else if (/every\s*(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/.test(lower)) recurrence = 'weekly';

    const durMatch = lower.match(/for\s+(\d+)\s+days?/);
    if (durMatch) {
      recurrenceConfig = { durationDays: parseInt(durMatch[1]) };
      if (recurrence === 'none') recurrence = 'daily';
    }

    return {
      title: title || text.trim(),
      scheduledAt,
      recurrence,
      recurrenceConfig,
      category: this.detectCategory(lower),
    };
  }

  private detectCategory(lower: string): string {
    if (/medicine|doctor|hospital|health|gym|exercise|workout|pill|tablet|run|walk/.test(lower)) return 'health';
    if (/meeting|standup|call|email|work|office|project|deadline|client|interview|report/.test(lower)) return 'work';
    return 'personal';
  }
}
