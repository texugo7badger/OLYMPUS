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
import { runGodTurn } from '@/lib/god-run';

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

  const first = await runGodTurn(god, message, lane);
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
    const second = await runGodTurn(withGod, context, lane);
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
