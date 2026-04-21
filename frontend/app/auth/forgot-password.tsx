import { useState } from 'react';
import {
  View, Text, StyleSheet, Platform, TouchableOpacity,
  KeyboardAvoidingView, ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { authApi } from '../../src/api/client';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSend = async () => {
    if (!email.trim()) return;
    setError(''); setLoading(true);
    try {
      await authApi.forgotPassword(email.trim());
      // Navigate regardless — backend never leaks whether email exists
      router.push({ pathname: '/auth/reset-password', params: { email: email.trim() } });
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Something went wrong. Try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

        <View style={styles.iconWrap}>
          <Text style={styles.iconEmoji}>🔑</Text>
        </View>

        <Text style={styles.heading}>Forgot password?</Text>
        <Text style={styles.sub}>
          Enter your email and we'll send a 6-digit code to reset your password.
        </Text>

        <View style={styles.inputWrap}>
          <Ionicons name="mail-outline" size={18} color="#A0A3B1" />
          {Platform.OS === 'web' ? (
            <input
              type="email"
              placeholder="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e: any) => e.key === 'Enter' && handleSend()}
              autoFocus
              style={{
                flex: 1, border: 'none', background: 'transparent',
                fontSize: 15, color: '#1A1A2E', outline: 'none',
                fontFamily: 'inherit', marginLeft: 10,
              } as any}
            />
          ) : (
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={{ color: '#A0A3B1', fontSize: 15 }}>{email || 'Email address'}</Text>
            </View>
          )}
        </View>

        {error ? (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle-outline" size={14} color="#EF4444" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {Platform.OS === 'web' ? (
          <button
            onClick={handleSend}
            disabled={!email.trim() || loading}
            style={{
              width: '100%', padding: '14px', borderRadius: 14, border: 'none',
              background: !email.trim() || loading ? '#C4C6D4' : 'linear-gradient(135deg,#6C5CE7,#8B5CF6)',
              color: '#fff', fontSize: 15, fontWeight: '700',
              cursor: !email.trim() || loading ? 'not-allowed' : 'pointer',
              marginBottom: 16,
            } as any}
          >
            {loading ? 'Sending…' : 'Send reset code'}
          </button>
        ) : (
          <TouchableOpacity
            style={[styles.btn, (!email.trim() || loading) && styles.btnDisabled]}
            onPress={handleSend}
            disabled={!email.trim() || loading}
          >
            <Text style={styles.btnText}>{loading ? 'Sending…' : 'Send reset code'}</Text>
          </TouchableOpacity>
        )}

        {Platform.OS === 'web' ? (
          <button
            onClick={() => router.back()}
            style={{ background: 'none', border: 'none', color: '#6C5CE7', fontSize: 13, fontWeight: '600', cursor: 'pointer' } as any}
          >
            ← Back to sign in
          </button>
        ) : (
          <TouchableOpacity onPress={() => router.back()} style={{ alignItems: 'center' }}>
            <Text style={{ color: '#6C5CE7', fontSize: 13, fontWeight: '600' }}>← Back to sign in</Text>
          </TouchableOpacity>
        )}

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F7FF' },
  content: { padding: 28, paddingTop: 60, alignItems: 'center' },
  iconWrap: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: '#FEF2F2', alignItems: 'center', justifyContent: 'center',
    marginBottom: 24, borderWidth: 2, borderColor: '#FECACA',
  },
  iconEmoji: { fontSize: 36 },
  heading: { fontSize: 24, fontWeight: '800', color: '#1A1A2E', marginBottom: 10, letterSpacing: -0.5 },
  sub: { fontSize: 14, color: '#8B8FA8', textAlign: 'center', lineHeight: 22, marginBottom: 32 },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#FFFFFF', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 14,
    borderWidth: 1.5, borderColor: '#E9E7FD',
    marginBottom: 16, width: '100%',
  },
  errorBox: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#FEF2F2', borderRadius: 10,
    padding: 12, marginBottom: 16, width: '100%',
  },
  errorText: { color: '#EF4444', fontSize: 13, flex: 1 },
  btn: {
    width: '100%', backgroundColor: '#6C5CE7', borderRadius: 14,
    padding: 15, alignItems: 'center', marginBottom: 16,
  },
  btnDisabled: { backgroundColor: '#C4C6D4' },
  btnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
