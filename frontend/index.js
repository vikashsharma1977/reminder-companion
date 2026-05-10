// notifee background handler must be registered before the app component mounts.
// It handles notification events when the app is killed or backgrounded.
// For full-screen intent (locked phone), the app is brought to foreground and
// getInitialNotification() is used instead — this handler is for pure background cases.
import notifee from '@notifee/react-native';

notifee.onBackgroundEvent(async ({ type, detail }) => {
  // EventType.PRESS (1): user tapped a notification action while app was backgrounded.
  // The app will open and _layout.tsx calls getInitialNotification() to show the modal.
  void type;
  void detail;
});

import 'expo-router/entry';
