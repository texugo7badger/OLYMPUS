/**
 * replan-prompt.ts — v0.1.1: Continue on a loop-blocked hop asks Apollo.
 *
 * The loop guard exists to stop the SAME hop from burning the night twice.
 * The old Continue started the same walk again and the guard refused it,
 * leaving the button dead. This module turns the deterministic evidence into
 * one Apollo terminal prompt: fix the upstream, split the hop, or ask the
 * user with options. No model turn happens here.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadHopState } from './hop-runtime/hop-state';
import { readFrozenPlan, readPlanFile, planPath } from './hop-runtime/plan-generation';
import { blockedLoopHops } from './hop-runtime/loop-guard';
import { readRecoveries } from './hop-runtime/recovery';

export interface ReplanRequest {
  prompt: string;
  hopId: string;
  generation: number;
  reason: string;
}

function tailJsonl(file: string, max = 6): any[] {
  try {
    return fs.readFileSync(file, 'utf-8').trim().split('\n')
      .map((l) => { try { return JSON.parse(l); } catch { return null; } })
      .filter(Boolean).slice(-max);
  } catch { return []; }
}

function readDesign(laneRoot: string): any | null {
  try { return JSON.parse(fs.readFileSync(path.join(laneRoot, 'design-review.json'), 'utf-8')); } catch { return null; }
}

/** Build the evidence-backed prompt; returns null when no loop block exists. */
export function buildReplanRequest(slug: string, laneRoot: string): ReplanRequest | null {
  const plan = readFrozenPlan(laneRoot) ?? readPlanFile(planPath(laneRoot));
  const state = loadHopState(laneRoot);
  const generation = Number(state?.generation ?? plan?.generation ?? 0);
  const blocked = blockedLoopHops(laneRoot, generation);
  if (blocked.length === 0) return null;
  const first = blocked[0];
  const hop = (plan?.hops ?? []).find((h: any) => String(h?.id) === first.hopId) as any;
  const recent = tailJsonl(path.join(laneRoot, '.olympus-hop-telemetry.jsonl'), 8)
    .filter((r) => String(r?.hop ?? '') === first.hopId);
  const recoveries = readRecoveries(laneRoot).filter((r: any) => r?.hopId === first.hopId).slice(-4);
  const design = readDesign(laneRoot);
  const artifacts = Array.isArray(hop?.artifacts) ? hop.artifacts : [];
  const present = artifacts.filter((a: string) => { try { return fs.existsSync(path.join(laneRoot, String(a))); } catch { return false; } });

  const prompt = `[OLYMPUS REPLAN — Continue on a loop-blocked hop]

Project: ${slug}
Generation: ${generation}
Blocked hop: ${first.hopId} (${first.entry.failures}× ${first.entry.lastClass ?? 'unknown'}; blocked ${first.entry.blockedAt ?? '—'})
Park: ${state?.parked?.reason ?? '—'} — ${state?.parked?.error ?? 'no error text'}
God: ${hop?.god ?? 'unknown'} · kind: ${hop?.kind ?? 'llm'}

Atlas evidence (deterministic, no model):
- Artifacts declared: ${artifacts.length ? artifacts.join(', ') : 'none'}
- Artifacts present: ${present.length ? present.join(', ') : 'none'}
- Recent attempts: ${recent.length ? recent.map((r) => `${r.status}/${r.errorClass ?? '—'}: ${String(r.error ?? r.checks ?? '').slice(0, 220)}`).join(' | ') : 'no telemetry rows'}
- Recovery decisions: ${recoveries.length ? recoveries.map((r) => `${r.kind ?? r.action}: ${String(r.message ?? '').slice(0, 160)}`).join(' | ') : 'none'}
- Design: ${design?.overall != null ? `overall ${design.overall} / floor ${design.floor ?? '—'} / target ${design.target ?? '—'}` : 'not measured'}

The loop guard refused a blind retry. Do NOT run the same hop again. In the terminal:
1. Diagnose the smallest upstream cause from the evidence and the project source.
2. Choose ONE: (a) a corrected generation with a narrower hop, (b) a split of the blocked hop into smaller artifacts, or (c) ask the user.
3. If anything is ambiguous, ask at most THREE questions TOTAL, each with 2–4 concrete options, trade-offs, and your recommendation.
4. When you have a plan, write dispatch-plan.next.json with a new generation (or state exactly what you need from the user). Do not edit project files in this turn.
End with: "Approve to apply this generation and resume Atlas."

The user clicked Continue because the campaign must move — be decisive, but never repeat the blocked hop unchanged.`;

  return { prompt, hopId: first.hopId, generation, reason: first.entry.lastClass ?? 'loop-blocked' };
}
