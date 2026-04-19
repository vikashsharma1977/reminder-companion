import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  Platform,
  Pressable,
} from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { authApi } from '../../src/api/client';

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!email || !password) return;
    setError('');
    setLoading(true);
    try {
      const res = mode === 'login'
        ? await authApi.login(email, password)
        : await authApi.register(email, password, displayName);
      await AsyncStorage.setItem('auth_token', res.data.token);
      // Small delay to ensure AsyncStorage write completes before nav
      await new Promise((r) => setTimeout(r, 100));
      router.replace('/(tabs)' as any);
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? err?.message ?? 'Something went wrong';
      setError(Array.isArray(msg) ? msg.join(', ') : msg);
    } finally {
      setLoading(false);
    }
  };

  const canSubmit = email.trim().length > 0 && password.length > 0 && !loading;

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.logo}>🔔</Text>
        <Text style={styles.title}>Reminder Companion</Text>
        <Text style={styles.subtitle}>
          {mode === 'login' ? 'Sign in to your account' : 'Create your account'}
        </Text>

        {mode === 'register' && (
          <TextInput
            style={styles.input}
            placeholder="Your name"
            value={displayName}
            onChangeText={setDisplayName}
            autoCapitalize="words"
          />
        )}

        <TextInput
          style={styles.input}
          placeholder="Email"
          value={email}
          onChangeText={(v) => { setEmail(v); setError(''); }}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          textContentType="emailAddress"
        />

        <TextInput
          style={styles.input}
          placeholder="Password"
          value={password}
          onChangeText={(v) => { setPassword(v); setError(''); }}
          secureTextEntry
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          textContentType={mode === 'login' ? 'password' : 'newPassword'}
          // Submit on Enter key on web
          onSubmitEditing={canSubmit ? handleSubmit : undefined}
        />

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        {/* Use Pressable + native button on web for reliable click handling */}
        {Platform.OS === 'web' ? (
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            style={{
              background: canSubmit ? '#6366f1' : '#a5b4fc',
              color: '#fff',
              border: 'none',
              borderRadius: 10,
              padding: '15px',
              fontSize: 16,
              fontWeight: '700',
              cursor: canSubmit ? 'pointer' : 'not-allowed',
              width: '100%',
              marginTop: 4,
            } as any}
          >
            {loading ? 'Please wait...' : mode === 'login' ? 'Sign In' : 'Create Account'}
          </button>
        ) : (
          <Pressable
            style={[styles.btn, !canSubmit && styles.btnDisabled]}
            onPress={handleSubmit}
            disabled={!canSubmit}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.btnText}>{mode === 'login' ? 'Sign In' : 'Create Account'}</Text>
            }
          </Pressable>
        )}

        <Pressable
          onPress={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}
          style={styles.toggleBtn}
        >
          <Text style={styles.toggleText}>
            {mode === 'login'
              ? "Don't have an account? Register"
              : 'Already have an account? Sign In'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#6366f1',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 32,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 10,
  },
  logo: { fontSize: 40, textAlign: 'center', marginBottom: 8 },
  title: { fontSize: 22, fontWeight: '700', color: '#111827', textAlign: 'center', marginBottom: 4 },
  subtitle: { fontSize: 14, color: '#6b7280', textAlign: 'center', marginBottom: 24 },
  input: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    padding: 14,
    fontSize: 15,
    marginBottom: 12,
    backgroundColor: '#f9fafb',
  },
  errorText: {
    color: '#ef4444',
    fontSize: 13,
    marginBottom: 8,
    textAlign: 'center',
  },
  btn: { backgroundColor: '#6366f1', padding: 15, borderRadius: 10, alignItems: 'center', marginTop: 4 },
  btnDisabled: { opacity: 0.5 },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  toggleBtn: { marginTop: 16, alignItems: 'center' },
  toggleText: { color: '#6366f1', fontWeight: '600', fontSize: 14 },
});
