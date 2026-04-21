import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type AlertSound = 'chime' | 'bell' | 'gentle' | 'urgent' | 'none';
export type AlertCategory = 'health' | 'work' | 'personal' | 'other' | 'default';

export interface AlertPrefs {
  vibration: boolean;
  sound: boolean;
  categoryOverrides: Partial<Record<AlertCategory, { sound: AlertSound; vibration: boolean }>>;
  defaultSound: AlertSound;
}

export const SOUND_OPTIONS: { value: AlertSound; label: string; emoji: string; desc: string }[] = [
  { value: 'chime',   label: 'Chime',   emoji: '🔔', desc: 'Soft chime'      },
  { value: 'bell',    label: 'Bell',    emoji: '🛎️', desc: 'Classic bell'    },
  { value: 'gentle',  label: 'Gentle',  emoji: '🎵', desc: 'Soft melody'     },
  { value: 'urgent',  label: 'Urgent',  emoji: '🚨', desc: 'Attention alert' },
  { value: 'none',    label: 'Silent',  emoji: '🔇', desc: 'No sound'        },
];

const DEFAULT_PREFS: AlertPrefs = {
  vibration: true,
  sound: true,
  defaultSound: 'chime',
  categoryOverrides: {},
};

const STORAGE_KEY = 'alert_prefs';

export function useAlertPrefs() {
  const [prefs, setPrefs] = useState<AlertPrefs>(DEFAULT_PREFS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(raw => {
      if (raw) {
        try { setPrefs({ ...DEFAULT_PREFS, ...JSON.parse(raw) }); } catch {}
      }
      setLoaded(true);
    });
  }, []);

  const save = useCallback(async (updated: AlertPrefs) => {
    setPrefs(updated);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  }, []);

  const setGlobal = useCallback((patch: Partial<Pick<AlertPrefs, 'vibration' | 'sound' | 'defaultSound'>>) => {
    save({ ...prefs, ...patch });
  }, [prefs, save]);

  const setCategoryOverride = useCallback((cat: AlertCategory, patch: Partial<{ sound: AlertSound; vibration: boolean }>) => {
    const existing = prefs.categoryOverrides[cat] ?? { sound: prefs.defaultSound, vibration: prefs.vibration };
    save({ ...prefs, categoryOverrides: { ...prefs.categoryOverrides, [cat]: { ...existing, ...patch } } });
  }, [prefs, save]);

  const resetCategory = useCallback((cat: AlertCategory) => {
    const { [cat]: _, ...rest } = prefs.categoryOverrides;
    save({ ...prefs, categoryOverrides: rest });
  }, [prefs, save]);

  return { prefs, loaded, setGlobal, setCategoryOverride, resetCategory };
}
