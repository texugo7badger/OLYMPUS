/**
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 *
 * POST /api/olympus/voice/listen
 *
 * Free local speech-to-text: the recorded blob is written to a temp file and
 * transcribed by farther-whisper through scripts/stt-whisper.py (ffmpeg →
 * 16 kHz PCM → Whisper base). No API key, no cloud.
 *
 * Form fields:
 *   - audio:    File (webm/wav/ogg/mp4)
 *   - language: BCP-47 hint (pt-BR, en, …)
 */

import { NextRequest, NextResponse } from 'next/server';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid form data' }, { status: 400 });
  }
  const file = form.get('audio');
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ ok: false, error: 'audio file is required' }, { status: 400 });
  }
  if (file.size > 24 * 1024 * 1024) {
    return NextResponse.json({ ok: false, error: 'audio is too large (max 24 MB)' }, { status: 413 });
  }
  const language = String(form.get('language') || 'en');
  const ext = (file.name.split('.').pop() || 'webm').replace(/[^a-z0-9]/gi, '').slice(0, 5) || 'webm';
  const tmp = path.join(os.tmpdir(), `olympus-stt-${crypto.randomUUID()}.${ext}`);
  try {
    fs.writeFileSync(tmp, Buffer.from(await file.arrayBuffer()));
    const script = path.join(process.cwd(), 'scripts', 'stt-whisper.py');
    const raw = await new Promise<string>((resolve, reject) => {
      execFile('python3', [script, tmp, language], {
        timeout: 120_000,
        maxBuffer: 8 * 1024 * 1024,
      }, (err, stdout, stderr) => {
        if (err) {
          reject(new Error(`${err.message} ${String(stderr).slice(-300)}`));
          return;
        }
        resolve(String(stdout));
      });
    });
    const parsed = JSON.parse(raw.trim().split('\n').pop() || '{}');
    return NextResponse.json({
      ok: true,
      text: String(parsed.text || ''),
      language: String(parsed.language || language),
      probability: typeof parsed.probability === 'number' ? parsed.probability : null,
    });
  } catch (e: any) {
    return NextResponse.json({
      ok: false,
      error: `local STT unavailable: ${e?.message || e}`,
      hint: 'pip install --user --break-system-packages faster-whisper',
    }, { status: 503 });
  } finally {
    try { fs.unlinkSync(tmp); } catch { /* gone */ }
  }
}
