/**
 * POST /api/olympus/god/chat — v0.0.77: a conversation with one god, or two.
 *
 * The terminal talks to Apollo; the Parthenon shows the other gods' stats. This
 * route runs a turn with a god's OWN agent (its identity, skills and lane) in
 * the active project, and returns the final text.
 *
 * v0.0.77 adds the **god↔god working session**: `withGod` runs a second agent
 * with the user's message + the first god's answer, so the pair discusses the
 * next planning with the user in the middle. Bounded: one round, two turns.
 *
 * Body: { god, message, withGod?, lane? }
 * Returns: { ok, god, text, replies: [{god,text}], lane, durationMs }
 *
 * Every exchange is appended to the shared activity feed — the terminal's
 * activity strip and the God Intelligence panel are the durable log.
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
import { appendActivity } from '@/lib/activity-feed';

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

function runGod(god: string, message: string, lane: string): Promise<{ ok: boolean; text: string; error?: string; durationMs: number }> {
  const startedAt = Date.now();
  return new Promise((resolve) => {
    let out = '';
    let err = '';
    let settled = false;
    const done = (r: { ok: boolean; text: string; error?: string }) => {
      if (settled) return;
      settled = true;
      resolve({ ...r, durationMs: Date.now() - startedAt });
    };
    const child = spawnOpencode(['run', '--format', 'json', '--agent', god, message], {
      cwd: lane,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const timer = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch { /* gone */ }
      done({ ok: false, text: '', error: `the god did not answer within ${TIMEOUT_MS / 1000}s` });
    }, TIMEOUT_MS);
    child.stdout?.on('data', (d) => { out = (out + String(d)).slice(-400_000); });
    child.stderr?.on('data', (d) => { err = (err + String(d)).slice(-20_000); });
    child.on('close', (code) => {
      clearTimeout(timer);
      const text = extractText(out);
      if (!text) done({ ok: false, text: '', error: code === 0 ? 'the god answered with no text' : `opencode exited ${code}: ${(err || out).slice(-300)}` });
      else done({ ok: true, text });
    });
    child.on('error', (e: any) => { clearTimeout(timer); done({ ok: false, text: '', error: String(e?.message || e) }); });
  });
}

export async function POST(req: NextRequest) {
  const denied = requireAuth(req);
  if (denied) return denied;

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: 'invalid JSON' }, { status: 400 }); }
  const god = String(body?.god || '').toLowerCase();
  const message = String(body?.message || '').trim();
  const withGod = body?.withGod ? String(body.withGod).toLowerCase() : null;
  if (!GODS.has(god)) return NextResponse.json({ ok: false, error: `unknown god: ${god}` }, { status: 400 });
  if (withGod && (!GODS.has(withGod) || withGod === god)) return NextResponse.json({ ok: false, error: `invalid withGod: ${withGod}` }, { status: 400 });
  if (!message) return NextResponse.json({ ok: false, error: 'message is required' }, { status: 400 });
  if (message.length > MAX_MESSAGE) return NextResponse.json({ ok: false, error: `message too long (max ${MAX_MESSAGE})` }, { status: 413 });

  const lane = typeof body?.lane === 'string' && body.lane ? path.resolve(String(body.lane)) : activeLane();
  if (!lane || !fs.existsSync(lane)) {
    return NextResponse.json({ ok: false, error: 'no active project — open one first' }, { status: 409 });
  }
  const slug = lane.split(/[\\/]/).filter(Boolean).pop() || 'project';
  const startedAt = Date.now();

  const first = await runGod(god, message, lane);
  if (!first.ok) {
    appendActivity({ god, action: 'chat', project: slug, msg: `Chat with ${god} failed: ${first.error}` });
    return NextResponse.json({ ok: false, error: first.error, god, lane }, { status: 502 });
  }
  appendActivity({ god, action: 'chat', project: slug, msg: `You → ${god}: ${message.slice(0, 300)}`, meta: { source: 'parthenon' } });
  appendActivity({ god, action: 'chat', project: slug, msg: `${god}: ${first.text.slice(0, 500)}`, meta: { source: 'parthenon' } });

  const replies: Array<{ god: string; text: string }> = [{ god, text: first.text }];

  if (withGod) {
    // The second god reads the user's message + the first god's answer and
    // replies with its own view. One round, two turns — bounded by design.
    const context = [
      `You are in a working session with ${god}, for the project "${slug}".`,
      `The user said: "${message}".`,
      `${god} answered: "${first.text}".`,
      `Reply in your own voice: your view, the risks you see, and ONE concrete next step. Do not repeat ${god}.`,
    ].join('\n');
    const second = await runGod(withGod, context, lane);
    if (second.ok) {
      replies.push({ god: withGod, text: second.text });
      appendActivity({ god: withGod, action: 'chat', project: slug, msg: `${withGod}: ${second.text.slice(0, 500)}`, meta: { source: 'parthenon', withGod: god } });
    } else {
      appendActivity({ god: withGod, action: 'chat', project: slug, msg: `${withGod} could not answer: ${second.error}` });
    }
  }

  return NextResponse.json({
    ok: true,
    god,
    text: first.text,
    replies,
    withGod,
    lane,
    durationMs: Date.now() - startedAt,
  });
}
