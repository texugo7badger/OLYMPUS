/**
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { GOD_IDS, DEFAULT_LLM_STRATEGY, type LLMStrategy } from '@/lib/model-strategies';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/olympus/brain-stats
 *
 * v3.0 VaultBrain — God Intelligence Dashboard data source.
 *
 * Returns per-god learning metrics computed from:
 *   - ~/OLYMPUS-VAULT/06_Activity_Feed/live.jsonl (dispatch + dispatch_outcome events)
 *   - ~/OLYMPUS-VAULT/05_Auto_Learning/instincts/<god>/{seed,empirical,_archive}/*.md
 *
 * Plus a top-level `recommendedStrategy` field that Apollo checks on
 * session.created to suggest a strategy change based on brain maturity.
 *
 * Query params:
 *   ?brief=true  — only return top-level metrics (no per-god breakdown).
 *                  Used by the session.created hook for fast strategy checks.
 *   ?range=7     — days for success-rate calculation (default 7; also computes 30d + all-time)
 */

const VAULT = process.env.OLYMPUS_VAULT || path.join(os.homedir(), 'OLYMPUS-VAULT');
const LIVE_FEED = path.join(VAULT, '06_Activity_Feed', 'live.jsonl');
const INSTINCTS_DIR = path.join(VAULT, '05_Auto_Learning', 'instincts');
const OLYMPUS_HOME = path.join(os.homedir(), '.olympus');

/**
 * Vault-relative POSIX path for an absolute instinct file (issue #27).
 * VaultSummary's instinct rows feed instinct-detail-modal, which now reads
 * via /api/vault/file/read (vault-relative) instead of reconstructing the
 * vault root from an '/OLYMPUS-VAULT' marker.
 */
const toRelPath = (abs: string): string => path.relative(VAULT, abs).split(path.sep).join('/');
const PROVIDERS_FILE = path.join(OLYMPUS_HOME, 'llm-providers.json');

interface DispatchEvent {
  ts: string;
  god: string;
  action: string;
  task_signature?: string;
  demigod?: string;
  instinct_id?: string | null;
  short_circuited?: boolean;
  outcome?: 'success' | 'failure' | 'unknown' | 'superseded';
  duration_ms?: number;
  tokens_used?: { input: number; output: number };
  stack?: string | null;
  project?: string | null;
  verification_sample?: boolean;
}

interface InstinctMeta {
  id: string;
  god: string;
  confidence: number;
  scope?: 'global' | 'stack' | 'project';
  samples?: number;
  successes?: number;
  failures?: number;
  source?: 'seed' | 'empirical';
  immutable?: boolean;
  last_used?: string;
  trigger?: string;
  // The instinct's display name. Falls back to the
  // filename stem (i.id) when the frontmatter has no `name:` field.
  // Previously the API set `name: i.trigger || i.id` which always used the
  // trigger (a long sentence) instead of the actual instinct name.
  name?: string;
  demigod?: string;
  path: string;
  /** Vault-relative POSIX path — added in issue #27. */
  relPath: string;
}

/**
 * A lightweight instinct summary used by the Vault
 * Summary panel to show the actual NAMES of instincts in each tier
 * (Mastered / Learning / Quick Circuits), not just the count.
 *
 * We cap at 10 names per tier to keep the payload small; the UI shows
 * "and N more" for the rest.
 */
interface InstinctSummary {
  id: string;
  name: string;
  confidence: number;
  trigger?: string;
  demigod?: string;
}

interface InstinctNames {
  seed: InstinctSummary[];
  empirical: InstinctSummary[];
  archived: InstinctSummary[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function readLiveFeed(): DispatchEvent[] {
  if (!fs.existsSync(LIVE_FEED)) return [];
  try {
    const content = fs.readFileSync(LIVE_FEED, 'utf-8');
    const events: DispatchEvent[] = [];
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('{')) continue;
      try {
        events.push(JSON.parse(trimmed));
      } catch {
        // skip malformed
      }
    }
    return events;
  } catch {
    return [];
  }
}

