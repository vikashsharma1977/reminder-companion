import { View, Text, StyleSheet, Platform, Modal, TouchableOpacity, Vibration } from 'react-native';
import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { remindersApi } from '../api/client';
import { FiredReminder } from '../hooks/useNotifications';
import { useAlertPrefs } from '../hooks/useAlertPrefs';
import { cancelLocalReminder, scheduleLocalReminder } from '../utils/localNotifications';

let Audio: any = null;
try { Audio = require('expo-av').Audio; } catch {}

const SOUND_FILES: Record<string, any> = {
  chime:  require('../../assets/sounds/chime.wav'),
  bell:   require('../../assets/sounds/bell.wav'),
  gentle: require('../../assets/sounds/gentle.wav'),
  urgent: require('../../assets/sounds/urgent.wav'),
};

const VIBRATION_PATTERNS: Record<string, number[]> = {
  chime:  [0, 600, 150, 600, 150, 600, 150, 600],   // ~3s
  bell:   [0, 600, 200, 600, 200, 600, 200, 600],   // ~3s
  gentle: [0, 700, 300, 700, 300, 700],             // ~3s
  urgent: [0, 300, 100, 300, 100, 300, 100, 300, 100, 300, 100, 300], // ~3s
  none:   [],
};

interface Props {
  reminder: FiredReminder | null;
  onDismiss: () => void;
}

const MIN_SNOOZE = 5;
const MAX_SNOOZE = 120;
const STEP = 5;

