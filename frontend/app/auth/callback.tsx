import { useEffect } from 'react';
import { View, ActivityIndicator, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { tokenStore } from '../../src/api/client';

export default function AuthCallbackScreen() {
  const router = useRouter();

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Tokens are passed in the URL fragment (#at=...&rt=...) — never hits server logs
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    const accessToken  = fragment.get('at');
    const refreshToken = fragment.get('rt');

    // Error is still a query param (safe — no sensitive data)
    const error = new URLSearchParams(window.location.search).get('error');

    if (accessToken && refreshToken) {
      tokenStore.save(accessToken, refreshToken).then(() => {
        router.replace('/(tabs)');
      });
    } else {
      router.replace(`/auth/login${error ? `?error=${error}` : ''}`);
    }
  }, []);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#6C5CE7" />
      <Text style={styles.text}>Signing you in…</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8F7FF' },
  text: { marginTop: 16, color: '#8B8FA8', fontSize: 14 },
});
