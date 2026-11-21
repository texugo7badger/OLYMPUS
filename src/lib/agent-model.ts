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
 * Resolve the model for a turn. A burn override wins; an unverified qwen
 * lane falls back to DeepSeek; otherwise the applied config is used.
 */
export function guardedModelForGod(god: string, requested?: string | null): string | null {
  const model = (requested && String(requested).trim()) || configuredModelForGod(god);
  if (!model) return null;
  return isUnverifiedQwenLane(model) ? VERIFIED_GO_FALLBACK : model;
}
