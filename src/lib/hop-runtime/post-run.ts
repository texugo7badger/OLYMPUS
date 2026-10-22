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
import { existsSync, readFileSync, writeFileSync, unlinkSync, rmSync, lstatSync, mkdirSync, statSync } from 'node:fs';

/**
 * W-S PLAN-SANITIZE (the 23:32 specimen — 'Bad control character in
 * string literal'): model-written plans carry raw control characters
 * (literal line breaks) inside JSON string values; JSON.parse refuses
 * them and the walk died 4x in a row on a mechanically-repairable file.
 * The repair: a string-aware pass — inside a string literal, every raw
 * control character (including newlines) becomes its \\uXXXX escape;
 * outside strings, whitespace stays untouched (legal JSON).
 */
export function sanitizePlanJson(raw: string): string {
  let out = '';
  let inString = false;
  let escaped = false;
  for (const ch of raw) {
    if (escaped) {
      out += ch;
      escaped = false;
      continue;
    }
    if (inString && ch === '\\') {
      out += ch;
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      out += ch;
      continue;
    }
    if (inString && ch.charCodeAt(0) < 0x20) {
      out += '\\u' + ch.charCodeAt(0).toString(16).padStart(4, '0');
      continue;
    }
    out += ch;
  }
  return out;
}

/** The hop state read, failure-safe (a corrupt state file never blocks a
 *  walk — it degrades to fresh). */
