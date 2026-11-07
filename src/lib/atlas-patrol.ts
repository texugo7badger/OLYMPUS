/**
 * atlas-patrol.ts — v0.0.87: Atlas watches every park, not just the toast.
 *
 * THE SPECIMEN (2026-11-07): a hop parked `dispatch-failed:timeout` after 20
 * minutes on an auth-blocked lane; the Parthenon showed a red chip and the
 * walk stopped. Atlas — the orchestrator — had no opinion: no cause, no
 * recommendation, no replan. The user's ask: "bote ele para pensar também e
 * sempre monitorar qualquer evidência de parked — já reporta Apollo".
 *
 * The patrol is DETERMINISTIC first (0 tokens): it reads the plan, state and
 * telemetry, classifies every park, checks lane health and artifacts, and
 * emits a finding with a concrete recommendation (`retry`, `replan`,
 * `ask-user`). The findings are appended to `.olympus-atlas-patrol.jsonl`
 * and the shared activity feed, so Apollo's next turn and the Parthenon can
 * see them. `askAtlas()` / `askApollo()` are the opt-in model turns for a
 * novel cause; they never run automatically on every park.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import fs from 'node:fs';
import path from 'node:path';
import { appendActivity } from './activity-feed';
import { laneChain, readLaneHealth, isLaneAvailable } from './lane-health';
import { laneRosterFor } from './lane-roster';
import { classifyDispatchFailure } from './hop-runtime/failure-class';
import { runGodTurn } from './god-run';

export type PatrolVerdict = 'retry' | 'replan' | 'ask-user' | 'none';

export interface PatrolFinding {
  ts: string;
  hopId: string;
  god: string;
  status: string;
  reason: string;
  errorClass: string | null;
  failureClass: ReturnType<typeof classifyDispatchFailure>;
  lane: string | null;
  nextLane: string | null;
  artifactsPresent: string[];
  artifactsMissing: string[];
  verdict: PatrolVerdict;
  recommendation: string;
  evidence: string;
}

export interface PatrolReport {
  ok: boolean;
  lane: string;
  scannedAt: string;
  parked: PatrolFinding[];
  stuck: PatrolFinding[];
  /** One line Apollo can read without parsing the JSON. */
  summary: string;
  source: 'disk';
}

function readJson<T>(file: string, fallback: T): T {
  try { return JSON.parse(fs.readFileSync(file, 'utf-8')) as T; } catch { return fallback; }
}

function readTelemetry(laneRoot: string): any[] {
  try {
    return fs.readFileSync(path.join(laneRoot, '.olympus-hop-telemetry.jsonl'), 'utf-8')
      .trim().split('\n').map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  } catch { return []; }
}

function planHop(plan: any, id: string): any | null {
  return Array.isArray(plan?.hops) ? plan.hops.find((h: any) => h?.id === id) ?? null : null;
}

function nextHealthyLane(god: string, current: string | null): string | null {
  const roster = laneRosterFor(god);
  const entries = readLaneHealth().lanes;
  // Prefer lanes with a fresh `alive` reading. An auth lane whose TTL expired
  // is "available" by policy (a fixed key can recover) but it is a bad
  // RECOMMENDATION when a proven-alive lane is sitting in the roster.
  const alive = [...(current ? [current] : []), ...roster]
    .filter((id, i, arr) => id && arr.indexOf(id) === i)
    .filter((id) => entries[id]?.status === 'alive' && isLaneAvailable(id));
  const firstAlive = alive.find((id) => id !== current);
  if (firstAlive) return firstAlive;
  if (!current) return roster.find((id: string) => isLaneAvailable(id)) ?? null;
  return laneChain(current, roster).filter((id) => id !== current)[0] ?? null;
}

function missingArtifacts(laneRoot: string, hop: any): { present: string[]; missing: string[] } {
  const present: string[] = [];
  const missing: string[] = [];
  for (const rel of Array.isArray(hop?.artifacts) ? hop.artifacts : []) {
    try { (fs.existsSync(path.join(laneRoot, String(rel))) ? present : missing).push(String(rel)); }
    catch { missing.push(String(rel)); }
  }
  return { present, missing };
}

