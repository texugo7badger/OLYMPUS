/**
 * shortcircuit-savings.ts — MEASURED tokens saved (v0.0.26).
 *
 * THE SPECIMEN: every `shortcircuit-log.jsonl` row carried `tokens_saved: 0`
 * — honest, but useless. The old comment said "the resonance loop backfills
 * real dispatch deltas"; no loop existed.
 *
 * The brief proposed "full dispatch payload that did not go out". That exact
 * payload is not available at the gate seam (instincts are actions, not
 * demigod ids; there is no tokenizer in the tree). What IS available:
 * the measured DEMIGOD turns for the same god (benchmark rows, now
 * attributed in v0.0.26). A short-circuit skips that dispatch, so the
 * median demigod turn for the god is the defensible baseline.
 *
 * Contract:
 *   tokens_saved = median(tokens_input of the god's demigod rows) − 0
 *   basis        = `median-demigod-input:<god>:n=<N>:window=<days>d`
 *   n < MIN_SAMPLES → tokens_saved stays 0 with basis `insufficient-baseline`
 *
 * Tags: the baseline is [MEASURED]; the per-row attribution is
 * [COUNTERFACTUAL] (that turn did not go out). The panel renders the sum as
 * measured-with-basis, never as exact.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import fs from 'node:fs';
import path from 'node:path';
import { getVaultRoot } from './vault-root';

export interface ShortCircuitBaseline {
  god: string;
  medianInputTokens: number;
  samples: number;
  windowDays: number;
}

export interface ShortCircuitBackfillRow {
  /** The short-circuit log row's own ts (the join key). */
  log_ts: string;
  god: string;
  task_signature: string;
  tokens_saved: number;
  basis: string;
  samples: number;
  /** When the backfill ran. */
  ts: string;
}

export interface BackfillResult {
  scanned: number;
  backfilled: number;
  skipped: number;
  rows: ShortCircuitBackfillRow[];
  baselines: ShortCircuitBaseline[];
}

const MIN_SAMPLES = 3;
const DEFAULT_WINDOW_DAYS = 30;

export function shortcircuitLogPath(vaultRoot = getVaultRoot()): string {
  return path.join(vaultRoot, '05_Auto_Learning', 'shortcircuit-log.jsonl');
}
export function backfillPath(vaultRoot = getVaultRoot()): string {
  return path.join(vaultRoot, '05_Auto_Learning', 'shortcircuit-backfill.jsonl');
}
export function benchmarkLogPath(vaultRoot = getVaultRoot()): string {
  return path.join(vaultRoot, '07_Reviews', 'benchmarks', 'dispatches.jsonl');
}

function readJsonl<T = any>(file: string, maxLines = 100_000): T[] {
  try {
    const raw = fs.readFileSync(file, 'utf-8');
    const lines = raw.split('\n').filter(Boolean);
    const tail = lines.length > maxLines ? lines.slice(-maxLines) : lines;
    const out: T[] = [];
    for (const line of tail) {
      try { out.push(JSON.parse(line)); } catch { /* skip a torn row */ }
    }
    return out;
  } catch {
    return [];
  }
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? Math.round((s[mid - 1] + s[mid]) / 2) : Math.round(s[mid]);
}

/**
 * Compute the per-god demigod-turn baselines from the benchmark log.
 * Only rows that (a) belong to a god, (b) are a DEMIGOD turn, (c) have
 * positive input tokens, and (d) fall inside the window are used.
 */
export function computeBaselines(opts: {
  vaultRoot?: string;
  windowDays?: number;
  now?: number;
} = {}): ShortCircuitBaseline[] {
  const vaultRoot = opts.vaultRoot ?? getVaultRoot();
  const windowDays = opts.windowDays ?? DEFAULT_WINDOW_DAYS;
  const now = opts.now ?? Date.now();
  const since = now - windowDays * 24 * 60 * 60 * 1000;
  const rows = readJsonl(benchmarkLogPath(vaultRoot));

  const byGod = new Map<string, number[]>();
  for (const r of rows) {
    if (!r || typeof r.god !== 'string' || !r.god || r.god === 'multi') continue;
    if (typeof r.demigod !== 'string' || !r.demigod) continue;
    const ts = Date.parse(r.ts);
    if (Number.isFinite(ts) && ts < since) continue;
    const input = Number(r.tokens_input) || 0;
    if (input <= 0) continue;
    const list = byGod.get(r.god) ?? [];
    list.push(input);
    byGod.set(r.god, list);
  }

  return [...byGod.entries()]
    .map(([god, values]) => ({
      god,
      medianInputTokens: median(values),
      samples: values.length,
      windowDays,
    }))
    .sort((a, b) => a.god.localeCompare(b.god));
}

/**
 * Backfill every short-circuit row for which a baseline exists. Idempotent:
 * the output is keyed by the log row ts, and a second run rewrites the same
 * values (append-only file, latest wins on read).
 */
export function backfillShortCircuitSavings(opts: {
  vaultRoot?: string;
  windowDays?: number;
  now?: number;
  /** Do not write; return what would be written. */
  dryRun?: boolean;
} = {}): BackfillResult {
  const vaultRoot = opts.vaultRoot ?? getVaultRoot();
  const baselines = computeBaselines(opts);
  const byGod = new Map(baselines.map((b) => [b.god, b]));

  const logs = readJsonl(shortcircuitLogPath(vaultRoot));
  const rows: ShortCircuitBackfillRow[] = [];
  let skipped = 0;
  let scanned = 0;

  for (const row of logs) {
    if (!row || row.short_circuited !== true) continue;
    scanned++;
    const base = byGod.get(String(row.god));
    if (!base || base.samples < MIN_SAMPLES) {
      skipped++;
      continue;
    }
    rows.push({
      log_ts: String(row.ts),
      god: String(row.god),
      task_signature: String(row.task_signature ?? '').slice(0, 160),
      tokens_saved: base.medianInputTokens,
      basis: `median-demigod-input:${row.god}:n=${base.samples}:window=${base.windowDays}d`,
      samples: base.samples,
      ts: new Date(opts.now ?? Date.now()).toISOString(),
    });
  }

  if (!opts.dryRun) {
    try {
      const file = backfillPath(vaultRoot);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      // Keep the last backfill per log_ts only: rewrite the file atomically.
      const prior = readJsonl<ShortCircuitBackfillRow>(file);
      const merged = new Map<string, ShortCircuitBackfillRow>();
      for (const r of prior) if (r?.log_ts) merged.set(r.log_ts, r);
      for (const r of rows) merged.set(r.log_ts, r);
      fs.writeFileSync(file, [...merged.values()].map((r) => JSON.stringify(r)).join('\n') + (merged.size ? '\n' : ''));
    } catch { /* telemetry never throws */ }
  }

  return { scanned, backfilled: rows.length, skipped, rows, baselines };
}

/** Latest backfill per log ts — the reader the stats route merges. */
export function readShortCircuitBackfill(vaultRoot = getVaultRoot()): Map<string, ShortCircuitBackfillRow> {
  const out = new Map<string, ShortCircuitBackfillRow>();
  for (const r of readJsonl<ShortCircuitBackfillRow>(backfillPath(vaultRoot))) {
    if (r?.log_ts) out.set(r.log_ts, r);
  }
  return out;
}
