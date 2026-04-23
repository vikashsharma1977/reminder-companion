import { useEffect, useRef, useCallback } from 'react';
import { Platform } from 'react-native';
import { authApi, tokenStore, remindersApi } from '../api/client';

// Module-level suppression: IDs manually completed by the user (not auto-fired).
// Prevents the polling loop from re-showing the notification modal after the user
// taps Done on the today screen (which updates lastFiredAt on the backend).
const suppressedIds = new Set<string>();
export function suppressFiringReminder(id: string) {
  suppressedIds.add(id);
  setTimeout(() => suppressedIds.delete(id), 3 * 60 * 1000);
}

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'https://reminder-companion-production.up.railway.app/api/v1';

export interface FiredReminder {
  reminderId: string;
  title: string;
  scheduledAt: string | null;
  notes?: string;
}

export function useNotifications(onReminder: (reminder: FiredReminder) => void) {
  const onReminderRef = useRef(onReminder);
  onReminderRef.current = onReminder;

  // ── Web: SSE ───────────────────────────────────────────────────────────────
  const esRef = useRef<any>(null);

  const connect = useCallback(async () => {
    try {
      const token = await tokenStore.getAccess();
      if (!token) return;

      const { data } = await authApi.getSseTicket();
      if (esRef.current) esRef.current.close();

      const es = new EventSource(
        `${BASE_URL}/notifications/stream?ticket=${encodeURIComponent(data.ticket)}`,
      );
      esRef.current = es;

      es.onmessage = (event: MessageEvent) => {
        try {
          const reminder: FiredReminder = JSON.parse(event.data);
          onReminderRef.current(reminder);
        } catch {}
      };

      es.onerror = () => {
        es.close();
        esRef.current = null;
        setTimeout(() => connect(), 5000);
      };
    } catch {
      setTimeout(() => connect(), 5000);
    }
  }, []);

  // ── Mobile: polling every 30 s ─────────────────────────────────────────────
  // EventSource is a browser API — not available in React Native.
  // We poll /reminders/firing (fires within last 90 s) and deduplicate.
  const seenRef = useRef(new Set<string>());

  const poll = useCallback(async () => {
    try {
      const token = await tokenStore.getAccess();
      if (!token) return;
      const { data } = await remindersApi.getFiring();
      for (const r of data) {
        if (suppressedIds.has(r.id)) continue;
        const key = `${r.id}_${r.lastFiredAt}`;
        if (!seenRef.current.has(key)) {
          seenRef.current.add(key);
          onReminderRef.current({
            reminderId: r.id,
            title: r.title,
            scheduledAt: r.scheduledAt ?? null,
            notes: r.notes,
          });
        }
      }
      // Prune seen set to avoid unbounded growth
      if (seenRef.current.size > 200) seenRef.current.clear();
    } catch {}
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web') {
      if (typeof EventSource !== 'undefined') connect();
      return () => {
        esRef.current?.close();
        esRef.current = null;
      };
    } else {
      // Poll immediately, then every 30 s
      poll();
      const id = setInterval(poll, 30_000);
      return () => clearInterval(id);
    }
  }, [connect, poll]);
}
