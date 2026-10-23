/**
 * /api/olympus/dispatches — the dispatch DNA feed (issue #182).
 *
 * Joins the three on-disk sources the dashboard never served together:
 *   - ~/.olympus/dispatch-state.json  → OPEN dispatches (live state)
 *   - 06_Activity_Feed/live.jsonl     → symphony-dispatch + dispatch_outcome
 *   - 03_Index/arsenal-resonance.jsonl → the proven arsenal aggregate
 *
 * Per-god grouping distinguishes PARALLEL demigods (the same god can hold
 * several open dispatches at once). Read-only, no writes.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getVaultRoot } from '@/lib/vault-root';

export const dynamic = 'force-dynamic';

const OLYMPUS_HOME = process.env.OLYMPUS_HOME || path.join(os.homedir(), '.olympus');
const STATE_FILE = path.join(OLYMPUS_HOME, 'dispatch-state.json');
const VAULT_ROOT = getVaultRoot();
const FEED_PATH = path.join(VAULT_ROOT, '06_Activity_Feed', 'live.jsonl');
const RESONANCE_PATH = path.join(VAULT_ROOT, '03_Index', 'arsenal-resonance.jsonl');

const FEED_TAIL_BYTES = 2 * 1024 * 1024;
const RECENT_WINDOW_MS = 24 * 60 * 60 * 1000;

interface DnaRow {
  dispatchId: string;
  god: string;
  demigod: string;
  task: string;
  skill: string | null;
  mcp: string | null;
  instinct: string | null;
  shortCircuited: boolean;
  classificationId: string | null;
  status: 'open' | 'success' | 'failure' | 'unknown' | 'superseded' | 'failed' | 'dispatched';
  outcome: string | null;
  ts: string;
  ageMs: number;
  durationMs: number | null;
  tokens: { input: number; output: number; total: number };
  toolCalls: number;
  findings: string | null;
  contractViolation: string | null;
  arsenalRecon: {
    skills: Array<{ skill: string; confidence: number; samples: number }>;
    mcps: Array<{ mcp: string; confidence: number; samples: number }>;
    demigods: Array<{ demigod: string; confidence: number; samples: number }>;
    quickCircuit: boolean;
    coherence: number;
  } | null;
  parallel: boolean;
}

function tailLines(filePath: string, maxBytes: number): string[] {
  try {
    const st = fs.statSync(filePath);
    const from = Math.max(0, st.size - maxBytes);
    const fh = fs.openSync(filePath, 'r');
    try {
      const buf = Buffer.alloc(st.size - from);
      fs.readSync(fh, buf, 0, buf.length, from);
      let raw = buf.toString('utf-8');
      if (from > 0) {
        const nl = raw.indexOf('\n');
        raw = nl === -1 ? '' : raw.slice(nl + 1);
      }
      return raw.split('\n').filter(Boolean);
    } finally {
      fs.closeSync(fh);
    }
  } catch {
    return [];
  }
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function readOpenDispatches(): any[] {
  try {
    const raw = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
    return Array.isArray(raw?.openDispatches) ? raw.openDispatches : [];
  } catch {
    return [];
  }
}

function readFeed(): { dispatches: Map<string, any>; outcomes: Map<string, any>; order: string[] } {
  const dispatches = new Map<string, any>();
  const outcomes = new Map<string, any>();
  const order: string[] = [];
  for (const line of tailLines(FEED_PATH, FEED_TAIL_BYTES)) {
    let ev: any;
    try { ev = JSON.parse(line); } catch { continue; }
    const action = String(ev?.action || '');
    const id = String(ev?.dispatch_id || ev?.signature_id || '');
    if (!id) continue;
    if (action === 'symphony-dispatch' || action === 'dispatch') {
      dispatches.set(id, ev);
      if (!order.includes(id)) order.push(id);
    } else if (action === 'dispatch_outcome') {
      outcomes.set(id, ev);
      if (!order.includes(id)) order.push(id);
    }
  }
  return { dispatches, outcomes, order };
}

function normalizeRecon(raw: any): DnaRow['arsenalRecon'] {
  if (!raw || typeof raw !== 'object') return null;
  const skills = Array.isArray(raw.suggestedSkills) ? raw.suggestedSkills : Array.isArray(raw.skills) ? raw.skills : [];
  const mcps = Array.isArray(raw.suggestedMcps) ? raw.suggestedMcps : Array.isArray(raw.mcps) ? raw.mcps : [];
  const demigods = Array.isArray(raw.suggestedDemigods) ? raw.suggestedDemigods : Array.isArray(raw.demigods) ? raw.demigods : [];
  if (skills.length === 0 && mcps.length === 0 && demigods.length === 0) return null;
  return {
    skills, mcps, demigods,
    quickCircuit: Boolean(raw.quickCircuit),
    coherence: num(raw.coherence),
  };
}

function rowFrom(dispatchId: string, d: any, o: any, now: number): DnaRow {
  // Two shapes meet here: the FEED event (snake_case: task_signature,
  // skill_equipped, dispatch_id) and the OPEN registry entry from
  // dispatch-state.json (camelCase: taskSignature, skill, dispatchId,
  // startTs, tokensUsed). Read BOTH — an open row must carry its full DNA,
  // not a hollow shell.
  const startTs = d?.startTs || d?.ts || o?.ts || new Date(now).toISOString();
  let start = now;
  try { start = new Date(startTs).getTime(); } catch {}
  const tokens = o?.tokens_used ?? d?.tokens_used ?? d?.tokensUsed ?? {};
  const input = num(tokens?.input);
  const output = num(tokens?.output);
  return {
    dispatchId,
    god: String(d?.god || o?.god || 'global').toLowerCase(),
    demigod: String(d?.demigod || o?.demigod || 'unknown'),
    task: String(d?.task_signature || d?.taskSignature || o?.task_signature || ''),
    skill: d?.skill_equipped ?? d?.skill ?? d?.meta?.skill ?? null,
    mcp: d?.mcp_enabled ?? d?.mcp ?? d?.meta?.mcp ?? null,
    instinct: d?.instinct_id ?? d?.instinctId ?? null,
    shortCircuited: Boolean(d?.short_circuited ?? d?.shortCircuited),
    classificationId: d?.classification_id ?? d?.classificationId ?? null,
    status: (o?.status || o?.outcome || (d ? 'dispatched' : 'unknown')) as DnaRow['status'],
    outcome: o?.outcome ?? null,
    ts: o?.ts || startTs,
    ageMs: Math.max(0, now - start),
    durationMs: typeof o?.duration_ms === 'number' ? o.duration_ms : null,
    tokens: { input, output, total: input + output },
    toolCalls: num(o?.tool_call_count ?? d?.toolCallCount),
    findings: typeof o?.findings_summary === 'string' ? o.findings_summary.slice(0, 600) : null,
    contractViolation: typeof o?.contract_violation === 'string' ? o.contract_violation : null,
    arsenalRecon: normalizeRecon(d?.arsenal_recon ?? d?.meta?.arsenal_recon),
    parallel: false,
  };
}

function readArsenal(): { skills: any[]; mcps: any[]; demigods: any[] } {
  const acc: Record<'skill' | 'mcp' | 'demigod', Map<string, { ok: number; total: number }>> = {
    skill: new Map(), mcp: new Map(), demigod: new Map(),
  };
  for (const line of tailLines(RESONANCE_PATH, 512 * 1024)) {
    let ev: any;
    try { ev = JSON.parse(line); } catch { continue; }
    const outcome = String(ev?.outcome || 'unknown');
    for (const key of ['skill', 'mcp', 'demigod'] as const) {
      const name = ev?.[key];
      if (typeof name !== 'string' || !name) continue;
      const row = acc[key].get(name) || { ok: 0, total: 0 };
      row.total++;
      if (outcome === 'success') row.ok++;
      acc[key].set(name, row);
    }
  }
  const rank = (m: Map<string, { ok: number; total: number }>) =>
    Array.from(m.entries())
      .map(([name, v]) => ({ name, confidence: v.total ? Math.round((v.ok / v.total) * 100) / 100 : 0, samples: v.total }))
      .sort((a, b) => b.confidence - a.confidence || b.samples - a.samples)
      .slice(0, 12);
  return { skills: rank(acc.skill), mcps: rank(acc.mcp), demigods: rank(acc.demigod) };
}

export async function GET(req: NextRequest) {
  const now = Date.now();
  const url = new URL(req.url);
  const godFilter = (url.searchParams.get('god') || '').toLowerCase();
  const limit = Math.min(500, Math.max(1, Number(url.searchParams.get('limit')) || 120));

  const { dispatches, outcomes, order } = readFeed();
  const recent: DnaRow[] = [];
  for (const id of order) {
    const row = rowFrom(id, dispatches.get(id), outcomes.get(id), now);
    if (row.ageMs > RECENT_WINDOW_MS) continue;
    if (godFilter && row.god !== godFilter) continue;
    recent.push(row);
  }
  recent.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());

  const open: DnaRow[] = [];
  for (const d of readOpenDispatches()) {
    const id = String(d?.dispatchId || '');
    if (!id) continue;
    const row = rowFrom(id, d, outcomes.get(id), now);
    row.status = 'open';
    if (godFilter && row.god !== godFilter) continue;
    open.push(row);
  }
  open.sort((a, b) => a.ageMs - b.ageMs);

  // Parallel demigods: more than one OPEN dispatch under the same god.
  const openByGod = new Map<string, number>();
  for (const r of open) openByGod.set(r.god, (openByGod.get(r.god) || 0) + 1);
  for (const r of open) r.parallel = (openByGod.get(r.god) || 0) > 1;

  const byGod: Record<string, { open: number; recent: number; demigods: string[] }> = {};
  for (const r of recent) {
    const g = (byGod[r.god] ||= { open: 0, recent: 0, demigods: [] });
    g.recent++;
    if (!g.demigods.includes(r.demigod)) g.demigods.push(r.demigod);
  }
  for (const r of open) {
    const g = (byGod[r.god] ||= { open: 0, recent: 0, demigods: [] });
    g.open++;
    if (!g.demigods.includes(r.demigod)) g.demigods.push(r.demigod);
  }

  return NextResponse.json({
    generatedAt: new Date(now).toISOString(),
    open,
    recent: recent.slice(0, limit),
    byGod,
    arsenal: readArsenal(),
  });
}
