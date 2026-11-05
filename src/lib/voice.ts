/**
 * voice.ts — v0.0.34: the shared per-god speech profile.
 *
 * The Pattern Studio and the terminal both use this so a god sounds the same
 * everywhere: one calm pitch/rate per god, a voice chosen from the selected
 * language, and a tiny persistent on/off flag.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { toNarration } from './narration';
import { speechLocale, type Language } from './i18n';

export const GOD_VOICE: Record<string, { pitch: number; rate: number }> = {
  apollo: { pitch: 0.92, rate: 0.96 },
  atlas: { pitch: 0.78, rate: 0.9 },
  artemis: { pitch: 1.06, rate: 1.0 },
  athena: { pitch: 1.02, rate: 0.97 },
  dionysus: { pitch: 1.12, rate: 1.04 },
  hephaestus: { pitch: 0.7, rate: 0.88 },
  hermes: { pitch: 1.05, rate: 1.06 },
  persephone: { pitch: 0.96, rate: 0.93 },
  prometheus: { pitch: 0.84, rate: 0.96 },
  callimachus: { pitch: 1.0, rate: 0.9 },
};

export const GOD_ORDER = Object.keys(GOD_VOICE);

export function voiceEnabled(): boolean {
  try { return window.localStorage.getItem('olympus:voice-enabled') === '1'; } catch { return false; }
}

export function setVoiceEnabled(on: boolean): void {
  try { window.localStorage.setItem('olympus:voice-enabled', on ? '1' : '0'); } catch { /* private */ }
}

/**
 * v0.0.38 — a turn's report is not a conversation.
 *
 * The terminal and the studio both hand whole answers to the voice lane; a
 * long answer full of code, URLs and bullets read aloud sounds like a machine
 * reciting a document. Speech gets the opening thought only: formatting is
 * stripped and a long reply stops at a sentence boundary instead of being cut
 * mid-word at 900 characters. Short conversational replies pass through whole.
 */
export function toSpeech(text: string, max = 360): string {
  // v0.0.81 — speech is the answer, never the transcript. `toNarration`
  // drops JSON, stack frames, shell lines, paths and tables; an empty result
  // means "this turn has nothing to say out loud", so the caller stays silent
  // instead of reciting a log.
  return toNarration(text, { max, fallback: '' });
}

let currentAudio: HTMLAudioElement | null = null;
let audioCtx: AudioContext | null = null;

/** Speak as a god. Preferred lane: the free edge-tts neural voice route
 *  (professional, per-god, per-language). Fallback: the browser voice.
 *  Best-effort: a missing voice must never break the UI. */
export async function speakAs(
  text: string,
  god: string,
  language: Language,
  onState?: (speaking: boolean) => void,
  onLevel?: (level: number) => void,
): Promise<void> {
  if (!text || typeof window === 'undefined') return;
  const spoken = toSpeech(text);
  if (!spoken) return;
  const key = (god || 'apollo').toLowerCase();
  try {
    const res = await fetch('/api/olympus/voice/speak', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: spoken, god: key, language }),
    });
    if (res.status === 204) {
      // Nothing to say out loud (a log-only turn); stay silent.
      onState?.(false);
      return;
    }
    if (res.ok) {
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      try { currentAudio?.pause(); } catch { /* gone */ }
      const audio = new Audio(url);
      currentAudio = audio;
      onState?.(true);
      // v0.0.34 — the orb responds to the REAL waveform: an analyser reads
      // the MP3 as it plays and reports a 0..1 level.
      try {
        const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        audioCtx ??= new Ctx();
        const src = audioCtx.createMediaElementSource(audio);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        src.connect(analyser);
        analyser.connect(audioCtx.destination);
        await audioCtx.resume();
        const data = new Uint8Array(analyser.frequencyBinCount);
        const tick = () => {
          if (audio.paused || audio.ended) { onLevel?.(0); return; }
          analyser.getByteFrequencyData(data);
          let sum = 0;
          for (let i = 0; i < data.length; i += 1) sum += data[i];
          onLevel?.(Math.min(1, sum / data.length / 72));
          requestAnimationFrame(tick);
        };
        tick();
      } catch { onLevel?.(0.5); }
      audio.onended = () => { onState?.(false); onLevel?.(0); URL.revokeObjectURL(url); };
      audio.onerror = () => { onState?.(false); onLevel?.(0); URL.revokeObjectURL(url); };
      await audio.play();
      return;
    }
  } catch { /* fall through to the browser */ }

  if (!('speechSynthesis' in window)) { onState?.(false); return; }
  try {
    const profile = GOD_VOICE[key] ?? GOD_VOICE.apollo;
    const u = new SpeechSynthesisUtterance(spoken);
    u.lang = speechLocale(language);
    u.pitch = profile.pitch;
    u.rate = profile.rate;
    const prefix = u.lang.slice(0, 2).toLowerCase();
    const voices = window.speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith(prefix));
    const idx = Math.max(0, GOD_ORDER.indexOf(key));
    if (voices.length) u.voice = voices[idx % voices.length];
    let levelTimer: ReturnType<typeof setInterval> | null = null;
    u.onstart = () => { onState?.(true); levelTimer = setInterval(() => onLevel?.(0.25 + Math.random() * 0.55), 90); };
    u.onend = () => { onState?.(false); onLevel?.(0); if (levelTimer) clearInterval(levelTimer); };
    u.onerror = () => { onState?.(false); onLevel?.(0); if (levelTimer) clearInterval(levelTimer); };
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  } catch { onState?.(false); }
}