function readHopStateSafe(laneRoot: string): { completed?: string[]; parked?: { hopId: string } | null; updatedAt?: string } | null {
  try {
    return JSON.parse(readFileSync(hopStatePath(laneRoot), 'utf-8'));
  } catch {
    return null;
  }
}
import { join } from 'node:path';
import { walkPlan, resolveGodModelLane, type HopDispatcher, type HopWalkEvent } from './walker';
import { hopStatePath, saveHopState } from './hop-state';
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
    if (send) send({ type: 'hop_start', hop: ev.hop, god: ev.god, pool, lane: laneRoot, artifacts: ev.artifacts, msg, ts });
  } else if (ev.type === 'hop_heartbeat') {
    msg = `Hop '${ev.hop}' running — god ${ev.god}${poolNote}, ${Math.round(ev.elapsedMs / 1000)}s (the spawn works; the next event lands on completion)`;
    if (send) send({ type: 'log', msg, ts });
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
  /** W-D3: the projected remaining wall-time for the parked walk's
   *  remaining hops (the tasks sheet's critical-path model) — the RESUME
   *  contract carries a time expectation, honestly derived. */
  projectedRemainingMs?: number;
}): string {
  if (opts.parked) {
    const eta = typeof opts.projectedRemainingMs === 'number' && opts.projectedRemainingMs > 0
      ? ` ~${opts.projectedRemainingMs >= 60_000
          ? `${Math.round(opts.projectedRemainingMs / 60_000)} min`
          : `${Math.round(opts.projectedRemainingMs / 1000)}s`} of projected work left (the lane's own medians).`
      : '';
    return [
      `Plan parked at hop '${opts.parked.hopId}' (${opts.parked.reason}) — ${opts.completed}/${opts.total} hops done.${eta}`,
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
  /** #U1d (UAT-2-FIX): when the caller expects a plan (the classification
   *  said needsPlanning), the no-plan case is NOT silent — the honest note
   *  names the expected path so a plan-in-the-wrong-place surfaces in
   *  seconds (the 16:29 specimen sat invisible for 27 minutes). */
  expectPlan?: boolean;
  /** W-S TURN-SETTLE: a probe wired by the route — true while the planning
   *  turn is still ALIVE server-side. The walk waits for it to settle
   *  before reading the plan (the v2 prompt resolves a step early). */
  turnStillAlive?: () => Promise<boolean>;
  /** #120 (B6d): publish hop events to the durable activity feed. The
   *  product flow opts in; fixtures never touch the real vault. */
  publishActivity?: boolean;
  /** W-T PLAN-FRESHNESS: the planning turn's start (epoch ms). When a plan
   *  is EXPECTED and the file on disk predates the turn, the model ECHOED
   *  a plan but never WROTE one (the 00:53 specimen: the walk consumed the
   *  stale plan from a prior session while the new one existed only in the
   *  model's chat text). The stale file never answers a planning turn. */
  turnStartedAt?: number;
}): Promise<PostRunWalkOutcome> {
  // W-P/W-S TURN-SETTLE (the 23:31 specimen — the walk raced the planner):
  // the v2 prompt resolves after the FIRST step while Apollo's turn KEEPS
  // RUNNING server-side (the plan write lands minutes later). The old
  // walk-check fired on the plan that was already on disk — walking the
  // STALE plan while the NEW one was mid-write, corrupting the campaign
  // state into hybrids ("12/5 hops GREEN"). The cure: the walk waits for
  // the turn to SETTLE server-side before it reads any plan.
  if (opts.turnStillAlive) {
    const SETTLE_MS = Number(process.env.OLYMPUS_TURN_SETTLE_MS || 150_000);
    const t0 = Date.now();
    let narratedAt = 0;
    try {
      while (await opts.turnStillAlive()) {
        if (Date.now() - t0 >= SETTLE_MS) break;
        if (Date.now() - narratedAt >= 15_000) {
          narratedAt = Date.now();
          opts.send?.({ type: 'log', msg: `⏳ the planning turn is still running server-side — the walk waits for it to settle (bound ${Math.round((SETTLE_MS - (Date.now() - t0)) / 1000)}s left)`, ts: new Date().toISOString() });
        }
        await new Promise((r) => setTimeout(r, 3_000));
      }
    } catch { /* the probe failing = settle now — the walk proceeds */ }
  }

  const planPath = join(opts.laneRoot, DISPATCH_PLAN_FILENAME);
  // W-P PLAN-WAIT (the 2026-10-21 20:11 specimen): the v2 prompt resolves
  // after the FIRST step while the planner's plan write lands in a LATER
  // step — the walk-check raced the write and told the user "no plan,
  // resend" 80 seconds BEFORE the plan arrived on disk. The grace window:
  // when a plan is EXPECTED and absent, poll for it (the planner is still
  // writing) before declaring the honest no-plan.
  if (!existsSync(planPath) && opts.expectPlan) {
    const PLAN_WAIT_MS = Number(process.env.OLYMPUS_PLAN_WAIT_MS || 120_000);
    const t0 = Date.now();
    let narratedAt = 0;
    while (!existsSync(planPath) && Date.now() - t0 < PLAN_WAIT_MS) {
      await new Promise((r) => setTimeout(r, 2_000));
      if (Date.now() - narratedAt >= 15_000) {
        narratedAt = Date.now();
        opts.send?.({ type: 'log', msg: `⏳ waiting for dispatch-plan.json — the planner is still writing (grace window ${Math.round((PLAN_WAIT_MS - (Date.now() - t0)) / 1000)}s left)`, ts: new Date().toISOString() });
      }
    }
    if (existsSync(planPath)) {
      opts.send?.({ type: 'log', msg: `dispatch-plan.json landed after ${Math.round((Date.now() - t0) / 1000)}s (the post-turn write) — proceeding to the walk check.`, ts: new Date().toISOString() });
    }
  }
  if (!existsSync(planPath)) {
    // #U1d (UAT-2-FIX): the honest no-plan — when a plan was EXPECTED, the
    // silence is a lie by omission (the 16:29 specimen: the planner wrote
    // elsewhere; the walk skipped silently; "Task completed" printed over
    // a 25-hop plan that would never walk). The note names the expected
    // path so the wrong-place plan surfaces in seconds.
    if (opts.expectPlan) {
      const msg = `No dispatch-plan.json found at ${planPath} — this task was classified as needing a plan, so NOTHING will walk. If the plan was written elsewhere, move it to that exact path and resend any prompt.`;
      opts.send?.({ type: 'walk_summary', completed: 0, total: 0, parked: null, msg, ts: new Date().toISOString() });
      return { walked: false, reason: 'no-plan-expected', completed: 0, total: 0, parked: null, summaryLine: msg };
    }
    return { walked: false, reason: 'no plan', completed: 0, total: 0, parked: null, summaryLine: '' };
  }
  let plan: unknown;
  try {
    plan = JSON.parse(sanitizePlanJson(readFileSync(planPath, 'utf-8')));
  } catch (e) {
    const msg = `dispatch-plan.json is unparseable in '${opts.slug}' — the walk is refused: ${e instanceof Error ? e.message : String(e)}. Ask Apollo to rewrite the plan as STRICT JSON (no raw line breaks inside string values — escape them as \\n).`;
    opts.send?.({ type: 'walk_summary', completed: 0, total: 0, parked: null, msg, ts: new Date().toISOString() });
    return { walked: false, reason: 'plan-unparseable', completed: 0, total: 0, parked: null, summaryLine: msg };
  }
  // W-T PLAN-FRESHNESS (the 00:53 specimen — the echo without the write):
  // a PLANNING turn whose plan file predates the turn never delivered. The
  // old walk consumed the stale plan from a prior session (complete with
  // its retired hop ids and malformed checks) while the new scope lived
  // only in the model's chat text. The honest refusal names the gap; the
  // stale file never answers a planning turn. Resumes are safe: a resume
  // prompt is short (classified planning=no) so expectPlan is false.
  if (opts.expectPlan && typeof opts.turnStartedAt === 'number') {
    try {
      const mtimeMs = statSync(planPath).mtimeMs;
      if (mtimeMs < opts.turnStartedAt - 2_000) {
        const msg = `The plan on disk PREDATES this turn (written ${new Date(mtimeMs).toISOString()}, the turn started ${new Date(opts.turnStartedAt).toISOString()}) — Apollo described a plan but did not WRITE dispatch-plan.json. The stale plan was NOT walked. Resend the ask with the words: escreva o dispatch-plan.json em disco, sobrescrevendo.`;
        opts.send?.({ type: 'walk_summary', completed: 0, total: 0, parked: null, msg, ts: new Date().toISOString() });
        return { walked: false, reason: 'plan-not-written', completed: 0, total: 0, parked: null, summaryLine: msg };
      }
    } catch { /* absent plan falls to the no-plan branch below */ }
  }
  // W-S THE STATE MACHINE (the 23:31 specimen — the hybrid "12/5 hops
  // GREEN"): the old resume doctrine keyed on the STATE FILE's existence —
  // so a NEW plan on a lane with ANY prior state resumed blindly: old
  // completed ids from retired plans leaked into the new walk's counts, a
  // fully-walked plan re-echoed "GREEN" at a fresh prompt, and no gate
  // ever opened for genuinely new scope. The plan-to-state relation
  // decides:
  //   - parked hop ∈ plan            → RESUME (re-run the parked + rest; the
  //                                     approval already happened)
  //   - every plan hop already done  → STALE-COMPLETE (the honest echo — a
  //                                     fresh prompt needs a fresh plan)
  //   - completed ∩ plan == ∅        → FRESH (reset the state; the #120 gate
  //                                     opens)
  //   - partial overlap              → RESUME (same plan, some done)
  const stateExists = existsSync(hopStatePath(opts.laneRoot));
  const planIds = new Set<string>(Array.isArray((plan as any)?.hops) ? (plan as any).hops.map((h: any) => String(h?.id ?? '')) : []);
  const priorState = stateExists ? readHopStateSafe(opts.laneRoot) : null;
  const priorCompleted = new Set<string>(priorState?.completed ?? []);
  const priorParkedId = priorState?.parked?.hopId ?? null;
  const allPlanHopsDone = planIds.size > 0 && [...planIds].every((id) => priorCompleted.has(id)) && !priorParkedId;
  const anyPlanHopDone = [...planIds].some((id) => priorCompleted.has(id));
  let resume = stateExists && (priorParkedId ? planIds.has(priorParkedId) : anyPlanHopDone);
  if (stateExists && allPlanHopsDone) {
    // STALE-COMPLETE: the previous plan is fully walked and this turn wrote
    // no replacement — never the liar's "walked N/N GREEN" for a NEW ask.
    const msg = `The previous plan is already fully walked (${planIds.size}/${planIds.size} GREEN, ${priorState?.updatedAt ?? 'earlier'}) and no NEW plan was written this turn. This prompt's NEW work needs a fresh dispatch-plan.json — resend the ask (the word 're-plan' or 'TRABALHO NOVO' guarantees Apollo writes one) or delete ${planPath} and resend.`;
    opts.send?.({ type: 'walk_summary', completed: planIds.size, total: planIds.size, parked: null, msg, ts: new Date().toISOString() });
    return { walked: false, reason: 'stale-complete', completed: planIds.size, total: planIds.size, parked: null, summaryLine: msg };
  }
  if (stateExists && !resume) {
    // FRESH plan on a lane with unrelated state: reset the campaign memory
    // (retired ids must not leak into the new counts — the "12/5" hybrid).
    try { unlinkSync(hopStatePath(opts.laneRoot)); } catch { /* best-effort */ }
  }
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
  // W-S PLAN-SCOPED TRUTH: the counts answer THIS plan — completed ids
  // from retired plans never inflate the number (the "12/5" hybrid).
  const completed = result.completed.filter((id) => planIds.has(id)).length;
  const parked = result.parked ? { hopId: result.parked.hopId, reason: result.parked.reason } : null;
  // W-D3: the parked summary carries the projected remaining time — the
  // tasks sheet's critical-path model over the same lane artifacts.
  let projectedRemainingMs: number | undefined;
  try {
    const { buildTasksSheet } = await import('../tasks-sheet');
    projectedRemainingMs = buildTasksSheet({ lane: opts.laneRoot }).stats.projectedRemainingMs || undefined;
  } catch { /* the projection never breaks the summary */ }

  // W-D6 (v0.0.6 MISSION-CONTROL-TRUE): ATLAS THE ORCHESTRATOR, the missing
  // half of W2-1 — on a PARK, the orchestrator lane gets the failure context
  // and produces a bounded verification verdict (what failed, the likely
  // cause, the resume recommendation). Deterministic checks stay first and
  // free; this fires ONLY on park (rare, bounded — one Atlas call, never on
  // healthy walks). Non-fatal by contract: a verdict failure never touches
  // the summary.
  let atlasVerdict: string | null = null;
  if (parked) {
    try {
      const { spawnHopDispatcher } = await import('./walker');
      const atlasLane = resolveGodModelLane('atlas');
      if (atlasLane) {
        const verdictHop: import('./plan-schema').PlanHop = {
          id: 'atlas-verdict',
          god: 'atlas',
          prompt: [
            'PROJECT VERIFICATION VERDICT (you are Atlas, the orchestrator).',
            `The walk parked at hop '${parked.hopId}' (reason: ${parked.reason}) with ${completed}/${totalHops} hops done.`,
            `The lane: ${opts.laneRoot}`,
            'Write a BOUNDED verdict (max 6 lines, plain text, no headers):',
            '1. WHAT failed (one line, the failure class in your own words).',
            '2. The LIKELY cause (one line — read the hop state / the lane as needed, do not re-run anything).',
            '3. The RESUME recommendation (one line — what the user should do before resuming).',
            'Do NOT fix anything. Do NOT write code. Verdict only.',
          ].join('\n'),
          artifacts: [],
        };
        // W-Q VERDICT-BOUND (the 2026-10-21 20:30 specimen): the verdict
        // call sat IN THE CRITICAL PATH with no wall-clock bound — a slow
        // free-lane dispatch held the walk summary (and the whole stream)
        // hostage for 25+ minutes after the walk itself had resolved. The
        // verdict is a nicety, never a gate: past the bound it is skipped
        // and the summary ships.
        const VERDICT_TIMEOUT_MS = Number(process.env.OLYMPUS_ATLAS_VERDICT_MS || 120_000);
        const r = await Promise.race([
          spawnHopDispatcher(verdictHop, { laneRoot: opts.laneRoot, prompt: verdictHop.prompt }),
          new Promise<null>((resolveTimeout) => setTimeout(() => resolveTimeout(null), VERDICT_TIMEOUT_MS)),
        ]);
        if (r === null) {
          opts.send?.({ type: 'log', msg: `Atlas verdict skipped — the call exceeded the ${Math.round(VERDICT_TIMEOUT_MS / 1000)}s bound (the walk summary ships without it; the lane verdict lands on the next resume).`, ts: new Date().toISOString() });
        }
        if (r?.ok && r.output) {
          atlasVerdict = String(r.output).trim().slice(0, 1200);
          try { writeFileSync(join(opts.laneRoot, '.olympus-atlas-verdict.md'), `# Atlas verification verdict — ${new Date().toISOString()}\n\n${atlasVerdict}\n`, 'utf-8'); } catch { /* the file is best-effort */ }
          opts.send?.({ type: 'atlas_verdict', msg: atlasVerdict, parked, ts: new Date().toISOString() });
        }
      }
    } catch { /* the verdict never breaks the summary */ }
  }

  const summaryLine = [
    buildWalkSummaryLine({ completed, total: totalHops, parked, laneRoot: opts.laneRoot, slug: opts.slug, projectedRemainingMs }),
    atlasVerdict ? ` Atlas verdict: ${atlasVerdict.split('\n')[0].slice(0, 160)}…` : '',
  ].join('');
  opts.send?.({ type: 'walk_summary', completed, total: totalHops, parked, msg: summaryLine, ts: new Date().toISOString() });

  // #DESIGN-INTELLIGENCE D3: THE SELF-CORRECTION LOOP — when the walk
  // parks on a design-review hop (score < threshold), the machine reads
  // the review's fixInstructions and generates targeted fix hops. This is
  // the anti-AI-slop mechanism: the machine CRITIQUES its own output and
  // REPAIRS it. Max 2 design iterations (the third parks honest for the
  // human's judgment).
  if (parked && parked.reason === 'verify-failed' && parked.hopId.includes('design-review')) {
    const reviewPath = join(opts.laneRoot, 'design-review.json');
    try {
      const review = JSON.parse(readFileSync(reviewPath, 'utf-8'));
      if (Array.isArray(review.fixInstructions) && review.fixInstructions.length > 0 && (review._designIterations || 0) < 2) {
        const iterations = (review._designIterations || 0) + 1;
        const fixHops = review.fixInstructions.slice(0, 5).map((fix: string, i: number) => ({
          id: `design-fix-${iterations}-${i + 1}`,
          god: 'athena',
          prompt: `DESIGN FIX (iteration ${iterations}): ${fix}. Read the current file(s), apply the fix, write back. The design tokens are in globals.css — respect them.`,
          artifacts: [],
          verify: { review: 'deterministic', checks: [] },
          budgetTokens: 4096,
        }));
        // Append the fix hops + a re-review hop to the plan
        const planObj = JSON.parse(readFileSync(join(opts.laneRoot, DISPATCH_PLAN_FILENAME), 'utf-8')) as { hops: Array<Record<string, unknown>> };
        const completedIds = new Set(result.completed);
        planObj.hops = planObj.hops.filter((h) => !completedIds.has(h.id as string));
        planObj.hops.push(...fixHops);
        planObj.hops.push({
          id: `design-review-${iterations}`,
          god: 'athena',
          prompt: `DESIGN REVIEW (iteration ${iterations}): Re-read the key components and re-score. Write design-review.json with the SAME structure (scores, overall, issues, fixInstructions). If overall >= 7, the review passes.`,
          artifacts: ['design-review.json'],
          verify: { review: 'deterministic', checks: ['file-exists:design-review.json', 'design-score:7'] },
          budgetTokens: 4096,
        });
        review._designIterations = iterations;
        writeFileSync(reviewPath, JSON.stringify(review, null, 2));
        writeFileSync(join(opts.laneRoot, DISPATCH_PLAN_FILENAME), JSON.stringify(planObj, null, 2));
        // Clear the parked hop state so the resume picks up the fix hops
        saveHopState(opts.laneRoot, {
          version: 1,
          completed: [...completedIds].filter((id) => id !== parked.hopId),
          parked: null,
          updatedAt: new Date().toISOString(),
        });
        opts.send?.({ type: 'log', msg: `Design review failed (score ${review.overall} < 7) — self-correcting with ${fixHops.length} fix hops (iteration ${iterations} of 2).`, ts: new Date().toISOString() });
        // Recurse: walk the fix hops + re-review
        const fixResult = await maybeWalkThePlan({ ...opts, expectPlan: true });
        return fixResult;
      }
    } catch { /* the self-correction never breaks the summary */ }
  }

  // #DESIGN-INTELLIGENCE: THE RESIDUE CLEANUP — after a FULLY COMPLETED
  // walk, the machine removes its own runtime artifacts from the
  // deliverable. The project root must contain ONLY deliverable files.
  if (!parked && completed === totalHops) {
    const runtimeArtifacts = [
      join(opts.laneRoot, '.opencode'),
      join(opts.laneRoot, 'opencode.json'),
      join(opts.laneRoot, 'opencode.demigods.json'),
    ];
    for (const p of runtimeArtifacts) {
      try { if (existsSync(p)) { const stat = lstatSync(p); if (stat.isDirectory()) rmSync(p, { recursive: true }); else unlinkSync(p); } } catch { /* never breaks the walk */ }
    }
    // Ensure .gitignore covers the machine's runtime files
    const gitignorePath = join(opts.laneRoot, '.gitignore');
    const gitignoreEntries = ['.olympus-*', 'design-review.json', 'worklog/', '.opencode', 'opencode.json', 'opencode.demigods.json', 'node_modules/', '.next/', 'tsconfig.tsbuildinfo'];
    try {
      let existing = '';
      if (existsSync(gitignorePath)) existing = readFileSync(gitignorePath, 'utf-8');
      const missing = gitignoreEntries.filter((e) => !existing.includes(e));
      if (missing.length > 0) writeFileSync(gitignorePath, existing + (existing && !existing.endsWith('\n') ? '\n' : '') + missing.join('\n') + '\n');
    } catch { /* never breaks the walk */ }
  }

  return { walked: true, completed, total: totalHops, parked, summaryLine };
}

// ─── #120 (B6c): the terminal answers resolve the SAME gate ──────────────────

/**
 * UAT-3-FIX (A2): the regex matches at the START of the text — so the
 * choice button labels ("s — approve the walk") match exactly like a
 * bare "s". The old exact-word Set missed every multi-word approval.
 */
const APPROVE_RE = /^(s\b|sim\b|y\b|yes\b|ok\b|approve\b|aprovar\b|seguir\b|continua[r]?\b|start\b|go\b)/i;
const ABORT_RE = /^(n\b|nao\b|não\b|no\b|abort\b|abortar\b|parar\b|stop\b|cancela[r]?\b)/i;

export interface PlanWalkAnswerResolution {
  gateId: string;
  decision: 'approve' | 'abort';
  planPath: string;
  approvalPrompt: string;
}

/**
 * #120 + UAT-3-FIX (A2/A4): 's'/'n' typed in the terminal (PT-BR included)
 * resolves the SAME HITL gate the Pantheon toast shows — one state, no
 * bifurcation. The regex matches at the START of the text, so the choice
 * button labels match.
 *
 * #UAT3-A4: when no PENDING gate exists but a plan-walk gate was ALREADY
 * RESOLVED as approve (typically by the Pantheon toast — which resolves
 * but never walks, the 18:12:49 design gap), this ALSO returns the
 * resolution — the gateAnswerStream then walks the plan the Pantheon
 * left dangling. A 10-minute freshness window prevents old approved
 * gates from hijacking every future "s" message.
 */
export function resolvePlanWalkAnswer(text: string): PlanWalkAnswerResolution | null {
  const t = (text || '').trim().toLowerCase();
  if (!t) return null;

  const isApprove = APPROVE_RE.test(t);
  const isAbort = ABORT_RE.test(t);
  if (!isApprove && !isAbort) return null;
  const decision: 'approve' | 'abort' = isApprove ? 'approve' : 'abort';

  // Path 1: a PENDING gate — resolve it and return (the normal case).
  const pending = getPendingGates().filter((g) => g.phase === PLAN_WALK_PHASE);
  if (pending.length > 0) {
    const resolved = resolveGate(pending[0].id, decision);
    if (!resolved) return null;
    return { gateId: resolved.id, decision, planPath: resolved.targetFile ?? '', approvalPrompt: resolved.approvalPrompt };
  }

  // #UAT3-A4: Path 2 — no PENDING gate, but an APPROVED one exists (the
  // Pantheon resolved it but nobody walked). Return it so the
  // gateAnswerStream walks the plan the Pantheon left dangling.
  const all = listGates().filter((g) => g.phase === PLAN_WALK_PHASE && g.decision === 'approve' && g.targetFile);
  const lastResolved = all.length > 0 ? all[all.length - 1] : null;
  if (lastResolved) {
    const decidedAtMs = lastResolved.decidedAt ? new Date(lastResolved.decidedAt).getTime() : 0;
    const FRESH_WINDOW_MS = 10 * 60_000; // 10 minutes
    if (Date.now() - decidedAtMs < FRESH_WINDOW_MS) {
      return { gateId: lastResolved.id, decision: 'approve', planPath: lastResolved.targetFile ?? '', approvalPrompt: lastResolved.approvalPrompt };
    }
  }

  return null;
}
