import { useState, useEffect } from 'react';
import {
  View, Text, TextInput, StyleSheet, ScrollView, Platform, TouchableOpacity,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { remindersApi } from '../../src/api/client';
import { useSpeechRecognition } from '../../src/hooks/useSpeechRecognition';
import { scheduleLocalReminder } from '../../src/utils/localNotifications';

// ─── Types ────────────────────────────────────────────────────────────────────

type Frequency = 1 | 2 | 3;
type Duration = 'today' | 'days' | 'ongoing';

const FREQ_OPTIONS: { value: Frequency; label: string; desc: string }[] = [
  { value: 1, label: 'Once',   desc: '1 time a day' },
  { value: 2, label: 'Twice',  desc: '2 times a day' },
  { value: 3, label: 'Thrice', desc: '3 times a day' },
];

const DOSE_ICONS = ['🌅', '☀️', '🌙'];
const DEFAULT_TIMES: Record<Frequency, string[]> = {
  1: ['08:00'],
  2: ['08:00', '20:00'],
  3: ['08:00', '13:00', '20:00'],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayLocalStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function buildScheduledAt(dateStr: string, timeStr: string): string {
  return new Date(`${dateStr}T${timeStr}`).toISOString();
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Btn({
  label, onPress, disabled, loading, variant = 'primary',
}: {
  label: string; onPress: () => void; disabled?: boolean; loading?: boolean; variant?: 'primary' | 'ghost';
}) {
  if (Platform.OS === 'web') {
    return (
      <button onClick={onPress} disabled={disabled || loading} style={{
        width: '100%', padding: '15px', borderRadius: 14, border: 'none',
        background: variant === 'primary'
          ? (disabled ? '#C4C6D4' : 'linear-gradient(135deg,#6C5CE7,#8B5CF6)')
          : 'transparent',
        color: variant === 'primary' ? '#fff' : '#6C5CE7',
        fontSize: 15, fontWeight: '700', cursor: disabled || loading ? 'not-allowed' : 'pointer',
        marginBottom: 10,
      } as any}>{loading ? 'Saving…' : label}</button>
    );
  }
  return (
    <TouchableOpacity
      style={[styles.btn, variant === 'ghost' && styles.btnGhost, (disabled || loading) && styles.btnDisabled]}
      onPress={onPress} disabled={disabled || loading}
    >
      <Text style={[styles.btnText, variant === 'ghost' && styles.btnTextGhost]}>
        {loading ? 'Saving…' : label}
      </Text>
    </TouchableOpacity>
  );
}

function TimeInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  if (Platform.OS === 'web') {
    return (
      <input type="time" value={value} onChange={e => onChange(e.target.value)}
        style={{
          padding: '10px 14px', borderRadius: 10, border: '1.5px solid #E9E7FD',
          backgroundColor: '#F8F7FF', fontSize: 16, color: '#6C5CE7', fontWeight: '700',
          cursor: 'pointer', outline: 'none', fontFamily: 'inherit', minWidth: 110,
        } as any}
      />
    );
  }
  return (
    <TextInput
      style={styles.timeNative}
      value={value}
      onChangeText={onChange}
      placeholder="HH:MM"
      placeholderTextColor="#C4C6D4"
      keyboardType="numbers-and-punctuation"
    />
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

// Extract a likely medicine name from free-form text like
// "Take Metformin after dinner for 5 days"
function extractMedicineName(text: string): string {
  return text
    .replace(/^(remind me (to )?|take|set (a )?reminder (to )?)/i, '')
    .replace(/\b(medicine|tablet|pill|capsule|dose|dosage|mg|medication|drug|syrup|injection|inhaler)\b/gi, '')
    .replace(/\b(after|before|with|for|every|daily|day|night|morning|evening|dinner|lunch|breakfast)\b.*$/i, '')
    .replace(/\d+\s*(mg|ml|times?|days?)/gi, '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[.,;]+$/, '')
    .trim();
}

export default function MedicineReminderScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const params = useLocalSearchParams<{ prefill?: string }>();

  const [step, setStep] = useState<'setup' | 'timing' | 'preview'>('setup');
  const [error, setError] = useState('');
  const [voiceError, setVoiceError] = useState('');

  // Step 1 – setup
  const [medicineName, setMedicineName] = useState('');
  const [notes, setNotes] = useState('');

  // Voice recognition for the medicine name field
  const { listening, supported, toggle } = useSpeechRecognition({
    onFinal: (text) => {
      setMedicineName(extractMedicineName(text) || text.trim());
      setVoiceError('');
      setError('');
    },
    onError: (msg) => setVoiceError(msg),
  });

  // Pre-fill medicine name when arriving from the general reminder box
  useEffect(() => {
    if (params.prefill) {
      const name = extractMedicineName(params.prefill);
      if (name) setMedicineName(name);
    }
  }, []);
  const [frequency, setFrequency] = useState<Frequency>(1);
  const [duration, setDuration] = useState<Duration>('ongoing');
  const [durationDays, setDurationDays] = useState('7');

  // Step 2 – dose times: one free time per dose
  const [doseTimes, setDoseTimes] = useState<string[]>(DEFAULT_TIMES[1]);

  const setDoseTime = (index: number, time: string) => {
    setDoseTimes(prev => prev.map((t, i) => (i === index ? time : t)));
  };

  const saveMutation = useMutation({
    mutationFn: async (payloads: object[]) => {
      const results = [];
      for (const p of payloads) {
        const res = await remindersApi.create(p);
        results.push(res.data);
      }
      return results;
    },
    onSuccess: (savedReminders) => {
      qc.invalidateQueries({ queryKey: ['reminders'] });
      // Schedule a local OS alarm for each dose
      for (const r of savedReminders) {
        scheduleLocalReminder(r).catch(() => {});
      }
      router.canGoBack() ? router.back() : router.replace('/(tabs)');
    },
    onError: (e: any) => setError(e?.response?.data?.message ?? 'Could not save. Try again.'),
  });

  const goToTiming = () => {
    if (!medicineName.trim()) { setError('Please enter the medicine name.'); return; }
    setError('');
    // Resize doseTimes to match frequency, keeping existing values where possible
    setDoseTimes(DEFAULT_TIMES[frequency].map((def, i) => doseTimes[i] ?? def));
    setStep('timing');
  };

  const goToPreview = () => {
    const invalid = doseTimes.some(t => !/^\d{2}:\d{2}$/.test(t));
    if (invalid) { setError('Please enter valid times (HH:MM) for all doses.'); return; }
    setError('');
    setStep('preview');
  };

  const buildPayloads = (): object[] => {
    const today = todayLocalStr();
    const days = duration === 'days' ? Math.max(1, parseInt(durationDays) || 7) : undefined;
    const recurrence = duration === 'today' ? 'none' : 'daily';
    const recurrenceConfig = days ? { durationDays: days } : undefined;

    return doseTimes.map((time, i) => ({
      title: doseTimes.length === 1
        ? medicineName
        : `${medicineName} — Dose ${i + 1}`,
      scheduledAt: buildScheduledAt(today, time),
      recurrence,
      recurrenceConfig,
      category: 'health',
      notes: notes.trim() || undefined,
      sourceType: 'medicine',
    }));
  };

  const payloads = step === 'preview' ? buildPayloads() : [];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

      {/* ── STEP 1: Setup ─────────────────────────────── */}
      {step === 'setup' && (
        <>
          <View style={styles.heroRow}>
            <Text style={styles.heroEmoji}>💊</Text>
            <View>
              <Text style={styles.heading}>Medicine Reminder</Text>
              <Text style={styles.subheading}>Set up your daily doses</Text>
            </View>
          </View>

          <Text style={styles.fieldLabel}>MEDICINE NAME</Text>
          <View style={styles.nameRow}>
            <TextInput
              style={[styles.input, styles.nameInput]}
              placeholder={listening ? '🎙 Listening…' : 'e.g. Metformin, Vitamin D…'}
              placeholderTextColor={listening ? '#8B5CF6' : '#A0A3B1'}
              value={medicineName}
              onChangeText={v => { setMedicineName(v); setError(''); }}
              autoFocus={!params.prefill}
            />
            {supported && (
              Platform.OS === 'web' ? (
                <button onClick={toggle} style={{
                  padding: '0 14px', borderRadius: 10, border: 'none', cursor: 'pointer',
                  background: listening ? 'linear-gradient(135deg,#EF4444,#F87171)' : 'linear-gradient(135deg,#6C5CE7,#8B5CF6)',
                  color: '#fff', fontSize: 13, fontWeight: '700', whiteSpace: 'nowrap',
                  boxShadow: '0 2px 8px rgba(108,92,231,0.3)',
                } as any}>
                  {listening ? '■ Stop' : '🎙 Speak'}
                </button>
              ) : (
                <TouchableOpacity
                  style={[styles.micBtn, listening && styles.micBtnActive]}
                  onPress={toggle}
                >
                  <Ionicons name={listening ? 'stop' : 'mic'} size={18} color="#fff" />
                </TouchableOpacity>
              )
            )}
          </View>
          {voiceError ? (
            <View style={styles.errorBox}>
              <Ionicons name="mic-off-outline" size={14} color="#EF4444" />
              <Text style={styles.errorText}>{voiceError}</Text>
            </View>
          ) : null}

          <Text style={styles.fieldLabel}>NOTES (OPTIONAL)</Text>
          <TextInput
            style={[styles.input, { minHeight: 60, textAlignVertical: 'top' }]}
            placeholder="e.g. Take with water, after food…"
            placeholderTextColor="#A0A3B1"
            value={notes}
            onChangeText={setNotes}
            multiline
          />

          <Text style={styles.fieldLabel}>HOW MANY TIMES A DAY?</Text>
          <View style={styles.freqRow}>
            {FREQ_OPTIONS.map(opt =>
              Platform.OS === 'web' ? (
                <button key={opt.value} onClick={() => setFrequency(opt.value)} style={{
                  flex: 1, padding: '14px 6px', borderRadius: 14, cursor: 'pointer',
                  border: frequency === opt.value ? '2px solid #6C5CE7' : '2px solid #E9E7FD',
                  background: frequency === opt.value ? '#F5F3FF' : '#FFFFFF',
                  marginRight: 8, display: 'flex', flexDirection: 'column' as any,
                  alignItems: 'center', gap: 4,
                } as any}>
                  <span style={{ fontSize: 22 }}>{'💊'.repeat(opt.value)}</span>
                  <span style={{ fontSize: 14, fontWeight: '700', color: frequency === opt.value ? '#6C5CE7' : '#1A1A2E' }}>{opt.label}</span>
                  <span style={{ fontSize: 11, color: '#8B8FA8' }}>{opt.desc}</span>
                </button>
              ) : (
                <TouchableOpacity key={opt.value} style={[styles.freqBtn, frequency === opt.value && styles.freqBtnActive]} onPress={() => setFrequency(opt.value)}>
                  <Text style={styles.freqEmoji}>{'💊'.repeat(opt.value)}</Text>
                  <Text style={[styles.freqLabel, frequency === opt.value && styles.freqLabelActive]}>{opt.label}</Text>
                  <Text style={styles.freqDesc}>{opt.desc}</Text>
                </TouchableOpacity>
              )
            )}
          </View>

          <Text style={styles.fieldLabel}>DURATION</Text>
          <View style={styles.durationRow}>
            {(['today', 'days', 'ongoing'] as Duration[]).map(d => (
              Platform.OS === 'web' ? (
                <button key={d} onClick={() => setDuration(d)} style={{
                  flex: 1, padding: '10px 4px', borderRadius: 10, cursor: 'pointer',
                  border: duration === d ? '2px solid #6C5CE7' : '2px solid #E9E7FD',
                  background: duration === d ? '#F5F3FF' : '#FFFFFF',
                  color: duration === d ? '#6C5CE7' : '#8B8FA8',
                  fontWeight: '700', fontSize: 13, marginRight: 6,
                  textTransform: 'capitalize',
                } as any}>{d === 'today' ? 'Today only' : d === 'days' ? 'For X days' : 'Ongoing'}</button>
              ) : (
                <TouchableOpacity key={d} style={[styles.durBtn, duration === d && styles.durBtnActive]} onPress={() => setDuration(d)}>
                  <Text style={[styles.durBtnText, duration === d && styles.durBtnTextActive]}>
                    {d === 'today' ? 'Today only' : d === 'days' ? 'For X days' : 'Ongoing'}
                  </Text>
                </TouchableOpacity>
              )
            ))}
          </View>

          {duration === 'days' && (
            <View style={styles.daysInputRow}>
              <Ionicons name="calendar-outline" size={16} color="#6C5CE7" />
              <TextInput
                style={styles.daysInput}
                value={durationDays}
                onChangeText={setDurationDays}
                keyboardType="number-pad"
                placeholder="7"
                placeholderTextColor="#C4C6D4"
              />
              <Text style={styles.daysLabel}>days</Text>
            </View>
          )}

          {error ? <ErrorBox msg={error} /> : null}

          <Btn label="Set Dose Times →" onPress={goToTiming} disabled={!medicineName.trim()} />
        </>
      )}

      {/* ── STEP 2: Dose times ────────────────────────── */}
      {step === 'timing' && (
        <>
          <View style={styles.heroRow}>
            <Text style={styles.heroEmoji}>🕐</Text>
            <View>
              <Text style={styles.heading}>Set Dose Times</Text>
              <Text style={styles.subheading}>
                Choose when to take {medicineName} each day
              </Text>
            </View>
          </View>

          {doseTimes.map((time, i) => (
            <View key={i} style={styles.doseCard}>
              <View style={styles.doseCardLeft}>
                <Text style={styles.doseIcon}>{DOSE_ICONS[i]}</Text>
                <View>
                  <Text style={styles.doseLabel}>
                    {doseTimes.length === 1 ? 'Daily dose' : `Dose ${i + 1}`}
                  </Text>
                  <Text style={styles.doseSuggestion}>
                    {i === 0 ? 'e.g. Morning' : i === 1 ? 'e.g. Evening' : 'e.g. Night'}
                  </Text>
                </View>
              </View>
              <TimeInput value={time} onChange={v => setDoseTime(i, v)} />
            </View>
          ))}

          <Text style={styles.timingHint}>
            Tap the time to choose any hour that works for you
          </Text>

          {error ? <ErrorBox msg={error} /> : null}

          <View style={{ marginTop: 8 }}>
            <Btn label="Preview Reminders →" onPress={goToPreview} />
            <Btn label="← Back" onPress={() => { setStep('setup'); setError(''); }} variant="ghost" />
          </View>
        </>
      )}

      {/* ── STEP 3: Preview ───────────────────────────── */}
      {step === 'preview' && (
        <>
          <View style={styles.heroRow}>
            <Text style={styles.heroEmoji}>✅</Text>
            <View>
              <Text style={styles.heading}>Review & Save</Text>
              <Text style={styles.subheading}>{payloads.length} reminder{payloads.length > 1 ? 's' : ''} will be created</Text>
            </View>
          </View>

          {payloads.map((p: any, i) => (
            <View key={i} style={styles.previewCard}>
              <Text style={styles.previewIcon}>{DOSE_ICONS[i] ?? '💊'}</Text>
              <View style={styles.previewBody}>
                <Text style={styles.previewTitle}>{p.title}</Text>
                <View style={styles.previewMeta}>
                  <View style={styles.pill}>
                    <Ionicons name="time-outline" size={11} color="#6C5CE7" />
                    <Text style={styles.pillText}>
                      {new Date(p.scheduledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>
                  {p.recurrence !== 'none' && (
                    <View style={[styles.pill, { backgroundColor: '#ECFDF5' }]}>
                      <Ionicons name="repeat" size={11} color="#10B981" />
                      <Text style={[styles.pillText, { color: '#10B981' }]}>
                        {p.recurrenceConfig?.durationDays
                          ? `${p.recurrence} · ${p.recurrenceConfig.durationDays} days`
                          : p.recurrence}
                      </Text>
                    </View>
                  )}
                </View>
                {p.notes && <Text style={styles.previewNotes}>{p.notes}</Text>}
              </View>
            </View>
          ))}

          {error ? <ErrorBox msg={error} /> : null}

          <View style={{ marginTop: 8 }}>
            <Btn
              label={`Save ${payloads.length} Reminder${payloads.length > 1 ? 's' : ''}`}
              onPress={() => saveMutation.mutate(payloads)}
              loading={saveMutation.isPending}
            />
            <Btn label="← Edit Times" onPress={() => { setStep('timing'); setError(''); }} variant="ghost" />
          </View>
        </>
      )}
    </ScrollView>
  );
}

function ErrorBox({ msg }: { msg: string }) {
  return (
    <View style={styles.errorBox}>
      <Ionicons name="alert-circle-outline" size={14} color="#EF4444" />
      <Text style={styles.errorText}>{msg}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F7FF' },
  content: { padding: 24, paddingBottom: 60 },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 28 },
  heroEmoji: { fontSize: 40 },
  heading: { fontSize: 20, fontWeight: '700', color: '#1A1A2E', letterSpacing: -0.3 },
  subheading: { fontSize: 13, color: '#8B8FA8', marginTop: 2 },
  fieldLabel: { fontSize: 11, fontWeight: '700', color: '#A0A3B1', letterSpacing: 1, marginBottom: 8, marginTop: 4 },
  input: {
    backgroundColor: '#FFFFFF', borderRadius: 12, padding: 14,
    fontSize: 15, color: '#1A1A2E', borderWidth: 1.5, borderColor: '#E9E7FD', marginBottom: 16,
  },
  freqRow: { flexDirection: 'row', marginBottom: 20 },
  freqBtn: {
    flex: 1, alignItems: 'center', padding: 14, borderRadius: 14,
    borderWidth: 2, borderColor: '#E9E7FD', backgroundColor: '#FFFFFF', marginRight: 8,
  },
  freqBtnActive: { borderColor: '#6C5CE7', backgroundColor: '#F5F3FF' },
  freqEmoji: { fontSize: 20, marginBottom: 4 },
  freqLabel: { fontSize: 14, fontWeight: '700', color: '#1A1A2E', marginBottom: 2 },
  freqLabelActive: { color: '#6C5CE7' },
  freqDesc: { fontSize: 11, color: '#8B8FA8' },
  durationRow: { flexDirection: 'row', marginBottom: 12 },
  durBtn: {
    flex: 1, padding: 10, borderRadius: 10, alignItems: 'center',
    borderWidth: 2, borderColor: '#E9E7FD', backgroundColor: '#FFFFFF', marginRight: 6,
  },
  durBtnActive: { borderColor: '#6C5CE7', backgroundColor: '#F5F3FF' },
  durBtnText: { fontSize: 12, fontWeight: '700', color: '#8B8FA8' },
  durBtnTextActive: { color: '#6C5CE7' },
  daysInputRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#FFFFFF', borderRadius: 12, borderWidth: 1.5,
    borderColor: '#E9E7FD', padding: 12, marginBottom: 20,
  },
  daysInput: { flex: 1, fontSize: 16, fontWeight: '700', color: '#6C5CE7' },
  daysLabel: { fontSize: 14, color: '#8B8FA8', fontWeight: '500' },
  doseCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#FFFFFF', borderRadius: 14, padding: 16, marginBottom: 12,
    borderWidth: 2, borderColor: '#E9E7FD',
  },
  doseCardLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  doseIcon: { fontSize: 28 },
  doseLabel: { fontSize: 15, fontWeight: '700', color: '#1A1A2E' },
  doseSuggestion: { fontSize: 12, color: '#A0A3B1', marginTop: 2 },
  timingHint: { fontSize: 12, color: '#A0A3B1', textAlign: 'center', marginTop: 4, marginBottom: 16 },
  timeNative: {
    borderWidth: 1.5, borderColor: '#E9E7FD', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 8,
    fontSize: 15, color: '#6C5CE7', fontWeight: '700', minWidth: 80,
  },
  previewCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 14,
    backgroundColor: '#FFFFFF', borderRadius: 14, padding: 16, marginBottom: 10,
    borderWidth: 1.5, borderColor: '#E9E7FD',
    shadowColor: '#6C5CE7', shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  previewIcon: { fontSize: 28, marginTop: 2 },
  previewBody: { flex: 1 },
  previewTitle: { fontSize: 15, fontWeight: '700', color: '#1A1A2E', marginBottom: 8 },
  previewMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#F5F3FF', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20,
  },
  pillText: { fontSize: 11, fontWeight: '600', color: '#6C5CE7' },
  previewNotes: { fontSize: 12, color: '#8B8FA8', marginTop: 6 },
  errorBox: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#FEF2F2', borderRadius: 10, padding: 12, marginBottom: 14,
  },
  errorText: { color: '#EF4444', fontSize: 13, flex: 1 },
  btn: { backgroundColor: '#6C5CE7', borderRadius: 14, padding: 16, alignItems: 'center', marginBottom: 10 },
  btnGhost: { backgroundColor: 'transparent' },
  btnDisabled: { opacity: 0.5 },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  btnTextGhost: { color: '#6C5CE7' },

  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  nameInput: { flex: 1, marginBottom: 0 },
  micBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#6C5CE7', alignItems: 'center', justifyContent: 'center',
    shadowColor: '#6C5CE7', shadowOpacity: 0.4, shadowRadius: 6, elevation: 3,
  },
  micBtnActive: { backgroundColor: '#EF4444', shadowColor: '#EF4444' },
});