/** Classify one park (or a stale in-flight) into an actionable finding. */
export function patrolFinding(laneRoot: string, hop: any, park: any, opts: { now?: number; stuck?: boolean } = {}): PatrolFinding {
  const now = opts.now ?? Date.now();
  const hopId = String(park?.hopId ?? hop?.id ?? 'unknown');
  const god = String(hop?.god ?? 'system');
  const reason = String(park?.reason ?? (opts.stuck ? 'running' : 'unknown'));
  const errorClass = park?.errorClass ? String(park.errorClass) : null;
  const failureClass = classifyDispatchFailure({ error: park?.error, errorClass });
  const lane = (() => {
    const rows = readTelemetry(laneRoot);
    const match = [...rows].reverse().find((r) => String(r?.hop) === hopId && typeof r?.lane === 'string');
    return match ? String(match.lane) : null;
  })();
  const health = readLaneHealth().lanes;
  const laneEntry = lane ? health[lane] : null;
  const nextLane = nextHealthyLane(god, lane);
  const arts = missingArtifacts(laneRoot, hop);

  let verdict: PatrolVerdict = 'ask-user';
  let recommendation = '';
  if (opts.stuck) {
    verdict = nextLane ? 'retry' : 'ask-user';
    recommendation = nextLane
      ? `The hop has been running for ${Math.round((now - Date.parse(String(park?.startedAt ?? ''))) / 60_000)} min. Quarantine ${lane ?? 'its lane'} and retry on ${nextLane}.`
      : 'The hop is stuck and no healthy fallback lane is known — stop the walk and open Settings → LLM Strategy.';
  } else if (failureClass === 'provider' || failureClass === 'agent-missing' || failureClass === 'model-missing') {
    verdict = nextLane ? 'retry' : 'ask-user';
    recommendation = nextLane
      ? `Cause is ${failureClass} (${lane ?? 'lane unknown'}). Re-dispatch the same hop on ${nextLane}; do not burn the same lane again.`
      : `Cause is ${failureClass}; no healthy fallback in the roster — ask the user to fix the key/route.`;
  } else if (failureClass === 'timeout' || failureClass === 'transport') {
    verdict = nextLane ? 'retry' : 'ask-user';
    recommendation = nextLane
      ? `${failureClass} on ${lane ?? 'the applied lane'}. Quarantine it for 10 min and retry on ${nextLane}; the artifact check says ${arts.missing.length} missing.`
      : `${failureClass} with no fallback lane — stop and ask the user which lane to use.`;
  } else if (failureClass === 'campaign-budget') {
    verdict = 'retry';
    recommendation = `The campaign window elapsed (${reason}). A resume opens a fresh 60-minute window and Atlas continues the same plan from disk; the start budget still applies. ${arts.missing.length ? `Missing: ${arts.missing.join(', ')}.` : ''}`.trim();
  } else if (failureClass === 'tool-budget') {
    verdict = 'replan';
    recommendation = `Tool budget exhausted (${reason}). Replan the hop with a narrower prompt: name the exact files, cap the shell calls, write the artifact before probing. ${arts.missing.length ? `Missing: ${arts.missing.join(', ')}.` : 'Artifacts exist — verify before rerunning.'}`;
  } else if (reason.startsWith('verify-failed')) {
    verdict = 'replan';
    recommendation = `Deterministic verify failed. ${arts.missing.length ? `Missing: ${arts.missing.join(', ')}.` : 'The artifacts exist but do not satisfy the checks.'} Replan the hop around the failing check, not a blind retry.`;
  } else if (failureClass === 'script') {
    verdict = 'retry';
    recommendation = `Script failed. The traced command and stderr are in the telemetry row; fix the script (or the artifact it asserts) and retry the same id.`;
  } else {
    verdict = 'ask-user';
    recommendation = `Unclassified park (${reason}). Ask the user before another attempt; the evidence is in telemetry.`;
  }

  const evidence = [
    `reason=${reason}`,
    `failureClass=${failureClass}`,
    lane ? `lane=${lane}${laneEntry ? `(${laneEntry.status})` : ''}` : 'lane=unknown',
    nextLane ? `nextLane=${nextLane}` : 'nextLane=none',
    arts.missing.length ? `missing=${arts.missing.join(',')}` : 'artifacts=present',
  ].join(' · ');

  return {
    ts: new Date(now).toISOString(),
    hopId, god, status: String(park?.status ?? (opts.stuck ? 'running' : 'parked')),
    reason, errorClass, failureClass, lane, nextLane,
    artifactsPresent: arts.present, artifactsMissing: arts.missing,
    verdict, recommendation, evidence,
  };
}

