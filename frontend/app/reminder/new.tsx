import { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, StyleSheet, ScrollView,
  Platform, TouchableOpacity, Animated, Easing,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { parserApi, remindersApi } from '../../src/api/client';
import { useSpeechRecognition } from '../../src/hooks/useSpeechRecognition';
import { scheduleLocalReminder } from '../../src/utils/localNotifications';

// Lazy-require so a missing native module doesn't crash the whole screen
let DateTimePicker: any = null;
try { DateTimePicker = require('@react-native-community/datetimepicker').default; } catch {}

// ─── Pulse ring (voice listening animation) ───────────────────────────────────

function PulseRing({ listening }: { listening: boolean }) {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(0.6)).current;
  useEffect(() => {
    if (!listening) { scale.setValue(1); opacity.setValue(0.6); return; }
    const loop = Animated.loop(Animated.parallel([
      Animated.sequence([
        Animated.timing(scale,   { toValue: 1.8, duration: 800, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        Animated.timing(scale,   { toValue: 1,   duration: 800, easing: Easing.in(Easing.ease),  useNativeDriver: true }),
      ]),
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0,   duration: 800, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.6, duration: 0,   useNativeDriver: true }),
      ]),
    ]));
    loop.start();
    return () => loop.stop();
  }, [listening]);
  if (!listening) return null;
  return <Animated.View style={[styles.pulseRing, { transform: [{ scale }], opacity }]} />;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORIES = ['personal', 'work', 'health', 'other'] as const;
const RECURRENCES = ['none', 'daily', 'weekly'] as const;

const CATEGORY_CONFIG: Record<string, { color: string; bg: string; icon: string }> = {
  work:     { color: '#3B82F6', bg: '#EFF6FF', icon: '💼' },
  personal: { color: '#8B5CF6', bg: '#F5F3FF', icon: '✨' },
  health:   { color: '#10B981', bg: '#ECFDF5', icon: '🏃' },
  other:    { color: '#F59E0B', bg: '#FFFBEB', icon: '📌' },
};

const UTILITIES = [
  { id: 'medicine',  icon: '💊', title: 'Medicine',  desc: 'Dose schedule',    route: '/reminder/medicine', color: '#10B981', bg: '#ECFDF5', border: '#A7F3D0', available: true },
  { id: 'water',     icon: '💧', title: 'Water',     desc: 'Hydration reminders', route: null,               color: '#3B82F6', bg: '#EFF6FF', border: '#BFDBFE', available: false },
  { id: 'exercise',  icon: '🏃', title: 'Exercise',  desc: 'Workout schedule', route: null,                  color: '#F59E0B', bg: '#FFFBEB', border: '#FDE68A', available: false },
  { id: 'custom',    icon: '⚙️', title: 'Custom',    desc: 'Coming soon',      route: null,                  color: '#8B5CF6', bg: '#F5F3FF', border: '#DDD6FE', available: false },
];

