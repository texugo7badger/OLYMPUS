/**
 * campaign-context.ts — v0.0.88: Apollo sees the campaign before it speaks.
 *
 * The AIME specimen: a follow-up "corrija o parked e reinicie o walk" was a
 * planning turn, Apollo rewrote `dispatch-plan.json` (21 → 35 hops), the walk
 * kept its old snapshot, and the next resume appeared to "restart with more
 * hops". The campaign was invisible to the prompt.
 *
 * This block is authoritative in every turn: generation, per-generation
 * progress, walk state, the current park, Atlas's verdict and the last
 * recovery. It also carries the STEERING LAW: while a campaign is live or
 * parked, do not rewrite the plan; write a hop override, or stage a next
 * generation for a boundary.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getVaultRoot } from './vault-root';
import { readWalkLock } from './hop-runtime/walk-lock';
import { loadHopState } from './hop-runtime/hop-state';
import { readFrozenPlan, readNextPlan, readPlanFile, planPath, diffPlans } from './hop-runtime/plan-generation';
import { patrolLane } from './atlas-patrol';
import { recoveryStatus } from './hop-runtime/recovery';

let cache: { at: number; slug: string; block: string } | null = null;

function activeSlug(): string | null {
  try {
    const home = process.env.OLYMPUS_HOME || path.join(os.homedir(), '.olympus');
    const raw = JSON.parse(fs.readFileSync(path.join(home, 'active-project.json'), 'utf-8'));
    const slug = String(raw?.slug ?? '');
    return slug || null;
  } catch { return null; }
}

export function campaignContextBlock(slugOverride?: string | null): string {
  const slug = String(slugOverride ?? activeSlug() ?? '').trim();
  if (!slug) return '';
  const now = Date.now();
  if (cache && cache.slug === slug && now - cache.at < 2_000) return cache.block;
  const lane = path.join(getVaultRoot(), '02_Projects', slug);
  const plan = readFrozenPlan(lane) ?? readPlanFile(planPath(lane));
  if (!plan || !Array.isArray(plan.hops)) return '';
  const lock = readWalkLock(lane);
  const state = loadHopState(lane);
  const planned = new Set(plan.hops.map((h) => h.id));
  const completed = (state?.completed ?? []).filter((id) => planned.has(id));
  const generation = plan.generation ?? 1;
  const next = readNextPlan(lane);
  const patrol = (() => { try { return patrolLane(lane); } catch { return null; } })();
  const finding = patrol?.parked[0] ?? patrol?.stuck[0] ?? null;
  const stateKind = lock.holder && lock.alive ? 'RUNNING' : state?.parked ? 'PARKED' : 'IDLE';
  const lines = [
    '## CAMPAIGN CONTEXT — authoritative for this turn',
    `Project: ${slug} · generation ${generation} · plan ${plan.hops.length} hops · ${completed.length}/${plan.hops.length} completed in THIS generation · ${state?.completed?.length ?? 0} lifetime ids.`,
    `Walk: ${stateKind}${lock.holder?.pid ? ` · pid ${lock.holder.pid}` : ''}${state?.parked ? ` · parked at ${state.parked.hopId} (${state.parked.reason}${state.parked.errorClass ? `:${state.parked.errorClass}` : ''})` : ''}.`,
    `Atlas: ${patrol ? patrol.summary : 'patrol unavailable'}${finding ? ` · verdict ${finding.verdict} · next lane ${finding.nextLane ?? 'none'}` : ''}.`,
    recoveryStatus(lane),
    ...(next.plan && next.diff
      ? [`Staged next generation: +${next.diff.added.length} / -${next.diff.removed.length} / ~${next.diff.changed.length} hops — it applies at a hop boundary, not during the walk.`]
      : []),
    '',
    'STEERING LAW (v0.0.88):',
    '- While Walk is RUNNING or PARKED, DO NOT write `dispatch-plan.json` and DO NOT add/remove hops. The live walk holds a frozen generation.',
    '- To steer a hop, write `.olympus-hop-overrides.json` (in the lane) with `{ "<hopId>": { "promptAppend": "...", "toolBudget": N } }` — the next attempt consumes it without changing the plan.',
    '- To replan, write the new plan to `dispatch-plan.next.json` and tell the user it will apply at the next boundary; never overwrite the active plan.',
    '- Atlas owns recovery (retry/replan/ask-user). You own the answer to the user and the product decision. Do not hand-dispatch hops.',
  ];
  const block = lines.join('\n');
  cache = { at: now, slug, block };
  return block;
}