function parseFrontmatter(raw: string): Record<string, any> | null {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return null;
  const fm: Record<string, any> = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!kv) continue;
    const key = kv[1];
    const val = kv[2].trim();
    if (val.startsWith('[') && val.endsWith(']')) {
      fm[key] = val.slice(1, -1).split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
    } else if (val === 'true' || val === 'false') {
      fm[key] = val === 'true';
    } else if (/^-?\d+(\.\d+)?$/.test(val)) {
      fm[key] = parseFloat(val);
    } else if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      fm[key] = val.slice(1, -1);
    } else {
      fm[key] = val;
    }
  }
  return fm;
}

function loadInstinctsForGod(godId: string): { seed: InstinctMeta[]; empirical: InstinctMeta[]; archived: InstinctMeta[] } {
  const result = { seed: [] as InstinctMeta[], empirical: [] as InstinctMeta[], archived: [] as InstinctMeta[] };
  const godDir = path.join(INSTINCTS_DIR, godId);
  if (!fs.existsSync(godDir)) return result;

  const tierDirs: Record<keyof typeof result, string> = {
    seed: 'seed',
    empirical: 'empirical',
    archived: '_archive',
  };

  for (const tier of Object.keys(tierDirs) as Array<keyof typeof result>) {
    const tierDir = path.join(godDir, tierDirs[tier]);
    if (!fs.existsSync(tierDir)) continue;
    try {
      for (const file of fs.readdirSync(tierDir)) {
        if (!file.endsWith('.md')) continue;
        const filePath = path.join(tierDir, file);
        try {
          const raw = fs.readFileSync(filePath, 'utf-8');
          const fm = parseFrontmatter(raw);
          if (!fm) continue;
          result[tier].push({
            id: fm.id || path.basename(file, '.md'),
            god: godId,
            confidence: typeof fm.confidence === 'number' ? fm.confidence : 0,
            scope: fm.scope,
            samples: typeof fm.samples === 'number' ? fm.samples : undefined,
            successes: typeof fm.successes === 'number' ? fm.successes : undefined,
            failures: typeof fm.failures === 'number' ? fm.failures : undefined,
            source: fm.source,
            immutable: fm.immutable,
            last_used: fm.last_used,
            trigger: fm.trigger,
            // Populate `name` from frontmatter, falling back
            // to the filename stem. Previously the API used `i.trigger || i.id`
            // for the display name, which always showed the trigger sentence.
            name: typeof fm.name === 'string' && fm.name.trim()
              ? fm.name.trim()
              : path.basename(file, '.md'),
            demigod: fm.demigod,
            path: filePath,
            relPath: toRelPath(filePath),
          });
        } catch {
          // skip unreadable
        }
      }
    } catch {
      // ignore
    }
  }
  return result;
}

function getCurrentStrategy(): LLMStrategy {
  try {
    if (fs.existsSync(PROVIDERS_FILE)) {
      const cfg = JSON.parse(fs.readFileSync(PROVIDERS_FILE, 'utf-8'));
      if (typeof cfg.strategy === 'string') return cfg.strategy as LLMStrategy;
    }
  } catch {
    // ignore
  }
  return DEFAULT_LLM_STRATEGY;
}

/**
 * Recommend a strategy based on brain maturity.
 *
 * - Short-circuit hit rate > 70% AND avg confidence > 0.8 -> go-budget
 *   (the gods are smart enough to use cheaper models).
 * - Short-circuit hit rate < 30% AND avg confidence < 0.5 -> go-max-quality
 *   (the gods are still learning, use the best models).
 * - Otherwise -> go-balanced (the default).
 *
 * The recommendation is non-blocking — Apollo mentions it in natural language
 * and the user decides. The brain never silently changes its own strategy.
 */
function recommendStrategy(
  shortCircuitHitRate: number,
  avgConfidence: number,
): LLMStrategy {
  if (shortCircuitHitRate > 0.70 && avgConfidence > 0.80) {
    return 'go-budget';
  }
  if (shortCircuitHitRate < 0.30 && avgConfidence < 0.50) {
    return 'go-max-quality';
  }
  return 'go-balanced';
}

