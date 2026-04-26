import { Stack } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { useState, useEffect } from 'react';
import { View, Platform, AppState, Alert } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import * as IntentLauncher from 'expo-intent-launcher';
import { useNotifications, FiredReminder } from '../src/hooks/useNotifications';
import { NotificationModal } from '../src/components/NotificationModal';
import { notificationsApi, tokenStore, remindersApi } from '../src/api/client';
import { syncLocalNotifications } from '../src/utils/localNotifications';

// Show alerts for foreground notifications (iOS especially)
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 2, staleTime: 1000 * 60 },
  },
});

function AppShell() {
  const [activeReminder, setActiveReminder] = useState<FiredReminder | null>(null);

  // Web: request browser notification permission
  useEffect(() => {
    if (Platform.OS === 'web' && typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  // Native: set up notification channel, register push token, clear badge on foreground
  useEffect(() => {
    if (Platform.OS === 'web') return;
    (async () => {
      try {
        // Android: high-importance channel so reminders show as heads-up banners
        if (Platform.OS === 'android') {
          await Notifications.setNotificationChannelAsync('reminders', {
            name: 'Reminders',
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 600, 150, 600, 150, 600, 150, 600],
            lightColor: '#6C5CE7',
            enableLights: true,
            enableVibrate: true,
            showBadge: true,
            lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
          });
        }

        const { status: existing } = await Notifications.getPermissionsAsync();
        let finalStatus = existing;
        if (existing !== 'granted') {
          const { status } = await Notifications.requestPermissionsAsync();
          finalStatus = status;
        }
        if (finalStatus !== 'granted') return;

        // Android: two-step setup for reliable background notifications.
        // Battery exemption prevents Doze from blocking exact alarms.
        // Overlay permission lets the modal appear over any other app.
        // Key versioned so fixed builds re-prompt users who saw broken dialogs.
        if (Platform.OS === 'android') {
          const asked = await SecureStore.getItemAsync('notif_setup_v3');
          if (!asked) {
            await SecureStore.setItemAsync('notif_setup_v3', '1');

            const openAppDetailSettings = () =>
              IntentLauncher.startActivityAsync(
                'android.settings.APPLICATION_DETAILS_SETTINGS',
                { data: 'package:com.remindercompanion.app' },
              ).catch(() => {});

            // Step 1: battery optimization
            Alert.alert(
              'Step 1 of 2 — Battery',
              'For reliable reminders when screen is off:\n\nTap "Open Settings", then tap Battery → set to "Unrestricted".',
              [
                { text: 'Skip', style: 'cancel' },
                {
                  text: 'Open Settings',
                  onPress: () => {
                    IntentLauncher.startActivityAsync(
                      'android.settings.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS',
                      { data: 'package:com.remindercompanion.app' },
                    ).catch(openAppDetailSettings);
                  },
                },
              ],
            );

            // Step 2: overlay permission (small delay so alerts don't stack)
            setTimeout(() => {
              Alert.alert(
                'Step 2 of 2 — Display over apps',
                'Enable "Allow display over other apps" so reminders pop up over any screen.',
                [
                  { text: 'Skip', style: 'cancel' },
                  {
                    text: 'Open Settings',
                    onPress: () => {
                      IntentLauncher.startActivityAsync(
                        'android.settings.action.MANAGE_OVERLAY_PERMISSION',
                        { data: 'package:com.remindercompanion.app' },
                      ).catch(openAppDetailSettings);
                    },
                  },
                ],
              );
            }, 500);
          }
        }

        const token = await tokenStore.getAccess();
        if (!token) return;

        const { data: pushToken } = await Notifications.getExpoPushTokenAsync({
          projectId: 'd7babc87-33c6-4d6d-9a7e-abf74b5a1b9c',
        });
        await notificationsApi.registerPushToken(pushToken);
      } catch {}
    })();

    // On foreground: clear badge + re-sync local notifications from server
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
    syncOnForeground(); // also run immediately on mount
    return () => sub.remove();
  }, []);

  // Handle notification taps (from lock screen / notification shade).
  // Show the snooze modal exactly as if the reminder just fired in-app.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as any;
      const reminderId: string = data?.reminderId;
      if (!reminderId) return;
      const content = response.notification.request.content;
      setActiveReminder({
        reminderId,
        title: content.title ?? '',
        scheduledAt: null,
        notes: typeof content.body === 'string' &&
               content.body !== 'Time for your reminder!'
               ? content.body : undefined,
      });
    });
    return () => sub.remove();
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
