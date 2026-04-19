import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { View, ActivityIndicator } from 'react-native';

export default function Index() {
  const [destination, setDestination] = useState<string | null>(null);

  useEffect(() => {
    AsyncStorage.getItem('auth_token').then((token) => {
      setDestination(token ? '/(tabs)' : '/auth/login');
    });
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
