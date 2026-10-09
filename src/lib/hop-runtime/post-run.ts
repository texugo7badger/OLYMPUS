/**
 * post-run.ts — #117 (PLANO-MASTER-1 B3): the PRODUCT FLOW walks the plan.
 *
 * The defect it cures (the user's UAT, verbatim): the planner turn emitted a
 * valid 19-hop dispatch-plan.json and the run ENDED there — "Task completed.
 * writes 1" (the 1 write WAS the plan), 0 hops walked, the walker existing
 * only in test harnesses. The cure: after a successful turn, the flow looks
 * for a plan in the project's lane and WALKS it inside the stream — small
 * hops, deterministic verify, park-on-exhaustion with the resume contract
 * PRINTED, and a completion line that tells the truth (walked/parked —
 * never "completed" over unwalked hops).
 *
 * Resume doctrine: the hop state lives on disk (.olympus-hop-state.json in
 * the lane); the next successful prompt in the project re-runs this seam and
 * the walk resumes from the state — the campaign never dies with a pool
 * burst, it parks. Sessions are lanes; the disk carries the campaign.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { walkPlan, type HopDispatcher, type HopWalkEvent } from './walker';
import { hopStatePath } from './hop-state';

export const DISPATCH_PLAN_FILENAME = 'dispatch-plan.json';

/** The SSE bridge shape (the route's send()). */
export type WalkSend = (ev: Record<string, unknown>) => void;

export interface PostRunWalkOutcome {
  /** false = no plan on disk / an invalid plan (the honest skip — most
   *  turns are not planning turns and must not invent narration). */
  walked: boolean;
  reason?: string;
  completed: number;
  total: number;
  parked: { hopId: string; reason: string } | null;
  /** The honest completion line (empty on the honest skip). */
  summaryLine: string;
}

function fmt(n: number | null | undefined): string {
  return typeof n === 'number' && Number.isFinite(n) ? String(n) : '?';
}

function bridgeEvent(ev: HopWalkEvent, laneRoot: string, send?: WalkSend): void {
  if (!send) return;
  const ts = new Date().toISOString();
  if (ev.type === 'hop_start') {
    send({ type: 'hop_start', hop: ev.hop, god: ev.god, lane: laneRoot, msg: `Hop '${ev.hop}' started — god ${ev.god}, lane ${laneRoot}`, ts });
  } else if (ev.type === 'hop_done') {
    send({
      type: 'hop_done', hop: ev.hop, god: ev.god, lane: laneRoot,
      durationMs: ev.durationMs, tokensIn: ev.tokensIn, tokensOut: ev.tokensOut,
      msg: `Hop '${ev.hop}' GREEN — god ${ev.god}, ${Math.round(ev.durationMs / 1000)}s, ${fmt(ev.tokensIn)} in / ${fmt(ev.tokensOut)} out`,
      ts,
    });
  } else {
    const errHead = (ev.error || '').slice(0, 160);
    send({
      type: 'hop_parked', hop: ev.hop, god: ev.god, lane: laneRoot, reason: ev.reason,
      msg: `Hop '${ev.hop}' PARKED (${ev.reason}) — god ${ev.god}${errHead ? `: ${errHead}` : ''}`,
      ts,
    });
  }
}

/**
 * The honest completion line. A walked plan names the lane; a parked plan
 * names the hop + the reason and PRINTS the 1-line resume contract. It never
 * says "Task completed" over unwalked hops — that line was the UAT's lie.
 */
export function buildWalkSummaryLine(opts: {
  completed: number;
  total: number;
  parked: { hopId: string; reason: string } | null;
  laneRoot: string;
  slug: string;
}): string {
  if (opts.parked) {
    return [
      `Plan parked at hop '${opts.parked.hopId}' (${opts.parked.reason}) — ${opts.completed}/${opts.total} hops done.`,
      `RESUME: send any prompt in '${opts.slug}' — the walk resumes from disk (.olympus-hop-state.json); nothing is lost.`,
    ].join(' ');
  }
  return `The plan is walked: ${opts.completed}/${opts.total} hops GREEN — the deliverables are on disk at ${opts.laneRoot}.`;
}

/**
 * The post-run seam: look for a plan in the lane; walk it (resuming from the
 * state file when one exists); narrate the hops live; return the truth.
 * Never throws into the turn's close path — the caller wraps non-fatally.
 */
export async function maybeWalkThePlan(opts: {
  slug: string;
  laneRoot: string;
  /** The SSE bridge (the route's send). Omitted in fixtures that assert the return only. */
  send?: WalkSend;
  /** Injected dispatcher (fixtures). Defaults to the live spawn dispatcher. */
  dispatcher?: HopDispatcher;
}): Promise<PostRunWalkOutcome> {
  const planPath = join(opts.laneRoot, DISPATCH_PLAN_FILENAME);
  if (!existsSync(planPath)) {
    return { walked: false, reason: 'no plan', completed: 0, total: 0, parked: null, summaryLine: '' };
  }
  let plan: unknown;
  try {
    plan = JSON.parse(readFileSync(planPath, 'utf-8'));
  } catch (e) {
    const msg = `dispatch-plan.json is unparseable in '${opts.slug}' — the walk is refused: ${e instanceof Error ? e.message : String(e)}`;
    opts.send?.({ type: 'walk_summary', completed: 0, total: 0, parked: null, msg, ts: new Date().toISOString() });
    return { walked: false, reason: 'plan-unparseable', completed: 0, total: 0, parked: null, summaryLine: msg };
  }
  // Resume doctrine: the state file on disk is the campaign's memory — a
  // parked or half-walked plan resumes; a fresh plan resets nothing because
  // no state exists yet.
  const resume = existsSync(hopStatePath(opts.laneRoot));
  let result: Awaited<ReturnType<typeof walkPlan>>;
  try {
    result = await walkPlan({
      plan,
      dispatcher: opts.dispatcher,
      resume,
      onEvent: (ev) => bridgeEvent(ev, opts.laneRoot, opts.send),
    });
  } catch (e) {
    const msg = `the plan in '${opts.slug}' is invalid — the walk is refused: ${e instanceof Error ? e.message : String(e)}`;
    opts.send?.({ type: 'walk_summary', completed: 0, total: 0, parked: null, msg, ts: new Date().toISOString() });
    return { walked: false, reason: 'plan-invalid', completed: 0, total: 0, parked: null, summaryLine: msg };
  }
  const totalHops = Array.isArray((plan as { hops?: unknown[] })?.hops) ? (plan as { hops: unknown[] }).hops.length : 0;
  const completed = result.completed.length;
  const parked = result.parked ? { hopId: result.parked.hopId, reason: result.parked.reason } : null;
  const summaryLine = buildWalkSummaryLine({ completed, total: totalHops, parked, laneRoot: opts.laneRoot, slug: opts.slug });
  opts.send?.({ type: 'walk_summary', completed, total: totalHops, parked, msg: summaryLine, ts: new Date().toISOString() });
  return { walked: true, completed, total: totalHops, parked, summaryLine };
}
