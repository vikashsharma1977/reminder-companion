import { useState, useEffect, useRef, useCallback } from 'react';
import { Platform, PermissionsAndroid } from 'react-native';

interface Options {
  onInterim?: (text: string) => void;
  onFinal: (text: string) => void;
  onError?: (msg: string) => void;
}

// ── Native voice module (loaded only on iOS/Android) ─────────────────────────
let Voice: any = null;
if (Platform.OS !== 'web') {
  try { Voice = require('@react-native-voice/voice').default; } catch {}
}

export function useSpeechRecognition({ onInterim, onFinal, onError }: Options) {
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(false);

  const finalRef   = useRef(onFinal);
  const interimRef = useRef(onInterim);
  const errorRef   = useRef(onError);
  finalRef.current   = onFinal;
  interimRef.current = onInterim;
  errorRef.current   = onError;

  // ── Web: Web Speech API ───────────────────────────────────────────────────
  const recognitionRef  = useRef<any>(null);
  const pendingInterim  = useRef('');

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
    if (!SR) return;

    setSupported(true);
    const rec = new SR();
    rec.continuous     = false;
    rec.interimResults = true;
    rec.lang           = 'en-US';
    rec.maxAlternatives = 1;

    rec.onresult = (e: any) => {
      let interim = '';
      let final = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) { final += t; pendingInterim.current = ''; }
        else { interim += t; pendingInterim.current = t; }
      }
      if (interim) interimRef.current?.(interim);
      if (final)   finalRef.current(final);
    };

    rec.onerror = (e: any) => {
      setListening(false);
      if (e.error !== 'no-speech') errorRef.current?.(
        e.error === 'not-allowed'
          ? 'Microphone access denied. Allow it in browser settings.'
          : `Speech error: ${e.error}`,
      );
    };

    rec.onend = () => {
      if (pendingInterim.current) {
        finalRef.current(pendingInterim.current);
        pendingInterim.current = '';
      }
      setListening(false);
    };

    recognitionRef.current = rec;
  }, []);

  // ── Native: @react-native-voice/voice ────────────────────────────────────
  useEffect(() => {
    if (Platform.OS === 'web' || !Voice) return;

    setSupported(true);

    Voice.onSpeechStart   = () => setListening(true);
    Voice.onSpeechEnd     = () => setListening(false);

    Voice.onSpeechPartialResults = (e: any) => {
      const text = e?.value?.[0] ?? '';
      if (text) interimRef.current?.(text);
    };

    Voice.onSpeechResults = (e: any) => {
      const text = e?.value?.[0] ?? '';
      if (text) finalRef.current(text);
      setListening(false);
    };

    Voice.onSpeechError = (e: any) => {
      setListening(false);
      const code = e?.error?.code ?? e?.error ?? '';
      if (code !== '5' && code !== 'no_match') {
        errorRef.current?.(
          String(code).includes('permission')
            ? 'Microphone permission denied.'
            : `Voice error: ${code}`,
        );
      }
    };

    return () => { Voice.destroy().catch(() => {}); };
  }, []);

  // ── Controls ──────────────────────────────────────────────────────────────
  const start = useCallback(async () => {
    if (listening) return;
    if (Platform.OS === 'web') {
      recognitionRef.current?.start();
      setListening(true);
    } else {
      try {
        if (Platform.OS === 'android') {
          const granted = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
            {
              title: 'Microphone Permission',
              message: 'Reminder Companion needs microphone access for voice reminders.',
              buttonPositive: 'Allow',
            },
          );
          if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
            errorRef.current?.('Microphone permission denied.');
            return;
          }
        }
        await Voice.start('en-US');
      } catch (e: any) {
        errorRef.current?.(`Could not start voice: ${e?.message ?? e}`);
      }
    }
  }, [listening]);

  const stop = useCallback(async () => {
    if (Platform.OS === 'web') {
      recognitionRef.current?.stop();
    } else {
      try { await Voice.stop(); } catch {}
    }
    setListening(false);
  }, []);

  const toggle = useCallback(() => {
    listening ? stop() : start();
  }, [listening, start, stop]);

  return { listening, supported, toggle, start, stop };
}
