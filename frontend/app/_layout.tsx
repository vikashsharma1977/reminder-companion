import { Stack } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { useState, useEffect } from 'react';
import { View, Platform, AppState, Alert } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import * as IntentLauncher from 'expo-intent-launcher';
import notifee, { EventType } from '@notifee/react-native';
import { useNotifications, FiredReminder } from '../src/hooks/useNotifications';
import { NotificationModal } from '../src/components/NotificationModal';
import { notificationsApi, tokenStore, remindersApi } from '../src/api/client';
import { syncLocalNotifications, setupNotifeeChannels } from '../src/utils/localNotifications';

// Suppress expo-notifications presentation in foreground — notifee handles all
// local notifications now. This handler only affects any residual server pushes.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: false,
    shouldPlaySound: false,
    shouldSetBadge: true,
    shouldShowBanner: false,
    shouldShowList: false,
  }),
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 2, staleTime: 1000 * 60 },
  },
});

function reminderFromNotifee(notification: any): FiredReminder | null {
  const reminderId = notification?.data?.reminderId;
  if (!reminderId) return null;
  return {
    reminderId: String(reminderId),
    title: notification.title ?? '',
    scheduledAt: null,
    notes: typeof notification.body === 'string' &&
           notification.body !== 'Time for your reminder!'
           ? notification.body : undefined,
  };
}

function AppShell() {
  const [activeReminder, setActiveReminder] = useState<FiredReminder | null>(null);

  // Web: request browser notification permission
  useEffect(() => {
    if (Platform.OS === 'web' && typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  // Native setup: notifee channels, permissions, push token, foreground sync
  useEffect(() => {
    if (Platform.OS === 'web') return;
    (async () => {
      try {
        // Create one notifee channel per alert duration option.
        // Notifee uses VibrationEffect directly and bypasses OEM channel overrides.
        if (Platform.OS === 'android') {
          await setupNotifeeChannels();
        }

        // Use expo-notifications for permission prompts (notifee's permissions
        // API is a subset; expo's gives us the full Android 13+ POST_NOTIFICATIONS flow).
        const { status: existing } = await Notifications.getPermissionsAsync();
        let finalStatus = existing;
        if (existing !== 'granted') {
          const { status } = await Notifications.requestPermissionsAsync();
          finalStatus = status;
        }
        if (finalStatus !== 'granted') return;

        // One-time prompt for battery + overlay settings (unchanged)
        if (Platform.OS === 'android') {
          const asked = await SecureStore.getItemAsync('notif_setup_v4');
          if (!asked) {
            await SecureStore.setItemAsync('notif_setup_v4', '1');
            const openAppDetail = () =>
              IntentLauncher.startActivityAsync(
                'android.settings.APPLICATION_DETAILS_SETTINGS',
                { data: 'package:com.remindercompanion.app' },
              ).catch(() => {});
            Alert.alert(
              'Enable background alerts',
              'Two quick steps so reminders fire even when your screen is off:\n\n' +
              '① Tap "Battery Setting" → set Battery to "Unrestricted"\n\n' +
              '② Tap "Overlay Setting" → enable "Display over other apps"\n\n' +
              'Samsung users: also add this app to Battery → Never sleeping apps.',
              [
                { text: 'Later', style: 'cancel' },
                {
                  text: 'Battery Setting',
                  onPress: () =>
                    IntentLauncher.startActivityAsync(
                      'android.settings.APPLICATION_DETAILS_SETTINGS',
                      { data: 'package:com.remindercompanion.app' },
                    ).catch(() => {}),
                },
                {
                  text: 'Overlay Setting',
                  onPress: () =>
                    IntentLauncher.startActivityAsync(
                      'android.settings.action.MANAGE_OVERLAY_PERMISSION',
                      { data: 'package:com.remindercompanion.app' },
                    ).catch(openAppDetail),
                },
              ],
            );
          }
        }

        // Register Expo push token for server-side digest notifications
        const token = await tokenStore.getAccess();
        if (!token) return;
        const { data: pushToken } = await Notifications.getExpoPushTokenAsync({
          projectId: 'd7babc87-33c6-4d6d-9a7e-abf74b5a1b9c',
        });
        await notificationsApi.registerPushToken(pushToken);
      } catch {}
    })();

    // Foreground sync: clear badge + reschedule local notifications from server
    const syncOnForeground = async () => {
      Notifications.setBadgeCountAsync(0).catch(() => {});
      try {
        const token = await tokenStore.getAccess();
        if (!token) return;
        const { data } = await remindersApi.getAll();
        await syncLocalNotifications(data);
      } catch {}
    };

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') syncOnForeground();
    });
    syncOnForeground();
    return () => sub.remove();
  }, []);

  // Notifee: show modal when notification arrives in foreground (app open)
  // or is pressed (notification shade / lock screen tap).
  useEffect(() => {
    if (Platform.OS === 'web') return;

    // Check if the app was launched/foregrounded by a full-screen intent or tap.
    // This fires when the app loads after being woken by a locked-screen notification.
    notifee.getInitialNotification().then(initial => {
      if (!initial) return;
      const r = reminderFromNotifee(initial.notification);
      if (r) setActiveReminder(r);
    }).catch(() => {});

    // Foreground event: notification delivered while app is open, or pressed.
    const unsubscribe = notifee.onForegroundEvent(({ type, detail }) => {
      if (type === EventType.DELIVERED || type === EventType.PRESS) {
        const r = reminderFromNotifee(detail.notification);
        if (r) setActiveReminder(r);
      }
    });

    return () => unsubscribe();
  }, []);

  useNotifications((reminder) => {
    setActiveReminder(reminder);
    // Fire a browser notification so it works even when the tab is in the background
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      new Notification(reminder.title, {
        body: reminder.notes ?? 'Tap to open the app',
        icon: '/favicon.ico',
      });
    }
  });

  return (
    <View style={{ flex: 1 }}>
      <StatusBar style="auto" />
      <Stack>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="auth/login" options={{ headerShown: false }} />
        <Stack.Screen name="auth/callback" options={{ headerShown: false }} />
        <Stack.Screen name="auth/verify-otp" options={{ title: 'Verify Code', headerBackTitle: 'Back' }} />
        <Stack.Screen name="auth/forgot-password" options={{ title: 'Forgot Password', headerBackTitle: 'Back' }} />
        <Stack.Screen name="auth/reset-password" options={{ title: 'Reset Password', headerBackTitle: 'Back' }} />
        <Stack.Screen name="reminder/new" options={{ title: 'New Reminder', presentation: 'modal' }} />
        <Stack.Screen name="reminder/medicine" options={{ title: 'Medicine Reminder', presentation: 'modal' }} />
      </Stack>

      <NotificationModal
        reminder={activeReminder}
        onDismiss={() => setActiveReminder(null)}
      />
    </View>
  );
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppShell />
    </QueryClientProvider>
  );
}
