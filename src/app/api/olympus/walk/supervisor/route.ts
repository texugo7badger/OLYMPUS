/**
 * /api/olympus/walk/supervisor — v0.0.73: the detached walk, observable.
 *
 * GET  → every supervisor on disk: pid, alive, status, startedAt, log, the
 *        lane lock and the last telemetry row. `alive` requires the pid AND
 *        the same boot id — a recycled pid never reads as a live walk.
 * POST → { action: 'start' | 'stop', slug, lane?, autoResume? }
 *        start spawns the detached runner (one per lane);
 *        stop  terminates it and writes the reason.
 *
 * The app is a READER here: killing the server does not kill the walk.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import { requireAuth, requireReadAuth } from '@/lib/auth';
import { getVaultRoot } from '@/lib/vault-root';
import { NO_CACHE_HEADERS } from '@/app/api/olympus/_lib/no-cache';
import { listSupervisors, startDetachedWalk, stopSupervisor } from '@/lib/hop-runtime/supervisor';
import { readWalkLock } from '@/lib/hop-runtime/walk-lock';
import { loadHopState } from '@/lib/hop-runtime/hop-state';
import { readHopTelemetry } from '@/lib/hop-runtime/walker';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function lastHop(laneRoot: string) {
  try {
    const rows = readHopTelemetry(laneRoot);
    const row = rows[rows.length - 1];
    return row ? { hop: row.hop, status: row.status, ts: row.ts, tokensIn: row.tokensIn, tokensOut: row.tokensOut } : null;
  } catch { return null; }
}

export async function GET(req: NextRequest) {
  const denied = requireReadAuth(req);
  if (denied) return denied;
  const vault = getVaultRoot();
  const supervisors = listSupervisors().map((view) => {
    const slug = view.state?.slug ?? '';
    const laneRoot = view.state?.laneRoot ?? path.join(vault, '02_Projects', slug);
    const lock = readWalkLock(laneRoot);
    const hopState = (() => { try { return loadHopState(laneRoot); } catch { return null; } })();
    return {
      ...view,
      lock: lock.holder ? { pid: lock.holder.pid, alive: lock.alive, ageMs: lock.ageMs } : null,
      hops: hopState ? {
        completed: hopState.completed?.length ?? 0,
        parked: hopState.parked?.hopId ?? null,
        inFlight: (hopState.inFlight ?? []).map((h: any) => (typeof h === 'string' ? h : h?.hopId)).filter(Boolean),
      } : null,
      lastHop: lastHop(laneRoot),
    };
  });
  return NextResponse.json({ ok: true, supervisors }, { headers: NO_CACHE_HEADERS });
}

export async function POST(req: NextRequest) {
  const denied = requireAuth(req);
  if (denied) return denied;
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: 'invalid JSON' }, { status: 400 }); }

  const action = String(body?.action || '');
  const slug = String(body?.slug || '').trim();
  if (!slug) return NextResponse.json({ ok: false, error: 'slug is required' }, { status: 400 });

  if (action === 'stop') {
    const result = stopSupervisor(slug);
    return NextResponse.json({ ok: result.ok, reason: result.reason ?? null }, { status: result.ok ? 200 : 400 });
  }

  if (action !== 'start') {
    return NextResponse.json({ ok: false, error: "action must be 'start' or 'stop'" }, { status: 400 });
  }

  const laneRoot = body?.lane ? path.resolve(String(body.lane)) : path.join(getVaultRoot(), '02_Projects', slug);
  if (!fs.existsSync(laneRoot)) return NextResponse.json({ ok: false, error: `lane not found: ${laneRoot}` }, { status: 404 });
  if (!fs.existsSync(path.join(laneRoot, 'dispatch-plan.json'))) {
    return NextResponse.json({ ok: false, error: `no dispatch-plan.json in ${laneRoot}` }, { status: 409 });
  }

  const started = startDetachedWalk({ slug, laneRoot, autoResume: body?.autoResume !== false });
  if (!started.ok) {
    return NextResponse.json({ ok: false, error: started.reason, pid: started.pid ?? null, logFile: started.logFile ?? null }, { status: started.reason === 'already-running' ? 409 : 500 });
  }
  return NextResponse.json({ ok: true, pid: started.pid, logFile: started.logFile }, { headers: NO_CACHE_HEADERS });
}