/** Scan the lane: the named park + any in-flight hop older than 30 min. */
export function patrolLane(laneRoot: string, now = Date.now()): PatrolReport {
  const plan = readJson<any>(path.join(laneRoot, 'dispatch-plan.json'), { hops: [] });
  const state = readJson<any>(path.join(laneRoot, '.olympus-hop-state.json'), { completed: [], inFlight: [], parked: null });
  const parked: PatrolFinding[] = [];
  const stuck: PatrolFinding[] = [];
  if (state?.parked?.hopId) {
    parked.push(patrolFinding(laneRoot, planHop(plan, String(state.parked.hopId)), state.parked, { now }));
  }
  const completed = new Set<string>(Array.isArray(state?.completed) ? state.completed.map(String) : []);
  for (const row of Array.isArray(state?.inFlight) ? state.inFlight : []) {
    if (completed.has(String(row?.hopId))) continue;
    const started = Date.parse(String(row?.startedAt ?? '')) || now;
    if (now - started >= 30 * 60_000) {
      stuck.push(patrolFinding(laneRoot, planHop(plan, String(row.hopId)), { ...row, reason: 'running-over-30m', error: row?.error }, { now, stuck: true }));
    }
  }
  const findings = [...parked, ...stuck];
  const summary = findings.length === 0
    ? 'Atlas patrol: no park, no stale running hop.'
    : `Atlas patrol: ${parked.length} parked, ${stuck.length} stuck — ` +
      findings.slice(0, 3).map((f) => `${f.hopId}: ${f.verdict} (${f.failureClass}${f.nextLane ? ` → ${f.nextLane}` : ''})`).join('; ');
  return { ok: true, lane: laneRoot, scannedAt: new Date(now).toISOString(), parked, stuck, summary, source: 'disk' };
}

/** Persist the patrol + publish it to the shared feed (Atlas is visible). */
export function recordPatrol(laneRoot: string, report: PatrolReport): void {
  if (!report || (!report.parked.length && !report.stuck.length)) return;
  try {
    const file = path.join(laneRoot, '.olympus-atlas-patrol.jsonl');
    const lines = [...report.parked, ...report.stuck].map((f) => JSON.stringify(f)).join('\n') + '\n';
    fs.appendFileSync(file, lines);
  } catch { /* evidence only */ }
  for (const f of [...report.parked, ...report.stuck].slice(0, 4)) {
    try {
      appendActivity({
        god: 'atlas',
        action: 'patrol',
        project: path.basename(laneRoot),
        msg: `Atlas: ${f.hopId} — ${f.verdict} · ${f.failureClass}${f.nextLane ? ` → ${f.nextLane}` : ''} · ${f.recommendation.slice(0, 220)}`,
        meta: { hop: f.hopId, verdict: f.verdict, failureClass: f.failureClass, lane: f.lane, nextLane: f.nextLane },
      });
    } catch { /* feed is best-effort */ }
  }
}

/** Optional model turn: Atlas deep-reads a novel park and writes a memo. */
export async function askAtlas(laneRoot: string, finding: PatrolFinding, timeoutMs = 180_000): Promise<{ ok: boolean; text: string; error?: string }> {
  const prompt = [
    'You are Atlas, the orchestrator. A hop parked and the deterministic patrol produced this finding:',
    JSON.stringify(finding, null, 2),
    '',
    'Read the plan, the hop state and the telemetry in this lane. In at most 12 lines:',
    '1. the actual cause (quote the evidence);',
    '2. whether the hop can be retried as-is, needs a narrower replan, or needs the user;',
    '3. the exact next action (lane, prompt change, artifact check).',
    'Write it to evidence/atlas-patrol.md. Do not modify any other file.',
  ].join('\n');
  const turn = await runGodTurn('atlas', prompt, laneRoot, timeoutMs);
  try {
    appendActivity({
      god: 'atlas', action: 'patrol-think', project: path.basename(laneRoot),
      msg: turn.ok ? `Atlas analysed ${finding.hopId}: ${turn.text.slice(0, 300)}` : `Atlas analysis failed for ${finding.hopId}: ${turn.error}`,
      meta: { hop: finding.hopId, verdict: finding.verdict },
    });
  } catch { /* best-effort */ }
  return turn;
}

/** Escalate a finding to Apollo, who owns the replan decision. */
export async function askApollo(laneRoot: string, finding: PatrolFinding, timeoutMs = 240_000): Promise<{ ok: boolean; text: string; error?: string }> {
  const prompt = [
    'Atlas patrol found a parked/stuck hop. You are Apollo; decide and act.',
    JSON.stringify(finding, null, 2),
    '',
    'If the fix is mechanical (lane quarantine/retry, missing artifact, narrower prompt), write the corrected hop instruction to evidence/apollo-replan.md and tell the user the one action to take.',
    'If it needs a product decision, ask the user one direct question. Do not start a new campaign.',
  ].join('\n');
  const turn = await runGodTurn('apollo', prompt, laneRoot, timeoutMs);
  try {
    appendActivity({
      god: 'apollo', action: 'replan', project: path.basename(laneRoot),
      msg: turn.ok ? `Apollo replan for ${finding.hopId}: ${turn.text.slice(0, 400)}` : `Apollo replan failed for ${finding.hopId}: ${turn.error}`,
      meta: { hop: finding.hopId, verdict: finding.verdict },
    });
  } catch { /* best-effort */ }
  return turn;
}
