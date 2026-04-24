import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

// The OS fires these even when the app is killed and the phone is locked.
// Identifier is derived from the server reminder ID so we can cancel/update
// without storing a separate mapping.

function notifId(reminderId: string) {
  return `reminder_${reminderId}`;
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

  // Cancel any stale notification for this reminder before rescheduling
  await cancelLocalReminder(reminder.id);

  await Notifications.scheduleNotificationAsync({
    identifier: notifId(reminder.id),
    content: {
      title: reminder.title,
      body: reminder.notes ?? 'Time for your reminder!',
      sound: true,
      data: { reminderId: reminder.id },
      // Must reference the high-importance channel so Android shows heads-up banners
      // over other apps. Without this it falls back to the default low-importance channel.
      ...(Platform.OS === 'android' && { channelId: 'reminders' }),
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: fireAt,
    },
  });
}

export async function cancelLocalReminder(reminderId: string): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    await Notifications.cancelScheduledNotificationAsync(notifId(reminderId));
  } catch {}
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
  // the authoritative server list.  This handles deletions and reschedules.
  await Notifications.cancelAllScheduledNotificationsAsync();

  const now = new Date();
  for (const r of reminders) {
    if (!r.scheduledAt) continue;
    if (r.status && r.status !== 'active') continue;
    const fireAt = new Date(r.scheduledAt);
    if (fireAt <= now) continue;

    await Notifications.scheduleNotificationAsync({
      identifier: notifId(r.id),
      content: {
        title: r.title,
        body: r.notes ?? 'Time for your reminder!',
        sound: true,
        data: { reminderId: r.id },
        ...(Platform.OS === 'android' && { channelId: 'reminders' }),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: fireAt,
      },
    });
  }
}
