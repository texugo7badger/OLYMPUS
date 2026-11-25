/**
 * agent-model.ts — v0.0.97: the verified model guard.
 *
 * The GO provider can reject a specific model (the observed qwen3.7-plus
 * `provider.auth` / "OpenCode Go requires an API key") while the rest of the
 * account works. The old warm chat kept the dead model on the SESSION even
 * after the turn was attributed to another god, so every following Apollo
 * prompt died on the same lane. This module resolves the model for a god and
 * maps a known-unverified GO qwen lane to the verified DeepSeek GO fallback.
 *
 * It is deliberately conservative: only the exact qwen3.7-plus family is
 * redirected; an explicit user model in a custom strategy is left alone
 * unless it is that lane.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import fs from 'node:fs';
import path from 'node:path';
import { findOlympusRoot } from './opencode-spawn';
import { GO_SAFE_FALLBACKS } from './model-strategies';
import { isLaneAvailable, readLaneHealth } from './lane-health';

export const VERIFIED_GO_FALLBACK = 'opencode-go/deepseek-v4.1-flash';

/** The model applied in opencode.json for a god, if readable. */
export function configuredModelForGod(god: string): string | null {
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(findOlympusRoot(), 'opencode.json'), 'utf-8'));
    const model = cfg?.agent?.[god]?.model;
    return typeof model === 'string' && model ? model : null;
  } catch {
    return null;
  }
}

/** True for the exact GO qwen lane that returns provider.auth on this account. */
export function isUnverifiedQwenLane(model: string | null | undefined): boolean {
  return /^opencode-go\/qwen3\.7-plus$/i.test(String(model || ''));
}

/**
 * Resolve the model for a turn. A burn override wins; a lane the provider has
 * measured dead (auth/no-route/rate-limit) falls back to a verified live GO
 * lane; the older exact qwen3.7-plus guard stays as a belt-and-braces check.
 *
 * v0.1.0 — the fallback is LOUD. The user reported "GO auth disconnects" with
 * no cause: a chat turn silently kept a dead model on the session and every
 * later prompt failed. Now the cause is logged once per turn and the selected
 * live lane is what the session receives.
 */
export function guardedModelForGod(god: string, requested?: string | null): string | null {
  const model = (requested && String(requested).trim()) || configuredModelForGod(god);
  if (!model) return null;
  const health = readLaneHealth().lanes;
  if (isUnverifiedQwenLane(model)) {
    const fallback = firstAvailableGoLane(health);
    console.warn(`[agent-model] ${model} is a known-rejected GO qwen lane — using ${fallback} for '${god}'`);
    return fallback;
  }
  if (model.startsWith('opencode-go/') && !isLaneAvailable(model, health)) {
    const entry = health[model];
    const fallback = firstAvailableGoLane(health);
    if (fallback !== model) {
      console.warn(`[agent-model] lane '${model}' is unavailable (${entry?.status ?? 'unknown'}${entry?.error ? ` — ${entry.error.slice(0, 160)}` : ''}) — using ${fallback} for '${god}'`);
      return fallback;
    }
  }
  return model;
}

/** The first GO lane the provider has not rejected, in roster order. */
export function firstAvailableGoLane(entries = readLaneHealth().lanes): string {
  for (const lane of GO_SAFE_FALLBACKS) {
    if (isLaneAvailable(lane, entries)) return lane;
  }
  return VERIFIED_GO_FALLBACK;
}

let activeLaneCache: { at: number; lanes: Set<string> } | null = null;

/**
 * v0.1.0 — A LANE NOBODY ASSIGNED IS NOT A DEAD LANE.
 *
 * The GO account refuses qwen/minimax models with "requires an API key". Once
 * no agent (and no fallback) uses those lanes, they must not appear as three
 * red "dead" errors in Model lanes: that reads as a broken install when the
 * configured roster is healthy. This set is the current config's assignments
 * plus the GO-safe fallbacks, cached briefly.
 */
export function activeLaneIds(): Set<string> {
  if (activeLaneCache && Date.now() - activeLaneCache.at < 10_000) return activeLaneCache.lanes;
  const lanes = new Set<string>(GO_SAFE_FALLBACKS as readonly string[]);
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(findOlympusRoot(), 'opencode.json'), 'utf-8'));
    for (const key of ['model', 'small_model']) {
      if (typeof cfg?.[key] === 'string' && cfg[key].includes('/')) lanes.add(cfg[key]);
    }
    for (const agent of Object.values(cfg?.agent || {}) as any[]) {
      if (typeof agent?.model === 'string' && agent.model.includes('/')) lanes.add(agent.model);
    }
  } catch { /* no config — keep the fallbacks */ }
  activeLaneCache = { at: Date.now(), lanes };
  return lanes;
}

/** The blocked lanes the current config actually uses, with the honest cause. */
export function blockedLanesInUse(entries = readLaneHealth().lanes, now = Date.now()) {
  const active = activeLaneIds();
  return Object.entries(entries)
    .filter(([lane, e]) => e && active.has(lane) && !isLaneAvailable(lane, entries, now))
    .map(([lane, e]) => ({ lane, ...e }));
}
