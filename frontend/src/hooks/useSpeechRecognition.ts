import { useState, useEffect, useRef, useCallback } from 'react';
import { Platform } from 'react-native';

interface Options {
  onInterim?: (text: string) => void; // called with partial results while speaking
  onFinal: (text: string) => void;    // called when speech ends with final transcript
  onError?: (msg: string) => void;
}

export function useSpeechRecognition({ onInterim, onFinal, onError }: Options) {
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(false);
  const recognitionRef = useRef<any>(null);
  const finalRef  = useRef(onFinal);
  const interimRef = useRef(onInterim);
  // Track last interim so we can commit it if recognition ends without a final result
  const pendingInterim = useRef('');
  finalRef.current  = onFinal;
  interimRef.current = onInterim;

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
    if (!SR) return;

    setSupported(true);
    const rec = new SR();
    rec.continuous = false;
    rec.interimResults = true;
    rec.lang = 'en-US';
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
      if (e.error !== 'no-speech') onError?.(e.error === 'not-allowed'
        ? 'Microphone access denied. Allow it in browser settings.'
        : `Speech error: ${e.error}`);
    };

    rec.onend = () => {
      // Commit any in-flight interim text that never got a final result
      if (pendingInterim.current) {
        finalRef.current(pendingInterim.current);
        pendingInterim.current = '';
      }
      setListening(false);
    };

    recognitionRef.current = rec;
  }, []);

  const start = useCallback(() => {
    if (!recognitionRef.current || listening) return;
    recognitionRef.current.start();
    setListening(true);
  }, [listening]);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
    setListening(false);
  }, []);

  const toggle = useCallback(() => {
    listening ? stop() : start();
  }, [listening, start, stop]);

  return { listening, supported, toggle, start, stop };
}
