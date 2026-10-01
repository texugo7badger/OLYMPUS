/**
 * Benchmarks — log reader + writer + config persistence for the Benchmarks panel.
 *
 * Reads dispatches.jsonl from the vault and returns aggregate stats.
 * Also handles the recording config at ~/.olympus/benchmark-config.json.
 *
 * WRITER (issue #28): this module is the app-side writer. It is deliberately
 * app-side rather than a plugin sink — the olympus-hooks plugin is gated
 * behind OLYMPUS_MANAGED=1 (issue #25), so a plugin writer would be silenced
 * in Zed and any non-OLYMPUS spawn, i.e. exactly the runs benchmark recording
 * exists to measure. The app process is never gated.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { existsSync, readFileSync, writeFileSync, appendFileSync, mkdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';
import { getVaultRoot } from './vault-root';

const BENCHMARK_CONFIG_FILE = join(homedir(), '.olympus', 'benchmark-config.json');
// Issue #30: the recording path resolved the root on its own
// (OLYMPUS_VAULT_DIR || ~/OLYMPUS-VAULT), skipping ~/.olympus/vault-root.txt —
// so a Settings-switched vault recorded nothing. Use the canonical root.
const VAULT_ROOT = getVaultRoot();
const BENCHMARK_LOG = join(VAULT_ROOT, '07_Reviews', 'benchmarks', 'dispatches.jsonl');

export interface BenchmarkConfig {
  recordingEnabled: boolean;
  sessionLabel?: string;
}

export interface BenchmarkEntry {
  ts: string;
  session_label: string | null;
  /** Never null — the reader drops rows where god is falsy. Session-level
   *  rows use "multi" when no single god owns the whole session window. */
  god: string;
  /** null when the row is attributed to a god rather than a named subagent. */
  demigod: string | null;
  instinct_id: string | null;
  short_circuited: boolean;
  skill: string | null;
  mcp: string | null;
  /** Dispatch correlation id. Always null in session-level v1: the app has
   *  no dispatch lifecycle to correlate against (dispatch-tracker is
   *  plugin-side). Reserved so per-dispatch rows need no schema migration. */
  dispatch_id: string | null;
  /** sha256(task_signature + stack + project), normalized and truncated to 12
   *  hex chars. The raw task signature is NEVER written — this is what keeps
   *  the log content-free. */
  task_sig_hash: string;
  stack: string | null;
  project: string | null;
  outcome: string;
  duration_ms: number | null;
  /** Runtime model id from message.updated (e.g. "glm-5.3"). Registry static
   *  models are a fallback only — runtime beats declared config. */
  model: string | null;
  /** activeStrategyId() sampled at flush time. */
  strategy: string | null;
  tokens_input: number;
  tokens_output: number;
  /** input + output only. Reasoning and cache are accounted separately so
   *  cache reads never inflate the headline token count. */
  tokens_total: number;
  tokens_reasoning: number;
  tokens_cache_read: number;
  tokens_cache_write: number;
  spend_usd: number;
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

/**
 * Content-free task signature hash.
 *
 * God-agnostic on purpose: the same task dispatched by two different gods
 * must hash identically, otherwise cross-model comparison silently breaks.
 * Normalization is trim + collapse internal whitespace + lowercase so
 * cosmetic reformatting doesn't fork a task into two buckets.
 */
export function hashTaskSignature(taskSignature: string, stack: string | null, project: string | null): string {
  const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();
  const payload = `${norm(taskSignature)}|${norm(stack ?? '')}|${norm(project ?? '')}`;
  return createHash('sha256').update(payload).digest('hex').slice(0, 12);
}

/** Shape the accumulator in opencode-session.ts flushes. */
export interface BenchmarkSessionRow {
  sessionID: string;
  taskSignature: string;
  stack: string | null;
  project: string | null;
  model: string | null;
  strategy: string | null;
  tokens_input: number;
  tokens_output: number;
  tokens_reasoning: number;
  tokens_cache_read: number;
  tokens_cache_write: number;
  spend_usd: number;
  had_error: boolean;
  tool_call_count: number;
  duration_ms: number;
  god: string;
  demigod: string | null;
}

/**
 * Append one benchmark row.
 *
 * Hard rules:
 *  - Recording OFF is a strict no-op: no mkdir, no file, no dir side effects.
 *  - Failures are logged and swallowed. This is called from the SSE path; a
 *    throw here would kill an in-flight run over a telemetry write.
 *  - Rollover is handled by the vault-policy pruner, not inline.
 */
export function appendBenchmarkEntry(row: BenchmarkSessionRow, ts?: string): boolean {
  try {
    // Read config fresh: a toggle-off must take effect on the very next flush.
    if (!loadBenchmarkConfig().recordingEnabled) return false;

    // Issue #35 invariant: all-zero rows are forbidden. A zero-activity row
    // that claims success is ghost noise (late re-flush of a re-created empty
    // bucket after an error-second flush). True error rows are kept even at
    // zero activity — the failure signal must survive.
    const zeroActivity = row.tokens_input === 0
      && row.tokens_output === 0
      && row.tokens_reasoning === 0
      && row.tool_call_count === 0;
    if (zeroActivity && !row.had_error) return false;

    const entry: BenchmarkEntry = {
      ts: ts ?? new Date().toISOString(),
      session_label: loadBenchmarkConfig().sessionLabel ?? null,
      god: row.god,
      demigod: row.demigod,
      instinct_id: null,
      short_circuited: false,
      skill: null,
      mcp: null,
      dispatch_id: null,
      task_sig_hash: hashTaskSignature(row.taskSignature, row.stack, row.project),
      stack: row.stack,
      project: row.project,
      outcome: row.had_error ? 'error' : 'success',
      duration_ms: Math.round(row.duration_ms),
      model: row.model,
      strategy: row.strategy,
      tokens_input: row.tokens_input,
      tokens_output: row.tokens_output,
      tokens_total: row.tokens_input + row.tokens_output,
      tokens_reasoning: row.tokens_reasoning,
      tokens_cache_read: row.tokens_cache_read,
      tokens_cache_write: row.tokens_cache_write,
      spend_usd: Number(row.spend_usd.toFixed(6)),
      had_error: row.had_error,
      tool_call_count: row.tool_call_count,
    };

    mkdirSync(dirname(BENCHMARK_LOG), { recursive: true });
    appendFileSync(BENCHMARK_LOG, JSON.stringify(entry) + '\n', { mode: 0o600 });
    return true;
  } catch (err: any) {
    console.error('[olympus:benchmarks] appendBenchmarkEntry failed:', err.message);
    return false;
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

  // Top demigods by dispatch count. Session-level rows carry demigod: null
  // (no app-side dispatch correlation exists) — skip them rather than
  // bucketing every session row under a literal "null" key.
  const perDemigodMap = new Map<string, { count: number; tokens: number; success_count: number }>();
  for (const e of entries) {
    if (!e.demigod) continue;
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
