import { useState, useEffect, useRef, useCallback } from 'react';
import { Platform } from 'react-native';

interface Options {
  onInterim?: (text: string) => void;
  onFinal: (text: string) => void;
  onError?: (msg: string) => void;
}

// ── Android: expo-intent-launcher (no native module, uses OS dialog) ──────────
// Loaded lazily so web/iOS bundles aren't affected.
let IntentLauncher: any = null;
if (Platform.OS === 'android') {
  try { IntentLauncher = require('expo-intent-launcher'); } catch {}
}

// ── iOS: @react-native-voice/voice (bridge module) ────────────────────────────
let Voice: any = null;
if (Platform.OS === 'ios') {
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
  const recognitionRef = useRef<any>(null);
  const pendingInterim = useRef('');

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
    if (!SR) return;

    setSupported(true);
    const rec = new SR();
    rec.continuous      = false;
    rec.interimResults  = true;
    rec.lang            = 'en-US';
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

  // ── Android: setSupported based on IntentLauncher availability ────────────
  useEffect(() => {
    if (Platform.OS === 'android') setSupported(!!IntentLauncher);
  }, []);

  // ── iOS: @react-native-voice/voice ────────────────────────────────────────
  useEffect(() => {
    if (Platform.OS !== 'ios' || !Voice) return;

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
      return;
    }

    if (Platform.OS === 'android') {
      if (!IntentLauncher) {
        errorRef.current?.('Voice recognition not available on this device.');
        return;
      }
      try {
        setListening(true);
        // Uses the OS RecognizerIntent — no native module needed.
        // Shows Google's voice input overlay; result comes back as extra.
        const result = await IntentLauncher.startActivityAsync(
          'android.speech.action.RECOGNIZE_SPEECH',
          {
            extra: {
              'android.speech.extra.LANGUAGE_MODEL': 'free_form',
              'android.speech.extra.LANGUAGE': 'en-US',
              'android.speech.extra.PROMPT': 'Speak your reminder...',
              'android.speech.extra.MAX_RESULTS': 1,
            },
          },
        );
        setListening(false);
        // RESULT_OK = -1 on Android
        if (result.resultCode === -1 && result.extra) {
          const results: string[] = result.extra['android.speech.extra.RESULTS'] ?? [];
          if (results.length > 0) finalRef.current(results[0]);
        }
      } catch (e: any) {
        setListening(false);
        errorRef.current?.(`Voice error: ${e?.message ?? e}`);
      }
      return;
    }

    // iOS — @react-native-voice/voice
    if (!Voice) {
      errorRef.current?.('Voice recognition not available on this device.');
      return;
    }
    try {
      await Voice.start('en-US');
    } catch (e: any) {
      errorRef.current?.(`Could not start voice: ${e?.message ?? e}`);
    }
  }, [listening]);

  const stop = useCallback(async () => {
    if (Platform.OS === 'web') {
      recognitionRef.current?.stop();
    } else if (Platform.OS === 'ios' && Voice) {
      try { await Voice.stop(); } catch {}
    }
    // Android: no explicit stop — the OS dialog handles it
    setListening(false);
  }, []);

  const toggle = useCallback(() => {
    listening ? stop() : start();
  }, [listening, start, stop]);

  return { listening, supported, toggle, start, stop };
}
