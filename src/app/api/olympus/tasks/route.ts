/**
 * GET /api/olympus/tasks — the TASK SHEET data layer (v0.0.4 W1).
 *
 * Joins the hop runtime's own artifacts into the per-god task lists the
 * Parthenon cards and the drill-down modal render:
 *   - <lane>/dispatch-plan.json        — the DAG (hops: id, god, prompt,
 *     artifacts, verify, budgetTokens)
 *   - <lane>/.olympus-hop-state.json   — completed[] + parked
 *   - <lane>/.olympus-hop-telemetry.jsonl — per-hop: ts, tokens in/out,
 *     duration, retries, status + (v0.0.4) the child's OWN reasoning + id
 *   - the vault's 06_Activity_Feed/live.jsonl — the files each god touched
 *     inside the hop's time window (tool_call events carry meta.file).
 *
 * The ACTIVE lane: the most recently updated dispatch-plan.json under the
 * vault's 02_Projects (or ?lane=<absolute path> to pin one).
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { NextResponse, NextRequest } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getVaultRoot } from '@/lib/vault-root';
import { NO_CACHE_HEADERS } from '@/app/api/olympus/_lib/no-cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PROJECTS_DIR = path.join(getVaultRoot(), '02_Projects');
const FEED_PATH = path.join(getVaultRoot(), '06_Activity_Feed', 'live.jsonl');

interface TaskFile {
  file: string;
  tool: string;
  ts: string;
}

export interface TaskRecord {
  id: string;
  god: string;
  /** The hop directive excerpt (first ~240 chars). */
  promptExcerpt: string;
  artifacts: string[];
  verify: unknown;
  budgetTokens: number | null;
  /** pending | running | completed | parked */
  status: string;
  /** The parked reason when status==='parked'. */
  parkedReason?: string | null;
  /** Telemetry (present once the hop ran). */
  ts?: string;
  tokensIn?: number | null;
  tokensOut?: number | null;
  durationMs?: number;
  retriesAbsorbed?: number;
  /** The child session's OWN thinking (W1-4). */
  reasoning?: string | null;
  sessionId?: string | null;
  /** Files this god touched inside the hop window (from the live feed). */
  files: TaskFile[];
}

function safeJson<T>(p: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8')) as T;
  } catch {
    return fallback;
  }
}

/** The most recently updated lane (or the ?lane= pin). */
function findActiveLane(pin?: string | null): { lane: string; updatedAt: string } | null {
  if (pin && typeof pin === 'string' && pin.startsWith('/') && fs.existsSync(path.join(pin, 'dispatch-plan.json'))) {
    const st = fs.statSync(path.join(pin, 'dispatch-plan.json'));
    return { lane: pin, updatedAt: st.mtime.toISOString() };
  }
  let best: { lane: string; updatedAt: string } | null = null;
  let entries: string[] = [];
  try { entries = fs.readdirSync(PROJECTS_DIR); } catch { return null; }
  for (const name of entries) {
    const plan = path.join(PROJECTS_DIR, name, 'dispatch-plan.json');
    try {
      const st = fs.statSync(plan);
      if (!best || st.mtimeMs > new Date(best.updatedAt).getTime()) {
        best = { lane: path.join(PROJECTS_DIR, name), updatedAt: st.mtime.toISOString() };
      }
    } catch { /* no plan here */ }
  }
  return best;
}

