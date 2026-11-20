/**
 * burn-state.ts — v0.0.96: persistence + the sync resolver used by the walk
 * and the interactive chat.
 *
 * The resolver is deliberately synchronous and cheap: it reads the last
 * decision file. The decision is refreshed by /api/olympus/burn while the app
 * is open; a stale decision keeps working but is labelled stale in the UI.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { normalizeBurnPolicy, type BurnDecision, type BurnPolicyState, type GodId } from './burn-policy';

const home = () => process.env.OLYMPUS_HOME || path.join(os.homedir(), '.olympus');
export const burnPolicyPath = () => path.join(home(), 'burn-policy.json');
export const burnDecisionPath = () => path.join(home(), 'burn-decision.json');
export const burnLogPath = () => path.join(home(), 'metrics', 'burn-log.jsonl');

export function readBurnPolicy(): BurnPolicyState {
  try {
    return normalizeBurnPolicy(JSON.parse(fs.readFileSync(burnPolicyPath(), 'utf-8')));
  } catch {
    return normalizeBurnPolicy(null);
  }
}

export function writeBurnPolicy(patch: unknown): BurnPolicyState {
  const next = normalizeBurnPolicy({ ...readBurnPolicy(), ...(patch as any), updatedAt: new Date().toISOString() });
  try {
    fs.mkdirSync(path.dirname(burnPolicyPath()), { recursive: true });
    fs.writeFileSync(burnPolicyPath(), JSON.stringify(next, null, 2) + '\n', { mode: 0o600 });
  } catch { /* best effort */ }
  return next;
}

export function readBurnDecision(): BurnDecision | null {
  try {
    const raw = JSON.parse(fs.readFileSync(burnDecisionPath(), 'utf-8'));
    return raw && typeof raw === 'object' && raw.active === true ? raw as BurnDecision : null;
  } catch {
    return null;
  }
}

export function writeBurnDecision(decision: BurnDecision): void {
  try {
    fs.mkdirSync(path.dirname(burnDecisionPath()), { recursive: true });
    fs.writeFileSync(burnDecisionPath(), JSON.stringify(decision, null, 2) + '\n', { mode: 0o600 });
    fs.mkdirSync(path.dirname(burnLogPath()), { recursive: true });
    fs.appendFileSync(burnLogPath(), JSON.stringify({ ...decision, loggedAt: new Date().toISOString() }) + '\n', 'utf-8');
  } catch { /* best effort */ }
}

export function burnDecisionAgeMs(): number | null {
  try {
    const st = fs.statSync(burnDecisionPath());
    return Math.max(0, Date.now() - st.mtimeMs);
  } catch {
    return null;
  }
}

/**
 * The synchronous model override for a god. Returns null when burn is off,
 * the decision is blocked, or the god has no picked lane — in which case the
 * applied opencode.json model stays in force.
 */
export function resolveBurnModelForGod(god: string): string | null {
  const decision = readBurnDecision();
  if (!decision?.active || decision.blocked) return null;
  const model = decision.roster?.[god as GodId];
  return typeof model === 'string' && model.includes('/') ? model : null;
}
