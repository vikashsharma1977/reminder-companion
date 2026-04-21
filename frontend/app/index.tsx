import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { tokenStore } from '../src/api/client';

export default function Index() {
  const [destination, setDestination] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      // Migrate: clear the old single-token key so stale sessions don't cause loops
      const legacy = await AsyncStorage.getItem('auth_token');
      if (legacy) await AsyncStorage.removeItem('auth_token');

      const token = await tokenStore.getAccess();
      setDestination(token ? '/(tabs)' : '/auth/login');
    })();
  }, []);

  if (!destination) {
    return (
      <View style={{ flex: 1, backgroundColor: '#6366f1', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#fff" size="large" />
      </View>
    );
  }

  return <Redirect href={destination as any} />;
}
