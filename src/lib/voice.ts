/**
 * voice.ts — v0.0.34: the shared per-god speech profile.
 *
 * The Pattern Studio and the terminal both use this so a god sounds the same
 * everywhere: one calm pitch/rate per god, a voice chosen from the selected
 * language, and a tiny persistent on/off flag.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

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

let currentAudio: HTMLAudioElement | null = null;

/** Speak as a god. Preferred lane: the free edge-tts neural voice route
 *  (professional, per-god, per-language). Fallback: the browser voice.
 *  Best-effort: a missing voice must never break the UI. */
export async function speakAs(
  text: string,
  god: string,
  language: Language,
  onState?: (speaking: boolean) => void,
): Promise<void> {
  if (!text || typeof window === 'undefined') return;
  const key = (god || 'apollo').toLowerCase();
  try {
    const res = await fetch('/api/olympus/voice/speak', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text.slice(0, 900), god: key, language }),
    });
    if (res.ok) {
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      try { currentAudio?.pause(); } catch { /* gone */ }
      const audio = new Audio(url);
      currentAudio = audio;
      onState?.(true);
      audio.onended = () => { onState?.(false); URL.revokeObjectURL(url); };
      audio.onerror = () => { onState?.(false); URL.revokeObjectURL(url); };
      await audio.play();
      return;
    }
  } catch { /* fall through to the browser */ }

  if (!('speechSynthesis' in window)) { onState?.(false); return; }
  try {
    const profile = GOD_VOICE[key] ?? GOD_VOICE.apollo;
    const u = new SpeechSynthesisUtterance(text.replace(/[#*_`>]/g, '').slice(0, 420));
    u.lang = speechLocale(language);
    u.pitch = profile.pitch;
    u.rate = profile.rate;
    const prefix = u.lang.slice(0, 2).toLowerCase();
    const voices = window.speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith(prefix));
    const idx = Math.max(0, GOD_ORDER.indexOf(key));
    if (voices.length) u.voice = voices[idx % voices.length];
    u.onstart = () => onState?.(true);
    u.onend = () => onState?.(false);
    u.onerror = () => onState?.(false);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  } catch { onState?.(false); }
}
