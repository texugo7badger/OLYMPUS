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

export type RecoveryKind = 'retry-budget' | 'retry-lane' | 'retry-verify' | 'retry-script' | 'ask-lane' | 'ask-unknown' | 'none';

export interface RecoveryDecision {
  action: 'retry' | 'stop';
  kind: RecoveryKind;
  delayMs: number;
  override?: HopOverride;
  message: string;
}

const MAX_PER_HOP = 2;
const MAX_PER_CAMPAIGN = 6;

export function recoveryLogPath(laneRoot: string): string {
  return path.join(laneRoot, '.olympus-recovery.jsonl');
}

export function readRecoveries(laneRoot: string): any[] {
  try {
    return fs.readFileSync(recoveryLogPath(laneRoot), 'utf-8').trim().split('\n')
      .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  } catch { return []; }
}

export function recoveryAttempts(laneRoot: string, hopId: string): number {
  const fromOverrides = Number(readHopOverrides(laneRoot)[hopId]?.attempts ?? 0);
  const fromLog = readRecoveries(laneRoot).filter((r) => r?.hopId === hopId && r?.action === 'retry').length;
  return Math.max(fromOverrides, fromLog);
}

/** Turn one deterministic finding into the next bounded action. */
export function decideRecovery(laneRoot: string, finding: PatrolFinding): RecoveryDecision {
  const attempts = recoveryAttempts(laneRoot, finding.hopId);
  const campaignAttempts = readRecoveries(laneRoot).filter((r) => r?.action === 'retry').length;
  const base = (msg: string): string => `${finding.hopId}: ${msg}`;
  if (attempts >= MAX_PER_HOP) {
    return { action: 'stop', kind: 'ask-unknown', delayMs: 0, message: base(`already recovered ${attempts}× — needs the user. ${finding.recommendation}`) };
  }
  if (campaignAttempts >= MAX_PER_CAMPAIGN) {
    return { action: 'stop', kind: 'ask-unknown', delayMs: 0, message: base(`campaign recovery budget exhausted (${campaignAttempts}/${MAX_PER_CAMPAIGN}) — stopping so the loop cannot burn the night. ${finding.recommendation}`) };
  }
  const laneNote = finding.nextLane ? ` Next lane: ${finding.nextLane}.` : ' No healthy fallback lane.';
  switch (finding.failureClass) {
    case 'tool-budget':
      return {
        action: 'retry', kind: 'retry-budget', delayMs: 5_000,
        override: {
          toolBudget: 24,
          promptAppend: `RECOVERY: the previous attempt exhausted the tool budget. Use at most 24 tool calls; batch shell commands into ONE call; write the declared artifact BEFORE further probing. Do not add scope. The failing evidence: ${finding.evidence}.`,
          reason: `tool-budget recovery (attempt ${attempts + 1})`,
        },
        message: base(`tool-budget → budget 24 + narrow directive; retry now.${laneNote}`),
      };
    case 'lane-exhausted':
      return {
        action: 'retry', kind: 'retry-lane', delayMs: 60_000,
        message: base('every lane in the chain was marked dead — waiting for the health window, then retrying the chain (transient exhaustion, not a missing key).'),
      };
    case 'timeout':
    case 'transport':
      return {
        action: 'retry', kind: 'retry-lane', delayMs: 8_000,
        ...(finding.nextLane ? { override: { lane: finding.nextLane, reason: `lane failover after ${finding.failureClass}`, promptAppend: `RECOVERY: the previous lane stalled. Keep the same scope; write the artifact before probing.` } } : {}),
        message: base(`${finding.failureClass} → quarantine the lane and retry on the next healthy lane.${laneNote}`),
      };
    case 'script':
      return {
        action: 'retry', kind: 'retry-script', delayMs: 3_000,
        override: { reason: `script retry (attempt ${attempts + 1})`, promptAppend: `RECOVERY: the deterministic script failed. Read the traced command/stderr in telemetry, fix the check or the artifact it asserts, and re-run.` },
        message: base(`script failure → retry once with the trace; then ask the user.`),
      };
    case 'provider':
    case 'agent-missing':
    case 'model-missing':
      return {
        action: 'stop', kind: 'ask-lane', delayMs: 0,
        message: base(`${finding.failureClass} is a lane/identity problem — no retry until the key/route/agent is fixed.${laneNote}`),
      };
    default:
      if (finding.reason.startsWith('verify-failed') || finding.errorClass === 'verify') {
        return {
          action: 'retry', kind: 'retry-verify', delayMs: 5_000,
          override: {
            toolBudget: 24,
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
