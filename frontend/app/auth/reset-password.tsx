import { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, StyleSheet, Platform,
  TouchableOpacity, KeyboardAvoidingView, ScrollView,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { authApi } from '../../src/api/client';

const RESEND_COOLDOWN = 60;

export default function ResetPasswordScreen() {
  const router = useRouter();
  const { email } = useLocalSearchParams<{ email: string }>();

  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN);
  const [focusedIdx, setFocusedIdx] = useState(0);
  const codeInputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => c - 1), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  const handleCodeChange = (val: string) => {
    const digits = val.replace(/\D/g, '').slice(0, 6);
    setCode(digits);
    setFocusedIdx(Math.min(digits.length, 5));
  };

  const handleResend = async () => {
    if (cooldown > 0) return;
    setError('');
    try {
      await authApi.forgotPassword(email);
      setCooldown(RESEND_COOLDOWN);
      setCode('');
    } catch {
      setError('Could not resend. Try again.');
    }
  };

  const handleReset = async () => {
    if (code.length !== 6 || !newPassword) return;
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    setError(''); setLoading(true);
    try {
      await authApi.resetPassword(email, code, newPassword);
      setSuccess(true);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Invalid or expired code. Try again.');
      setCode('');
    } finally {
      setLoading(false);
    }
  };

  const digits = code.split('').concat(Array(6 - code.length).fill(''));

  const maskedEmail = email
    ? email.replace(/(.{2})(.*)(@.*)/, (_, a, b, c) => a + '*'.repeat(Math.min(b.length, 4)) + c)
    : '';

  if (success) {
    return (
      <View style={styles.successContainer}>
        <View style={styles.successIcon}>
          <Text style={{ fontSize: 48 }}>✅</Text>
        </View>
        <Text style={styles.successTitle}>Password updated!</Text>
        <Text style={styles.successSub}>You can now sign in with your new password.</Text>
        {Platform.OS === 'web' ? (
          <button
            onClick={() => router.replace('/auth/login')}
            style={{
              padding: '14px 32px', borderRadius: 14, border: 'none',
              background: 'linear-gradient(135deg,#6C5CE7,#8B5CF6)',
              color: '#fff', fontSize: 15, fontWeight: '700', cursor: 'pointer', marginTop: 8,
            } as any}
          >
            Sign in
          </button>
        ) : (
          <TouchableOpacity style={styles.btn} onPress={() => router.replace('/auth/login')}>
            <Text style={styles.btnText}>Sign in</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  const canSubmit = code.length === 6 && newPassword.length >= 8 && confirmPassword === newPassword && !loading;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

        <View style={styles.iconWrap}>
          <Text style={styles.iconEmoji}>🔐</Text>
        </View>

        <Text style={styles.heading}>Reset your password</Text>
        <Text style={styles.sub}>
          Enter the 6-digit code sent to{'\n'}
          <Text style={styles.target}>{maskedEmail}</Text>
        </Text>

        {/* OTP digit boxes */}
        <View style={styles.codeSection}>
          <View style={styles.digitRow} pointerEvents="none">
            {digits.map((d, i) => (
              <View key={i} style={[styles.digitBox, i === focusedIdx && code.length < 6 && styles.digitBoxFocused]}>
                <Text style={styles.digitText}>{d}</Text>
              </View>
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
              ref={codeInputRef}
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

        {/* Resend */}
        {Platform.OS === 'web' ? (
          <button
            onClick={handleResend}
            disabled={cooldown > 0}
            style={{
              background: 'none', border: 'none', alignSelf: 'center',
              color: cooldown > 0 ? '#A0A3B1' : '#6C5CE7',
              fontSize: 13, fontWeight: '600',
              cursor: cooldown > 0 ? 'default' : 'pointer',
              marginBottom: 24,
            } as any}
          >
            {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
          </button>
        ) : (
          <TouchableOpacity onPress={handleResend} disabled={cooldown > 0} style={{ marginBottom: 24, alignSelf: 'center' }}>
            <Text style={{ color: cooldown > 0 ? '#A0A3B1' : '#6C5CE7', fontSize: 13, fontWeight: '600' }}>
              {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
            </Text>
          </TouchableOpacity>
        )}

        {/* New password */}
        <View style={[styles.inputWrap, { marginBottom: 12 }]}>
          <Ionicons name="lock-closed-outline" size={18} color="#A0A3B1" />
          {Platform.OS === 'web' ? (
            <input
              type={showPass ? 'text' : 'password'}
              placeholder="New password (min 8 chars)"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              style={{
                flex: 1, border: 'none', background: 'transparent',
                fontSize: 15, color: '#1A1A2E', outline: 'none',
                fontFamily: 'inherit', marginLeft: 10,
              } as any}
            />
          ) : (
            <TextInput
              style={[styles.nativeInput, { marginLeft: 10 }]}
              placeholder="New password (min 8 chars)"
              placeholderTextColor="#A0A3B1"
              secureTextEntry={!showPass}
              value={newPassword}
              onChangeText={setNewPassword}
            />
          )}
          {Platform.OS === 'web' ? (
            <button
              onClick={() => setShowPass((s) => !s)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 } as any}
            >
              <Ionicons name={showPass ? 'eye-off-outline' : 'eye-outline'} size={18} color="#A0A3B1" />
            </button>
          ) : (
            <TouchableOpacity onPress={() => setShowPass((s) => !s)}>
              <Ionicons name={showPass ? 'eye-off-outline' : 'eye-outline'} size={18} color="#A0A3B1" />
            </TouchableOpacity>
          )}
        </View>

        {/* Confirm password */}
        <View style={styles.inputWrap}>
          <Ionicons name="lock-closed-outline" size={18} color="#A0A3B1" />
          {Platform.OS === 'web' ? (
            <input
              type={showPass ? 'text' : 'password'}
              placeholder="Confirm new password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              onKeyDown={(e: any) => e.key === 'Enter' && canSubmit && handleReset()}
              style={{
                flex: 1, border: 'none', background: 'transparent',
                fontSize: 15, color: '#1A1A2E', outline: 'none',
                fontFamily: 'inherit', marginLeft: 10,
              } as any}
            />
          ) : (
            <TextInput
              style={[styles.nativeInput, { marginLeft: 10 }]}
              placeholder="Confirm new password"
              placeholderTextColor="#A0A3B1"
              secureTextEntry={!showPass}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
            />
          )}
          {confirmPassword.length > 0 && (
            <Ionicons
              name={confirmPassword === newPassword ? 'checkmark-circle' : 'close-circle'}
              size={18}
              color={confirmPassword === newPassword ? '#10B981' : '#EF4444'}
            />
          )}
        </View>

        {/* Password strength indicator */}
        {newPassword.length > 0 && (
          <View style={styles.strengthRow}>
            {[1, 2, 3, 4].map((level) => {
              const strength = Math.min(
                4,
                (newPassword.length >= 8 ? 1 : 0) +
                (/[A-Z]/.test(newPassword) ? 1 : 0) +
                (/[0-9]/.test(newPassword) ? 1 : 0) +
                (/[^A-Za-z0-9]/.test(newPassword) ? 1 : 0),
              );
              const colors = ['#EF4444', '#F59E0B', '#3B82F6', '#10B981'];
              return (
                <View
                  key={level}
                  style={[
                    styles.strengthBar,
                    { backgroundColor: level <= strength ? colors[strength - 1] : '#E9E7FD' },
                  ]}
                />
              );
            })}
          </View>
        )}

        {error ? (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle-outline" size={14} color="#EF4444" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {Platform.OS === 'web' ? (
          <button
            onClick={handleReset}
            disabled={!canSubmit}
            style={{
              width: '100%', padding: '14px', borderRadius: 14, border: 'none',
              background: canSubmit ? 'linear-gradient(135deg,#6C5CE7,#8B5CF6)' : '#C4C6D4',
              color: '#fff', fontSize: 15, fontWeight: '700',
              cursor: canSubmit ? 'pointer' : 'not-allowed',
              marginTop: 8,
            } as any}
          >
            {loading ? 'Updating…' : 'Set new password'}
          </button>
        ) : (
          <TouchableOpacity
            style={[styles.btn, !canSubmit && styles.btnDisabled]}
            onPress={handleReset}
            disabled={!canSubmit}
          >
            <Text style={styles.btnText}>{loading ? 'Updating…' : 'Set new password'}</Text>
          </TouchableOpacity>
        )}

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F7FF' },
  content: { padding: 28, paddingTop: 48, alignItems: 'center' },
  iconWrap: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: '#F5F3FF', alignItems: 'center', justifyContent: 'center',
    marginBottom: 20, borderWidth: 2, borderColor: '#E9E7FD',
  },
  iconEmoji: { fontSize: 36 },
  heading: { fontSize: 24, fontWeight: '800', color: '#1A1A2E', marginBottom: 8, letterSpacing: -0.5 },
  sub: { fontSize: 14, color: '#8B8FA8', textAlign: 'center', lineHeight: 22, marginBottom: 28 },
  target: { color: '#1A1A2E', fontWeight: '700' },
  codeSection: { position: 'relative', width: '100%', height: 70, marginBottom: 12 },
  digitRow: { flexDirection: 'row', justifyContent: 'center', gap: 10, height: 70 },
  digitBox: {
    width: 46, height: 62, borderRadius: 12, borderWidth: 2, borderColor: '#E9E7FD',
    backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center',
  },
  digitBoxFocused: { borderColor: '#6C5CE7', backgroundColor: '#F5F3FF' },
  digitText: { fontSize: 28, fontWeight: '700', color: '#1A1A2E' },
  hiddenInput: { position: 'absolute', opacity: 0, width: '100%', height: '100%' },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#FFFFFF', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 14,
    borderWidth: 1.5, borderColor: '#E9E7FD',
    marginBottom: 12, width: '100%', minHeight: 52,
  },
  nativeInput: { flex: 1, fontSize: 15, color: '#1A1A2E' },
  strengthRow: { flexDirection: 'row', gap: 6, width: '100%', marginBottom: 16 },
  strengthBar: { flex: 1, height: 4, borderRadius: 2 },
  errorBox: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#FEF2F2', borderRadius: 10,
    padding: 12, marginBottom: 12, width: '100%',
  },
  errorText: { color: '#EF4444', fontSize: 13, flex: 1 },
  btn: {
    width: '100%', backgroundColor: '#6C5CE7', borderRadius: 14,
    padding: 15, alignItems: 'center', marginTop: 8,
  },
  btnDisabled: { backgroundColor: '#C4C6D4' },
  btnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  successContainer: {
    flex: 1, backgroundColor: '#F8F7FF',
    alignItems: 'center', justifyContent: 'center', padding: 32,
  },
  successIcon: { marginBottom: 24 },
  successTitle: { fontSize: 24, fontWeight: '800', color: '#1A1A2E', marginBottom: 8 },
  successSub: { fontSize: 14, color: '#8B8FA8', textAlign: 'center', marginBottom: 32, lineHeight: 22 },
});
