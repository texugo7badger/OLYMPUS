/**
 * post-run.ts — #117/#120 (PLANO-MASTER-1 B3/B6): the PRODUCT FLOW walks the
 * plan — gated by the user's approval.
 *
 * B3: after a successful turn, the flow looks for a plan in the project's
 * lane and WALKS it inside the stream — small hops, deterministic verify,
 * park-on-exhaustion with the resume contract PRINTED, and a completion
 * line that tells the truth (walked/parked — never "completed" over unwalked
 * hops).
 *
 * B6 (#120): a FRESH plan opens the HITL approval gate BEFORE the walk —
 * the SAME gate the Pantheon toast polls (5s) and the terminal question
 * render; approve/abort resolve it from EITHER surface (no state
 * bifurcation; 's'/'n' in the terminal resolve the same record via
 * resolvePlanWalkAnswer). A RESUMED walk skips the gate: its approval
 * already happened for this campaign. The hop narration now carries the
 * POOL (the god's live model lane) beside WHO and WHERE, and the product
 * flow (publishActivity opt-in) publishes every hop event to the durable
 * activity feed — the Pantheon's cross-session surface (#85's foundation).
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { walkPlan, resolveGodModelLane, type HopDispatcher, type HopWalkEvent } from './walker';
import { hopStatePath } from './hop-state';
import { createGate, getPendingGates, listGates, resolveGate } from '@/lib/hitl-gates';
import { appendActivity } from '@/lib/activity-feed';

export const DISPATCH_PLAN_FILENAME = 'dispatch-plan.json';

/** #120: the HITL phase key for the plan-walk approval gate. */
const PLAN_WALK_PHASE = 'plan-walk';

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
  /** #120: a fresh plan awaiting the user's approval — the gate BOTH the
   *  Pantheon toast and the terminal question resolve. */
  awaitingApproval?: { gate: { id: string; approvalPrompt: string } };
}

function fmt(n: number | null | undefined): string {
  return typeof n === 'number' && Number.isFinite(n) ? String(n) : '?';
}

