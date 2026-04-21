import { useState, useEffect } from 'react';
import {
  View, Text, TextInput, StyleSheet, Platform,
  TouchableOpacity, ScrollView, KeyboardAvoidingView,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { authApi, tokenStore } from '../../src/api/client';

type AuthMethod = 'password' | 'email-otp' | 'phone-otp';

function Blob({ style }: { style: any }) {
  return <View style={[styles.blob, style]} />;
}

function WebInput({
  type = 'text', placeholder, value, onChange, icon, right,
}: {
  type?: string; placeholder: string; value: string;
  onChange: (v: string) => void; icon: string; right?: React.ReactNode;
}) {
  return (
    <View style={styles.inputWrap}>
      <Ionicons name={icon as any} size={18} color="#A0A3B1" style={styles.inputIcon} />
      {Platform.OS === 'web' ? (
        <input
          type={type}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{
            flex: 1, border: 'none', background: 'transparent',
            fontSize: 15, color: '#1A1A2E', outline: 'none',
            fontFamily: 'inherit',
          } as any}
        />
      ) : (
        <TextInput
          style={styles.nativeInput}
          placeholder={placeholder}
          placeholderTextColor="#A0A3B1"
          value={value}
          onChangeText={onChange}
          secureTextEntry={type === 'password'}
          keyboardType={type === 'tel' ? 'phone-pad' : type === 'email' ? 'email-address' : 'default'}
          autoCapitalize="none"
        />
      )}
      {right}
    </View>
  );
}

