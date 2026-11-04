/**
 * POST /api/olympus/god/chat — v0.0.76: a conversation with ONE god.
 *
 * The terminal talks to Apollo; the Parthenon shows the other gods' stats but
 * had no way to ask them anything. This route runs a single turn with the
 * god's own agent (its identity, skills and lane), in the active project, and
 * returns the final text. It is deliberately a spawn per message: a god chat
 * is occasional, and an isolated turn cannot poison the terminal's session.
 *
 * Body: { god: string, message: string, lane?: string }
 * Returns: { ok, god, text, durationMs, lane }
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { requireAuth } from '@/lib/auth';
import { spawnOpencode } from '@/lib/opencode-spawn';
import { getVaultRoot } from '@/lib/vault-root';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const GODS = new Set(['apollo', 'atlas', 'artemis', 'athena', 'dionysus', 'hephaestus', 'hermes', 'persephone', 'prometheus', 'callimachus']);
const MAX_MESSAGE = 8_000;
const TIMEOUT_MS = 180_000;

function activeLane(): string | null {
  try {
    const home = process.env.OLYMPUS_HOME || path.join(os.homedir(), '.olympus');
    const slug = String(JSON.parse(fs.readFileSync(path.join(home, 'active-project.json'), 'utf-8'))?.slug ?? '');
    if (!slug) return null;
    const lane = path.join(getVaultRoot(), '02_Projects', slug);
    return fs.existsSync(lane) ? lane : null;
  } catch { return null; }
}

/** Tolerant parser for `opencode run --format json` text parts. */
function extractText(stdout: string): string {
  const parts: string[] = [];
  for (const line of stdout.split('\n')) {
    if (!line.trim()) continue;
    try {
      const ev = JSON.parse(line);
      const text = ev?.part?.text ?? ev?.text ?? (ev?.type === 'text' ? ev?.content : null);
      if (typeof text === 'string' && text.trim()) parts.push(text);
    } catch { /* not a JSON line */ }
  }
  return parts.join('').trim();
}

export async function POST(req: NextRequest) {
  const denied = requireAuth(req);
  if (denied) return denied;

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: 'invalid JSON' }, { status: 400 }); }
  const god = String(body?.god || '').toLowerCase();
  const message = String(body?.message || '').trim();
  if (!GODS.has(god)) return NextResponse.json({ ok: false, error: `unknown god: ${god}` }, { status: 400 });
  if (!message) return NextResponse.json({ ok: false, error: 'message is required' }, { status: 400 });
  if (message.length > MAX_MESSAGE) return NextResponse.json({ ok: false, error: `message too long (max ${MAX_MESSAGE})` }, { status: 413 });

  const lane = typeof body?.lane === 'string' && body.lane ? path.resolve(String(body.lane)) : activeLane();
  if (!lane || !fs.existsSync(lane)) {
    return NextResponse.json({ ok: false, error: 'no active project — open one first' }, { status: 409 });
  }

  const startedAt = Date.now();
  const result = await new Promise<{ code: number | null; stdout: string; stderr: string; timedOut: boolean }>((resolve) => {
    let out = '';
    let err = '';
    let settled = false;
    const done = (r: { code: number | null; stdout: string; stderr: string; timedOut: boolean }) => { if (!settled) { settled = true; resolve(r); } };
    const child = spawnOpencode(['run', '--format', 'json', '--agent', god, message], {
      cwd: lane,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const timer = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch { /* gone */ }
      done({ code: null, stdout: out, stderr: err, timedOut: true });
    }, TIMEOUT_MS);
    child.stdout?.on('data', (d) => { out = (out + String(d)).slice(-400_000); });
    child.stderr?.on('data', (d) => { err = (err + String(d)).slice(-20_000); });
    child.on('close', (code) => { clearTimeout(timer); done({ code, stdout: out, stderr: err, timedOut: false }); });
    child.on('error', (e: any) => { clearTimeout(timer); done({ code: null, stdout: out, stderr: String(e?.message || e), timedOut: false }); });
  });

  const text = extractText(result.stdout);
  if (result.timedOut) return NextResponse.json({ ok: false, error: `the god did not answer within ${TIMEOUT_MS / 1000}s`, god, lane }, { status: 504 });
  if (!text) {
    return NextResponse.json({
      ok: false,
      error: result.code === 0 ? 'the god answered with no text' : `opencode exited ${result.code}`,
      detail: (result.stderr || result.stdout).slice(-500),
      god, lane,
    }, { status: 502 });
  }
  return NextResponse.json({ ok: true, god, text, durationMs: Date.now() - startedAt, lane });
}