export function NotificationModal({ reminder, onDismiss }: Props) {
  const qc = useQueryClient();
  const [snoozeMins, setSnoozeMins] = useState(10);
  const { prefs } = useAlertPrefs();

  // Reset snooze duration each time a new reminder fires
  useEffect(() => {
    if (reminder) setSnoozeMins(10);
  }, [reminder?.reminderId]);

  // Vibrate + play sound when a reminder fires
  useEffect(() => {
    if (!reminder) return;

    const sound = prefs.defaultSound;

    if (Platform.OS !== 'web' && prefs.vibration && sound !== 'none') {
      const pattern = VIBRATION_PATTERNS[sound] ?? VIBRATION_PATTERNS.chime;
      if (pattern.length > 0) Vibration.vibrate(pattern);
    }

    if (prefs.sound && sound !== 'none' && Audio && SOUND_FILES[sound]) {
      (async () => {
        try {
          await Audio.setAudioModeAsync({
            playsInSilentModeIOS: true,
            allowsRecordingIOS: false,
            staysActiveInBackground: false,
          });
          const { sound: s } = await Audio.Sound.createAsync(
            SOUND_FILES[sound],
            { shouldPlay: true, volume: 1.0, isLooping: true },
          );
          // Stop looping after 3s, then unload
          setTimeout(async () => {
            try { await s.setIsLoopingAsync(false); } catch {}
            setTimeout(() => s.unloadAsync().catch(() => {}), 2000);
          }, 3000);
        } catch {}
      })();
    }
  }, [reminder?.reminderId]);

  const completeMutation = useMutation({
    mutationFn: (id: string) => remindersApi.complete(id),
    onSuccess: (_data, id) => {
      cancelLocalReminder(id).catch(() => {});
      qc.invalidateQueries({ queryKey: ['reminders'] });
      onDismiss();
    },
  });

  const snoozeMutation = useMutation({
    mutationFn: ({ id, minutes }: { id: string; minutes: number }) =>
      remindersApi.snooze(id, minutes),
    onSuccess: (res, { id }) => {
      // Reschedule local notification for the new snoozed time
      cancelLocalReminder(id)
        .then(() => scheduleLocalReminder(res.data))
        .catch(() => {});
      qc.invalidateQueries({ queryKey: ['reminders'] });
      onDismiss();
    },
  });

  if (!reminder) return null;

  const isPending = completeMutation.isPending || snoozeMutation.isPending;
  const canDecrease = snoozeMins > MIN_SNOOZE;
  const canIncrease = snoozeMins < MAX_SNOOZE;

  const handleSnooze = () =>
    snoozeMutation.mutate({ id: reminder.reminderId, minutes: snoozeMins });

  const content = (
    <View style={styles.overlay}>
      <View style={styles.modal}>
        {/* Bell */}
        <View style={styles.bellWrap}>
          <View style={styles.bellRing} />
          <View style={styles.bellCircle}>
            <Text style={styles.bellEmoji}>🔔</Text>
          </View>
        </View>

        <Text style={styles.label}>REMINDER</Text>
        <Text style={styles.title}>{reminder.title}</Text>

        {reminder.scheduledAt && (
          <View style={styles.timePill}>
            <Ionicons name="time-outline" size={13} color="#6C5CE7" />
            <Text style={styles.timeText}>
              {new Date(reminder.scheduledAt).toLocaleTimeString([], {
                hour: '2-digit', minute: '2-digit',
              })}
            </Text>
          </View>
        )}

        {reminder.notes ? <Text style={styles.notes}>{reminder.notes}</Text> : null}

        {/* Snooze duration picker */}
        <View style={styles.pickerSection}>
          <Text style={styles.pickerLabel}>SNOOZE FOR</Text>
          <View style={styles.pickerRow}>
            <StepBtn
              icon="remove"
              onPress={() => setSnoozeMins(m => Math.max(MIN_SNOOZE, m - STEP))}
              disabled={!canDecrease || isPending}
            />
            <View style={styles.pickerDisplay}>
              <Text style={styles.pickerValue}>{snoozeMins}</Text>
              <Text style={styles.pickerUnit}>min</Text>
            </View>
            <StepBtn
              icon="add"
              onPress={() => setSnoozeMins(m => Math.min(MAX_SNOOZE, m + STEP))}
              disabled={!canIncrease || isPending}
            />
          </View>
        </View>

        {/* Action buttons */}
        <View style={styles.actions}>
          <ActionBtn
            label={snoozeMutation.isPending ? 'Snoozing…' : `Snooze ${snoozeMins} min`}
            icon="alarm-outline"
            onPress={handleSnooze}
            variant="secondary"
            disabled={isPending}
          />
          <View style={{ width: 10 }} />
          <ActionBtn
            label={completeMutation.isPending ? 'Saving…' : 'Mark Done'}
            icon="checkmark-circle-outline"
            onPress={() => completeMutation.mutate(reminder.reminderId)}
            variant="primary"
            disabled={isPending}
          />
        </View>

        <DismissBtn onPress={onDismiss} />
      </View>
    </View>
  );

  if (Platform.OS === 'web') return content;

  return (
    <Modal visible={!!reminder} transparent animationType="fade">
      {content}
    </Modal>
  );
}

function StepBtn({
  icon, onPress, disabled,
}: {
  icon: 'add' | 'remove';
  onPress: () => void;
  disabled?: boolean;
}) {
  if (Platform.OS === 'web') {
    return (
      <button
        onClick={onPress}
        disabled={disabled}
        style={{
          width: 40, height: 40, borderRadius: 20,
          border: '2px solid #E9E7FD',
          background: disabled ? '#F8F7FF' : '#FFFFFF',
          cursor: disabled ? 'not-allowed' : 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 20, color: disabled ? '#C4C6D4' : '#6C5CE7',
          fontWeight: '700',
        } as any}
      >
        {icon === 'add' ? '+' : '−'}
      </button>
    );
  }
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      style={[styles.stepBtn, disabled && styles.stepBtnDisabled]}
    >
      <Ionicons name={icon} size={18} color={disabled ? '#C4C6D4' : '#6C5CE7'} />
    </TouchableOpacity>
  );
}

