/**
 * lane-roster.ts — v0.0.90: the strategy-aware fallback roster (server only).
 *
 * The live AIME 401 on `qwen3.7-plus` fell through the FREE_HYBRID_ROSTER to
 * `beam-free`, a free endpoint that locks the walk. A GO/Zen campaign must
 * never leave its plan for a free lane because a credential failed. This
 * module keeps the roster decision server-side (fs read of the strategy file)
 * so the client strategy catalog stays free of node built-ins.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DEFAULT_LLM_STRATEGY, FREE_HYBRID_ROSTER, GO_SAFE_FALLBACKS } from './model-strategies';

/** The active strategy id, read cheaply (no session imports, no cycle). */
export function readActiveStrategyId(): string {
  const home = process.env.OLYMPUS_HOME || path.join(os.homedir(), '.olympus');
  for (const file of [path.join(home, 'llm-providers.json'), path.join(home, 'active-strategy.json')]) {
    try {
      const raw = JSON.parse(fs.readFileSync(file, 'utf-8'));
      if (typeof raw?.strategy === 'string' && raw.strategy) return raw.strategy;
    } catch { /* next */ }
  }
  return DEFAULT_LLM_STRATEGY;
}

/**
 * The per-god fallback roster for the ACTIVE strategy.
 *
 * GO/Zen → GO-safe lanes only; local → stay local; free-* → the free roster
 * (an explicit user choice). No accidental free fallback.
 */
export function laneRosterFor(god: string, strategy = readActiveStrategyId()): string[] {
  if (strategy.startsWith('go-') || strategy.startsWith('zen-')) return [...GO_SAFE_FALLBACKS];
  if (strategy === 'local') return [];
  return ((FREE_HYBRID_ROSTER as any)?.[god] ?? []).map((l: any) => String(l.id));
}
