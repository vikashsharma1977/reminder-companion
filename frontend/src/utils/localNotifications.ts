import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

// The OS fires these even when the app is killed and the phone is locked.
// Identifier is derived from the server reminder ID so we can cancel/update
// without storing a separate mapping.

const CHANNEL = 'reminders_v6';
const NUDGE_DELAYS_MIN = [10, 20, 30];

function notifId(reminderId: string) {
  return `reminder_${reminderId}`;
}

function nudgeId(reminderId: string, attempt: number) {
  return `reminder_${reminderId}_nudge_${attempt}`;
}

export async function scheduleLocalReminder(reminder: {
  id: string;
  title: string;
  scheduledAt: string | null;
  notes?: string | null;
}): Promise<void> {
  if (Platform.OS === 'web' || !reminder.scheduledAt) return;

  const fireAt = new Date(reminder.scheduledAt);
  if (fireAt <= new Date()) return; // already past

  // Cancel any stale notification (main + nudges) before rescheduling
  await cancelLocalReminder(reminder.id);

  const base = {
    sound: true,
    data: { reminderId: reminder.id },
    ...(Platform.OS === 'android' && { channelId: CHANNEL, sticky: true }),
  };

  // Main notification
  await Notifications.scheduleNotificationAsync({
    identifier: notifId(reminder.id),
    content: { title: reminder.title, body: reminder.notes ?? 'Time for your reminder!', ...base },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: fireAt },
  });

  // Nudge notifications at +10, +20, +30 min — only fire if main wasn't acted on
  for (let i = 0; i < NUDGE_DELAYS_MIN.length; i++) {
    const nudgeAt = new Date(fireAt.getTime() + NUDGE_DELAYS_MIN[i] * 60 * 1000);
    await Notifications.scheduleNotificationAsync({
      identifier: nudgeId(reminder.id, i + 1),
      content: { title: `Still pending: ${reminder.title}`, body: 'Tap to snooze or mark done.', ...base },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: nudgeAt },
    });
  }
}

export async function cancelLocalReminder(reminderId: string): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    await Notifications.cancelScheduledNotificationAsync(notifId(reminderId));
  } catch {}
  // Cancel all nudges
  for (let i = 1; i <= NUDGE_DELAYS_MIN.length; i++) {
    Notifications.cancelScheduledNotificationAsync(nudgeId(reminderId, i)).catch(() => {});
  }
}

// Sync all upcoming reminders with the OS scheduler.
// Call this on app foreground so any backend changes (snooze, new reminders)
// are reflected in local notifications.
export async function syncLocalNotifications(reminders: Array<{
  id: string;
  title: string;
  scheduledAt: string | null;
  notes?: string | null;
  status?: string;
}>): Promise<void> {
  if (Platform.OS === 'web') return;

  // Cancel every currently scheduled local notification and rebuild from
  // the authoritative server list. This handles deletions and reschedules.
  await Notifications.cancelAllScheduledNotificationsAsync();

  const now = new Date();
  const base = (reminderId: string) => ({
    sound: true,
    data: { reminderId },
    ...(Platform.OS === 'android' && { channelId: CHANNEL, sticky: true }),
  });

  for (const r of reminders) {
    if (!r.scheduledAt) continue;
    if (r.status && r.status !== 'active') continue;
    const fireAt = new Date(r.scheduledAt);
    if (fireAt <= now) continue;

    await Notifications.scheduleNotificationAsync({
      identifier: notifId(r.id),
      content: { title: r.title, body: r.notes ?? 'Time for your reminder!', ...base(r.id) },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: fireAt },
    });

    // Nudges
    for (let i = 0; i < NUDGE_DELAYS_MIN.length; i++) {
      const nudgeAt = new Date(fireAt.getTime() + NUDGE_DELAYS_MIN[i] * 60 * 1000);
      if (nudgeAt <= now) continue;
      await Notifications.scheduleNotificationAsync({
        identifier: nudgeId(r.id, i + 1),
        content: { title: `Still pending: ${r.title}`, body: 'Tap to snooze or mark done.', ...base(r.id) },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: nudgeAt },
      });
    }
  }
}
