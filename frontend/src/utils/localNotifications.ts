import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import notifee, {
  AndroidImportance,
  AndroidVisibility,
  TriggerType,
  AndroidCategory,
} from '@notifee/react-native';

export const ALERT_DURATIONS = [2, 4, 6, 8, 10] as const;
const NUDGE_DELAYS_MIN = [10, 20, 30];
const NUDGE_WINDOW_MS = 48 * 60 * 60 * 1000;

export function channelIdForDuration(seconds: number): string {
  return `reminders_dur_${seconds}s`;
}

export function vibPatternForDuration(seconds: number): number[] {
  // [0, on, off, on, ...] pattern totalling ~seconds of vibration
  const pattern: number[] = [0];
  const pulses = Math.round((seconds * 1000) / 750);
  for (let i = 0; i < pulses; i++) {
    pattern.push(600);
    if (i < pulses - 1) pattern.push(150);
  }
  return pattern;
}

export async function getActiveChannelId(): Promise<string> {
  try {
    const raw = await AsyncStorage.getItem('alert_prefs');
    const dur: number = raw ? (JSON.parse(raw).alertDuration ?? 4) : 4;
    return channelIdForDuration(dur);
  } catch {
    return channelIdForDuration(4);
  }
}

// Creates one notifee channel per alert duration. Notifee bypasses OEM channel
// restrictions by using VibrationEffect directly — unlike expo-notifications
// channels which Samsung/MIUI override with a single default pulse.
export async function setupNotifeeChannels(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Promise.all(
    ALERT_DURATIONS.map(dur =>
      notifee.createChannel({
        id: channelIdForDuration(dur),
        name: `Reminders (${dur}s)`,
        importance: AndroidImportance.HIGH,
        sound: 'chime',
        vibration: true,
        vibrationPattern: vibPatternForDuration(dur),
        visibility: AndroidVisibility.PUBLIC,
      }),
    ),
  );
}

function notifId(reminderId: string) {
  return `reminder_${reminderId}`;
}

function nudgeId(reminderId: string, attempt: number) {
  return `reminder_${reminderId}_nudge_${attempt}`;
}

function buildAndroidContent(reminderId: string, channelId: string, isNudge = false) {
  return {
    channelId,
    importance: AndroidImportance.HIGH,
    visibility: AndroidVisibility.PUBLIC,
    category: AndroidCategory.ALARM,
    // fullScreenAction: wakes the screen and shows the app on top of the lock
    // screen — this is what makes the JS modal (with its full Vibration.vibrate
    // call) run on a locked phone instead of the OEM's 1s default vibration.
    fullScreenAction: { id: 'default' },
    pressAction: { id: 'default' },
    ongoing: true,
    asForegroundService: false,
    ...(isNudge ? {} : {}),
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
  const androidContent = buildAndroidContent(reminder.id, channelId);

  const promises: Promise<string>[] = [
    notifee.createTriggerNotification(
      {
        id: notifId(reminder.id),
        title: reminder.title,
        body: reminder.notes ?? 'Time for your reminder!',
        data: { reminderId: reminder.id },
        android: androidContent,
      },
      {
        type: TriggerType.TIMESTAMP,
        timestamp: fireAt.getTime(),
        alarmManager: { allowWhileIdle: true },
      },
    ),
  ];

  if (fireAt.getTime() - now.getTime() <= NUDGE_WINDOW_MS) {
    for (let i = 0; i < NUDGE_DELAYS_MIN.length; i++) {
      const nudgeAt = new Date(fireAt.getTime() + NUDGE_DELAYS_MIN[i] * 60 * 1000);
      promises.push(
        notifee.createTriggerNotification(
          {
            id: nudgeId(reminder.id, i + 1),
            title: `Still pending: ${reminder.title}`,
            body: 'Tap to snooze or mark done.',
            data: { reminderId: reminder.id },
            android: buildAndroidContent(reminder.id, channelId, true),
          },
          {
            type: TriggerType.TIMESTAMP,
            timestamp: nudgeAt.getTime(),
            alarmManager: { allowWhileIdle: true },
          },
        ),
      );
    }
  }

  await Promise.all(promises);
}

export async function cancelLocalReminder(reminderId: string): Promise<void> {
  if (Platform.OS === 'web') return;
  await Promise.all([
    notifee.cancelNotification(notifId(reminderId)).catch(() => {}),
    ...NUDGE_DELAYS_MIN.map((_, i) =>
      notifee.cancelNotification(nudgeId(reminderId, i + 1)).catch(() => {}),
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

  await notifee.cancelAllNotifications();

  const channelId = await getActiveChannelId();
  const now = new Date();
  const promises: Promise<string>[] = [];

  for (const r of reminders) {
    if (!r.scheduledAt || (r.status && r.status !== 'active')) continue;
    const fireAt = new Date(r.scheduledAt);
    if (fireAt <= now) continue;

    promises.push(
      notifee.createTriggerNotification(
        {
          id: notifId(r.id),
          title: r.title,
          body: r.notes ?? 'Time for your reminder!',
          data: { reminderId: r.id },
          android: buildAndroidContent(r.id, channelId),
        },
        {
          type: TriggerType.TIMESTAMP,
          timestamp: fireAt.getTime(),
          alarmManager: { allowWhileIdle: true },
        },
      ),
    );

    if (fireAt.getTime() - now.getTime() <= NUDGE_WINDOW_MS) {
      for (let i = 0; i < NUDGE_DELAYS_MIN.length; i++) {
        const nudgeAt = new Date(fireAt.getTime() + NUDGE_DELAYS_MIN[i] * 60 * 1000);
        if (nudgeAt <= now) continue;
        promises.push(
          notifee.createTriggerNotification(
            {
              id: nudgeId(r.id, i + 1),
              title: `Still pending: ${r.title}`,
              body: 'Tap to snooze or mark done.',
              data: { reminderId: r.id },
              android: buildAndroidContent(r.id, channelId, true),
            },
            {
              type: TriggerType.TIMESTAMP,
              timestamp: nudgeAt.getTime(),
              alarmManager: { allowWhileIdle: true },
            },
          ),
        );
      }
    }
  }

  await Promise.all(promises);
}
