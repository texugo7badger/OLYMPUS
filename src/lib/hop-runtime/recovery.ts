/**
 * recovery.ts — v0.0.88: Atlas ACTS on the park, then the walk resumes.
 *
 * The v0.0.87 patrol diagnosed every park but the overnight resume still
 * re-ran the same hop, on the same lane, with the same 14-tool budget, three
 * times. The logs show the result: three identical tool-budget parks. This
 * module turns the finding into a bounded action:
 *
 *   tool-budget  → hop override (budget 24 + narrow directive), retry once
 *   timeout      → lane quarantine (already written), retry on next lane
 *   verify       → override with the failing check named, retry once
 *   script       → retry once, then ask the user
 *   provider/auth/no-route → STOP; the user must fix the key/route
 *   unknown      → STOP; the user gets the evidence
 *
 * Max 2 recoveries per hop, 6 per campaign, persisted in
 * `.olympus-recovery.jsonl` + `.olympus-hop-overrides.json`.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import fs from 'node:fs';
import path from 'node:path';
import { appendActivity } from '../activity-feed';
import { readLaneHealth } from '../lane-health';
import type { PatrolFinding } from '../atlas-patrol';
import { writeHopOverride, readHopOverrides, type HopOverride } from './hop-overrides';
import { readGoConsoleAnchor } from '../go-console';
import { readHibernationPlan } from '../hibernation';

export type RecoveryKind = 'retry-budget' | 'retry-campaign-budget' | 'retry-lane' | 'retry-verify' | 'retry-script' | 'retry-blocked-deps' | 'wait-quota' | 'ask-lane' | 'ask-unknown' | 'none';

export interface RecoveryDecision {
  action: 'retry' | 'stop';
  kind: RecoveryKind;
  delayMs: number;
  override?: HopOverride;
  message: string;
}

/** v0.0.98 — the night window is the budget. A 2/hop + 6/campaign cap
 *  stopped an 8h night after a handful of parks; the window (up to 120
 *  starts) is the bound, with a per-hop cap so one hop cannot burn it all. */
const MAX_PER_HOP = 4;
const DEFAULT_MAX_PER_CAMPAIGN = 12;
function recoveryBudget(): { perHop: number; perCampaign: number } {
  const plan = readHibernationPlan();
  if (!plan) return { perHop: MAX_PER_HOP, perCampaign: DEFAULT_MAX_PER_CAMPAIGN };
  const left = Math.max(0, Date.parse(plan.until) - Date.now());
  return {
    perHop: MAX_PER_HOP,
    perCampaign: Math.min(120, Math.max(DEFAULT_MAX_PER_CAMPAIGN, Math.ceil(left / 120_000))),
  };
}

export function recoveryLogPath(laneRoot: string): string {
  return path.join(laneRoot, '.olympus-recovery.jsonl');
}

/**
 * v0.0.92 — THE BUDGET IS PER CAMPAIGN, NOT PER LANE FOREVER.
 *
 * The ledger had six retries from 7–8 November; every later campaign read
 * "6/6" and stopped on its first park. The campaign id is the scope. Legacy
 * rows without an id belong to the past and no longer block a new campaign.
 */
export function campaignKey(laneRoot: string): string {
  try {
    const state = JSON.parse(fs.readFileSync(path.join(laneRoot, '.olympus-hop-state.json'), 'utf-8'));
    return String(state?.campaignId || (state?.generation ? `gen-${state.generation}` : 'unknown'));
  } catch {
    return 'unknown';
  }
}

export function readRecoveries(laneRoot: string): any[] {
  try {
    return fs.readFileSync(recoveryLogPath(laneRoot), 'utf-8').trim().split('\n')
      .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  } catch { return []; }
}

export function recoveryAttempts(laneRoot: string, hopId: string, campaignId = campaignKey(laneRoot)): number {
  const fromOverrides = Number(readHopOverrides(laneRoot)[hopId]?.attempts ?? 0);
  const fromLog = readRecoveries(laneRoot)
    .filter((r) => r?.hopId === hopId && r?.action === 'retry' && r?.campaignId === campaignId).length;
  return Math.max(fromOverrides, fromLog);
}

