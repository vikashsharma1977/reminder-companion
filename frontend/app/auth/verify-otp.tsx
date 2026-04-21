import { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, StyleSheet, Platform,
  TouchableOpacity, KeyboardAvoidingView, ScrollView,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { authApi, tokenStore } from '../../src/api/client';

const RESEND_COOLDOWN = 60;

function Digit({
  value, focused,
}: { value: string; focused: boolean }) {
  return (
    <View style={[styles.digitBox, focused && styles.digitBoxFocused]}>
      <Text style={styles.digitText}>{value || ''}</Text>
    </View>
  );
}

export default function VerifyOtpScreen() {
  const router = useRouter();
  const { type, target } = useLocalSearchParams<{ type: 'email' | 'phone'; target: string }>();

  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN);
  const [focusedIdx, setFocusedIdx] = useState(0);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => c - 1), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  const handleVerify = async () => {
    if (code.length !== 6) return;
    setLoading(true);
    setError('');
    try {
      const res = type === 'email'
        ? await authApi.verifyEmailOtp(target, code)
        : await authApi.verifyPhoneOtp(target, code);
      await tokenStore.save(res.data.accessToken, res.data.refreshToken);
      router.replace('/(tabs)');
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Invalid code. Try again.');
      setCode('');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (cooldown > 0) return;
    setError('');
    try {
      if (type === 'email') {
        await authApi.sendEmailOtp(target);
      } else {
        await authApi.sendPhoneOtp(target);
      }
      setCooldown(RESEND_COOLDOWN);
      setCode('');
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Could not resend. Try again.');
    }
  };

  const handleCodeChange = (val: string) => {
    const digits = val.replace(/\D/g, '').slice(0, 6);
    setCode(digits);
    setFocusedIdx(Math.min(digits.length, 5));
    if (digits.length === 6) {
      inputRef.current?.blur();
      // Auto-submit
      setTimeout(() => {
        handleVerifyWithCode(digits);
      }, 150);
    }
  };

  const handleVerifyWithCode = async (c: string) => {
    setLoading(true);
    setError('');
    try {
      const res = type === 'email'
        ? await authApi.verifyEmailOtp(target, c)
        : await authApi.verifyPhoneOtp(target, c);
      await tokenStore.save(res.data.accessToken, res.data.refreshToken);
      router.replace('/(tabs)');
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Invalid code. Try again.');
      setCode('');
    } finally {
      setLoading(false);
    }
  };

  const label = type === 'email' ? 'email' : 'phone number';
  const maskedTarget = type === 'email'
    ? target.replace(/(.{2})(.*)(@.*)/, (_, a, b, c) => a + '*'.repeat(Math.min(b.length, 4)) + c)
    : target.slice(0, 4) + '****' + target.slice(-3);

  const digits = code.split('').concat(Array(6 - code.length).fill(''));

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

        {/* Icon */}
        <View style={styles.iconWrap}>
          <Text style={styles.iconEmoji}>{type === 'email' ? '📧' : '📱'}</Text>
        </View>

        <Text style={styles.heading}>Enter the code</Text>
        <Text style={styles.sub}>
          We sent a 6-digit code to your {label}
          {'\n'}
          <Text style={styles.target}>{maskedTarget}</Text>
        </Text>

        {/* Hidden text input, visual digit boxes overlay */}
        <View style={styles.codeSection}>
          <View style={styles.digitRow} pointerEvents="none">
            {digits.map((d, i) => (
              <Digit key={i} value={d} focused={i === focusedIdx && !loading} />
            ))}
          </View>

          {Platform.OS === 'web' ? (
            <input
              type="tel"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              value={code}
              onChange={(e) => handleCodeChange(e.target.value)}
              autoFocus
              style={{
                position: 'absolute', opacity: 0, width: '100%', height: '100%',
                top: 0, left: 0, cursor: 'text', fontSize: 32,
              } as any}
            />
          ) : (
            <TextInput
              ref={inputRef}
              style={styles.hiddenInput}
              value={code}
              onChangeText={handleCodeChange}
              keyboardType="number-pad"
              maxLength={6}
              autoFocus
              caretHidden
            />
          )}
        </View>

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {/* Verify button */}
        {Platform.OS === 'web' ? (
          <button
            onClick={handleVerify}
            disabled={code.length !== 6 || loading}
            style={{
              width: '100%', padding: '15px', borderRadius: 14, border: 'none',
              background: code.length === 6 && !loading
                ? 'linear-gradient(135deg,#6C5CE7,#8B5CF6)' : '#C4C6D4',
              color: '#fff', fontSize: 15, fontWeight: '700',
              cursor: code.length === 6 && !loading ? 'pointer' : 'not-allowed',
              marginBottom: 16,
            } as any}
          >
            {loading ? 'Verifying…' : 'Verify'}
          </button>
        ) : (
          <TouchableOpacity
            style={[styles.btn, (code.length !== 6 || loading) && styles.btnDisabled]}
            onPress={handleVerify}
            disabled={code.length !== 6 || loading}
          >
            <Text style={styles.btnText}>{loading ? 'Verifying…' : 'Verify'}</Text>
          </TouchableOpacity>
        )}

        {/* Resend */}
        {Platform.OS === 'web' ? (
          <button
            onClick={handleResend}
            disabled={cooldown > 0}
            style={{
              background: 'none', border: 'none',
              color: cooldown > 0 ? '#A0A3B1' : '#6C5CE7',
              fontSize: 14, fontWeight: '600', cursor: cooldown > 0 ? 'default' : 'pointer',
            } as any}
          >
            {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
          </button>
        ) : (
          <TouchableOpacity onPress={handleResend} disabled={cooldown > 0}>
            <Text style={[styles.resendText, cooldown > 0 && { color: '#A0A3B1' }]}>
              {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
            </Text>
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
    backgroundColor: '#F5F3FF', alignItems: 'center', justifyContent: 'center',
    marginBottom: 24, borderWidth: 2, borderColor: '#E9E7FD',
  },
  iconEmoji: { fontSize: 36 },
  heading: { fontSize: 24, fontWeight: '800', color: '#1A1A2E', marginBottom: 10, letterSpacing: -0.5 },
  sub: { fontSize: 14, color: '#8B8FA8', textAlign: 'center', lineHeight: 22, marginBottom: 36 },
  target: { color: '#1A1A2E', fontWeight: '700' },
  codeSection: { position: 'relative', width: '100%', marginBottom: 24, height: 70 },
  digitRow: { flexDirection: 'row', justifyContent: 'center', gap: 10, height: 70 },
  digitBox: {
    width: 46, height: 62, borderRadius: 12, borderWidth: 2, borderColor: '#E9E7FD',
    backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center',
  },
  digitBoxFocused: { borderColor: '#6C5CE7', backgroundColor: '#F5F3FF' },
  digitText: { fontSize: 28, fontWeight: '700', color: '#1A1A2E' },
  hiddenInput: { position: 'absolute', opacity: 0, width: '100%', height: '100%' },
  errorBox: {
    backgroundColor: '#FEF2F2', borderRadius: 10, padding: 12,
    marginBottom: 16, width: '100%', alignItems: 'center',
  },
  errorText: { color: '#EF4444', fontSize: 13, fontWeight: '600' },
  btn: {
    width: '100%', backgroundColor: '#6C5CE7', borderRadius: 14,
    padding: 16, alignItems: 'center', marginBottom: 16,
  },
  btnDisabled: { backgroundColor: '#C4C6D4' },
  btnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  resendText: { fontSize: 14, fontWeight: '600', color: '#6C5CE7' },
});