function ActionBtn({
  label, onPress, variant, disabled,
}: {
  label: string;
  icon: string;
  onPress: () => void;
  variant: 'primary' | 'secondary';
  disabled?: boolean;
}) {
  if (Platform.OS === 'web') {
    return (
      <button
        onClick={onPress}
        disabled={disabled}
        style={{
          flex: 1,
          padding: '13px 8px',
          borderRadius: 14,
          border: variant === 'primary' ? 'none' : '1.5px solid #E9E7FD',
          background: variant === 'primary'
            ? 'linear-gradient(135deg,#6C5CE7,#8B5CF6)'
            : '#FFFFFF',
          color: variant === 'primary' ? '#fff' : '#6C5CE7',
          fontSize: 13, fontWeight: '700',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.6 : 1,
        } as any}
      >
        {label}
      </button>
    );
  }
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.actionBtn,
        variant === 'primary' ? styles.actionBtnPrimary : styles.actionBtnSecondary,
        disabled && { opacity: 0.6 },
      ]}
    >
      <Text style={[styles.actionBtnText, variant === 'secondary' && { color: '#6C5CE7' }]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function DismissBtn({ onPress }: { onPress: () => void }) {
  if (Platform.OS === 'web') {
    return (
      <button
        onClick={onPress}
        style={{ background: 'none', border: 'none', color: '#A0A3B1', fontSize: 12, cursor: 'pointer', marginTop: 12, fontWeight: '600' } as any}
      >
        Dismiss
      </button>
    );
  }
  return (
    <TouchableOpacity onPress={onPress} style={{ marginTop: 14 }}>
      <Text style={{ color: '#A0A3B1', fontSize: 12, fontWeight: '600' }}>Dismiss</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute' as any,
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(26,26,46,0.6)',
    alignItems: 'center', justifyContent: 'center',
    zIndex: 9999,
  },
  modal: {
    backgroundColor: '#FFFFFF', borderRadius: 24,
    padding: 28, width: '90%', maxWidth: 340,
    alignItems: 'center',
    shadowColor: '#6C5CE7', shadowOpacity: 0.25, shadowRadius: 40,
    shadowOffset: { width: 0, height: 16 }, elevation: 20,
  },
  bellWrap: { alignItems: 'center', justifyContent: 'center', marginBottom: 16, width: 72, height: 72 },
  bellRing: { position: 'absolute', width: 72, height: 72, borderRadius: 36, borderWidth: 2, borderColor: '#E9E7FD' },
  bellCircle: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#F5F3FF', alignItems: 'center', justifyContent: 'center' },
  bellEmoji: { fontSize: 26 },
  label: { fontSize: 11, fontWeight: '700', color: '#A0A3B1', letterSpacing: 1.5, marginBottom: 8 },
  title: { fontSize: 20, fontWeight: '700', color: '#1A1A2E', textAlign: 'center', marginBottom: 10, lineHeight: 26 },
  timePill: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#F5F3FF', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, marginBottom: 10 },
  timeText: { fontSize: 13, fontWeight: '600', color: '#6C5CE7' },
  notes: { fontSize: 13, color: '#8B8FA8', textAlign: 'center', marginBottom: 8, lineHeight: 20 },
  pickerSection: { width: '100%', alignItems: 'center', marginVertical: 16, padding: 16, backgroundColor: '#F8F7FF', borderRadius: 16 },
  pickerLabel: { fontSize: 10, fontWeight: '700', color: '#A0A3B1', letterSpacing: 1.2, marginBottom: 12 },
  pickerRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  pickerDisplay: { alignItems: 'center', minWidth: 64 },
  pickerValue: { fontSize: 36, fontWeight: '800', color: '#6C5CE7', lineHeight: 40 },
  pickerUnit: { fontSize: 12, color: '#A0A3B1', fontWeight: '600', marginTop: 2 },
  stepBtn: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: '#E9E7FD', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' },
  stepBtnDisabled: { borderColor: '#F0EFF8', backgroundColor: '#F8F7FF' },
  actions: { flexDirection: 'row', width: '100%' },
  actionBtn: { flex: 1, padding: 13, borderRadius: 14, alignItems: 'center' },
  actionBtnPrimary: { backgroundColor: '#6C5CE7' },
  actionBtnSecondary: { borderWidth: 1.5, borderColor: '#E9E7FD', backgroundColor: '#FFFFFF' },
  actionBtnText: { fontSize: 13, fontWeight: '700', color: '#FFFFFF' },
});
