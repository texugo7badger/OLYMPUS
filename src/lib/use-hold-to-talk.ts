'use client';

/**
 * use-hold-to-talk.ts — v0.0.64: press and hold, speak, release, send.
 *
 * The studio's ring is the button: pointerdown starts the mic, pointerup
 * stops it, pointercancel (or a slide-away) discards it. The transcript comes
 * from the server STT (`/api/olympus/voice/listen`, the same lane as the
 * desktop), with the browser's SpeechRecognition as a fallback when
 * MediaRecorder/getUserMedia is unavailable (or blocked on HTTP).
 *
 * The analyser drives the ring's level while the user speaks — the same
 * visual language as the god's TTS level.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { speechLocale, type Language } from './i18n';

export interface HoldToTalk {
  recording: boolean;
  transcribing: boolean;
  level: number;
  supported: boolean;
  start: () => Promise<void>;
  stop: (cancel?: boolean) => void;
}

export function useHoldToTalk(opts: {
  language: Language;
  onText: (text: string) => void;
  onError?: (message: string) => void;
}): HoldToTalk {
  const { language, onText, onError } = opts;
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [level, setLevel] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef(0);
  const cancelledRef = useRef(false);
  const srRef = useRef<any>(null);
  const srTextRef = useRef('');
  const onTextRef = useRef(onText);
  const onErrorRef = useRef(onError);
  const langRef = useRef(language);
  useEffect(() => { onTextRef.current = onText; }, [onText]);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);
  useEffect(() => { langRef.current = language; }, [language]);

  const supported = typeof window !== 'undefined'
    && (typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia);

  const stopLevel = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    setLevel(0);
  }, []);

  const stop = useCallback((cancel = false) => {
    cancelledRef.current = cancel;
    stopLevel();
    if (srRef.current) {
      try { srRef.current.stop(); } catch { /* already stopped */ }
      return;
    }
    try { recorderRef.current?.stop(); } catch { /* already stopped */ }
  }, [stopLevel]);

  const start = useCallback(async () => {
    if (recording) return;
    cancelledRef.current = false;
    srTextRef.current = '';
    try {
      if (supported && typeof MediaRecorder !== 'undefined') {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;
        chunksRef.current = [];
        const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : '';
        const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
        recorderRef.current = rec;
        rec.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
        rec.onstop = async () => {
          setRecording(false);
          stopLevel();
          stream.getTracks().forEach((t) => t.stop());
          const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' });
          if (cancelledRef.current || !blob.size) { setTranscribing(false); return; }
          setTranscribing(true);
          try {
            const fd = new FormData();
            fd.append('audio', blob, 'mic.webm');
            fd.append('language', langRef.current);
            const r = await fetch('/api/olympus/voice/listen', { method: 'POST', body: fd });
            const d = await r.json().catch(() => null);
            if (d?.ok && d.text) onTextRef.current(String(d.text).trim());
            else onErrorRef.current?.(d?.error || 'no speech recognized');
          } catch (e: any) {
            onErrorRef.current?.(e?.message || 'transcription failed');
          } finally {
            setTranscribing(false);
          }
        };
        // the ring reads the real mic level
        try {
          const Ctx = window.AudioContext || (window as any).webkitAudioContext;
          audioCtxRef.current ??= new Ctx();
          const src = audioCtxRef.current.createMediaStreamSource(stream);
          const analyser = audioCtxRef.current.createAnalyser();
          analyser.fftSize = 256;
          src.connect(analyser);
          const data = new Uint8Array(analyser.frequencyBinCount);
          const tick = () => {
            if (!recorderRef.current || recorderRef.current.state === 'inactive') { setLevel(0); return; }
            analyser.getByteFrequencyData(data);
            let sum = 0;
            for (let i = 0; i < data.length; i += 1) sum += data[i];
            setLevel(Math.min(1, sum / data.length / 64));
            rafRef.current = requestAnimationFrame(tick);
          };
          tick();
        } catch { /* the ring stays calm */ }
        rec.start();
        setRecording(true);
        return;
      }
    } catch (e: any) {
      onErrorRef.current?.(e?.message || 'microphone unavailable');
    }

    // Fallback: the browser's own recognition (works where getUserMedia is blocked).
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { onErrorRef.current?.('This browser has no speech recognition.'); return; }
    try {
      const sr = new SR();
      srRef.current = sr;
      sr.lang = speechLocale(langRef.current);
      sr.interimResults = true;
      sr.continuous = false;
      sr.onresult = (ev: any) => {
        let heard = '';
        for (let i = ev.resultIndex; i < ev.results.length; i += 1) heard += ev.results[i][0].transcript;
        srTextRef.current = heard.trim();
      };
      sr.onend = () => {
        setRecording(false);
        srRef.current = null;
        if (!cancelledRef.current && srTextRef.current) onTextRef.current(srTextRef.current);
      };
      sr.onerror = () => { setRecording(false); srRef.current = null; };
      sr.start();
      setRecording(true);
    } catch (e: any) {
      onErrorRef.current?.(e?.message || 'microphone unavailable');
    }
  }, [recording, supported, stopLevel]);

  useEffect(() => () => {
    stopLevel();
    try { streamRef.current?.getTracks().forEach((t) => t.stop()); } catch { /* gone */ }
    try { audioCtxRef.current?.close(); } catch { /* gone */ }
  }, [stopLevel]);

  return { recording, transcribing, level, supported, start, stop };
}
