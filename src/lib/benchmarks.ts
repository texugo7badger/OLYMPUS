/**
 * Benchmarks — log reader + config persistence for the Benchmarks panel.
 *
 * Reads dispatches.jsonl from the vault and returns aggregate stats.
 * Also handles the recording config at ~/.olympus/benchmark-config.json.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';

const BENCHMARK_CONFIG_FILE = join(homedir(), '.olympus', 'benchmark-config.json');
const VAULT_ROOT = process.env.OLYMPUS_VAULT_DIR || join(homedir(), 'OLYMPUS-VAULT');
const BENCHMARK_LOG = join(VAULT_ROOT, '07_Reviews', 'benchmarks', 'dispatches.jsonl');

export interface BenchmarkConfig {
  recordingEnabled: boolean;
  sessionLabel?: string;
}

export interface BenchmarkEntry {
  ts: string;
  session_label: string | null;
  god: string;
  demigod: string;
  instinct_id: string | null;
  short_circuited: boolean;
  skill: string | null;
  mcp: string | null;
  task_signature: string;
  stack: string | null;
  project: string | null;
  outcome: string;
  duration_ms: number | null;
  tokens_input: number;
  tokens_output: number;
  tokens_total: number;
  had_error: boolean;
  tool_call_count: number;
}

export interface BenchmarkStats {
  config: BenchmarkConfig;
  total_dispatches: number;
  total_short_circuits: number;
  short_circuit_rate: number;
  total_tokens: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_duration_ms: number;
  avg_duration_ms: number;
  success_rate: number;
  error_count: number;
  per_god: Record<string, {
    dispatches: number;
    short_circuits: number;
    short_circuit_rate: number;
    tokens: number;
    avg_duration_ms: number;
    success_rate: number;
  }>;
  per_demigod_top: Array<{ demigod: string; count: number; tokens: number; success_rate: number }>;
  /** 14-day sparkline of dispatch volume + token cost. */
  sparkline: Array<{ date: string; dispatches: number; tokens: number; short_circuits: number }>;
  /** Per-session breakdown (grouped by session_label). */
  per_session: Array<{ label: string | null; dispatches: number; tokens: number; success_rate: number; first_ts: string; last_ts: string }>;
  log_file: { path: string; exists: boolean; size_bytes: number; size_mb: number };
  generated_at: string;
}

export function loadBenchmarkConfig(): BenchmarkConfig {
  try {
    if (existsSync(BENCHMARK_CONFIG_FILE)) {
      const raw = JSON.parse(readFileSync(BENCHMARK_CONFIG_FILE, 'utf-8'));
      return {
        recordingEnabled: raw.recordingEnabled === true,
        sessionLabel: typeof raw.sessionLabel === 'string' ? raw.sessionLabel : undefined,
      };
    }
  } catch {}
  return { recordingEnabled: false };
}

export function saveBenchmarkConfig(cfg: BenchmarkConfig): void {
  try {
    mkdirSync(dirname(BENCHMARK_CONFIG_FILE), { recursive: true });
    writeFileSync(BENCHMARK_CONFIG_FILE, JSON.stringify(cfg, null, 2), { mode: 0o600 });
  } catch (err: any) {
    console.error('[olympus:benchmarks] saveBenchmarkConfig failed:', err.message);
  }
}

