/**
 * plan-balance.ts — v0.0.55: stop the Athena-16 bottleneck.
 *
 * The planner can concentrate one god with most of the hops; the critical path
 * then serializes on that god's pool. This module rebalances only
 * UNAMBIGUOUS work by artifact type (UI -> Athena, scripts/docs -> Hephaestus,
 * data/schema -> Persephone, tests -> Dionysus, Docker/CI -> Prometheus), never
 * a script hop, never a semantic judgement call. The DAG edges are untouched;
 * only the executing god changes. Every change is reported.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import type { DispatchPlan, PlanHop } from './plan-schema';

export interface BalanceChange { hop: string; from: string; to: string; reason: string }
export interface BalanceResult {
  plan: DispatchPlan;
  changes: BalanceChange[];
  before: Record<string, number>;
  after: Record<string, number>;
  threshold: number;
}

function artifactKind(hop: PlanHop): 'ui' | 'data' | 'test' | 'infra' | 'script' | 'unknown' {
  if (hop.kind === 'script') return 'script';
  const files = (hop.artifacts ?? []).map((f) => f.toLowerCase());
  if (files.some((f) => /(^|\/)(dockerfile|docker-compose|\.github\/|terraform|k8s|helm)/.test(f) || /\.ya?ml$/.test(f))) return 'infra';
  if (files.some((f) => /\.(test|spec)\.[tj]sx?$/.test(f) || /(^|\/)(tests?|__tests__)\//.test(f))) return 'test';
  if (files.some((f) => /\.(tsx|jsx|css|scss|vue|svelte)$/.test(f))) return 'ui';
  if (files.some((f) => /\.(sql|prisma)$/.test(f) || /(schema|migration|seed)/.test(f))) return 'data';
  if (files.length > 0 && files.every((f) => /\.(ts|tsx|js|mjs|cjs|json|md|mdx|sh)$/.test(f))) return 'script';
  return 'unknown';
}

function preferred(kind: ReturnType<typeof artifactKind>, current: string): string[] {
  if (kind === 'ui') return ['athena'];
  if (kind === 'data') return ['persephone', 'hephaestus'];
  if (kind === 'test') return ['dionysus', 'hephaestus'];
  if (kind === 'infra') return ['prometheus', 'hephaestus'];
  if (kind === 'script') return ['hephaestus', 'persephone', 'athena'];
  return [];
}

/**
 * Rebalance a validated plan. A god may own at most `balanceThreshold` of the
 * hops (default 40%); only unambiguous hops are moved, and only to a god that
 * has room. The original plan object is not mutated.
 */
export function balancePlan(plan: DispatchPlan, opts: { threshold?: number } = {}): BalanceResult {
  const threshold = Math.max(0.2, Math.min(0.8, opts.threshold ?? 0.4));
  // Deterministic script hops do not serialize on an LLM pool; they are not
  // part of the balancing budget (the AIME plan mixes shell checks with UI).
  const eligible = plan.hops.filter((h) => h.kind !== 'script');
  const total = eligible.length;
  const counts: Record<string, number> = {};
  for (const h of eligible) counts[h.god] = (counts[h.god] ?? 0) + 1;
  const before = { ...counts };
  const max = Math.max(1, Math.floor(total * threshold));
  const changes: BalanceChange[] = [];
  const hops: PlanHop[] = plan.hops.map((h) => ({ ...h }));

  for (const hop of hops) {
    if ((counts[hop.god] ?? 0) <= max) continue;
    const kind = artifactKind(hop);
    // A shell hop (`kind: 'script'`) is deterministic and stays put; a
    // docs/script ARTIFACT can move to a build god.
    if (hop.kind === 'script' || kind === 'unknown') continue;
    const candidates = preferred(kind, hop.god).filter((g) => g !== hop.god && (counts[g] ?? 0) < max);
    if (candidates.length === 0) continue;
    const target = candidates.sort((a, b) => (counts[a] ?? 0) - (counts[b] ?? 0))[0];
    const from = hop.god;
    hop.god = target;
    counts[from] = (counts[from] ?? 1) - 1;
    counts[target] = (counts[target] ?? 0) + 1;
    changes.push({ hop: hop.id, from, to: target, reason: `${kind} artifact fits ${target}; ${from} was over ${Math.round(threshold * 100)}%` });
  }

  return { plan: { ...plan, hops }, changes, before, after: counts, threshold };
}

export function planLoad(plan: DispatchPlan): Array<{ god: string; hops: number; share: number }> {
  const eligible = plan.hops.filter((h) => h.kind !== 'script');
  const counts: Record<string, number> = {};
  for (const h of eligible) counts[h.god] = (counts[h.god] ?? 0) + 1;
  const total = Math.max(1, eligible.length);
  return Object.entries(counts).map(([god, n]) => ({ god, hops: n, share: n / total })).sort((a, b) => b.hops - a.hops);
}