const MEDICINE_RE = /\b(medicine|tablet|pill|capsule|dose|dosage|mg|medication|drug|syrup|injection|inhaler)\b/i;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toDatetimeLocal(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatDisplay(val: string) {
  if (!val) return null;
  const d = new Date(val);
  return {
    date: d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }),
    time: d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  };
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function NewReminderScreen() {
  const router = useRouter();
  const qc = useQueryClient();

  const [inputText, setInputText] = useState('');
  const [interimText, setInterimText] = useState('');
  const [parsed, setParsed] = useState<any>(null);
  const [step, setStep] = useState<'input' | 'preview'>('input');
  const [error, setError] = useState('');
  const [voiceError, setVoiceError] = useState('');

  const { listening, supported, toggle } = useSpeechRecognition({
    onInterim: (t) => setInterimText(t),
    onFinal:   (t) => { setInputText(prev => (prev + ' ' + t).trim()); setInterimText(''); setError(''); },
    onError:   (msg) => setVoiceError(msg),
  });

  // Editable fields
  const [title, setTitle] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [recurrence, setRecurrence] = useState('none');
  const [category, setCategory] = useState('personal');
  const [notes, setNotes] = useState('');

  // Native date/time picker
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const pickerDate = scheduledAt ? new Date(scheduledAt) : new Date();

  const onDateChange = (_: any, selected?: Date) => {
    setShowDatePicker(false);
    if (!selected) return;
    const base = scheduledAt ? new Date(scheduledAt) : new Date();
    selected.setHours(base.getHours(), base.getMinutes());
    setScheduledAt(toDatetimeLocal(selected.toISOString()));
    if (Platform.OS === 'android') setShowTimePicker(true);
  };

  const onTimeChange = (_: any, selected?: Date) => {
    setShowTimePicker(false);
    if (!selected) return;
    const base = scheduledAt ? new Date(scheduledAt) : new Date();
    base.setHours(selected.getHours(), selected.getMinutes());
    setScheduledAt(toDatetimeLocal(base.toISOString()));
  };

  const saveMutation = useMutation({
    mutationFn: (data: object) => remindersApi.create(data),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['reminders'] });
      // Schedule a local OS-level notification so the alert fires even when
      // the app is closed or the phone is locked.
      scheduleLocalReminder(res.data).catch(() => {});
      router.canGoBack() ? router.back() : router.replace('/(tabs)');
    },
    onError: (err: any) => setError(err?.response?.data?.message ?? 'Could not save reminder.'),
  });

  const parseMutation = useMutation({
    mutationFn: (text: string) => parserApi.parseText(text).then(r => r.data),
    onSuccess: (data) => {
      setParsed(data);
      setTitle(data.title ?? '');
      setScheduledAt(toDatetimeLocal(data.scheduledAt));
      setRecurrence(data.recurrence ?? 'none');
      setCategory(data.category ?? 'personal');
      setNotes(data.notes ?? '');
      setError('');
      setStep('preview');
    },
    onError: (err: any) => setError(err?.response?.data?.message ?? 'Could not parse. Try again.'),
  });

  const handleParse = () => {
    if (!inputText.trim()) return;
    setError('');
    if (MEDICINE_RE.test(inputText)) {
      router.push('/reminder/medicine');
      return;
    }
    parseMutation.mutate(inputText.trim());
  };

  const handleConfirm = () => {
    saveMutation.mutate({
      title: title.trim() || parsed?.title,
      scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : undefined,
      recurrence,
      recurrenceConfig: parsed?.recurrenceConfig ?? undefined,
      category,
      notes: notes.trim() || undefined,
      sourceType: 'text',
    });
  };

  const cfg = CATEGORY_CONFIG[category] ?? CATEGORY_CONFIG.other;
  const dt = formatDisplay(scheduledAt);

  // ── Step 1: Input ────────────────────────────────────────────────────────────
  if (step === 'input') {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

        {/* Voice / text input card */}
        <View style={styles.inputCard}>
          <View style={styles.inputCardHeader}>
            <Ionicons name="sparkles" size={16} color="#6C5CE7" />
            <Text style={styles.inputCardLabel}>AI REMINDER</Text>
          </View>
          <Text style={styles.inputHint}>Describe it in plain English</Text>

          <View style={styles.inputWrapper}>
            <TextInput
              style={styles.input}
              placeholder={listening ? '' : 'e.g. "Take medicine after dinner for 5 days"'}
              placeholderTextColor="#A0A3B1"
              value={inputText}
              onChangeText={v => { setInputText(v); setError(''); }}
              multiline
              autoFocus
            />
            {listening && (
              <Text style={styles.interimText}>{interimText || '🎙 Listening…'}</Text>
            )}
            {supported && (
              Platform.OS === 'web' ? (
                <button onClick={toggle} style={{
                  position: 'absolute', bottom: 12, right: 12, width: 40, height: 40,
                  borderRadius: 20, border: 'none', cursor: 'pointer',
                  background: listening ? 'linear-gradient(135deg,#EF4444,#F87171)' : 'linear-gradient(135deg,#6C5CE7,#8B5CF6)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: listening ? '0 0 0 6px rgba(239,68,68,0.2)' : '0 2px 8px rgba(108,92,231,0.3)',
                } as any}>
                  <Ionicons name={listening ? 'stop' : 'mic'} size={18} color="#fff" />
                </button>
              ) : (
                <TouchableOpacity style={[styles.micBtn, listening && styles.micBtnActive]} onPress={toggle}>
                  <PulseRing listening={listening} />
                  <Ionicons name={listening ? 'stop' : 'mic'} size={18} color="#fff" />
                </TouchableOpacity>
              )
            )}
          </View>

          {voiceError ? (
            <View style={styles.inlineError}>
              <Ionicons name="mic-off-outline" size={13} color="#EF4444" />
              <Text style={styles.inlineErrorText}>{voiceError}</Text>
            </View>
          ) : null}
          {error ? (
            <View style={styles.inlineError}>
              <Ionicons name="alert-circle-outline" size={13} color="#EF4444" />
              <Text style={styles.inlineErrorText}>{error}</Text>
            </View>
          ) : null}

          {Platform.OS === 'web' ? (
            <button onClick={handleParse} disabled={!inputText.trim() || parseMutation.isPending} style={{
              width: '100%', padding: '14px', borderRadius: 12, border: 'none',
              background: !inputText.trim() ? '#C4C6D4' : 'linear-gradient(135deg,#6C5CE7,#8B5CF6)',
              color: '#fff', fontSize: 15, fontWeight: '700', cursor: !inputText.trim() ? 'not-allowed' : 'pointer',
              marginTop: 4,
            } as any}>{parseMutation.isPending ? 'Parsing…' : '✨ Parse Reminder'}</button>
          ) : (
            <TouchableOpacity
              style={[styles.parseBtn, (!inputText.trim() || parseMutation.isPending) && styles.parseBtnDisabled]}
              onPress={handleParse}
              disabled={!inputText.trim() || parseMutation.isPending}
            >
              <Ionicons name="sparkles" size={16} color="#fff" />
              <Text style={styles.parseBtnText}>{parseMutation.isPending ? 'Parsing…' : 'Parse Reminder'}</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Utilities section */}
        <Text style={styles.sectionLabel}>SMART UTILITIES</Text>
        <Text style={styles.sectionSub}>Guided wizards for common reminders</Text>

        <View style={styles.utilityGrid}>
          {UTILITIES.map(u => (
            Platform.OS === 'web' ? (
              <button
                key={u.id}
                onClick={() => u.available && u.route && router.push(u.route as any)}
                disabled={!u.available}
                style={{
                  flex: '1 1 calc(50% - 6px)', padding: '16px 14px', borderRadius: 16,
                  border: `1.5px solid ${u.border}`, background: u.bg,
                  cursor: u.available ? 'pointer' : 'default',
                  opacity: u.available ? 1 : 0.5, textAlign: 'left',
                  display: 'flex', flexDirection: 'column' as any, gap: 6,
                } as any}
              >
                <span style={{ fontSize: 28 }}>{u.icon}</span>
                <span style={{ fontSize: 14, fontWeight: '700', color: u.color }}>{u.title}</span>
                <span style={{ fontSize: 11, color: '#8B8FA8' }}>{u.desc}</span>
                {!u.available && <span style={{ fontSize: 10, color: '#C4C6D4', fontWeight: '600' }}>COMING SOON</span>}
              </button>
            ) : (
              <TouchableOpacity
                key={u.id}
                style={[styles.utilityCard, { borderColor: u.border, backgroundColor: u.bg, opacity: u.available ? 1 : 0.5 }]}
                onPress={() => u.available && u.route && router.push(u.route as any)}
                disabled={!u.available}
              >
                <Text style={styles.utilityIcon}>{u.icon}</Text>
                <Text style={[styles.utilityTitle, { color: u.color }]}>{u.title}</Text>
                <Text style={styles.utilityDesc}>{u.desc}</Text>
                {!u.available && <Text style={styles.utilitySoon}>SOON</Text>}
              </TouchableOpacity>
            )
          ))}
        </View>

      </ScrollView>
    );
  }

  // ── Step 2: Preview / Edit ───────────────────────────────────────────────────
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

      {/* Category */}
      <Text style={styles.fieldLabel}>CATEGORY</Text>
      <View style={styles.categoryRow}>
        {CATEGORIES.map(cat => {
          const c = CATEGORY_CONFIG[cat];
          const active = category === cat;
          return Platform.OS === 'web' ? (
            <button key={cat} onClick={() => setCategory(cat)} style={{
              flex: 1, display: 'flex', flexDirection: 'column' as any, alignItems: 'center', gap: 4,
              padding: '10px 4px', borderRadius: 12,
              border: active ? `2px solid ${c.color}` : '2px solid transparent',
              background: active ? c.bg : '#F8F7FF', cursor: 'pointer', minWidth: 60,
            } as any}>
              <span style={{ fontSize: 20 }}>{c.icon}</span>
              <span style={{ fontSize: 11, fontWeight: '700', color: active ? c.color : '#A0A3B1', textTransform: 'capitalize' }}>{cat}</span>
            </button>
          ) : (
            <TouchableOpacity
              key={cat}
              style={[styles.catBtn, { borderColor: active ? c.color : 'transparent', backgroundColor: active ? c.bg : '#F8F7FF' }]}
              onPress={() => setCategory(cat)}
            >
              <Text style={styles.catIcon}>{c.icon}</Text>
              <Text style={[styles.catLabel, { color: active ? c.color : '#A0A3B1' }]}>{cat}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Title */}
      <Text style={styles.fieldLabel}>TITLE</Text>
      <TextInput style={styles.editInput} value={title} onChangeText={setTitle} placeholder="What to remember" placeholderTextColor="#A0A3B1" />

      {/* Date & Time */}
      <Text style={styles.fieldLabel}>DATE & TIME</Text>
      {Platform.OS === 'web' ? (
        <input type="datetime-local" value={scheduledAt} onChange={e => setScheduledAt(e.target.value)} style={{
          width: '100%', padding: '13px 14px', borderRadius: 12,
          border: '1.5px solid #E9E7FD', backgroundColor: '#F8F7FF',
          fontSize: 14, color: '#1A1A2E', marginBottom: 16,
          boxSizing: 'border-box', fontFamily: 'inherit',
        } as any} />
      ) : (
        <>
          <View style={styles.dateTimeRow}>
            <TouchableOpacity style={styles.dateBtn} onPress={() => setShowDatePicker(true)}>
              <Ionicons name="calendar-outline" size={16} color="#6C5CE7" />
              <Text style={[styles.dateBtnText, !dt && { color: '#A0A3B1' }]}>
                {dt ? dt.date : 'Pick date'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.dateBtn} onPress={() => setShowTimePicker(true)}>
              <Ionicons name="time-outline" size={16} color="#6C5CE7" />
              <Text style={[styles.dateBtnText, !dt && { color: '#A0A3B1' }]}>
                {dt ? dt.time : 'Pick time'}
              </Text>
            </TouchableOpacity>
          </View>
          {showDatePicker && DateTimePicker && (
            <DateTimePicker value={pickerDate} mode="date" display="default" onValueChange={onDateChange} minimumDate={new Date()} />
          )}
          {showTimePicker && DateTimePicker && (
            <DateTimePicker value={pickerDate} mode="time" display="default" onValueChange={onTimeChange} />
          )}
        </>
      )}

      {/* Repeat */}
      <Text style={styles.fieldLabel}>REPEAT</Text>
      <View style={styles.recurrenceRow}>
        {RECURRENCES.map(r =>
          Platform.OS === 'web' ? (
            <button key={r} onClick={() => setRecurrence(r)} style={{
              flex: 1, padding: '10px 4px', borderRadius: 10, cursor: 'pointer',
              border: recurrence === r ? '2px solid #6C5CE7' : '2px solid #E9E7FD',
              background: recurrence === r ? '#F5F3FF' : '#FFFFFF',
              color: recurrence === r ? '#6C5CE7' : '#8B8FA8',
              fontWeight: '700', fontSize: 13, marginRight: 6, textTransform: 'capitalize',
            } as any}>{r === 'none' ? 'Once' : r.charAt(0).toUpperCase() + r.slice(1)}</button>
          ) : (
            <TouchableOpacity key={r} style={[styles.recBtn, recurrence === r && styles.recBtnActive]} onPress={() => setRecurrence(r)}>
              <Text style={[styles.recBtnText, recurrence === r && styles.recBtnTextActive]}>
                {r === 'none' ? 'Once' : r.charAt(0).toUpperCase() + r.slice(1)}
              </Text>
            </TouchableOpacity>
          )
        )}
      </View>

      {/* Notes */}
      <Text style={styles.fieldLabel}>NOTES (OPTIONAL)</Text>
      <TextInput
        style={[styles.editInput, { minHeight: 70, textAlignVertical: 'top' }]}
        value={notes} onChangeText={setNotes}
        placeholder="Any extra details…" placeholderTextColor="#A0A3B1" multiline
      />

      {/* Summary */}
      {dt && (
        <View style={[styles.summaryPill, { backgroundColor: cfg.bg, borderColor: cfg.color }]}>
          <Text style={styles.summaryIcon}>{cfg.icon}</Text>
          <Text style={[styles.summaryText, { color: cfg.color }]}>
            {dt.date} at {dt.time}{recurrence !== 'none' ? ` · ${recurrence}` : ''}
          </Text>
        </View>
      )}

      {error ? (
        <View style={styles.inlineError}>
          <Ionicons name="alert-circle-outline" size={13} color="#EF4444" />
          <Text style={styles.inlineErrorText}>{error}</Text>
        </View>
      ) : null}

      {Platform.OS === 'web' ? (
        <>
          <button onClick={handleConfirm} disabled={!title.trim() || saveMutation.isPending} style={{
            width: '100%', padding: '15px', borderRadius: 14, border: 'none',
            background: !title.trim() ? '#C4C6D4' : 'linear-gradient(135deg,#6C5CE7,#8B5CF6)',
            color: '#fff', fontSize: 15, fontWeight: '700', cursor: !title.trim() ? 'not-allowed' : 'pointer', marginBottom: 10,
          } as any}>{saveMutation.isPending ? 'Saving…' : 'Save Reminder'}</button>
          <button onClick={() => { setStep('input'); setError(''); }} style={{
            width: '100%', padding: '15px', borderRadius: 14, border: 'none',
            background: 'transparent', color: '#6C5CE7', fontSize: 15, fontWeight: '700', cursor: 'pointer',
          } as any}>← Re-parse</button>
        </>
      ) : (
        <>
          <TouchableOpacity
            style={[styles.parseBtn, (!title.trim() || saveMutation.isPending) && styles.parseBtnDisabled]}
            onPress={handleConfirm} disabled={!title.trim() || saveMutation.isPending}
          >
            <Ionicons name="checkmark-circle" size={16} color="#fff" />
            <Text style={styles.parseBtnText}>{saveMutation.isPending ? 'Saving…' : 'Save Reminder'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.ghostBtn} onPress={() => { setStep('input'); setError(''); }}>
            <Text style={styles.ghostBtnText}>← Re-parse</Text>
          </TouchableOpacity>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F7FF' },
  content: { padding: 20, paddingBottom: 60 },

  // Input card
  inputCard: {
    backgroundColor: '#FFFFFF', borderRadius: 20, padding: 18,
    borderWidth: 1.5, borderColor: '#E9E7FD', marginBottom: 28,
    shadowColor: '#6C5CE7', shadowOpacity: 0.06, shadowRadius: 12, elevation: 3,
  },
  inputCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  inputCardLabel: { fontSize: 11, fontWeight: '700', color: '#6C5CE7', letterSpacing: 1 },
  inputHint: { fontSize: 13, color: '#A0A3B1', marginBottom: 12 },
  inputWrapper: { position: 'relative', marginBottom: 12 },
  input: {
    backgroundColor: '#F8F7FF', borderRadius: 12, padding: 14, paddingRight: 52,
    fontSize: 15, color: '#1A1A2E', borderWidth: 1.5, borderColor: '#E9E7FD',
    minHeight: 90, textAlignVertical: 'top', lineHeight: 22,
  },
  interimText: { fontSize: 13, color: '#8B5CF6', fontStyle: 'italic', paddingHorizontal: 4, paddingBottom: 8 },
  micBtn: {
    position: 'absolute', bottom: 10, right: 10, width: 38, height: 38, borderRadius: 19,
    backgroundColor: '#6C5CE7', alignItems: 'center', justifyContent: 'center',
    shadowColor: '#6C5CE7', shadowOpacity: 0.4, shadowRadius: 6, elevation: 3,
  },
  micBtnActive: { backgroundColor: '#EF4444', shadowColor: '#EF4444' },
  pulseRing: { position: 'absolute', width: 38, height: 38, borderRadius: 19, backgroundColor: '#EF4444', zIndex: -1 },

  parseBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#6C5CE7', borderRadius: 12, padding: 14, marginTop: 4,
  },
  parseBtnDisabled: { opacity: 0.5 },
  parseBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  ghostBtn: { alignItems: 'center', padding: 14 },
  ghostBtnText: { color: '#6C5CE7', fontWeight: '700', fontSize: 15 },

  // Utilities section
  sectionLabel: { fontSize: 11, fontWeight: '700', color: '#A0A3B1', letterSpacing: 1, marginBottom: 4 },
  sectionSub: { fontSize: 13, color: '#8B8FA8', marginBottom: 14 },
  utilityGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 8 },
  utilityCard: {
    width: '47%', padding: 16, borderRadius: 16, borderWidth: 1.5,
  },
  utilityIcon: { fontSize: 28, marginBottom: 8 },
  utilityTitle: { fontSize: 14, fontWeight: '700', marginBottom: 2 },
  utilityDesc: { fontSize: 12, color: '#8B8FA8' },
  utilitySoon: { fontSize: 10, color: '#C4C6D4', fontWeight: '700', marginTop: 4, letterSpacing: 0.5 },

  // Preview fields
  fieldLabel: { fontSize: 11, fontWeight: '700', color: '#A0A3B1', letterSpacing: 1, marginBottom: 8, marginTop: 4 },
  editInput: {
    backgroundColor: '#FFFFFF', borderRadius: 12, padding: 14,
    fontSize: 15, color: '#1A1A2E', borderWidth: 1.5, borderColor: '#E9E7FD', marginBottom: 16,
  },
  categoryRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  catBtn: { flex: 1, alignItems: 'center', padding: 10, borderRadius: 12, borderWidth: 2, gap: 4 },
  catIcon: { fontSize: 20 },
  catLabel: { fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },

  // Date/time pickers
  dateTimeRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  dateBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#FFFFFF', borderRadius: 12, borderWidth: 1.5,
    borderColor: '#E9E7FD', padding: 13,
  },
  dateBtnText: { fontSize: 14, fontWeight: '600', color: '#1A1A2E', flex: 1 },

  recurrenceRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  recBtn: { flex: 1, padding: 10, borderRadius: 10, borderWidth: 2, borderColor: '#E9E7FD', alignItems: 'center', backgroundColor: '#FFFFFF' },
  recBtnActive: { borderColor: '#6C5CE7', backgroundColor: '#F5F3FF' },
  recBtnText: { fontSize: 13, fontWeight: '700', color: '#8B8FA8' },
  recBtnTextActive: { color: '#6C5CE7' },

  summaryPill: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 12, borderWidth: 1.5, marginBottom: 20 },
  summaryIcon: { fontSize: 18 },
  summaryText: { fontSize: 13, fontWeight: '600', flex: 1 },

  inlineError: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FEF2F2', borderRadius: 10, padding: 10, marginBottom: 12 },
  inlineErrorText: { color: '#EF4444', fontSize: 12, flex: 1 },
});