export default function LoginScreen() {
  const router = useRouter();
  const { error: errorParam } = useLocalSearchParams<{ error?: string }>();

  const [method, setMethod] = useState<AuthMethod>('password');
  const [registerMode, setRegisterMode] = useState(false);

  // Password fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPass, setShowPass] = useState(false);

  // OTP fields
  const [otpEmail, setOtpEmail] = useState('');
  const [otpPhone, setOtpPhone] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (errorParam === 'google_failed') {
      setError('Google sign-in failed. Please try another method.');
    }
  }, [errorParam]);

  // ── Password auth ─────────────────────────────────────────────────────────

  const handlePasswordSubmit = async () => {
    if (!email || !password) return;
    setError(''); setLoading(true);
    try {
      const fn = registerMode ? authApi.register(email, password, displayName || undefined)
                              : authApi.login(email, password);
      const res = await fn;
      await tokenStore.save(res.data.accessToken, res.data.refreshToken);
      router.replace('/(tabs)');
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  // ── Email OTP ─────────────────────────────────────────────────────────────

  const handleSendEmailOtp = async () => {
    if (!otpEmail) return;
    setError(''); setLoading(true);
    try {
      await authApi.sendEmailOtp(otpEmail);
      router.push({ pathname: '/auth/verify-otp', params: { type: 'email', target: otpEmail } });
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Could not send OTP. Check the email and try again.');
    } finally {
      setLoading(false);
    }
  };

  // ── Phone OTP ─────────────────────────────────────────────────────────────

  const handleSendPhoneOtp = async () => {
    if (!otpPhone) return;
    setError(''); setLoading(true);
    try {
      const phone = otpPhone.startsWith('+') ? otpPhone : `+${otpPhone}`;
      await authApi.sendPhoneOtp(phone);
      router.push({ pathname: '/auth/verify-otp', params: { type: 'phone', target: phone } });
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Could not send OTP. Use E.164 format: +91XXXXXXXXXX');
    } finally {
      setLoading(false);
    }
  };

  // ── Google ────────────────────────────────────────────────────────────────

  const handleGoogleSignIn = () => {
    if (Platform.OS === 'web') {
      window.location.href = authApi.googleAuthUrl();
    }
  };

  const tabs: { id: AuthMethod; label: string; icon: string }[] = [
    { id: 'password',  label: 'Password',  icon: 'lock-closed-outline' },
    { id: 'email-otp', label: 'Email OTP', icon: 'mail-outline' },
    { id: 'phone-otp', label: 'Phone OTP', icon: 'phone-portrait-outline' },
  ];

  const primaryAction =
    method === 'password'  ? handlePasswordSubmit  :
    method === 'email-otp' ? handleSendEmailOtp    : handleSendPhoneOtp;

  const primaryLabel =
    method === 'password'  ? (loading ? 'Please wait…' : registerMode ? 'Create account' : 'Sign in') :
    method === 'email-otp' ? (loading ? 'Sending…' : 'Send code') :
                             (loading ? 'Sending…' : 'Send code');

  const primaryDisabled =
    loading ||
    (method === 'password'  && (!email || !password)) ||
    (method === 'email-otp' && !otpEmail) ||
    (method === 'phone-otp' && !otpPhone);

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

        {/* Decorative blobs */}
        <Blob style={{ top: -60, right: -60, width: 200, height: 200, backgroundColor: '#EDE9FE', borderRadius: 100 }} />
        <Blob style={{ top: 80, left: -80, width: 160, height: 160, backgroundColor: '#E0F2FE', borderRadius: 80 }} />

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.appName}>Reminder</Text>
          <Text style={styles.appNameAccent}>Companion</Text>
          <Text style={styles.tagline}>Stay on top of everything that matters</Text>
        </View>

        {/* Card */}
        <View style={styles.card}>

          {/* Google sign-in */}
          {Platform.OS === 'web' ? (
            <button
              onClick={handleGoogleSignIn}
              style={{
                width: '100%', display: 'flex', alignItems: 'center',
                justifyContent: 'center', gap: 10,
                padding: '12px 16px', borderRadius: 12, marginBottom: 20,
                border: '1.5px solid #E2E8F0', background: '#FFFFFF',
                fontSize: 14, fontWeight: '700', color: '#1A1A2E', cursor: 'pointer',
                boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
              } as any}
            >
              <GoogleIcon />
              Continue with Google
            </button>
          ) : (
            <TouchableOpacity style={styles.googleBtn} onPress={handleGoogleSignIn}>
              <GoogleIcon />
              <Text style={styles.googleBtnText}>Continue with Google</Text>
            </TouchableOpacity>
          )}

          {/* Divider */}
          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Method tabs */}
          <View style={styles.tabs}>
            {tabs.map((t) =>
              Platform.OS === 'web' ? (
                <button
                  key={t.id}
                  onClick={() => { setMethod(t.id); setError(''); }}
                  style={{
                    flex: 1, padding: '8px 4px', borderRadius: 10, border: 'none',
                    background: method === t.id ? '#6C5CE7' : 'transparent',
                    color: method === t.id ? '#fff' : '#8B8FA8',
                    fontWeight: '700', fontSize: 12, cursor: 'pointer', transition: 'all 0.15s',
                  } as any}
                >
                  {t.label}
                </button>
              ) : (
                <TouchableOpacity
                  key={t.id}
                  style={[styles.tab, method === t.id && styles.tabActive]}
                  onPress={() => { setMethod(t.id); setError(''); }}
                >
                  <Text style={[styles.tabText, method === t.id && styles.tabTextActive]}>
                    {t.label}
                  </Text>
                </TouchableOpacity>
              )
            )}
          </View>

          {/* ── Password form ── */}
          {method === 'password' && (
            <>
              {registerMode && (
                <WebInput
                  icon="person-outline"
                  placeholder="Display name (optional)"
                  value={displayName}
                  onChange={setDisplayName}
                />
              )}
              <WebInput
                type="email"
                icon="mail-outline"
                placeholder="Email address"
                value={email}
                onChange={setEmail}
              />
              <WebInput
                type={showPass ? 'text' : 'password'}
                icon="lock-closed-outline"
                placeholder="Password"
                value={password}
                onChange={setPassword}
                right={
                  Platform.OS === 'web' ? (
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
                  )
                }
              />
            </>
          )}

          {/* ── Email OTP form ── */}
          {method === 'email-otp' && (
            <>
              <Text style={styles.methodHint}>
                We'll send a 6-digit code to your email — no password needed.
              </Text>
              <WebInput
                type="email"
                icon="mail-outline"
                placeholder="Email address"
                value={otpEmail}
                onChange={setOtpEmail}
              />
            </>
          )}

          {/* ── Phone OTP form ── */}
          {method === 'phone-otp' && (
            <>
              <Text style={styles.methodHint}>
                Enter your phone number in international format to receive an SMS code.
              </Text>
              <WebInput
                type="tel"
                icon="phone-portrait-outline"
                placeholder="+91 98765 43210"
                value={otpPhone}
                onChange={setOtpPhone}
              />
            </>
          )}

          {error ? (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle-outline" size={14} color="#EF4444" />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {/* Primary CTA */}
          {Platform.OS === 'web' ? (
            <button
              onClick={primaryAction}
              disabled={primaryDisabled}
              style={{
                width: '100%', padding: '14px', borderRadius: 14, border: 'none',
                background: primaryDisabled
                  ? '#C4C6D4' : 'linear-gradient(135deg,#6C5CE7,#8B5CF6)',
                color: '#fff', fontSize: 15, fontWeight: '700',
                cursor: primaryDisabled ? 'not-allowed' : 'pointer',
                marginTop: 8,
              } as any}
            >
              {primaryLabel}
            </button>
          ) : (
            <TouchableOpacity
              style={[styles.submitBtn, primaryDisabled && styles.submitBtnDisabled]}
              onPress={primaryAction}
              disabled={primaryDisabled}
            >
              <Text style={styles.submitBtnText}>{primaryLabel}</Text>
            </TouchableOpacity>
          )}

          {/* Password mode toggle + forgot password */}
          {method === 'password' && (
            Platform.OS === 'web' ? (
              <div style={{ display: 'flex', flexDirection: 'column' as any, alignItems: 'center', gap: 8, marginTop: 14 }}>
                <button
                  onClick={() => { setRegisterMode((r) => !r); setError(''); }}
                  style={{ background: 'none', border: 'none', color: '#6C5CE7', fontSize: 13, fontWeight: '600', cursor: 'pointer' } as any}
                >
                  {registerMode ? 'Already have an account? Sign in' : "Don't have an account? Create one"}
                </button>
                {!registerMode && (
                  <button
                    onClick={() => router.push('/auth/forgot-password')}
                    style={{ background: 'none', border: 'none', color: '#A0A3B1', fontSize: 12, fontWeight: '600', cursor: 'pointer' } as any}
                  >
                    Forgot password?
                  </button>
                )}
              </div>
            ) : (
              <View style={{ alignItems: 'center', marginTop: 14, gap: 8 }}>
                <TouchableOpacity onPress={() => { setRegisterMode((r) => !r); setError(''); }}>
                  <Text style={{ color: '#6C5CE7', fontSize: 13, fontWeight: '600' }}>
                    {registerMode ? 'Already have an account? Sign in' : "Don't have an account? Create one"}
                  </Text>
                </TouchableOpacity>
                {!registerMode && (
                  <TouchableOpacity onPress={() => router.push('/auth/forgot-password')}>
                    <Text style={{ color: '#A0A3B1', fontSize: 12, fontWeight: '600' }}>Forgot password?</Text>
                  </TouchableOpacity>
                )}
              </View>
            )
          )}
        </View>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function GoogleIcon() {
  if (Platform.OS === 'web') {
    return (
      <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
        <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" fill="#4285F4"/>
        <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z" fill="#34A853"/>
        <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
        <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
      </svg>
    );
  }
  return <Text style={{ fontSize: 18 }}>G</Text>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F7FF' },
  content: { padding: 24, paddingTop: 60, paddingBottom: 60, minHeight: '100%' },
  blob: { position: 'absolute', opacity: 0.5 },
  header: { alignItems: 'center', marginBottom: 32 },
  appName: { fontSize: 32, fontWeight: '800', color: '#1A1A2E', letterSpacing: -1 },
  appNameAccent: { fontSize: 32, fontWeight: '800', color: '#6C5CE7', letterSpacing: -1, marginTop: -8 },
  tagline: { fontSize: 14, color: '#8B8FA8', marginTop: 8, textAlign: 'center' },
  card: {
    backgroundColor: '#FFFFFF', borderRadius: 24, padding: 24,
    shadowColor: '#6C5CE7', shadowOpacity: 0.08, shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 }, elevation: 8,
  },
  googleBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    padding: 13, borderRadius: 12, borderWidth: 1.5, borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF', marginBottom: 20,
  },
  googleBtnText: { fontSize: 14, fontWeight: '700', color: '#1A1A2E' },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#E9E7FD' },
  dividerText: { fontSize: 12, color: '#A0A3B1', fontWeight: '600' },
  tabs: { flexDirection: 'row', backgroundColor: '#F5F3FF', borderRadius: 12, padding: 4, marginBottom: 20, gap: 4 },
  tab: { flex: 1, padding: 8, borderRadius: 10, alignItems: 'center' },
  tabActive: { backgroundColor: '#6C5CE7' },
  tabText: { fontSize: 12, fontWeight: '700', color: '#8B8FA8' },
  tabTextActive: { color: '#FFFFFF' },
  methodHint: { fontSize: 13, color: '#8B8FA8', lineHeight: 18, marginBottom: 16 },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#F8F7FF', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: Platform.OS === 'web' ? 0 : 14,
    borderWidth: 1.5, borderColor: '#E9E7FD', marginBottom: 12,
    minHeight: 52,
  },
  inputIcon: { width: 20 },
  nativeInput: { flex: 1, fontSize: 15, color: '#1A1A2E' },
  errorBox: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#FEF2F2', borderRadius: 10, padding: 12, marginBottom: 8,
  },
  errorText: { color: '#EF4444', fontSize: 13, flex: 1 },
  submitBtn: {
    backgroundColor: '#6C5CE7', borderRadius: 14,
    padding: 15, alignItems: 'center', marginTop: 8,
  },
  submitBtnDisabled: { backgroundColor: '#C4C6D4' },
  submitBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