export function getBenchmarkStats(maxLines: number = 100_000): BenchmarkStats {
  const config = loadBenchmarkConfig();
  let exists = false;
  let sizeBytes = 0;
  let entries: BenchmarkEntry[] = [];

  try {
    if (existsSync(BENCHMARK_LOG)) {
      exists = true;
      sizeBytes = statSync(BENCHMARK_LOG).size;
      const raw = readFileSync(BENCHMARK_LOG, 'utf-8');
      const allLines = raw.split('\n').filter(Boolean);
      const lines = maxLines > 0 && allLines.length > maxLines
        ? allLines.slice(allLines.length - maxLines)
        : allLines;
      for (const line of lines) {
        try {
          const e = JSON.parse(line) as BenchmarkEntry;
          if (typeof e.ts === 'string' && typeof e.god === 'string') {
            entries.push(e);
          }
        } catch {}
      }
    }
  } catch {}

  const totalDispatches = entries.length;
  const totalShortCircuits = entries.filter(e => e.short_circuited).length;
  const totalTokens = entries.reduce((n, e) => n + (e.tokens_total || 0), 0);
  const totalInputTokens = entries.reduce((n, e) => n + (e.tokens_input || 0), 0);
  const totalOutputTokens = entries.reduce((n, e) => n + (e.tokens_output || 0), 0);
  const totalDurationMs = entries.reduce((n, e) => n + (e.duration_ms || 0), 0);
  const errorCount = entries.filter(e => e.had_error).length;
  const successCount = entries.filter(e => e.outcome === 'success').length;
  const successRate = totalDispatches > 0 ? successCount / totalDispatches : 0;
  const avgDurationMs = totalDispatches > 0 ? totalDurationMs / totalDispatches : 0;

  // Per-god breakdown.
  const perGodMap = new Map<string, { dispatches: number; short_circuits: number; tokens: number; duration_sum: number; success_count: number }>();
  for (const e of entries) {
    let g = perGodMap.get(e.god);
    if (!g) {
      g = { dispatches: 0, short_circuits: 0, tokens: 0, duration_sum: 0, success_count: 0 };
      perGodMap.set(e.god, g);
    }
    g.dispatches++;
    if (e.short_circuited) g.short_circuits++;
    g.tokens += e.tokens_total || 0;
    g.duration_sum += e.duration_ms || 0;
    if (e.outcome === 'success') g.success_count++;
  }
  const perGod: BenchmarkStats['per_god'] = {};
  for (const [god, g] of perGodMap) {
    perGod[god] = {
      dispatches: g.dispatches,
      short_circuits: g.short_circuits,
      short_circuit_rate: g.dispatches > 0 ? g.short_circuits / g.dispatches : 0,
      tokens: g.tokens,
      avg_duration_ms: g.dispatches > 0 ? g.duration_sum / g.dispatches : 0,
      success_rate: g.dispatches > 0 ? g.success_count / g.dispatches : 0,
    };
  }

  // Top demigods by dispatch count.
  const perDemigodMap = new Map<string, { count: number; tokens: number; success_count: number }>();
  for (const e of entries) {
    let d = perDemigodMap.get(e.demigod);
    if (!d) {
      d = { count: 0, tokens: 0, success_count: 0 };
      perDemigodMap.set(e.demigod, d);
    }
    d.count++;
    d.tokens += e.tokens_total || 0;
    if (e.outcome === 'success') d.success_count++;
  }
  const perDemigodTop = Array.from(perDemigodMap.entries())
    .map(([demigod, v]) => ({
      demigod,
      count: v.count,
      tokens: v.tokens,
      success_rate: v.count > 0 ? v.success_count / v.count : 0,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // 14-day sparkline.
  const sparklineMap = new Map<string, { dispatches: number; tokens: number; short_circuits: number }>();
  const today = new Date();
  for (let i = 13; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    sparklineMap.set(dateStr, { dispatches: 0, tokens: 0, short_circuits: 0 });
  }
  for (const e of entries) {
    const dateStr = e.ts.slice(0, 10);
    if (sparklineMap.has(dateStr)) {
      const s = sparklineMap.get(dateStr)!;
      s.dispatches++;
      s.tokens += e.tokens_total || 0;
      if (e.short_circuited) s.short_circuits++;
    }
  }
  const sparkline = Array.from(sparklineMap.entries()).map(([date, s]) => ({
    date,
    dispatches: s.dispatches,
    tokens: s.tokens,
    short_circuits: s.short_circuits,
  }));

  // Per-session breakdown.
  const perSessionMap = new Map<string | null, { dispatches: number; tokens: number; success_count: number; first_ts: string; last_ts: string }>();
  for (const e of entries) {
    const label = e.session_label || null;
    let s = perSessionMap.get(label);
    if (!s) {
      s = { dispatches: 0, tokens: 0, success_count: 0, first_ts: e.ts, last_ts: e.ts };
      perSessionMap.set(label, s);
    }
    s.dispatches++;
    s.tokens += e.tokens_total || 0;
    if (e.outcome === 'success') s.success_count++;
    if (e.ts < s.first_ts) s.first_ts = e.ts;
    if (e.ts > s.last_ts) s.last_ts = e.ts;
  }
  const perSession = Array.from(perSessionMap.entries())
    .map(([label, v]) => ({
      label,
      dispatches: v.dispatches,
      tokens: v.tokens,
      success_rate: v.dispatches > 0 ? v.success_count / v.dispatches : 0,
      first_ts: v.first_ts,
      last_ts: v.last_ts,
    }))
    .sort((a, b) => b.last_ts.localeCompare(a.last_ts));

  return {
    config,
    total_dispatches: totalDispatches,
    total_short_circuits: totalShortCircuits,
    short_circuit_rate: totalDispatches > 0 ? totalShortCircuits / totalDispatches : 0,
    total_tokens: totalTokens,
    total_input_tokens: totalInputTokens,
    total_output_tokens: totalOutputTokens,
    total_duration_ms: totalDurationMs,
    avg_duration_ms: avgDurationMs,
    success_rate: successRate,
    error_count: errorCount,
    per_god: perGod,
    per_demigod_top: perDemigodTop,
    sparkline,
    per_session: perSession,
    log_file: {
      path: BENCHMARK_LOG,
      exists,
      size_bytes: sizeBytes,
      size_mb: Math.round((sizeBytes / (1024 * 1024)) * 100) / 100,
    },
    generated_at: new Date().toISOString(),
  };
}
