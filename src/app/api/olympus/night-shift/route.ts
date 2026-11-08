/**
 * /api/olympus/night-shift — v0.0.91.
 *
 * GET  ?slug=  → the headless night shift state (pid, deadline, hops, report).
 * POST {action:'start'|'stop', slug, hours?, maxHops?}
 *
 * The start spawns `scripts/night-shift.ts --headless`, which relaunches the
 * supervisor through `systemd-run --user` — outside the Electron cgroup. The
 * route never pretends the mode is running; it reads the state file and the
 * pid, and the UI says "unverified" when the file is absent.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { resolveDispatchCwd } from '@/lib/opencode-spawn';
import { getVaultRoot } from '@/lib/vault-root';
import { readWalkLock } from '@/lib/hop-runtime/walk-lock';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function safeSlug(slug: string): string {
  return slug.replace(/[^a-z0-9-]/gi, '-').toLowerCase().replace(/-+/g, '-').replace(/^-|-$/g, '');
}

function dirFor(slug: string): string {
  return path.join(os.homedir(), '.olympus', 'night-shift', safeSlug(slug));
}

function pidAlive(pid: number): boolean {
  if (!Number.isFinite(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (e: any) { return e?.code === 'EPERM'; }
}

function unitFor(slug: string): string {
  return `olympus-night-${safeSlug(slug)}`;
}

export async function GET(req: NextRequest) {
  const slug = String(req.nextUrl.searchParams.get('slug') || '').trim();
  if (!slug) return NextResponse.json({ ok: false, error: 'slug is required' }, { status: 400 });
  const dir = dirFor(slug);
  let state: any = null;
  try { state = JSON.parse(fs.readFileSync(path.join(dir, 'state.json'), 'utf-8')); } catch { /* no run yet */ }
  const alive = state ? pidAlive(Number(state.pid)) : false;
  let logTail: string | null = null;
  try {
    const raw = fs.readFileSync(path.join(dir, 'night-shift.log'), 'utf-8');
    logTail = raw.slice(-2_000);
  } catch { /* no log */ }
  return NextResponse.json({
    ok: true,
    slug,
    unit: unitFor(slug),
    state,
    alive,
    reportPath: state?.reportPath ?? path.join(dir, 'morning-report.md'),
    logTail,
  });
}

export async function POST(req: NextRequest) {
  let body: any = {};
  try { body = await req.json(); } catch { /* empty */ }
  const slug = String(body?.slug || '').trim();
  if (!slug) return NextResponse.json({ ok: false, error: 'slug is required' }, { status: 400 });
  const action = String(body?.action || '');
  const dir = dirFor(slug);
  const statePath = path.join(dir, 'state.json');
  const current = (() => { try { return JSON.parse(fs.readFileSync(statePath, 'utf-8')); } catch { return null; } })();

  if (action === 'stop') {
    let stopped = false;
    try {
      execFileSync('systemctl', ['--user', 'stop', unitFor(slug)], { timeout: 15_000, stdio: 'ignore' });
      stopped = true;
    } catch { /* unit may not exist */ }
    if (!stopped && current?.pid && pidAlive(Number(current.pid))) {
      try { process.kill(Number(current.pid), 'SIGTERM'); stopped = true; } catch { /* gone */ }
    }
    return NextResponse.json({ ok: stopped, stopped });
  }

  if (action !== 'start') {
    return NextResponse.json({ ok: false, error: "action must be 'start' or 'stop'" }, { status: 400 });
  }
  if (current?.pid && pidAlive(Number(current.pid))) {
    return NextResponse.json({ ok: false, error: 'night shift already running', state: current }, { status: 409 });
  }
  // The lane lock is the truth: starting a night shift on a lane that already
  // has a live walk would only spawn a runner that exits 'already-walking'.
  const laneRoot = resolveDispatchCwd(slug) || path.join(getVaultRoot(), '02_Projects', slug);
  const lock = readWalkLock(laneRoot);
  if (lock.holder && lock.alive) {
    return NextResponse.json({
      ok: false,
      error: `a walk already owns this lane (pid ${lock.holder.pid}) — let it finish or stop it before launching the night shift`,
      lock: { pid: lock.holder.pid, startedAt: lock.holder.startedAt },
    }, { status: 409 });
  }
  const hours = Number.isFinite(Number(body?.hours)) ? Math.max(0.1, Math.min(24, Number(body.hours))) : 8;
  const maxHops = Number.isFinite(Number(body?.maxHops)) ? Math.max(1, Math.min(500, Number(body.maxHops))) : 100;
  const script = path.join(process.cwd(), 'scripts', 'night-shift.ts');
  if (!fs.existsSync(script)) {
    return NextResponse.json({ ok: false, error: `night-shift script not found: ${script}` }, { status: 500 });
  }
  // The script's --headless path relaunches through systemd-run. It is spawned
  // detached here only so the HTTP request returns immediately; the real
  // supervisor is the transient systemd unit.
  const child = spawn(process.execPath, [
    '--import', 'tsx', script,
    '--slug', slug, '--hours', String(hours), '--max-hops', String(maxHops), '--headless',
  ], {
    cwd: process.cwd(),
    detached: true,
    stdio: 'ignore',
    env: { ...process.env, OLYMPUS_NIGHT_SHIFT: '1' },
  });
  child.unref();
  return NextResponse.json({ ok: true, slug, unit: unitFor(slug), launcherPid: child.pid, hours, maxHops });
}
