import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { parserApi, remindersApi } from '../../src/api/client';

function WebButton({
  onPress,
  disabled,
  loading,
  label,
  secondary,
}: {
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  label: string;
  secondary?: boolean;
}) {
  if (Platform.OS === 'web') {
    return (
      <button
        onClick={onPress}
        disabled={disabled || loading}
        style={{
          background: secondary ? 'transparent' : disabled ? '#a5b4fc' : '#6366f1',
          color: secondary ? '#6366f1' : '#fff',
          border: secondary ? 'none' : 'none',
          borderRadius: 12,
          padding: secondary ? '12px' : '16px',
          fontSize: 16,
          fontWeight: '700',
          cursor: disabled || loading ? 'not-allowed' : 'pointer',
          width: '100%',
          marginBottom: 12,
        } as any}
      >
        {loading ? 'Please wait...' : label}
      </button>
    );
  }
  return null; // native handled separately
}

export default function NewReminderScreen() {
  const router = useRouter();
  const qc = useQueryClient();

  const [inputText, setInputText] = useState('');
  const [parsed, setParsed] = useState<any>(null);
  const [step, setStep] = useState<'input' | 'preview'>('input');
  const [error, setError] = useState('');

  const parseMutation = useMutation({
    mutationFn: (text: string) => parserApi.parseText(text).then((r) => r.data),
    onSuccess: (data) => {
      setParsed(data);
      setStep('preview');
      setError('');
    },
    onError: (err: any) => {
      setError(err?.response?.data?.message ?? 'Could not parse. Try again.');
    },
  });

  const saveMutation = useMutation({
    mutationFn: (data: object) => remindersApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reminders'] });
      router.back();
    },
    onError: (err: any) => {
      setError(err?.response?.data?.message ?? 'Could not save reminder.');
    },
  });

  const handleParse = () => {
    if (!inputText.trim()) return;
    setError('');
    parseMutation.mutate(inputText.trim());
  };

  const handleConfirm = () => {
    if (!parsed) return;
    setError('');
    saveMutation.mutate({
      title: parsed.title,
      scheduledAt: parsed.scheduledAt ?? undefined,
      recurrence: parsed.recurrence ?? 'none',
      recurrenceConfig: parsed.recurrenceConfig ?? undefined,
      category: parsed.category ?? 'personal',
      notes: parsed.notes ?? undefined,
      sourceType: 'text',
    });
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>New Reminder</Text>

      {step === 'input' && (
        <>
          <Text style={styles.label}>What do you want to remember?</Text>
          <TextInput
            style={styles.input}
            placeholder='e.g. "Take medicine after dinner for 5 days"'
            value={inputText}
            onChangeText={(v) => { setInputText(v); setError(''); }}
            multiline
            autoFocus
            onSubmitEditing={handleParse}
          />
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          <WebButton
            onPress={handleParse}
            disabled={!inputText.trim()}
            loading={parseMutation.isPending}
            label="Parse →"
          />
        </>
      )}

      {step === 'preview' && parsed && (
        <>
          <Text style={styles.label}>Review before saving</Text>

          <View style={styles.previewCard}>
            <View style={styles.previewRow}>
              <Text style={styles.previewKey}>Title</Text>
              <Text style={styles.previewValue}>{parsed.title}</Text>
            </View>
            {parsed.scheduledAt && (
              <View style={styles.previewRow}>
                <Text style={styles.previewKey}>Time</Text>
                <Text style={styles.previewValue}>
                  {new Date(parsed.scheduledAt).toLocaleString()}
                </Text>
              </View>
            )}
            <View style={styles.previewRow}>
              <Text style={styles.previewKey}>Recurrence</Text>
              <Text style={styles.previewValue}>{parsed.recurrence ?? 'none'}</Text>
            </View>
            <View style={styles.previewRow}>
              <Text style={styles.previewKey}>Category</Text>
              <Text style={styles.previewValue}>{parsed.category ?? 'personal'}</Text>
            </View>
          </View>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <WebButton
            onPress={handleConfirm}
            loading={saveMutation.isPending}
            label="Confirm & Save"
          />
          <WebButton
            onPress={() => { setStep('input'); setError(''); }}
            label="← Edit"
            secondary
          />
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  content: { padding: 24 },
  heading: { fontSize: 26, fontWeight: '700', color: '#111827', marginBottom: 24 },
  label: { fontSize: 15, fontWeight: '600', color: '#374151', marginBottom: 10 },
  input: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    minHeight: 100,
    textAlignVertical: 'top',
    marginBottom: 20,
  },
  errorText: { color: '#ef4444', fontSize: 13, marginBottom: 8, textAlign: 'center' },
  previewCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  previewRow: {
    flexDirection: 'row',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  previewKey: { width: 100, color: '#6b7280', fontWeight: '600' },
  previewValue: { flex: 1, color: '#111827' },
});