function bridgeEvent(ev: HopWalkEvent, laneRoot: string, send?: WalkSend, publishActivity?: boolean): void {
  // #120 (B6b): the POOL — the god's live model lane from the repo config.
  // WHO the god + WHERE the lane + WHICH pool: the three-part narration.
  const pool = resolveGodModelLane(ev.god);
  const poolNote = pool ? ` · pool ${pool}` : '';
  const ts = new Date().toISOString();
  let msg = '';
  if (ev.type === 'hop_start') {
    msg = `Hop '${ev.hop}' started — god ${ev.god}${poolNote}, lane ${laneRoot}`;
    if (send) send({ type: 'hop_start', hop: ev.hop, god: ev.god, pool, lane: laneRoot, msg, ts });
  } else if (ev.type === 'hop_done') {
    msg = `Hop '${ev.hop}' GREEN — god ${ev.god}${poolNote}, ${Math.round(ev.durationMs / 1000)}s, ${fmt(ev.tokensIn)} in / ${fmt(ev.tokensOut)} out`;
    if (send) send({ type: 'hop_done', hop: ev.hop, god: ev.god, pool, lane: laneRoot, durationMs: ev.durationMs, tokensIn: ev.tokensIn, tokensOut: ev.tokensOut, msg, ts });
  } else {
    const errHead = (ev.error || '').slice(0, 160);
    msg = `Hop '${ev.hop}' PARKED (${ev.reason}) — god ${ev.god}${poolNote}${errHead ? `: ${errHead}` : ''}`;
    if (send) send({ type: 'hop_parked', hop: ev.hop, god: ev.god, pool, lane: laneRoot, reason: ev.reason, msg, ts });
  }
  // #120 (B6d): the OPT-IN durable publish — the product flow opts in so
  // the hop states reach the activity feed (ANY terminal + the auditor can
  // see who is walking what, across sessions — #85's foundation). Fixtures
  // omit it; the real vault is never polluted by test hops.
  if (publishActivity) {
    try { appendActivity({ god: ev.god, action: 'hop', msg }); } catch { /* the feed write never breaks the walk */ }
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

function planHopCount(plan: unknown): number {
  return Array.isArray((plan as { hops?: unknown[] })?.hops) ? (plan as { hops: unknown[] }).hops.length : 0;
}

function planGods(plan: unknown): string {
  const hops = Array.isArray((plan as { hops?: unknown[] })?.hops) ? (plan as { hops: Array<{ god?: unknown }> }).hops : [];
  return [...new Set(hops.map((h) => String(h?.god ?? '?')))].join(', ');
}

/**
 * The post-run seam: look for a plan in the lane; walk it (resuming from the
 * state file when one exists); narrate the hops live; return the truth.
 * A FRESH plan opens the HITL approval gate first (#120) — the walk is
 * WITHHELD until the user approves. Never throws into the turn's close
 * path — the caller wraps non-fatally.
 */
export async function maybeWalkThePlan(opts: {
  slug: string;
  laneRoot: string;
  /** The SSE bridge (the route's send). Omitted in fixtures that assert the return only. */
  send?: WalkSend;
  /** Injected dispatcher (fixtures). Defaults to the live spawn dispatcher. */
  dispatcher?: HopDispatcher;
  /** #120: the conversation id riding the gate record (routing + audit). */
  sessionId?: string;
  /** #120 (B6d): publish hop events to the durable activity feed. The
   *  product flow opts in; fixtures never touch the real vault. */
  publishActivity?: boolean;
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
  // parked or half-walked plan resumes (its approval already happened);
  // a FRESH plan opens the approval gate (#120).
  const resume = existsSync(hopStatePath(opts.laneRoot));
  if (!resume) {
    const total = planHopCount(plan);
    const gates = listGates().filter((g) => g.phase === PLAN_WALK_PHASE && g.targetFile === planPath);
    const existing = gates.length > 0 ? gates[gates.length - 1] : null;
    if (!existing || existing.decision === null) {
      const approvalPrompt = `Plan ready: ${total} hops, gods: ${planGods(plan)}, lane: ${opts.laneRoot}. Approve the walk? (the Pantheon toast, or answer 's' / 'n' here)`;
      const gate = existing ?? createGate({
        phase: PLAN_WALK_PHASE,
        action: 'Walk the plan',
        approvalPrompt,
        sessionId: opts.sessionId ?? 'unknown',
        god: 'apollo',
        targetFile: planPath,
      });
      return {
        walked: false, reason: 'awaiting-approval',
        completed: 0, total, parked: null,
        summaryLine: gate.approvalPrompt,
        awaitingApproval: { gate: { id: gate.id, approvalPrompt: gate.approvalPrompt } },
      };
    }
    if (existing.decision === 'abort') {
      const msg = `Plan walk ABORTED by your earlier decision — the plan stays on disk at ${planPath}; delete it or ask for a replan to start over.`;
      opts.send?.({ type: 'walk_summary', completed: 0, total, parked: null, msg, ts: new Date().toISOString() });
      return { walked: false, reason: 'plan-aborted', completed: 0, total, parked: null, summaryLine: msg };
    }
    // approved ('approve' | 'patch') — the walk proceeds below.
  }
  let result: Awaited<ReturnType<typeof walkPlan>>;
  try {
    result = await walkPlan({
      plan,
      dispatcher: opts.dispatcher,
      resume,
      onEvent: (ev) => bridgeEvent(ev, opts.laneRoot, opts.send, opts.publishActivity),
    });
  } catch (e) {
    const msg = `the plan in '${opts.slug}' is invalid — the walk is refused: ${e instanceof Error ? e.message : String(e)}`;
    opts.send?.({ type: 'walk_summary', completed: 0, total: 0, parked: null, msg, ts: new Date().toISOString() });
    return { walked: false, reason: 'plan-invalid', completed: 0, total: 0, parked: null, summaryLine: msg };
  }
  const totalHops = planHopCount(plan);
  const completed = result.completed.length;
  const parked = result.parked ? { hopId: result.parked.hopId, reason: result.parked.reason } : null;
  const summaryLine = buildWalkSummaryLine({ completed, total: totalHops, parked, laneRoot: opts.laneRoot, slug: opts.slug });
  opts.send?.({ type: 'walk_summary', completed, total: totalHops, parked, msg: summaryLine, ts: new Date().toISOString() });
  return { walked: true, completed, total: totalHops, parked, summaryLine };
}

// ─── #120 (B6c): the terminal answers resolve the SAME gate ──────────────────

const APPROVE_WORDS = new Set(['s', 'sim', 'y', 'yes', 'ok', 'approve', 'aprovar', 'seguir', 'continua', 'continuar', 'start', 'go']);
const ABORT_WORDS = new Set(['n', 'nao', 'não', 'no', 'abort', 'abortar', 'parar', 'stop', 'cancela', 'cancelar']);

export interface PlanWalkAnswerResolution {
  gateId: string;
  decision: 'approve' | 'abort';
  planPath: string;
  approvalPrompt: string;
}

/**
 * #120: 's'/'n' typed in the terminal (PT-BR included) resolves the SAME HITL
 * gate the Pantheon toast shows — one state, no bifurcation. Resolves the
 * OLDEST pending plan-walk gate when several plans await; the caller names
 * it in the resolution line. Returns null when the text is not an approval
 * word or no plan-walk gate is pending (the normal turn flow proceeds).
 */
export function resolvePlanWalkAnswer(text: string): PlanWalkAnswerResolution | null {
  const t = (text || '').trim().toLowerCase();
  if (!t) return null;
  const pending = getPendingGates().filter((g) => g.phase === PLAN_WALK_PHASE);
  if (pending.length === 0) return null;
  const decision: 'approve' | 'abort' | null = APPROVE_WORDS.has(t) ? 'approve' : ABORT_WORDS.has(t) ? 'abort' : null;
  if (!decision) return null;
  const gate = pending[0];
  const resolved = resolveGate(gate.id, decision);
  if (!resolved) return null;
  return { gateId: resolved.id, decision, planPath: resolved.targetFile ?? '', approvalPrompt: resolved.approvalPrompt };
}