/** Turn one deterministic finding into the next bounded action. */
export function decideRecovery(laneRoot: string, finding: PatrolFinding, opts: { allowQaRetry?: boolean } = {}): RecoveryDecision {
  const campaignId = campaignKey(laneRoot);
  const attempts = recoveryAttempts(laneRoot, finding.hopId, campaignId);
  const campaignAttempts = readRecoveries(laneRoot)
    .filter((r) => r?.action === 'retry' && r?.campaignId === campaignId).length;
  const budget = recoveryBudget();
  const base = (msg: string): string => `${finding.hopId}: ${msg}`;
  if (attempts >= budget.perHop) {
    return { action: 'stop', kind: 'ask-unknown', delayMs: 0, message: base(`already recovered ${attempts}× — needs the user. ${finding.recommendation}`) };
  }
  if (campaignAttempts >= budget.perCampaign) {
    return { action: 'stop', kind: 'ask-unknown', delayMs: 0, message: base(`campaign recovery budget exhausted (${campaignAttempts}/${budget.perCampaign}) — stopping so the loop cannot burn the night. ${finding.recommendation}`) };
  }
  const laneNote = finding.nextLane ? ` Next lane: ${finding.nextLane}.` : ' No healthy fallback lane.';
  // v0.0.98-9.1 — A QA GATE NEVER GETS A BLIND RETRY. The qa-glow-local
  // specimen re-ran the same 7-check prompt 15 times on inflated budgets;
  // the walker's QA repair builds a fix/harness hop and a judge instead.
  if (!opts.allowQaRetry && /^qa[-_]/i.test(finding.hopId) && (finding.failureClass === 'tool-budget' || finding.failureClass === 'verify-failed' || finding.failureClass === 'script')) {
    return {
      action: 'stop', kind: 'ask-unknown', delayMs: 0,
      message: base(`${finding.failureClass} on a QA gate — the walker owns the repair hop (upstream fix or harness split + judge); a blind retry is refused. ${finding.recommendation}`),
    };
  }
  switch (finding.failureClass) {
    case 'campaign-budget':
      return {
        action: 'retry', kind: 'retry-campaign-budget', delayMs: 30_000,
        message: base('the 60-minute campaign window elapsed — a resume opens a fresh window; Atlas continues the same plan from disk (bounded).'),
      };
    case 'tool-budget':
      return {
        action: 'retry', kind: 'retry-budget', delayMs: 5_000,
        override: {
          toolBudget: 36,
          promptAppend: `RECOVERY: the previous attempt exhausted the tool budget. Use at most 36 tool calls; batch shell commands into ONE call; write the declared artifact BEFORE further probing; do not read files outside the declared set. Do not add scope. The failing evidence: ${finding.evidence}.`,
          reason: `tool-budget recovery (attempt ${attempts + 1})`,
        },
        message: base(`tool-budget → budget 36 + narrow directive; retry now.${laneNote}`),
      };
    case 'lane-exhausted':
      return {
        action: 'retry', kind: 'retry-lane', delayMs: 60_000,
        message: base('every lane in the chain was marked dead — waiting for the health window, then retrying the chain (transient exhaustion, not a missing key).'),
      };
    case 'timeout':
    case 'transport': {
      // v0.0.89 — ATLAS IS HY3, NEVER A FREE/NEMOTRON FAILOVER. The patrol may
      // propose any healthy lane; the architect of the campaign stays on its
      // sacred lane. The lane-health entry still quarantines the failure.
      const nextLane = finding.god === 'atlas' ? 'opencode-go/hy3' : finding.nextLane;
      return {
        action: 'retry', kind: 'retry-lane', delayMs: 8_000,
        ...(nextLane ? { override: { lane: nextLane, reason: `lane failover after ${finding.failureClass}`, promptAppend: `RECOVERY: the previous lane stalled. Keep the same scope; write the artifact before probing.` } } : {}),
        message: base(`${finding.failureClass} → quarantine the lane and retry on ${finding.god === 'atlas' ? 'HY3 (Atlas never falls back to a free lane)' : 'the next healthy lane'}.${laneNote}`),
      };
    }
    case 'script':
      return {
        action: 'retry', kind: 'retry-script', delayMs: 3_000,
        override: { reason: `script retry (attempt ${attempts + 1})`, promptAppend: `RECOVERY: the deterministic script failed. Read the traced command/stderr in telemetry, fix the check or the artifact it asserts, and re-run.` },
        message: base(`script failure → retry once with the trace; then ask the user.`),
      };
    case 'provider-quota': {
      // v0.0.98 — WAIT, don't stop. The console anchor is the reset truth;
      // a provider retryAfterMs is the fallback. The cap keeps a bad clock
      // from turning a night into a week.
      const anchor = readGoConsoleAnchor();
      const reset = anchor?.rollingResetAt ? Date.parse(anchor.rollingResetAt) : 0;
      const retryAfter = Number((finding as any).retryAfterMs ?? 0);
      const resumeAt = reset > Date.now() ? reset : (retryAfter > 0 ? Date.now() + retryAfter : 0);
      const delayMs = resumeAt
        ? Math.min(6 * 3600_000, Math.max(60_000, resumeAt - Date.now()))
        : 15 * 60_000;
      return {
        action: 'retry', kind: 'wait-quota', delayMs,
        message: base(`GO quota window exhausted — waiting ${Math.round(delayMs / 60_000)} min for ${resumeAt ? new Date(resumeAt).toISOString() : 'a bounded reset'}; the same hop resumes, no requests are burned.`),
      };
    }
    case 'provider-auth':
    case 'provider-route':
    case 'provider':
    case 'agent-missing':
    case 'model-missing':
      return {
        action: 'stop', kind: 'ask-lane', delayMs: 0,
        message: base(`${finding.failureClass} is a lane/identity problem — no retry until the key/route/agent is fixed.${laneNote}`),
      };
    case 'blocked-dependencies':
      return {
        action: 'retry', kind: 'retry-blocked-deps', delayMs: 0,
        message: base(`blocked by quarantined dependencies — recover those hops, not the gate. ${finding.recommendation}`),
      };
    default:
      if (finding.reason.startsWith('verify-failed') || finding.errorClass === 'verify') {
        return {
          action: 'retry', kind: 'retry-verify', delayMs: 5_000,
          override: {
            toolBudget: 32,
            promptAppend: `RECOVERY: the deterministic verify failed (${finding.evidence}). Fix exactly that check — do not add scope, do not rewrite the plan. Missing artifacts: ${finding.artifactsMissing.join(', ') || 'none'}.`,
            reason: `verify recovery (attempt ${attempts + 1})`,
          },
          message: base(`verify failed → targeted fix + retry.${laneNote}`),
        };
      }
      return {
        action: 'stop', kind: 'ask-unknown', delayMs: 0,
        message: base(`unclassified park — stopping and asking the user. ${finding.recommendation}`),
      };
  }
}

