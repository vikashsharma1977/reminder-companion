import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { parserApi, remindersApi } from '../../src/api/client';

export default function NewReminderScreen() {
  const router = useRouter();
  const qc = useQueryClient();

  const [inputText, setInputText] = useState('');
  const [parsed, setParsed] = useState<any>(null);
  const [step, setStep] = useState<'input' | 'preview'>('input');

  const parseMutation = useMutation({
    mutationFn: (text: string) => parserApi.parseText(text).then((r) => r.data),
    onSuccess: (data) => {
      setParsed(data);
      setStep('preview');
    },
    onError: () => Alert.alert('Error', 'Could not parse reminder. Try again.'),
  });

  const saveMutation = useMutation({
    mutationFn: (data: object) => remindersApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reminders'] });
      router.back();
    },
    onError: () => Alert.alert('Error', 'Could not save reminder.'),
  });

  const handleParse = () => {
    if (!inputText.trim()) return;
    parseMutation.mutate(inputText.trim());
  };

  const handleConfirm = () => {
    if (!parsed) return;
    saveMutation.mutate({
      title: parsed.title,
      scheduledAt: parsed.scheduledAt,
      recurrence: parsed.recurrence,
      recurrenceConfig: parsed.recurrenceConfig,
      category: parsed.category,
      notes: parsed.notes,
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
            onChangeText={setInputText}
            multiline
            autoFocus
          />
          <TouchableOpacity
            style={[styles.btn, !inputText.trim() && styles.btnDisabled]}
            onPress={handleParse}
            disabled={!inputText.trim() || parseMutation.isPending}
          >
            {parseMutation.isPending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.btnText}>Parse →</Text>
            )}
          </TouchableOpacity>
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

          <TouchableOpacity style={styles.btn} onPress={handleConfirm} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.btnText}>Confirm & Save</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity style={styles.backBtn} onPress={() => setStep('input')}>
            <Text style={styles.backBtnText}>Edit</Text>
          </TouchableOpacity>
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
  btn: {
    backgroundColor: '#6366f1',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  btnDisabled: { opacity: 0.5 },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  previewCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  previewRow: { flexDirection: 'row', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  previewKey: { width: 100, color: '#6b7280', fontWeight: '600' },
  previewValue: { flex: 1, color: '#111827' },
  backBtn: { alignItems: 'center', padding: 12 },
  backBtnText: { color: '#6366f1', fontWeight: '600' },
});
