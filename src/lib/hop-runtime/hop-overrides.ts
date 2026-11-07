/**
 * hop-overrides.ts — v0.0.88: recover a hop WITHOUT rewriting the plan.
 *
 * A recovery is a per-hop patch: a larger tool budget, a narrow prompt
 * addendum, a lane preference. It lives in `.olympus-hop-overrides.json` and
 * is consumed at dispatch; the plan file and its generation stay untouched.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import fs from 'node:fs';
import path from 'node:path';

export interface HopOverride {
  toolBudget?: number;
  promptAppend?: string;
  lane?: string;
  reason?: string;
  at?: string;
  attempts?: number;
}

export type HopOverrideMap = Record<string, HopOverride>;

export function overridesPath(laneRoot: string): string {
  return path.join(laneRoot, '.olympus-hop-overrides.json');
}

export function readHopOverrides(laneRoot: string): HopOverrideMap {
  try {
    const raw = JSON.parse(fs.readFileSync(overridesPath(laneRoot), 'utf-8'));
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as HopOverrideMap : {};
  } catch { return {}; }
}

export function readHopOverride(laneRoot: string, hopId: string): HopOverride | null {
  return readHopOverrides(laneRoot)[hopId] ?? null;
}

export function writeHopOverride(laneRoot: string, hopId: string, patch: HopOverride): HopOverride {
  const all = readHopOverrides(laneRoot);
  const prev = all[hopId] ?? {};
  const next: HopOverride = {
    ...prev,
    ...patch,
    attempts: Math.max(1, Number(patch.attempts ?? prev.attempts ?? 0) + (patch.attempts == null ? 1 : 0)),
    at: new Date().toISOString(),
  };
  all[hopId] = next;
  try {
    fs.mkdirSync(laneRoot, { recursive: true });
    fs.writeFileSync(overridesPath(laneRoot), JSON.stringify(all, null, 2) + '\n');
  } catch { /* best effort */ }
  return next;
}

export function clearHopOverride(laneRoot: string, hopId: string): void {
  const all = readHopOverrides(laneRoot);
  if (!(hopId in all)) return;
  delete all[hopId];
  try { fs.writeFileSync(overridesPath(laneRoot), JSON.stringify(all, null, 2) + '\n'); } catch { /* best effort */ }
}
