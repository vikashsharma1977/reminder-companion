import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Platform,
  TouchableOpacity,
  ScrollView,
  Animated,
} from 'react-native';
import { useRef, useEffect } from 'react';
import { useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { remindersApi } from '../../src/api/client';
import { suppressFiringReminder } from '../../src/hooks/useNotifications';

const CATEGORY_CONFIG: Record<string, { color: string; bg: string; icon: string }> = {
  work:     { color: '#3B82F6', bg: '#EFF6FF', icon: '💼' },
  personal: { color: '#8B5CF6', bg: '#F5F3FF', icon: '✨' },
  health:   { color: '#10B981', bg: '#ECFDF5', icon: '🏃' },
  other:    { color: '#F59E0B', bg: '#FFFBEB', icon: '📌' },
};

interface Reminder {
  id: string;
  title: string;
  scheduledAt: string | null;
  lastFiredAt: string | null;
  category: string;
  recurrence: string;
  status: string;
}

function firedToday(r: Reminder): boolean {
  if (!r.lastFiredAt || r.recurrence === 'none') return false;
  const fired = new Date(r.lastFiredAt);
  const now = new Date();
  return fired.getFullYear() === now.getFullYear() &&
    fired.getMonth() === now.getMonth() &&
    fired.getDate() === now.getDate();
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function ReminderCard({ item, onDone }: { item: Reminder; onDone: () => void }) {
  const cfg = CATEGORY_CONFIG[item.category] ?? CATEGORY_CONFIG.other;
  const isPast = !!(item.scheduledAt && new Date(item.scheduledAt) < new Date());
  const doneToday = firedToday(item);
  const isMissed = isPast && !doneToday;

  // Pulse animation for missed reminders
  const pulseOpacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!isMissed) return;
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseOpacity, { toValue: 0.25, duration: 850, useNativeDriver: true }),
        Animated.timing(pulseOpacity, { toValue: 1, duration: 850, useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [isMissed]);

  return (
    <View style={[styles.card, doneToday ? styles.cardDoneToday : isMissed ? styles.cardMissed : undefined]}>
      <Animated.View
        style={[
          styles.cardAccent,
          {
            backgroundColor: doneToday ? '#D1D5DB' : isMissed ? '#EF4444' : cfg.color,
            opacity: isMissed ? pulseOpacity : 1,
          },
        ]}
      />
      <View style={styles.cardBody}>
        <View style={styles.cardRow}>
          <Text style={[styles.cardIcon, doneToday && styles.dimmed]}>{doneToday ? '✓' : cfg.icon}</Text>
          <View style={styles.cardMeta}>
            <Text style={[styles.cardTitle, doneToday && styles.cardTitleDone]} numberOfLines={2}>
              {item.title}
            </Text>
            <View style={styles.cardFooter}>
              {doneToday ? (
                <View style={[styles.timePill, { backgroundColor: '#F3F4F6' }]}>
                  <Ionicons name="checkmark-circle" size={11} color="#9CA3AF" />
                  <Text style={[styles.timePillText, { color: '#9CA3AF' }]}>Done for today</Text>
                </View>
              ) : item.scheduledAt ? (
                <View style={[styles.timePill, isMissed && styles.timePillMissed]}>
                  <Ionicons name="time-outline" size={11} color={isMissed ? '#EF4444' : '#6C5CE7'} />
                  <Text style={[styles.timePillText, isMissed && styles.timePillPast]}>
                    {formatTime(item.scheduledAt)}
                  </Text>
                </View>
              ) : (
                <View style={styles.timePill}>
                  <Text style={styles.timePillText}>Anytime</Text>
                </View>
              )}
              {isMissed && (
                <View style={styles.missedBadge}>
                  <Ionicons name="alert-circle" size={10} color="#EF4444" />
                  <Text style={styles.missedBadgeText}>MISSED</Text>
                </View>
              )}
              {item.recurrence !== 'none' && (
                <View style={[styles.recurrencePill, doneToday && { backgroundColor: '#F3F4F6' }]}>
                  <Ionicons name="repeat" size={10} color={doneToday ? '#9CA3AF' : '#10B981'} />
                  <Text style={[styles.recurrencePillText, doneToday && { color: '#9CA3AF' }]}>
                    {item.recurrence}
                  </Text>
                </View>
              )}
            </View>
          </View>
        </View>
      </View>
      {!doneToday && (
        Platform.OS === 'web' ? (
          <button
            onClick={onDone}
            style={{
              background: 'transparent',
              border: `1.5px solid ${cfg.color}`,
              borderRadius: 20,
              padding: '6px 14px',
              color: cfg.color,
              fontSize: 12,
              fontWeight: '700',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              alignSelf: 'center',
            } as any}
          >
            Done
          </button>
        ) : (
          <TouchableOpacity style={[styles.doneBtn, { borderColor: cfg.color }]} onPress={onDone}>
            <Text style={[styles.doneBtnText, { color: cfg.color }]}>Done</Text>
          </TouchableOpacity>
        )
      )}
    </View>
  );
}

export default function TodayScreen() {
  const router = useRouter();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['reminders', 'today'],
    queryFn: () => remindersApi.getToday().then((r) => r.data as Reminder[]),
  });

  const completeMutation = useMutation({
    mutationFn: (id: string) => remindersApi.complete(id),
    onSuccess: (_data, id) => {
      suppressFiringReminder(id);
      qc.invalidateQueries({ queryKey: ['reminders'] });
    },
  });

  const allReminders = data ?? [];
  const doneReminders = allReminders.filter(firedToday);
  const activeReminders = allReminders.filter((r) => !firedToday(r));
  const missedReminders = activeReminders.filter(
    (r) => r.scheduledAt && new Date(r.scheduledAt) < new Date(),
  );
  const upcomingReminders = activeReminders.filter(
    (r) => !r.scheduledAt || new Date(r.scheduledAt) >= new Date(),
  );
  const pendingReminders = activeReminders; // total not-done-today count
  // Order: upcoming → missed (draws attention) → done today
  const reminders = [...upcomingReminders, ...missedReminders, ...doneReminders];
  const today = new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>{getGreeting()}</Text>
          <Text style={styles.date}>{today}</Text>
        </View>
        <View style={styles.countBubble}>
          <Text style={styles.countText}>{pendingReminders.length}</Text>
        </View>
      </View>

      {/* Summary strip */}
      {reminders.length > 0 && (
        <View style={styles.strip}>
          <Ionicons name="checkmark-circle-outline" size={14} color="#6C5CE7" />
          <Text style={styles.stripText}>
            {pendingReminders.length > 0
              ? `${pendingReminders.length} remaining${doneReminders.length > 0 ? ` · ${doneReminders.length} done today` : ''}`
              : 'All done for today!'}
          </Text>
        </View>
      )}

      {/* List */}
      {isLoading ? (
        <ActivityIndicator color="#6C5CE7" style={{ marginTop: 60 }} />
      ) : reminders.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>🎉</Text>
          <Text style={styles.emptyTitle}>All clear!</Text>
          <Text style={styles.emptySubtitle}>No reminders for today.{'\n'}Tap + to add one.</Text>
        </View>
      ) : (
        <FlatList
          data={reminders}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <ReminderCard
              item={item}
              onDone={() => completeMutation.mutate(item.id)}
            />
          )}
        />
      )}

      {/* FAB */}
      {Platform.OS === 'web' ? (
        <button
          onClick={() => router.push('/reminder/new')}
          style={{
            position: 'fixed',
            bottom: 90,
            right: 28,
            width: 56,
            height: 56,
            borderRadius: 28,
            background: 'linear-gradient(135deg, #6C5CE7, #8B5CF6)',
            border: 'none',
            color: '#fff',
            fontSize: 28,
            cursor: 'pointer',
            boxShadow: '0 8px 24px rgba(108,92,231,0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            lineHeight: 1,
          } as any}
        >
          +
        </button>
      ) : (
        <TouchableOpacity style={styles.fab} onPress={() => router.push('/reminder/new')}>
          <Text style={styles.fabText}>+</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F7FF' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 24,
    paddingTop: Platform.OS === 'web' ? 32 : 56,
    paddingBottom: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F0EFF8',
  },
  greeting: { fontSize: 22, fontWeight: '700', color: '#1A1A2E', letterSpacing: -0.3 },
  date: { fontSize: 13, color: '#8B8FA8', marginTop: 3 },
  countBubble: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F5F3FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: { fontSize: 18, fontWeight: '800', color: '#6C5CE7' },
  strip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 24,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F0EFF8',
  },
  stripText: { fontSize: 12, color: '#6C5CE7', fontWeight: '600' },
  list: { padding: 16, paddingBottom: 120 },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'stretch',
    overflow: 'hidden',
    shadowColor: '#6C5CE7',
    shadowOpacity: 0.07,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  cardPast: { opacity: 0.65 },
  cardMissed: { borderWidth: 1, borderColor: '#FECACA' },
  cardDoneToday: { opacity: 0.6 },
  cardTitleDone: { textDecorationLine: 'line-through', color: '#9CA3AF' },
  dimmed: { opacity: 0.4 },
  cardAccent: { width: 4, borderRadius: 2 },
  cardBody: { flex: 1, padding: 14 },
  cardRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  cardIcon: { fontSize: 22, marginTop: 1 },
  cardMeta: { flex: 1 },
  cardTitle: { fontSize: 15, fontWeight: '600', color: '#1A1A2E', lineHeight: 21, marginBottom: 8 },
  cardFooter: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  timePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#F5F3FF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
  },
  timePillText: { fontSize: 11, fontWeight: '600', color: '#6C5CE7' },
  timePillPast: { color: '#EF4444' },
  timePillMissed: { backgroundColor: '#FEF2F2' },
  missedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  missedBadgeText: { fontSize: 10, fontWeight: '800', color: '#EF4444', letterSpacing: 0.5 },
  recurrencePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
  },
  recurrencePillText: { fontSize: 11, fontWeight: '600', color: '#10B981' },
  doneBtn: {
    borderWidth: 1.5,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
    alignSelf: 'center',
    marginRight: 14,
  },
  doneBtnText: { fontSize: 12, fontWeight: '700' },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 80 },
  emptyIcon: { fontSize: 56, marginBottom: 16 },
  emptyTitle: { fontSize: 22, fontWeight: '700', color: '#1A1A2E', marginBottom: 8 },
  emptySubtitle: { fontSize: 14, color: '#8B8FA8', textAlign: 'center', lineHeight: 22 },
  fab: {
    position: 'absolute',
    bottom: 90,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#6C5CE7',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#6C5CE7',
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 8,
  },
  fabText: { color: '#fff', fontSize: 30, lineHeight: 34 },
});
