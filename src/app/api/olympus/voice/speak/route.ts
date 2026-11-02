/**
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 *
 * POST /api/olympus/voice/speak
 *
 * The free neural voice lane. It uses the open-source `edge-tts` project
 * (rany2/edge-tts, GPL-3.0) through the local Python install: Microsoft
 * Edge's neural voices, no API key, no paid service. Each god gets its own
 * voice + the calm pitch/rate profile, and the language comes from Settings.
 *
 * Body: { text: string, god?: string, language?: string }
 * Returns: audio/mpeg, or JSON { ok:false, fallback:'browser' } on failure.
 */

import { NextRequest, NextResponse } from 'next/server';
import { execFile } from 'node:child_process';
import path from 'node:path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const GODS = ['apollo', 'atlas', 'artemis', 'athena', 'dionysus', 'hephaestus', 'hermes', 'persephone', 'prometheus', 'callimachus'];

/** Curated free neural voices per language. The list is intentionally short:
 *  the elegant low-pitch voices, cycled per god and shaped by the profile. */
const VOICES: Record<string, string[]> = {
  en: ['en-US-AndrewNeural', 'en-US-BrianNeural', 'en-GB-SoniaNeural', 'en-US-AriaNeural', 'en-US-EmmaNeural', 'en-GB-RyanNeural', 'en-US-GuyNeural', 'en-US-MichelleNeural', 'en-GB-ThomasNeural', 'en-US-SteffanNeural'],
  'pt-BR': ['pt-BR-AntonioNeural', 'pt-BR-FranciscaNeural', 'pt-BR-ThalitaMultilingualNeural', 'pt-PT-DuarteNeural', 'pt-PT-RaquelNeural'],
  es: ['es-ES-AlvaroNeural', 'es-ES-ElviraNeural', 'es-ES-XimenaNeural'],
  fr: ['fr-FR-HenriNeural', 'fr-FR-DeniseNeural', 'fr-FR-EloiseNeural', 'fr-FR-RemyMultilingualNeural', 'fr-FR-VivienneMultilingualNeural'],
  de: ['de-DE-ConradNeural', 'de-DE-KatjaNeural', 'de-DE-AmalaNeural', 'de-DE-FlorianMultilingualNeural', 'de-DE-KillianNeural', 'de-DE-SeraphinaMultilingualNeural'],
  ja: ['ja-JP-KeitaNeural', 'ja-JP-NanamiNeural'],
  zh: ['zh-CN-YunxiNeural', 'zh-CN-XiaoxiaoNeural', 'zh-CN-YunjianNeural', 'zh-CN-XiaoyiNeural', 'zh-CN-YunyangNeural'],
};

const PROFILE: Record<string, { pitch: number; rate: number }> = {
  apollo: { pitch: 0.92, rate: 0.96 }, atlas: { pitch: 0.78, rate: 0.9 },
  artemis: { pitch: 1.06, rate: 1.0 }, athena: { pitch: 1.02, rate: 0.97 },
  dionysus: { pitch: 1.12, rate: 1.04 }, hephaestus: { pitch: 0.7, rate: 0.88 },
  hermes: { pitch: 1.05, rate: 1.06 }, persephone: { pitch: 0.96, rate: 0.93 },
  prometheus: { pitch: 0.84, rate: 0.96 }, callimachus: { pitch: 1.0, rate: 0.9 },
};

function signed(n: number, unit: string): string {
  return `${n >= 0 ? '+' : ''}${n}${unit}`;
}

export async function POST(req: NextRequest) {
  let body: any = {};
  try { body = await req.json(); } catch { /* empty */ }
  const text = String(body?.text || '').slice(0, 900).trim();
  if (!text) return NextResponse.json({ ok: false, error: 'text is required' }, { status: 400 });

  const god = String(body?.god || 'apollo').toLowerCase();
  const lang = String(body?.language || 'en');
  const pool = VOICES[lang] ?? VOICES.en;
  const index = Math.max(0, GODS.indexOf(god));
  const voice = pool[index % pool.length];
  const profile = PROFILE[god] ?? PROFILE.apollo;
  const rate = signed(Math.round((profile.rate - 1) * 50) - 4, '%');
  const pitch = signed(Math.round((profile.pitch - 1) * 40), 'Hz');
  const script = path.join(process.cwd(), 'scripts', 'tts-edge.py');

  try {
    const audio = await new Promise<Buffer>((resolve, reject) => {
      const child = execFile('python3', [script, voice, rate, pitch], {
        maxBuffer: 12 * 1024 * 1024,
        timeout: 35_000,
        encoding: 'buffer',
      }, (err, stdout, stderr) => {
        if (err) {
          reject(new Error(`${err.message} ${String(stderr).slice(0, 300)}`));
          return;
        }
        resolve(stdout as Buffer);
      });
      child.stdin?.write(text);
      child.stdin?.end();
    });
    if (!audio.length) throw new Error('empty audio');
    return new NextResponse(audio as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': String(audio.length),
        'Cache-Control': 'no-store',
      },
    });
  } catch (e: any) {
    return NextResponse.json({
      ok: false,
      fallback: 'browser',
      error: `free neural voice unavailable: ${e?.message || e}`,
      hint: 'pip install --user --break-system-packages edge-tts',
    }, { status: 503 });
  }
}
