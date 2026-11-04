/**
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 *
 * GET /api/olympus/voice/status — the honest voice lane report.
 * Checks the free neural TTS (edge-tts), local STT (faster-whisper) and
 * ffmpeg once, so the studio can say what is actually available.
 */
import { NextResponse } from 'next/server';
import { execFile } from 'node:child_process';
import { probeVoiceEngines, preferredEngine } from '@/lib/voice-engines';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function probe(bin: string, args: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    execFile(bin, args, { timeout: 12_000 }, (err) => resolve(!err));
  });
}

export async function GET() {
  const [neural, stt, ffmpeg, engines] = await Promise.all([
    probe('python3', ['-c', 'import edge_tts']),
    probe('python3', ['-c', 'import faster_whisper']),
    probe('ffmpeg', ['-version']),
    probeVoiceEngines(),
  ]);
  return NextResponse.json({
    ok: true,
    neural,
    stt: stt && ffmpeg,
    ffmpeg,
    godVoices: 10,
    languages: 7,
    // v0.0.78 — the ladder, probed (never claimed): Chatterbox → Kokoro →
    // edge-tts. `preferred` is the one the speak route should use.
    engines,
    preferred: preferredEngine(engines),
    note: neural
      ? 'free edge-tts neural voices — no API key'
      : 'browser speechSynthesis fallback (install edge-tts for the neural voices)',
  }, { headers: { 'Cache-Control': 'no-store' } });
}
