/**
 * voice-engines.ts — v0.0.78: the voice ladder, probed honestly.
 *
 * OLYMPUS speaks through the best engine the machine actually has, in this
 * order (research, 2026-11):
 *
 *   1. Chatterbox Multilingual V3 — MIT, 500M, 23+ languages, zero-shot
 *      cloning (~5s), emotion exaggeration. Needs a local sidecar
 *      (`chatterbox-tts-api` on :4123) and a GPU.
 *   2. Kokoro 82M — Apache-2.0, CPU-friendly, 8 languages, 54 voices, no
 *      cloning. Needs the `kokoro` Python package.
 *   3. edge-tts — the zero-install default (free Microsoft neural voices),
 *      per-god pitch/rate shaping.
 *
 * A probe never claims: each engine is available only when its probe answers.
 * The result is cached for 60s (the Settings/studio poll it).
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { execFile } from 'node:child_process';

export type VoiceEngineId = 'chatterbox' | 'kokoro' | 'edge';

export interface VoiceEngineStatus {
  id: VoiceEngineId;
  label: string;
  available: boolean;
  /** Where it listens / how it is probed. */
  detail: string;
  license: string;
  languages: string;
  cloning: boolean;
  emotion: boolean;
  /** The exact command to install/start it (never guessed). */
  setup: string;
}

function probe(bin: string, args: string[], timeout = 12_000): Promise<boolean> {
  return new Promise((resolve) => {
    execFile(bin, args, { timeout }, (err) => resolve(!err));
  });
}

async function probeHttp(url: string, timeoutMs = 1_500): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(url, { signal: ctrl.signal, cache: 'no-store' });
    clearTimeout(timer);
    return res.ok;
  } catch { return false; }
}

let cache: { at: number; engines: VoiceEngineStatus[] } | null = null;

export async function probeVoiceEngines(force = false): Promise<VoiceEngineStatus[]> {
  if (!force && cache && Date.now() - cache.at < 60_000) return cache.engines;

  const [chatterbox, kokoro, edge] = await Promise.all([
    probeHttp(process.env.OLYMPUS_CHATTERBOX_URL || 'http://127.0.0.1:4123/health'),
    probe('python3', ['-c', 'import kokoro']),
    probe('python3', ['-c', 'import edge_tts']),
  ]);

  const engines: VoiceEngineStatus[] = [
    {
      id: 'chatterbox', label: 'Chatterbox Multilingual V3',
      available: chatterbox,
      detail: chatterbox ? 'sidecar answering on :4123' : 'sidecar not running (probe :4123/health)',
      license: 'MIT', languages: '23+', cloning: true, emotion: true,
      setup: 'pip install chatterbox-tts && uvicorn app.main:app --port 4123 (see VOICE.md)',
    },
    {
      id: 'kokoro', label: 'Kokoro 82M',
      available: kokoro,
      detail: kokoro ? 'python package present' : 'python package missing (import kokoro)',
      license: 'Apache-2.0', languages: '8', cloning: false, emotion: false,
      setup: 'pip install kokoro (CPU-friendly; see VOICE.md)',
    },
    {
      id: 'edge', label: 'edge-tts (free neural)',
      available: edge,
      detail: edge ? 'python package present' : 'python package missing (import edge_tts)',
      license: 'free service', languages: '40+', cloning: false, emotion: false,
      setup: 'pip install edge-tts (the zero-install default)',
    },
  ];
  cache = { at: Date.now(), engines };
  return engines;
}

/** The engine the speak route should use, best first. */
export function preferredEngine(engines: VoiceEngineStatus[]): VoiceEngineId | null {
  for (const id of ['chatterbox', 'kokoro', 'edge'] as VoiceEngineId[]) {
    if (engines.find((e) => e.id === id && e.available)) return id;
  }
  return null;
}