/** Persist the decision + write the hop override; publish to the feed. */
export function applyRecovery(laneRoot: string, finding: PatrolFinding, decision: RecoveryDecision): void {
  if (decision.action !== 'retry') return;
  if (decision.override) writeHopOverride(laneRoot, finding.hopId, decision.override);
  try {
    fs.appendFileSync(recoveryLogPath(laneRoot), JSON.stringify({
      ts: new Date().toISOString(),
      campaignId: campaignKey(laneRoot),
      hopId: finding.hopId,
      god: finding.god,
      failureClass: finding.failureClass,
      kind: decision.kind,
      action: decision.action,
      lane: finding.lane,
      nextLane: finding.nextLane,
      message: decision.message,
      override: decision.override ?? null,
    }) + '\n');
  } catch { /* evidence only */ }
  try {
    appendActivity({
      god: 'atlas', action: 'recovery', project: path.basename(laneRoot),
      msg: `Atlas recovery: ${decision.message}`,
      meta: { hop: finding.hopId, kind: decision.kind, action: decision.action, nextLane: finding.nextLane },
    });
  } catch { /* best effort */ }
}

/** A one-paragraph status Apollo can consume on the next turn. */
export function recoveryStatus(laneRoot: string): string {
  const rows = readRecoveries(laneRoot);
  if (rows.length === 0) return 'No automatic recovery has run in this campaign.';
  const last = rows[rows.length - 1];
  const attempts = rows.filter((r) => r.action === 'retry').length;
  return `Last recovery: ${last.hopId} ${last.kind} (${last.failureClass}) — ${last.message}. Total auto-recoveries: ${attempts}.`;
}

export function laneForOverride(lane: string | null | undefined): string | null {
  if (!lane) return null;
  const entry = readLaneHealth().lanes[lane];
  return entry && entry.status !== 'alive' ? null : lane;
}
