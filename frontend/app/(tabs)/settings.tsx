import { View, Text, StyleSheet, TouchableOpacity, Platform, ScrollView, TextInput, ActivityIndicator, Switch, Vibration } from 'react-native';
import { useRouter } from 'expo-router';
import { authApi } from '../../src/api/client';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { usersApi } from '../../src/api/client';
import { useAlertPrefs, SOUND_OPTIONS, AlertCategory, AlertSound } from '../../src/hooks/useAlertPrefs';

const COMMON_TIMEZONES = [
  'UTC',
  'Asia/Kolkata',
  'Asia/Dubai',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Moscow',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Sao_Paulo',
  'Australia/Sydney',
  'Pacific/Auckland',
];

function SectionLabel({ label }: { label: string }) {
  return <Text style={styles.sectionLabel}>{label}</Text>;
}

function SettingsRow({
  icon,
  label,
  value,
  danger,
  onPress,
  children,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  value?: string;
  danger?: boolean;
  onPress?: () => void;
  children?: React.ReactNode;
}) {
  const inner = (
    <View style={styles.row}>
      <View style={[styles.rowIcon, danger && styles.rowIconDanger]}>
        <Ionicons name={icon} size={16} color={danger ? '#EF4444' : '#6C5CE7'} />
      </View>
      <View style={styles.rowContent}>
        <Text style={[styles.rowLabel, danger && styles.rowLabelDanger]}>{label}</Text>
        {children}
      </View>
      {value && !children ? <Text style={styles.rowValue}>{value}</Text> : null}
      {onPress && !children ? <Ionicons name="chevron-forward" size={14} color="#D1D5DB" /> : null}
    </View>
  );

  if (onPress && !children) {
    if (Platform.OS === 'web') {
      return (
        <button onClick={onPress} style={{ background: 'none', border: 'none', padding: 0, width: '100%', cursor: 'pointer', textAlign: 'left' } as any}>
          {inner}
        </button>
      );
    }
    return <TouchableOpacity onPress={onPress}>{inner}</TouchableOpacity>;
  }
  return inner;
}