/** Feed tool_call rows with a file, per god, inside [fromMs, toMs]. */
function filesInWindow(god: string, fromMs: number, toMs: number): TaskFile[] {
  let raw = '';
  try {
    const size = fs.statSync(FEED_PATH).size;
    if (size > 2 * 1024 * 1024) {
      const fh = fs.openSync(FEED_PATH, 'r');
      const buf = Buffer.alloc(Math.min(size, 2 * 1024 * 1024));
      fs.readSync(fh, buf, 0, buf.length, Math.max(0, size - buf.length));
      fs.closeSync(fh);
      raw = buf.toString('utf-8');
      raw = raw.slice(raw.indexOf('\n') + 1);
    } else {
      raw = fs.readFileSync(FEED_PATH, 'utf-8');
    }
  } catch { return []; }
  const out: TaskFile[] = [];
  const seen = new Set<string>();
  for (const line of raw.trim().split('\n').filter(Boolean).slice(-8000)) {
    let ev: any;
    try { ev = JSON.parse(line); } catch { continue; }
    if (ev?.action !== 'tool_call') continue;
    if (String(ev?.god || '').toLowerCase() !== god) continue;
    const meta = ev?.meta && typeof ev.meta === 'object' ? ev.meta : {};
    const file = meta.file;
    if (typeof file !== 'string' || !file) continue;
    let t = 0;
    try { t = new Date(ev.ts).getTime(); } catch { continue; }
    if (!Number.isFinite(t) || t < fromMs || t > toMs) continue;
    const key = `${meta.tool || ''}:${file}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ file, tool: String(meta.tool || 'tool'), ts: String(ev.ts) });
  }
  return out;
}

export async function GET(req: NextRequest) {
  const pin = req.nextUrl.searchParams.get('lane');
  const active = findActiveLane(pin);
  if (!active) {
    return NextResponse.json({ tasks: [], gods: {}, lane: null, stats: { total: 0, completed: 0, parked: 0 } }, { headers: NO_CACHE_HEADERS });
  }
  const lane = active.lane;
  const plan = safeJson<any>(path.join(lane, 'dispatch-plan.json'), { hops: [] });
  const state = safeJson<any>(path.join(lane, '.olympus-hop-state.json'), { completed: [], parked: null });
  const completed: string[] = Array.isArray(state.completed) ? state.completed : [];

  // Telemetry: the LAST row per hop wins (retries append rows).
  const telemetry = new Map<string, any>();
  try {
    const raw = fs.readFileSync(path.join(lane, '.olympus-hop-telemetry.jsonl'), 'utf-8');
    for (const line of raw.trim().split('\n').filter(Boolean)) {
      try {
        const row = JSON.parse(line);
        if (row?.hop) telemetry.set(String(row.hop), row);
      } catch { /* skip */ }
    }
  } catch { /* no telemetry yet */ }

  const now = Date.now();
  const tasks: TaskRecord[] = (Array.isArray(plan.hops) ? plan.hops : []).map((h: any) => {
    const tel = telemetry.get(String(h?.id)) || null;
    const isCompleted = completed.includes(String(h?.id));
    const isParked = !!state.parked && state.parked.hopId === h?.id;
    let status = 'pending';
    if (isCompleted) status = 'completed';
    else if (isParked) status = 'parked';
    else if (!tel && !isCompleted && !isParked) status = 'pending';
    // Running heuristic: the walk's state is the truth; a hop neither
    // completed nor parked with no telemetry yet may be running RIGHT NOW —
    // the first completed/parked neighbor marks the walk as past it.
    const prompt = typeof h?.prompt === 'string' ? h.prompt : '';
    const files: TaskFile[] = tel
      ? filesInWindow(
          String(h?.god || '').toLowerCase(),
          new Date(tel.ts).getTime() - (tel.durationMs || 0),
          new Date(tel.ts).getTime() + 60_000,
        )
      : [];
    return {
      id: String(h?.id ?? ''),
      god: String(h?.god ?? 'apollo').toLowerCase(),
      promptExcerpt: prompt.slice(0, 240),
      artifacts: Array.isArray(h?.artifacts) ? h.artifacts.map(String) : [],
      verify: h?.verify ?? null,
      budgetTokens: typeof h?.budgetTokens === 'number' ? h.budgetTokens : null,
      status,
      parkedReason: isParked ? (state.parked?.reason ?? null) : null,
      ts: tel?.ts,
      tokensIn: tel?.tokensIn ?? null,
      tokensOut: tel?.tokensOut ?? null,
      durationMs: tel?.durationMs,
      retriesAbsorbed: tel?.retriesAbsorbed ?? 0,
      reasoning: tel?.reasoning ?? null,
      sessionId: tel?.sessionId ?? null,
      files,
    };
  });

  // The RUNNING hop: the most recent telemetry row whose hop is neither
  // completed nor parked, OR (no telemetry at all) the first pending hop
  // after the last completed one — the walk is on it.
  const lastTelTs = Math.max(0, ...[...telemetry.values()].map((r: any) => { try { return new Date(r.ts).getTime(); } catch { return 0; } }));
  for (const t of tasks) {
    if (t.status !== 'pending') continue;
    if (!telemetry.has(t.id) && Date.now() - lastTelTs < 30 * 60_000) { t.status = 'running'; break; }
  }

  // Live demigod dispatches per god — the PARALLELISM-OF-PARALLELISM
  // surface: the god's own delegations riding the feed (action 'dispatch'
  // carries god + demigod). Rendered as demigod chips in the Parthenon.
  const demigods: Record<string, { id: string; ts: string }[]> = {};
  try {
    const raw = fs.readFileSync(FEED_PATH, 'utf-8');
    const cutoff = Date.now() - 30 * 60 * 1000;
    for (const line of raw.trim().split('\n').filter(Boolean).slice(-4000)) {
      let ev: any;
      try { ev = JSON.parse(line); } catch { continue; }
      const act = String(ev?.action || '');
      if (act !== 'dispatch' && act !== 'symphony-dispatch') continue;
      const god = String(ev?.god || '').toLowerCase();
      const dg = ev?.demigod ?? ev?.meta?.demigod;
      if (!dg || typeof dg !== 'string') continue;
      let t = 0;
      try { t = new Date(ev.ts).getTime(); } catch { continue; }
      if (!Number.isFinite(t) || t < cutoff) continue;
      const list = (demigods[god] ||= []);
      if (!list.some(d => d.id === dg)) list.push({ id: dg, ts: String(ev.ts) });
    }
    for (const list of Object.values(demigods)) list.sort((a, b) => a.ts < b.ts ? 1 : -1);
  } catch { /* decorative */ }

  const gods: Record<string, { total: number; completed: number; running: number; tokensIn: number; tokensOut: number; demigods: { id: string; ts: string }[] }> = {};
  for (const t of tasks) {
    const g = (gods[t.god] ||= { total: 0, completed: 0, running: 0, tokensIn: 0, tokensOut: 0, demigods: [] });
    g.total++;
    if (t.status === 'completed') g.completed++;
    if (t.status === 'running') g.running++;
    g.tokensIn += t.tokensIn ?? 0;
    g.tokensOut += t.tokensOut ?? 0;
    g.demigods = demigods[t.god] || [];
  }

  const stats = {
    total: tasks.length,
    completed: tasks.filter(t => t.status === 'completed').length,
    parked: tasks.filter(t => t.status === 'parked').length,
    tokensIn: tasks.reduce((n, t) => n + (t.tokensIn ?? 0), 0),
    tokensOut: tasks.reduce((n, t) => n + (t.tokensOut ?? 0), 0),
  };

  return NextResponse.json({
    lane,
    project: path.basename(lane),
    updatedAt: active.updatedAt,
    tasks,
    gods,
    stats,
  }, { headers: NO_CACHE_HEADERS });
}
