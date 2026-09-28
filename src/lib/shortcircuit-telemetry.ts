/**
 * Short-Circuit Telemetry — log reader + aggregator for instinct gate stats.
 *
 * Reads shortcircuit-log.jsonl from the vault and returns aggregate stats
 * for the God Intelligence Dashboard.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { getVaultRoot } from './vault-root';

const SHORTCIRCUIT_LOG = join(getVaultRoot(), '05_Auto_Learning', 'shortcircuit-log.jsonl');

export interface ShortCircuitEntry {
  ts: string;
  god: string;
  session_id?: string;
  confidence: number;
  short_circuited: boolean;
  instinct_id: string | null;
  instinct_tags: string[] | null;
  task_signature: string;
  tokens_saved: number;
}

export interface ShortCircuitStats {
  total_evaluations: number;
  total_short_circuits: number;
  short_circuit_rate: number; // 0.0 - 1.0
  total_tokens_saved: number;
  avg_confidence: number;
  /** Per-god breakdown of short-circuit counts + tokens saved. */
  per_god: Record<string, {
    evaluations: number;
    short_circuits: number;
    short_circuit_rate: number;
    tokens_saved: number;
    avg_confidence: number;
    top_instincts: Array<{ instinct_id: string; count: number; avg_confidence: number }>;
  }>;
  /** Top 5 instincts by fire count (across all gods). */
  top_instincts: Array<{ instinct_id: string; count: number; avg_confidence: number; tokens_saved: number }>;
  /** 14-day sparkline of short-circuit rate (one point per day). */
  sparkline: Array<{ date: string; evaluations: number; short_circuits: number; short_circuit_rate: number }>;
  /** Log file metadata. */
  log_file: { path: string; exists: boolean; size_bytes: number; size_mb: number };
  generated_at: string;
}

/**
 * Read the short-circuit log + compute aggregate stats.
 *
 * @param maxLines Cap the number of lines to read (default: 100,000 = ~20MB).
 *                  The most recent `maxLines` lines are read (tail). Set to
 *                  0 to read the whole file.
 */
export function getShortCircuitStats(maxLines: number = 100_000): ShortCircuitStats {
  const logFile = SHORTCIRCUIT_LOG;
  let exists = false;
  let sizeBytes = 0;
  let entries: ShortCircuitEntry[] = [];

  try {
    if (existsSync(logFile)) {
      exists = true;
      const stat = statSync(logFile);
      sizeBytes = stat.size;
      const raw = readFileSync(logFile, 'utf-8');
      const allLines = raw.split('\n').filter(Boolean);
      // Tail to the cap (most recent first).
      const lines = maxLines > 0 && allLines.length > maxLines
        ? allLines.slice(allLines.length - maxLines)
        : allLines;
      for (const line of lines) {
        try {
          const e = JSON.parse(line) as ShortCircuitEntry;
          // Basic validation.
          if (typeof e.ts === 'string' && typeof e.god === 'string' && typeof e.confidence === 'number') {
            entries.push(e);
          }
        } catch {}
      }
    }
  } catch (err) {
    // Log read failed — return empty stats.
  }

  const totalEvaluations = entries.length;
  const totalShortCircuits = entries.filter(e => e.short_circuited).length;
  const totalTokensSaved = entries.reduce((n, e) => n + (e.tokens_saved || 0), 0);
  const avgConfidence = totalEvaluations > 0
    ? entries.reduce((n, e) => n + e.confidence, 0) / totalEvaluations
    : 0;

  // Per-god breakdown.
  const perGodMap = new Map<string, {
    evaluations: number;
    short_circuits: number;
    tokens_saved: number;
    confidence_sum: number;
    instincts: Map<string, { count: number; confidence_sum: number }>;
  }>();
  for (const e of entries) {
    let g = perGodMap.get(e.god);
    if (!g) {
      g = { evaluations: 0, short_circuits: 0, tokens_saved: 0, confidence_sum: 0, instincts: new Map() };
      perGodMap.set(e.god, g);
    }
    g.evaluations++;
    if (e.short_circuited) g.short_circuits++;
    g.tokens_saved += e.tokens_saved || 0;
    g.confidence_sum += e.confidence;
    if (e.instinct_id) {
      let i = g.instincts.get(e.instinct_id);
      if (!i) {
        i = { count: 0, confidence_sum: 0 };
        g.instincts.set(e.instinct_id, i);
      }
      i.count++;
      i.confidence_sum += e.confidence;
    }
  }
  const perGod: ShortCircuitStats['per_god'] = {};
  for (const [god, g] of perGodMap) {
    perGod[god] = {
      evaluations: g.evaluations,
      short_circuits: g.short_circuits,
      short_circuit_rate: g.evaluations > 0 ? g.short_circuits / g.evaluations : 0,
      tokens_saved: g.tokens_saved,
      avg_confidence: g.evaluations > 0 ? g.confidence_sum / g.evaluations : 0,
      top_instincts: Array.from(g.instincts.entries())
        .map(([instinct_id, v]) => ({
          instinct_id,
          count: v.count,
          avg_confidence: v.count > 0 ? v.confidence_sum / v.count : 0,
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5),
    };
  }

  // Top instincts across all gods.
  const allInstincts = new Map<string, { count: number; confidence_sum: number; tokens_saved: number }>();
  for (const e of entries) {
    if (!e.instinct_id) continue;
    let i = allInstincts.get(e.instinct_id);
    if (!i) {
      i = { count: 0, confidence_sum: 0, tokens_saved: 0 };
      allInstincts.set(e.instinct_id, i);
    }
    i.count++;
    i.confidence_sum += e.confidence;
    i.tokens_saved += e.tokens_saved || 0;
  }
  const topInstincts = Array.from(allInstincts.entries())
    .map(([instinct_id, v]) => ({
      instinct_id,
      count: v.count,
      avg_confidence: v.count > 0 ? v.confidence_sum / v.count : 0,
      tokens_saved: v.tokens_saved,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // 14-day sparkline.
  const sparklineMap = new Map<string, { evaluations: number; short_circuits: number }>();
  const today = new Date();
  for (let i = 13; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10); // YYYY-MM-DD
    sparklineMap.set(dateStr, { evaluations: 0, short_circuits: 0 });
  }
  for (const e of entries) {
    const dateStr = e.ts.slice(0, 10);
    if (sparklineMap.has(dateStr)) {
      const s = sparklineMap.get(dateStr)!;
      s.evaluations++;
      if (e.short_circuited) s.short_circuits++;
    }
  }
  const sparkline = Array.from(sparklineMap.entries()).map(([date, s]) => ({
    date,
    evaluations: s.evaluations,
    short_circuits: s.short_circuits,
    short_circuit_rate: s.evaluations > 0 ? s.short_circuits / s.evaluations : 0,
  }));

  return {
    total_evaluations: totalEvaluations,
    total_short_circuits: totalShortCircuits,
    short_circuit_rate: totalEvaluations > 0 ? totalShortCircuits / totalEvaluations : 0,
    total_tokens_saved: totalTokensSaved,
    avg_confidence: avgConfidence,
    per_god: perGod,
    top_instincts: topInstincts,
    sparkline: sparkline,
    log_file: {
      path: logFile,
      exists,
      size_bytes: sizeBytes,
      size_mb: Math.round((sizeBytes / (1024 * 1024)) * 100) / 100,
    },
    generated_at: new Date().toISOString(),
  };
}