export default function SettingsScreen() {
  const router = useRouter();
  const qc = useQueryClient();

  const { data: user, isLoading } = useQuery({
    queryKey: ['me'],
    queryFn: () => usersApi.getMe().then((r) => r.data),
  });

  const updateMutation = useMutation({
    mutationFn: (data: { displayName?: string; timezone?: string }) => usersApi.updateMe(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['me'] }),
  });

  const [displayName, setDisplayName] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [showTzPicker, setShowTzPicker] = useState(false);
  const { prefs, setGlobal, setCategoryOverride, resetCategory } = useAlertPrefs();
  const [expandedCat, setExpandedCat] = useState<AlertCategory | null>(null);

  const CATEGORIES: { id: AlertCategory; label: string; emoji: string; color: string }[] = [
    { id: 'health',   label: 'Health',   emoji: '🏃', color: '#10B981' },
    { id: 'work',     label: 'Work',     emoji: '💼', color: '#3B82F6' },
    { id: 'personal', label: 'Personal', emoji: '✨', color: '#8B5CF6' },
    { id: 'other',    label: 'Other',    emoji: '📌', color: '#F59E0B' },
  ];

  useEffect(() => {
    if (user?.displayName) setDisplayName(user.displayName);
  }, [user?.displayName]);

  const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const activeTz = user?.timezone ?? browserTz;

  const handleLogout = async () => {
    const doLogout = async () => {
      await authApi.logout(); // revokes refresh token server-side + clears local storage
      router.replace('/auth/login');
    };

    if (Platform.OS === 'web') {
      if (!window.confirm('Sign out of Reminder Companion?')) return;
      await doLogout();
      return;
    }
    const { Alert } = require('react-native');
    Alert.alert('Sign Out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: doLogout },
    ]);
  };

  if (isLoading) {
    return <View style={styles.container}><ActivityIndicator color="#6C5CE7" style={{ marginTop: 80 }} /></View>;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.heading}>Settings</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Profile card */}
        <View style={styles.profileCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {(user?.displayName ?? user?.email ?? 'U')[0].toUpperCase()}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.profileName}>{user?.displayName ?? 'No name set'}</Text>
            <Text style={styles.profileEmail}>{user?.email}</Text>
          </View>
        </View>

        {/* Profile */}
        <SectionLabel label="PROFILE" />
        <View style={styles.card}>
          <SettingsRow icon="person-outline" label="Display Name">
            {editingName ? (
              <View style={styles.inlineEdit}>
                <TextInput
                  style={styles.inlineInput}
                  value={displayName}
                  onChangeText={setDisplayName}
                  autoFocus
                  placeholder="Your name"
                  placeholderTextColor="#C4C6D4"
                />
                <View style={styles.inlineActions}>
                  {Platform.OS === 'web' ? (
                    <>
                      <button
                        onClick={() => { updateMutation.mutate({ displayName }); setEditingName(false); }}
                        style={{ background: '#6C5CE7', border: 'none', borderRadius: 8, color: '#fff', fontSize: 12, fontWeight: '700', padding: '6px 12px', cursor: 'pointer', marginRight: 6 } as any}
                      >
                        Save
                      </button>
                      <button
                        onClick={() => { setDisplayName(user?.displayName ?? ''); setEditingName(false); }}
                        style={{ background: '#F5F3FF', border: 'none', borderRadius: 8, color: '#6C5CE7', fontSize: 12, fontWeight: '700', padding: '6px 12px', cursor: 'pointer' } as any}
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <TouchableOpacity style={styles.saveBtn} onPress={() => { updateMutation.mutate({ displayName }); setEditingName(false); }}>
                        <Text style={styles.saveBtnText}>Save</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => { setDisplayName(user?.displayName ?? ''); setEditingName(false); }}>
                        <Text style={styles.cancelBtnText}>Cancel</Text>
                      </TouchableOpacity>
                    </>
                  )}
                </View>
              </View>
            ) : (
              <View style={styles.inlineRow}>
                <Text style={styles.inlineValue}>{user?.displayName ?? 'Not set'}</Text>
                {Platform.OS === 'web' ? (
                  <button onClick={() => setEditingName(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6C5CE7', fontSize: 12, fontWeight: '700' } as any}>Edit</button>
                ) : (
                  <TouchableOpacity onPress={() => setEditingName(true)}>
                    <Text style={styles.editLink}>Edit</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </SettingsRow>
          <View style={styles.divider} />
          <SettingsRow icon="mail-outline" label="Email" value={user?.email} />
        </View>

        {/* Timezone */}
        <SectionLabel label="TIMEZONE" />
        <View style={styles.card}>
          <SettingsRow icon="globe-outline" label="Your Timezone">
            {Platform.OS === 'web' ? (
              <select
                value={activeTz}
                onChange={(e) => updateMutation.mutate({ timezone: e.target.value })}
                style={{
                  marginTop: 6,
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: 10,
                  border: '1.5px solid #E9E7FD',
                  backgroundColor: '#F8F7FF',
                  color: '#1A1A2E',
                  fontSize: 14,
                  fontWeight: '500',
                  cursor: 'pointer',
                  outline: 'none',
                } as any}
              >
                {/* Always include browser timezone at top even if not in list */}
                {!COMMON_TIMEZONES.includes(browserTz) && (
                  <option value={browserTz}>{browserTz} (current)</option>
                )}
                {COMMON_TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>{tz}</option>
                ))}
              </select>
            ) : (
              <>
                <TouchableOpacity style={styles.tzRow} onPress={() => setShowTzPicker(v => !v)}>
                  <Text style={styles.tzValue}>{activeTz}</Text>
                  <Ionicons name={showTzPicker ? 'chevron-up' : 'chevron-down'} size={14} color="#6C5CE7" />
                </TouchableOpacity>
                {showTzPicker && (
                  <ScrollView style={styles.tzList} nestedScrollEnabled showsVerticalScrollIndicator>
                    {[...new Set([browserTz, ...COMMON_TIMEZONES])].map(tz => (
                      <TouchableOpacity
                        key={tz}
                        style={[styles.tzOption, tz === activeTz && styles.tzOptionActive]}
                        onPress={() => {
                          updateMutation.mutate({ timezone: tz });
                          setShowTzPicker(false);
                        }}
                      >
                        <Text style={[styles.tzOptionText, tz === activeTz && styles.tzOptionTextActive]}>
                          {tz}
                        </Text>
                        {tz === activeTz && <Ionicons name="checkmark" size={14} color="#6C5CE7" />}
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                )}
              </>
            )}
          </SettingsRow>
          <View style={styles.divider} />
          <SettingsRow
            icon="information-circle-outline"
            label="Detected"
            value={browserTz}
            onPress={activeTz !== browserTz ? () => updateMutation.mutate({ timezone: browserTz }) : undefined}
          >
            {Platform.OS !== 'web' ? (
              <View style={styles.inlineRow}>
                <Text style={styles.inlineValue}>{browserTz}</Text>
                {activeTz !== browserTz && (
                  <TouchableOpacity onPress={() => updateMutation.mutate({ timezone: browserTz })}>
                    <Text style={styles.useDetectedBtn}>Use this</Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : undefined}
          </SettingsRow>
        </View>

        {/* Alert Settings */}
        <SectionLabel label="ALERTS" />
        <View style={styles.card}>
          {/* Global vibration toggle */}
          <View style={styles.row}>
            <View style={styles.rowIcon}><Ionicons name="phone-portrait-outline" size={16} color="#6C5CE7" /></View>
            <View style={styles.rowContent}><Text style={styles.rowLabel}>Vibration</Text></View>
            <Switch
              value={prefs.vibration}
              onValueChange={v => { setGlobal({ vibration: v }); if (v) Vibration.vibrate(200); }}
              trackColor={{ false: '#E9E7FD', true: '#6C5CE7' }}
              thumbColor="#fff"
            />
          </View>
          <View style={styles.divider} />

          {/* Global sound toggle */}
          <View style={styles.row}>
            <View style={styles.rowIcon}><Ionicons name="volume-medium-outline" size={16} color="#6C5CE7" /></View>
            <View style={styles.rowContent}><Text style={styles.rowLabel}>Sound</Text></View>
            <Switch
              value={prefs.sound}
              onValueChange={v => setGlobal({ sound: v })}
              trackColor={{ false: '#E9E7FD', true: '#6C5CE7' }}
              thumbColor="#fff"
            />
          </View>

          {/* Default sound picker */}
          {prefs.sound && (
            <>
              <View style={styles.divider} />
              <View style={[styles.row, { flexDirection: 'column', alignItems: 'flex-start' }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                  <View style={styles.rowIcon}><Ionicons name="musical-notes-outline" size={16} color="#6C5CE7" /></View>
                  <Text style={styles.rowLabel}>Default Sound</Text>
                </View>
                <View style={styles.soundGrid}>
                  {SOUND_OPTIONS.map(s => (
                    <TouchableOpacity
                      key={s.value}
                      style={[styles.soundChip, prefs.defaultSound === s.value && styles.soundChipActive]}
                      onPress={() => setGlobal({ defaultSound: s.value as AlertSound })}
                    >
                      <Text style={styles.soundEmoji}>{s.emoji}</Text>
                      <Text style={[styles.soundLabel, prefs.defaultSound === s.value && styles.soundLabelActive]}>{s.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </>
          )}
        </View>

        {/* Per-category overrides */}
        <SectionLabel label="ALERT BY CATEGORY" />
        <View style={styles.card}>
          {CATEGORIES.map((cat, idx) => {
            const override = prefs.categoryOverrides[cat.id];
            const activeSound = override?.sound ?? prefs.defaultSound;
            const activeVib = override?.vibration ?? prefs.vibration;
            const hasOverride = !!override;
            const isExpanded = expandedCat === cat.id;

            return (
              <View key={cat.id}>
                {idx > 0 && <View style={styles.divider} />}
                <TouchableOpacity
                  style={styles.row}
                  onPress={() => setExpandedCat(isExpanded ? null : cat.id)}
                >
                  <View style={[styles.rowIcon, { backgroundColor: cat.color + '22' }]}>
                    <Text style={{ fontSize: 14 }}>{cat.emoji}</Text>
                  </View>
                  <View style={styles.rowContent}>
                    <Text style={styles.rowLabel}>{cat.label}</Text>
                    <Text style={styles.rowSubLabel}>
                      {hasOverride ? `Custom · ${activeSound}${activeVib ? ' + vibrate' : ''}` : 'Using default'}
                    </Text>
                  </View>
                  {hasOverride && (
                    <TouchableOpacity onPress={() => resetCategory(cat.id)} style={styles.resetBtn}>
                      <Text style={styles.resetBtnText}>Reset</Text>
                    </TouchableOpacity>
                  )}
                  <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={14} color="#C4C6D4" />
                </TouchableOpacity>

                {isExpanded && (
                  <View style={styles.catOverride}>
                    {/* Vibration override */}
                    <View style={styles.overrideRow}>
                      <Ionicons name="phone-portrait-outline" size={14} color="#6C5CE7" />
                      <Text style={styles.overrideLabel}>Vibration</Text>
                      <Switch
                        value={activeVib}
                        onValueChange={v => { setCategoryOverride(cat.id, { vibration: v }); if (v) Vibration.vibrate(200); }}
                        trackColor={{ false: '#E9E7FD', true: '#6C5CE7' }}
                        thumbColor="#fff"
                        style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }}
                      />
                    </View>

                    {/* Sound override */}
                    {prefs.sound && (
                      <>
                        <View style={styles.overrideRow}>
                          <Ionicons name="musical-notes-outline" size={14} color="#6C5CE7" />
                          <Text style={styles.overrideLabel}>Sound</Text>
                        </View>
                        <View style={styles.soundGrid}>
                          {SOUND_OPTIONS.map(s => (
                            <TouchableOpacity
                              key={s.value}
                              style={[styles.soundChip, activeSound === s.value && styles.soundChipActive]}
                              onPress={() => setCategoryOverride(cat.id, { sound: s.value as AlertSound })}
                            >
                              <Text style={styles.soundEmoji}>{s.emoji}</Text>
                              <Text style={[styles.soundLabel, activeSound === s.value && styles.soundLabelActive]}>{s.label}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      </>
                    )}
                  </View>
                )}
              </View>
            );
          })}
        </View>

        {/* App */}
        <SectionLabel label="APP INFO" />
        <View style={styles.card}>
          <SettingsRow icon="code-slash-outline" label="Version" value="1.0.0 (MVP)" />
          <View style={styles.divider} />
          <SettingsRow icon="server-outline" label="Backend" value="localhost:3001" />
        </View>

        {/* Account */}
        <SectionLabel label="ACCOUNT" />
        <View style={styles.card}>
          <SettingsRow icon="log-out-outline" label="Sign Out" danger onPress={handleLogout} />
        </View>

        <Text style={styles.footer}>Made with ❤️ — Reminder Companion</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F7FF' },
  header: {
    paddingHorizontal: 24,
    paddingTop: Platform.OS === 'web' ? 32 : 56,
    paddingBottom: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F0EFF8',
  },
  heading: { fontSize: 22, fontWeight: '700', color: '#1A1A2E', letterSpacing: -0.3 },
  content: { padding: 20, paddingBottom: 60 },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 18,
    marginBottom: 24,
    shadowColor: '#6C5CE7',
    shadowOpacity: 0.07,
    shadowRadius: 12,
    elevation: 2,
  },
  avatar: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: '#6C5CE7',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontWeight: '800', fontSize: 18 },
  profileName: { fontSize: 16, fontWeight: '700', color: '#1A1A2E' },
  profileEmail: { fontSize: 13, color: '#8B8FA8', marginTop: 2 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: '#A0A3B1', letterSpacing: 1.2, marginBottom: 8, marginLeft: 4 },
  card: {
    backgroundColor: '#FFFFFF', borderRadius: 16, overflow: 'hidden', marginBottom: 20,
    shadowColor: '#6C5CE7', shadowOpacity: 0.05, shadowRadius: 10, elevation: 2,
  },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  rowIcon: { width: 32, height: 32, borderRadius: 8, backgroundColor: '#F5F3FF', alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  rowIconDanger: { backgroundColor: '#FEF2F2' },
  rowContent: { flex: 1 },
  rowLabel: { fontSize: 15, color: '#1A1A2E', fontWeight: '500' },
  rowLabelDanger: { color: '#EF4444', fontWeight: '600' },
  rowValue: { fontSize: 13, color: '#A0A3B1', fontWeight: '500', alignSelf: 'center' },
  divider: { height: 1, backgroundColor: '#F5F3FF', marginLeft: 60 },
  inlineEdit: { marginTop: 8, gap: 8 },
  inlineInput: {
    borderWidth: 1.5, borderColor: '#E9E7FD', borderRadius: 10,
    padding: 10, fontSize: 14, color: '#1A1A2E', backgroundColor: '#F8F7FF',
  },
  inlineActions: { flexDirection: 'row', gap: 8 },
  saveBtn: { backgroundColor: '#6C5CE7', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 6 },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  cancelBtnText: { color: '#6C5CE7', fontWeight: '700', fontSize: 12, paddingVertical: 6 },
  inlineRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
  inlineValue: { fontSize: 14, color: '#8B8FA8', fontWeight: '500' },
  editLink: { color: '#6C5CE7', fontWeight: '700', fontSize: 12 },
  footer: { textAlign: 'center', fontSize: 12, color: '#C4C6D4', marginTop: 8 },
  tzRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, backgroundColor: '#F5F3FF' },
  tzValue: { fontSize: 13, color: '#6C5CE7', fontWeight: '600', flex: 1 },
  tzList: { maxHeight: 200, marginTop: 8, borderRadius: 10, borderWidth: 1.5, borderColor: '#E9E7FD', backgroundColor: '#FAFAFA' },
  tzOption: { paddingHorizontal: 14, paddingVertical: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tzOptionActive: { backgroundColor: '#F5F3FF' },
  tzOptionText: { fontSize: 13, color: '#4B5563', fontWeight: '500' },
  tzOptionTextActive: { color: '#6C5CE7', fontWeight: '700' },
  useDetectedBtn: { color: '#6C5CE7', fontWeight: '700', fontSize: 12, paddingVertical: 2, paddingHorizontal: 8, backgroundColor: '#F5F3FF', borderRadius: 6 },
  soundGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingLeft: 44, paddingBottom: 4 },
  soundChip: { alignItems: 'center', padding: 10, borderRadius: 12, borderWidth: 1.5, borderColor: '#E9E7FD', backgroundColor: '#F8F7FF', minWidth: 64 },
  soundChipActive: { borderColor: '#6C5CE7', backgroundColor: '#F5F3FF' },
  soundEmoji: { fontSize: 20, marginBottom: 4 },
  soundLabel: { fontSize: 11, fontWeight: '600', color: '#8B8FA8' },
  soundLabelActive: { color: '#6C5CE7' },
  rowSubLabel: { fontSize: 12, color: '#A0A3B1', marginTop: 1 },
  catOverride: { backgroundColor: '#FAFAFE', paddingHorizontal: 16, paddingBottom: 14, paddingTop: 4 },
  overrideRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  overrideLabel: { flex: 1, fontSize: 13, color: '#4B5563', fontWeight: '500' },
  resetBtn: { backgroundColor: '#FEF2F2', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, marginRight: 6 },
  resetBtnText: { fontSize: 11, color: '#EF4444', fontWeight: '700' },
});
