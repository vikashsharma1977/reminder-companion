import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';

export const ALERT_DURATIONS = [2, 4, 6, 8, 10] as const;
const NUDGE_DELAYS_MIN = [10, 20, 30];
const NUDGE_WINDOW_MS = 48 * 60 * 60 * 1000;

export function channelIdForDuration(seconds: number): string {
  return `reminders_dur_${seconds}s`;
}

// Generates a [0, on, off, on, ...] pattern that vibrates for ~seconds total.
export function vibPatternForDuration(seconds: number): number[] {
  const pattern: number[] = [0];
  const pulses = Math.round((seconds * 1000) / 750); // 600ms on + 150ms off
  for (let i = 0; i < pulses; i++) {
    pattern.push(600);
    if (i < pulses - 1) pattern.push(150);
  }
  return pattern;
}

// Reads alertDuration from persisted prefs and returns the matching channel ID.
export async function getActiveChannelId(): Promise<string> {
  try {
    const raw = await AsyncStorage.getItem('alert_prefs');
    const dur: number = raw ? (JSON.parse(raw).alertDuration ?? 4) : 4;
    return channelIdForDuration(dur);
  } catch {
    return channelIdForDuration(4);
  }
}

function notifId(reminderId: string) {
  return `reminder_${reminderId}`;
}

function nudgeId(reminderId: string, attempt: number) {
  return `reminder_${reminderId}_nudge_${attempt}`;
}

function baseContent(reminderId: string, channelId: string) {
  return {
    sound: true,
    data: { reminderId },
    ...(Platform.OS === 'android' && { channelId, sticky: true }),
  };
}

export async function scheduleLocalReminder(reminder: {
  id: string;
  title: string;
  scheduledAt: string | null;
  notes?: string | null;
}): Promise<void> {
  if (Platform.OS === 'web' || !reminder.scheduledAt) return;

  const fireAt = new Date(reminder.scheduledAt);
  const now = new Date();
  if (fireAt <= now) return;

  await cancelLocalReminder(reminder.id);

  const channelId = await getActiveChannelId();
  const base = baseContent(reminder.id, channelId);
  const promises: Promise<string>[] = [
    Notifications.scheduleNotificationAsync({
      identifier: notifId(reminder.id),
      content: { title: reminder.title, body: reminder.notes ?? 'Time for your reminder!', ...base },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: fireAt },
    }),
  ];

  if (fireAt.getTime() - now.getTime() <= NUDGE_WINDOW_MS) {
    for (let i = 0; i < NUDGE_DELAYS_MIN.length; i++) {
      promises.push(
        Notifications.scheduleNotificationAsync({
          identifier: nudgeId(reminder.id, i + 1),
          content: { title: `Still pending: ${reminder.title}`, body: 'Tap to snooze or mark done.', ...base },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: new Date(fireAt.getTime() + NUDGE_DELAYS_MIN[i] * 60 * 1000),
          },
        }),
      );
    }
  }

  await Promise.all(promises);
}

export async function cancelLocalReminder(reminderId: string): Promise<void> {
  if (Platform.OS === 'web') return;
  await Promise.all([
    Notifications.cancelScheduledNotificationAsync(notifId(reminderId)).catch(() => {}),
    ...NUDGE_DELAYS_MIN.map((_, i) =>
      Notifications.cancelScheduledNotificationAsync(nudgeId(reminderId, i + 1)).catch(() => {}),
    ),
  ]);
}

export async function syncLocalNotifications(reminders: Array<{
  id: string;
  title: string;
  scheduledAt: string | null;
  notes?: string | null;
  status?: string;
}>): Promise<void> {
  if (Platform.OS === 'web') return;

  await Notifications.cancelAllScheduledNotificationsAsync();

  const channelId = await getActiveChannelId();
  const now = new Date();
  const promises: Promise<string>[] = [];

  for (const r of reminders) {
    if (!r.scheduledAt || (r.status && r.status !== 'active')) continue;
    const fireAt = new Date(r.scheduledAt);
    if (fireAt <= now) continue;

    const base = baseContent(r.id, channelId);

    promises.push(
      Notifications.scheduleNotificationAsync({
        identifier: notifId(r.id),
        content: { title: r.title, body: r.notes ?? 'Time for your reminder!', ...base },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: fireAt },
      }),
    );

    if (fireAt.getTime() - now.getTime() <= NUDGE_WINDOW_MS) {
      for (let i = 0; i < NUDGE_DELAYS_MIN.length; i++) {
        const nudgeAt = new Date(fireAt.getTime() + NUDGE_DELAYS_MIN[i] * 60 * 1000);
        if (nudgeAt <= now) continue;
        promises.push(
          Notifications.scheduleNotificationAsync({
            identifier: nudgeId(r.id, i + 1),
            content: { title: `Still pending: ${r.title}`, body: 'Tap to snooze or mark done.', ...base },
            trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: nudgeAt },
          }),
        );
      }
    }
  }

  await Promise.all(promises);
}
