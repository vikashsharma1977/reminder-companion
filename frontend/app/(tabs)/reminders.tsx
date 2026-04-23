import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { remindersApi } from '../../src/api/client';
import { cancelLocalReminder } from '../../src/utils/localNotifications';

const CATEGORY_CONFIG: Record<string, { color: string; bg: string; icon: string }> = {
  work:     { color: '#3B82F6', bg: '#EFF6FF', icon: '💼' },
  personal: { color: '#8B5CF6', bg: '#F5F3FF', icon: '✨' },
  health:   { color: '#10B981', bg: '#ECFDF5', icon: '🏃' },
  other:    { color: '#F59E0B', bg: '#FFFBEB', icon: '📌' },
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString([], {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export default function RemindersScreen() {
  const router = useRouter();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['reminders', 'all'],
    queryFn: () => remindersApi.getAll().then((r) => r.data as any[]),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => remindersApi.remove(id),
    onSuccess: (_data, id) => {
      cancelLocalReminder(id).catch(() => {});
      qc.invalidateQueries({ queryKey: ['reminders'] });
    },
  });

  const reminders = data ?? [];

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.heading}>All Reminders</Text>
        <View style={styles.headerRight}>
          <Text style={styles.count}>{reminders.length} total</Text>
        </View>
      </View>

      {isLoading ? (
        <ActivityIndicator color="#6C5CE7" style={{ marginTop: 60 }} />
      ) : reminders.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>📋</Text>
          <Text style={styles.emptyTitle}>No reminders yet</Text>
          <Text style={styles.emptySubtitle}>Tap + to create your first reminder.</Text>
        </View>
      ) : (
        <FlatList
          data={reminders}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => {
            const cfg = CATEGORY_CONFIG[item.category] ?? CATEGORY_CONFIG.other;
            return (
              <View style={styles.card}>
                <View style={[styles.iconBox, { backgroundColor: cfg.bg }]}>
                  <Text style={styles.iconText}>{cfg.icon}</Text>
                </View>
                <View style={styles.cardBody}>
                  <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
                  <View style={styles.cardMeta}>
                    {item.scheduledAt ? (
                      <View style={styles.metaItem}>
                        <Ionicons name="calendar-outline" size={11} color="#8B8FA8" />
                        <Text style={styles.metaText}>{formatDate(item.scheduledAt)}</Text>
                      </View>
                    ) : (
                      <View style={styles.metaItem}>
                        <Ionicons name="infinite-outline" size={11} color="#8B8FA8" />
                        <Text style={styles.metaText}>No schedule</Text>
                      </View>
                    )}
                    {item.recurrence !== 'none' && (
                      <View style={[styles.badge, { backgroundColor: '#ECFDF5' }]}>
                        <Ionicons name="repeat" size={10} color="#10B981" />
                        <Text style={[styles.badgeText, { color: '#10B981' }]}>{item.recurrence}</Text>
                      </View>
                    )}
                    <View style={[styles.badge, { backgroundColor: cfg.bg }]}>
                      <Text style={[styles.badgeText, { color: cfg.color }]}>{item.category}</Text>
                    </View>
                  </View>
                </View>
                {Platform.OS === 'web' ? (
                  <button
                    onClick={() => deleteMutation.mutate(item.id)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      padding: '8px',
                      color: '#D1D5DB',
                      borderRadius: 8,
                      alignSelf: 'center',
                    } as any}
                  >
                    <span style={{ fontSize: 18 }}>🗑️</span>
                  </button>
                ) : (
                  <TouchableOpacity
                    onPress={() => deleteMutation.mutate(item.id)}
                    style={styles.deleteBtn}
                  >
                    <Ionicons name="trash-outline" size={18} color="#D1D5DB" />
                  </TouchableOpacity>
                )}
              </View>
            );
          }}
        />
      )}

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
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: Platform.OS === 'web' ? 32 : 56,
    paddingBottom: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F0EFF8',
  },
  heading: { fontSize: 22, fontWeight: '700', color: '#1A1A2E', letterSpacing: -0.3 },
  headerRight: {},
  count: { fontSize: 13, color: '#8B8FA8', fontWeight: '500' },
  list: { padding: 16, paddingBottom: 120 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    gap: 12,
    shadowColor: '#6C5CE7',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconText: { fontSize: 22 },
  cardBody: { flex: 1 },
  cardTitle: { fontSize: 15, fontWeight: '600', color: '#1A1A2E', marginBottom: 6, lineHeight: 20 },
  cardMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  metaText: { fontSize: 11, color: '#8B8FA8', fontWeight: '500' },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 20,
  },
  badgeText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  deleteBtn: { padding: 8 },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 80 },
  emptyIcon: { fontSize: 56, marginBottom: 16 },
  emptyTitle: { fontSize: 22, fontWeight: '700', color: '#1A1A2E', marginBottom: 8 },
  emptySubtitle: { fontSize: 14, color: '#8B8FA8', textAlign: 'center' },
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
