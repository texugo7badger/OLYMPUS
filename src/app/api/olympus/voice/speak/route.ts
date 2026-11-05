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
import { toNarration } from '@/lib/narration';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const GODS = ['apollo', 'atlas', 'artemis', 'athena', 'dionysus', 'hephaestus', 'hermes', 'persephone', 'prometheus', 'callimachus'];

/** Curated free neural voices per language, split by the god's voice gender:
 *  a male god must never be read by a female voice (the v0.0.37 PT-BR pool
 *  mixed pt-PT and flipped genders at index 3). The profile still shapes
 *  pitch/rate, so two gods sharing a voice stay distinct. */
const VOICES: Record<string, { male: string[]; female: string[] }> = {
  en: {
    male: ['en-US-AndrewNeural', 'en-US-BrianNeural', 'en-GB-RyanNeural', 'en-US-GuyNeural', 'en-GB-ThomasNeural', 'en-US-SteffanNeural'],
    female: ['en-GB-SoniaNeural', 'en-US-AriaNeural', 'en-US-EmmaNeural', 'en-US-MichelleNeural'],
  },
  'pt-BR': {
    // v0.0.68 — the multilingual neural voices speak Portuguese too; without
    // them six male gods shared Antonio (the "same voice" complaint).
    male: ['pt-BR-AntonioNeural', 'en-US-AndrewMultilingualNeural', 'en-US-BrianMultilingualNeural', 'de-DE-FlorianMultilingualNeural', 'fr-FR-RemyMultilingualNeural'],
    female: ['pt-BR-FranciscaNeural', 'pt-BR-ThalitaMultilingualNeural', 'en-US-AvaMultilingualNeural', 'en-US-EmmaMultilingualNeural'],
  },
  es: { male: ['es-ES-AlvaroNeural'], female: ['es-ES-ElviraNeural', 'es-ES-XimenaNeural'] },
  fr: {
    male: ['fr-FR-HenriNeural', 'fr-FR-RemyMultilingualNeural'],
    female: ['fr-FR-DeniseNeural', 'fr-FR-EloiseNeural', 'fr-FR-VivienneMultilingualNeural'],
  },
  de: {
    male: ['de-DE-ConradNeural', 'de-DE-FlorianMultilingualNeural', 'de-DE-KillianNeural'],
    female: ['de-DE-KatjaNeural', 'de-DE-AmalaNeural', 'de-DE-SeraphinaMultilingualNeural'],
  },
  ja: {
    male: ['ja-JP-KeitaNeural', 'en-US-AndrewMultilingualNeural', 'en-US-BrianMultilingualNeural'],
    female: ['ja-JP-NanamiNeural', 'en-US-AvaMultilingualNeural', 'en-US-EmmaMultilingualNeural'],
  },
  zh: {
    male: ['zh-CN-YunxiNeural', 'zh-CN-YunjianNeural', 'zh-CN-YunyangNeural'],
    female: ['zh-CN-XiaoxiaoNeural', 'zh-CN-XiaoyiNeural'],
  },
};

/** The god's voice gender — matches the persona, not the array order. */
const GOD_GENDER: Record<string, 'male' | 'female'> = {
  apollo: 'male', atlas: 'male', artemis: 'female', athena: 'female',
  dionysus: 'male', hephaestus: 'male', hermes: 'male', persephone: 'female',
  prometheus: 'male', callimachus: 'female',
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
  const raw = String(body?.text || '').slice(0, 4000).trim();
  if (!raw) return NextResponse.json({ ok: false, error: 'text is required' }, { status: 400 });
  // v0.0.81 — never read a log aloud. The client already filters through
  // `toSpeech`; this is the server-side guard for every other caller.
  const text = toNarration(raw, { max: 900, fallback: '' });
  if (!text) return new NextResponse(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });

  const god = String(body?.god || 'apollo').toLowerCase();
  const lang = String(body?.language || 'en');
  const family = VOICES[lang] ?? VOICES.en;
  const gender = GOD_GENDER[god] ?? 'male';
  const pool = family[gender];
  // Round-robin inside the same gender, so Apollo/Atlas do not share the
  // exact same voice when the language offers more than one.
  const sameGender = GODS.filter((g) => (GOD_GENDER[g] ?? 'male') === gender);
  const index = Math.max(0, sameGender.indexOf(god));
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
