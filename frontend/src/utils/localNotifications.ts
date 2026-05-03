import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

const CHANNEL = 'reminders_v6';
const NUDGE_DELAYS_MIN = [10, 20, 30];
// Only schedule nudges for reminders firing within this window.
// Reminders further out get nudges scheduled on the next foreground sync.
const NUDGE_WINDOW_MS = 48 * 60 * 60 * 1000;

function notifId(reminderId: string) {
  return `reminder_${reminderId}`;
}

function nudgeId(reminderId: string, attempt: number) {
  return `reminder_${reminderId}_nudge_${attempt}`;
}

function baseContent(reminderId: string) {
  return {
    sound: true,
    data: { reminderId },
    ...(Platform.OS === 'android' && { channelId: CHANNEL, sticky: true }),
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

  const base = baseContent(reminder.id);
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

  const now = new Date();
  const promises: Promise<string>[] = [];

  for (const r of reminders) {
    if (!r.scheduledAt || (r.status && r.status !== 'active')) continue;
    const fireAt = new Date(r.scheduledAt);
    if (fireAt <= now) continue;

    const base = baseContent(r.id);

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