// ─── Main ────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const brief = req.nextUrl.searchParams.get('brief') === 'true';

  const allEvents = readLiveFeed();
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  const perGod: Record<string, any> = {};
  let totalShortCircuits = 0;
  let totalDispatches = 0;
  const allEmpiricalConfidences: number[] = [];

  for (const godId of GOD_IDS) {
    const instincts = loadInstinctsForGod(godId);

    const godEvents = allEvents.filter(e => e.god === godId);
    const godOutcomes = godEvents.filter(e => e.action === 'dispatch_outcome');

    const godDispatches = godOutcomes.length;
    const godScCount = godOutcomes.filter(e => e.short_circuited === true).length;
    const shortCircuitHitRate = godDispatches > 0 ? godScCount / godDispatches : 0;

    const successRate = (cutoffMs: number | null) => {
      const filtered = cutoffMs === null
        ? godOutcomes
        : godOutcomes.filter(e => new Date(e.ts).getTime() >= cutoffMs);
      if (filtered.length === 0) return null;
      const successes = filtered.filter(e => e.outcome === 'success').length;
      return successes / filtered.length;
    };

    const success7d = successRate(now - 7 * dayMs);
    const success30d = successRate(now - 30 * dayMs);
    const successAll = successRate(null);

    const empiricalConfs = instincts.empirical.map(i => i.confidence).filter(c => typeof c === 'number');
    const avgConfidence = empiricalConfs.length > 0
      ? empiricalConfs.reduce((s, c) => s + c, 0) / empiricalConfs.length
      : 0;
    allEmpiricalConfidences.push(...empiricalConfs);

    const topBySamples = [...instincts.empirical]
      .sort((a, b) => (b.samples ?? 0) - (a.samples ?? 0))
      .slice(0, 5)
      .map(i => ({
        id: i.id,
        confidence: i.confidence,
        samples: i.samples ?? 0,
        successes: i.successes ?? 0,
        failures: i.failures ?? 0,
        trigger: i.trigger,
        demigod: i.demigod,
      }));

    const topByConfidence = [...instincts.empirical]
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 5)
      .map(i => ({
        id: i.id,
        confidence: i.confidence,
        samples: i.samples ?? 0,
        trigger: i.trigger,
        demigod: i.demigod,
      }));

    const learningVelocity = instincts.empirical.filter(i => {
      try {
        const stat = fs.statSync(i.path);
        return stat.mtimeMs >= now - 7 * dayMs;
      } catch {
        return false;
      }
    }).length;

    const durations = godOutcomes
      .map(e => e.duration_ms)
      .filter((d): d is number => typeof d === 'number');
    const avgDurationMs = durations.length > 0
      ? Math.round(durations.reduce((s, d) => s + d, 0) / durations.length)
      : null;

    perGod[godId] = {
      instinctCounts: {
        seed: instincts.seed.length,
        empirical: instincts.empirical.length,
        archived: instincts.archived.length,
        total: instincts.seed.length + instincts.empirical.length + instincts.archived.length,
      },
      // Instinct names per tier (capped at 10 each).
      // The Vault Summary panel renders these so the user sees WHAT the god
      // is developing, not just how many.
      // Added `path` so the UI can make each name
      // clickable to open the instinct file in the IDE for verification.
      instinctNames: {
        seed: instincts.seed.slice(0, 10).map(i => ({
          id: i.id,
          name: i.name,
          confidence: i.confidence,
          trigger: i.trigger,
          demigod: i.demigod,
          path: i.path,
          relPath: i.relPath,
        })),
        empirical: instincts.empirical.slice(0, 10).map(i => ({
          id: i.id,
          name: i.name,
          confidence: i.confidence,
          trigger: i.trigger,
          demigod: i.demigod,
          path: i.path,
          relPath: i.relPath,
        })),
        archived: instincts.archived.slice(0, 10).map(i => ({
          id: i.id,
          name: i.name,
          confidence: i.confidence,
          trigger: i.trigger,
          demigod: i.demigod,
          path: i.path,
          relPath: i.relPath,
        })),
      },
      shortCircuitHitRate: Math.round(shortCircuitHitRate * 1000) / 1000,
      shortCircuitCount: godScCount,
      dispatchCount: godDispatches,
      avgConfidence: Math.round(avgConfidence * 1000) / 1000,
      successRate: {
        '7d': success7d !== null ? Math.round(success7d * 1000) / 1000 : null,
        '30d': success30d !== null ? Math.round(success30d * 1000) / 1000 : null,
        allTime: successAll !== null ? Math.round(successAll * 1000) / 1000 : null,
      },
      topBySamples,
      topByConfidence,
      learningVelocity,
      avgDurationMs,
    };

    totalShortCircuits += godScCount;
    totalDispatches += godDispatches;
  }

  const aggregateShortCircuitHitRate = totalDispatches > 0 ? totalShortCircuits / totalDispatches : 0;
  const aggregateAvgConfidence = allEmpiricalConfidences.length > 0
    ? allEmpiricalConfidences.reduce((s, c) => s + c, 0) / allEmpiricalConfidences.length
    : 0;

  const currentStrategy = getCurrentStrategy();
  const recommended = recommendStrategy(aggregateShortCircuitHitRate, aggregateAvgConfidence);

  // Sparkline data: short-circuit hit rate over the last 14 days (daily buckets)
  const sparkline: { date: string; hitRate: number; dispatches: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const dayStart = now - i * dayMs;
    const dayEnd = dayStart + dayMs;
    const dayStartIso = new Date(dayStart).toISOString().slice(0, 10);
    const dayOutcomes = allEvents.filter(e =>
      e.action === 'dispatch_outcome' &&
      new Date(e.ts).getTime() >= dayStart &&
      new Date(e.ts).getTime() < dayEnd
    );
    const daySc = dayOutcomes.filter(e => e.short_circuited === true).length;
    sparkline.push({
      date: dayStartIso,
      hitRate: dayOutcomes.length > 0 ? Math.round((daySc / dayOutcomes.length) * 1000) / 1000 : 0,
      dispatches: dayOutcomes.length,
    });
  }

  const strategyReasoning = (() => {
    if (recommended === currentStrategy) {
      return `Current strategy ${currentStrategy} is appropriate for the brain's current maturity (short-circuit hit rate: ${(aggregateShortCircuitHitRate * 100).toFixed(1)}%, avg confidence: ${aggregateAvgConfidence.toFixed(2)}).`;
    }
    if (recommended === 'go-budget') {
      return `Brain is mature (short-circuit hit rate ${(aggregateShortCircuitHitRate * 100).toFixed(1)}% > 70%, avg confidence ${aggregateAvgConfidence.toFixed(2)} > 0.80). The gods are smart enough to use cheaper models — suggest switching from ${currentStrategy} to go-budget to maximize the $10/mo GO plan.`;
    }
    if (recommended === 'go-max-quality') {
      return `Brain is still learning (short-circuit hit rate ${(aggregateShortCircuitHitRate * 100).toFixed(1)}% < 30%, avg confidence ${aggregateAvgConfidence.toFixed(2)} < 0.50). Suggest switching from ${currentStrategy} to go-max-quality so the gods have the best models while they build up their instincts.`;
    }
    return `Brain is at intermediate maturity (short-circuit hit rate ${(aggregateShortCircuitHitRate * 100).toFixed(1)}%, avg confidence ${aggregateAvgConfidence.toFixed(2)}). Suggest switching from ${currentStrategy} to go-balanced.`;
  })();

  if (brief) {
    return NextResponse.json({
      generated_at: new Date().toISOString(),
      vaultbrain_version: '3.0',
      shortCircuitHitRate: Math.round(aggregateShortCircuitHitRate * 1000) / 1000,
      avgConfidence: Math.round(aggregateAvgConfidence * 1000) / 1000,
      totalDispatches,
      currentStrategy,
      recommendedStrategy: recommended,
      strategyReasoning,
    });
  }

  return NextResponse.json({
    generated_at: new Date().toISOString(),
    vaultbrain_version: '3.0',
    aggregate: {
      totalDispatches,
      totalShortCircuits,
      shortCircuitHitRate: Math.round(aggregateShortCircuitHitRate * 1000) / 1000,
      avgConfidence: Math.round(aggregateAvgConfidence * 1000) / 1000,
      totalEmpiricalInstincts: allEmpiricalConfidences.length,
    },
    sparkline,
    currentStrategy,
    recommendedStrategy: recommended,
    strategyReasoning,
    perGod,
  });
}
