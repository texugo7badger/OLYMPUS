/**
 * token-speed.ts — v0.0.81: measured tokens per second, never a vibe.
 *
 * Three honest levels:
 *   turn   output tokens / (completed - streamed) + TTFT, from the OpenCode
 *          message ledger (`time.created/streamed/completed`);
 *   hop    output tokens / wall-clock duration, from the hop telemetry
 *          (includes tool time — label it as such);
 *   build  aggregate p50/p95 by model/agent/strategy.
 *
 * Output tokens include reasoning per OpenCode's contract. A zero-duration or
 * aborted turn returns null; the UI renders "—", never a fake 0.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface TurnSpeed {
  ts: number;
  model: string;
  agent: string | null;
  outputTokens: number;
  outTokPerSec: number;
  ttftMs: number | null;
  wallMs: number;
}

export interface SpeedStat {
  n: number;
  avg: number;
  p50: number;
  p95: number;
}

export interface HopSpeed {
  hop: string;
  god: string | null;
  status: string;
  outputTokens: number;
  durationMs: number;
  outTokPerSec: number;
}

export function turnSpeedFrom(
  tokens: { output?: number; reasoning?: number } | undefined,
  time: { created?: number; streamed?: number; completed?: number } | undefined,
  model: string,
  ts: number,
  agent?: string | null,
): TurnSpeed | null {
  const out = Number(tokens?.output ?? 0);
  const created = Number(time?.created ?? 0);
  const streamed = Number(time?.streamed ?? 0);
  const completed = Number(time?.completed ?? 0);
  if (!Number.isFinite(out) || out <= 0 || !Number.isFinite(completed) || completed <= 0) return null;
  // OpenCode's `streamed` is the LAST stream event, not the first token:
  // the measured specimen had created→streamed = 10.6s for 817 output tokens
  // (77 tok/s), and completed 5ms later. Using completed−streamed produced
  // 10,000 tok/s on Qwen. The generation window is created→streamed; the
  // wall window is created→completed. TTFT is not persisted, so it is null
  // (never a fabricated number).
  const genMs = streamed > created && created > 0 ? streamed - created : completed - created;
  const wallMs = completed > created && created > 0 ? completed - created : genMs;
  if (!Number.isFinite(genMs) || genMs <= 0) return null;
  return {
    ts,
    model,
    agent: agent ?? null,
    outputTokens: out,
    outTokPerSec: out / (genMs / 1000),
    ttftMs: null,
    wallMs,
  };
}

export function hopSpeed(hop: string, god: string | null, status: string, tokensOut: number | null, durationMs: number | null): HopSpeed | null {
  const out = Number(tokensOut ?? 0);
  const ms = Number(durationMs ?? 0);
  if (!Number.isFinite(out) || out <= 0 || !Number.isFinite(ms) || ms <= 0) return null;
  return { hop, god, status, outputTokens: out, durationMs: ms, outTokPerSec: out / (ms / 1000) };
}

export function stat(values: number[]): SpeedStat | null {
  const v = values.filter((n) => Number.isFinite(n) && n > 0).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const at = (p: number) => v[Math.min(v.length - 1, Math.max(0, Math.ceil((p / 100) * v.length) - 1))];
  return { n: v.length, avg: v.reduce((s, n) => s + n, 0) / v.length, p50: at(50), p95: at(95) };
}

function dbPaths(): string[] {
  return [
    process.env.OPENCODE_DATA_DIR ? path.join(process.env.OPENCODE_DATA_DIR, 'opencode.db') : '',
    path.join(os.homedir(), '.local', 'share', 'opencode', 'opencode.db'),
    path.join(os.homedir(), '.olympus', 'hop-data', 'opencode', 'opencode.db'),
    path.join(os.homedir(), '.olympus', 'opencode', 'opencode.db'),
    path.join(os.homedir(), '.config', 'opencode', 'opencode.db'),
  ].filter(Boolean);
}

/** Recent assistant turns from both ledgers (chat + hop lane). */
export function readTurnSpeeds(limit = 240): TurnSpeed[] {
  let Database: any = null;
  try { Database = require('better-sqlite3'); } catch { return []; }
  const out: TurnSpeed[] = [];
  for (const dbPath of dbPaths()) {
    try { if (!fs.existsSync(dbPath)) continue; } catch { continue; }
    try {
      const db = new Database(dbPath, { readonly: true, timeout: 2500 });
      try {
        const hasV2 = !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='session_message'").get();
        const table = hasV2 ? 'session_message' : 'message';
        const rows = db.prepare(`SELECT data, time_created FROM ${table} WHERE data LIKE '%opencode-go%' ORDER BY time_created DESC LIMIT ?`).all(limit) as Array<{ data: string; time_created: number }>;
        for (const row of rows) {
          let d: any;
          try { d = JSON.parse(row.data); } catch { continue; }
          const provider = typeof d?.model?.providerID === 'string' ? d.model.providerID : (typeof d?.providerID === 'string' ? d.providerID : '');
          if (provider && provider !== 'opencode-go') continue;
          const model = typeof d?.model?.id === 'string' ? d.model.id : (typeof d?.modelID === 'string' ? d.modelID : '');
          if (!model) continue;
          const t = d?.time ?? {};
          const s = turnSpeedFrom(d?.tokens, t, model, Number(t.completed ?? row.time_created) || row.time_created, typeof d?.agent === 'string' ? d.agent : null);
          if (s) out.push(s);
        }
      } finally { db.close(); }
    } catch { /* one locked DB must not hide the other */ }
  }
  return out.sort((a, b) => b.ts - a.ts).slice(0, limit);
}

export function groupByModel(turns: TurnSpeed[]): Array<{ model: string; n: number; avg: number; p50: number; p95: number }> {
  const by = new Map<string, number[]>();
  for (const t of turns) {
    if (!by.has(t.model)) by.set(t.model, []);
    by.get(t.model)!.push(t.outTokPerSec);
  }
  return [...by.entries()].map(([model, values]) => {
    const s = stat(values)!;
    return { model, n: s.n, avg: s.avg, p50: s.p50, p95: s.p95 };
  }).sort((a, b) => b.n - a.n);
}

export function readHopSpeeds(project: string, limit = 200): HopSpeed[] {
  const vault = process.env.OLYMPUS_VAULT_DIR || path.join(os.homedir(), 'OLYMPUS-VAULT');
  const file = path.join(vault, '02_Projects', project, '.olympus-hop-telemetry.jsonl');
  let raw = '';
  try { raw = fs.readFileSync(file, 'utf-8'); } catch { return []; }
  const rows = raw.trim().split('\n').filter(Boolean).slice(-limit);
  const out: HopSpeed[] = [];
  for (const line of rows) {
    try {
      const r = JSON.parse(line);
      const s = hopSpeed(String(r.hop ?? '?'), typeof r.god === 'string' ? r.god : null, String(r.status ?? '?'), r.tokensOut ?? null, r.durationMs ?? null);
      if (s) out.push(s);
    } catch { /* torn line */ }
  }
  return out;
}
