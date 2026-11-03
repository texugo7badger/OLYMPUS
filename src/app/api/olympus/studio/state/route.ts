/**
 * /api/olympus/studio/state — v0.0.64: the studio mirrors across surfaces.
 *
 * The desktop's creativity panel and the phone's `/m/studio` share the active
 * god and the voice switch. The chat stays local (a private transcript per
 * surface); the controls that shape the session are shared.
 *
 * GET  → { god, voice, updatedAt }
 * POST { god?, voice? } → merge + return
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { requireAuth, requireReadAuth } from '@/lib/auth';
import { NO_CACHE_HEADERS } from '@/app/api/olympus/_lib/no-cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const HOME = process.env.OLYMPUS_HOME || path.join(os.homedir(), '.olympus');
const FILE = path.join(HOME, 'studio-state.json');
const GODS = new Set(['apollo', 'atlas', 'artemis', 'athena', 'dionysus', 'hephaestus', 'hermes', 'persephone', 'prometheus', 'callimachus']);

type State = { god: string; voice: boolean; updatedAt: string };

function read(): State {
  try {
    const raw = JSON.parse(fs.readFileSync(FILE, 'utf-8'));
    return {
      god: GODS.has(String(raw?.god)) ? String(raw.god) : 'apollo',
      voice: raw?.voice !== false,
      updatedAt: typeof raw?.updatedAt === 'string' ? raw.updatedAt : '',
    };
  } catch { return { god: 'apollo', voice: true, updatedAt: '' }; }
}

function write(state: State): void {
  try {
    fs.mkdirSync(HOME, { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(state, null, 2) + '\n', { mode: 0o600 });
  } catch { /* the local control still works */ }
}

export async function GET(req: NextRequest) {
  const authError = requireReadAuth(req);
  if (authError) return authError;
  return NextResponse.json({ ok: true, ...read() }, { headers: NO_CACHE_HEADERS });
}

export async function POST(req: NextRequest) {
  const authError = requireAuth(req);
  if (authError) return authError;
  let body: any = {};
  try { body = await req.json(); } catch { /* invalid */ }
  const current = read();
  const next: State = {
    god: GODS.has(String(body?.god)) ? String(body.god) : current.god,
    voice: typeof body?.voice === 'boolean' ? body.voice : current.voice,
    updatedAt: new Date().toISOString(),
  };
  write(next);
  return NextResponse.json({ ok: true, ...next }, { headers: NO_CACHE_HEADERS });
}
