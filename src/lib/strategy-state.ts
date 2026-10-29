/**
 * strategy-state.ts — ONE source of truth for the applied LLM strategy.
 *
 * v0.0.22 (W2). Before this module the applied strategy lived in TWO files
 * that could disagree:
 *   - ~/.olympus/active-strategy.json  (written by scripts/apply-strategy.js)
 *   - ~/.olympus/llm-providers.json    (read by the UI + the strategy route)
 *
 * That split produced the #251/#256/#259 class: the UI showed `free-hybrid`
 * while opencode.json ran `go-budget`, and a `reconcileStrategy()` band-aid
 * in the run-state route patched the drift on every poll.
 *
 * The law now: `~/.olympus/strategy.json` is THE record.
 *   - readers use readStrategyState()
 *   - writers use writeStrategyState()
 *   - legacy files are migrated once, then kept in sync (never authoritative)
 *
 * Server-only (reads the filesystem). Never import from a client component.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export const OLYMPUS_HOME = path.join(os.homedir(), '.olympus');
export const STRATEGY_STATE_FILE = path.join(OLYMPUS_HOME, 'strategy.json');
export const LEGACY_ACTIVE_FILE = path.join(OLYMPUS_HOME, 'active-strategy.json');
export const LEGACY_PROVIDERS_FILE = path.join(OLYMPUS_HOME, 'llm-providers.json');

export interface StrategyState {
  /** The applied strategy id (go-*, zen-*, byok-*, local, custom-*). */
  strategy: string;
  /** ISO timestamp of the apply. */
  appliedAt: string | null;
  /** How many agents the applied config carries (10 gods + demigods). */
  agentCount: number | null;
  /** 'file_refs' | 'inlined_truncated' | null — the prompt shape applied. */
  godPrompts: string | null;
  /** Were demigods merged into opencode.json? */
  demigodsLoaded: boolean | null;
  /** Plugin paths applied. */
  plugins: string[] | null;
  /** Number of changed fields the apply reported. */
  changes: number | null;
  /** Backup taken before the apply. */
  backupPath: string | null;
  /** True when the last apply was a no-op (N37). */
  noOp: boolean;
  /** The schema version of this record. */
  version: number;
}

const DEFAULT_STATE: StrategyState = {
  strategy: 'go-balanced',
  appliedAt: null,
  agentCount: null,
  godPrompts: null,
  demigodsLoaded: null,
  plugins: null,
  changes: null,
  backupPath: null,
  noOp: false,
  version: 1,
};

function readJson<T>(file: string): T | null {
  try { return JSON.parse(fs.readFileSync(file, 'utf-8')) as T; } catch { return null; }
}

function writeJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf-8');
}

/**
 * Read the applied strategy state.
 *
 * Order:
 *   1. strategy.json (authoritative);
 *   2. migrate from active-strategy.json (legacy, apply-strategy.js writer);
 *   3. migrate from llm-providers.json (legacy, UI writer);
 *   4. the default (go-balanced, never applied).
 */
export function readStrategyState(): StrategyState {
  const current = readJson<Partial<StrategyState>>(STRATEGY_STATE_FILE);
  if (current && typeof current.strategy === 'string' && current.strategy) {
    return { ...DEFAULT_STATE, ...current } as StrategyState;
  }

  const active = readJson<Partial<StrategyState> & Record<string, unknown>>(LEGACY_ACTIVE_FILE);
  if (active && typeof active.strategy === 'string' && active.strategy) {
    // The legacy file is snake_case (apply-strategy.js wrote it before
    // v0.0.22). Map it explicitly — never trust the shape.
    const migrated: StrategyState = {
      ...DEFAULT_STATE,
      strategy: active.strategy,
      appliedAt: typeof active.appliedAt === 'string'
        ? active.appliedAt
        : (typeof active.applied_at === 'string' ? active.applied_at : null),
      agentCount: typeof active.agentCount === 'number'
        ? active.agentCount
        : (typeof active.agent_count === 'number' ? active.agent_count : null),
      godPrompts: typeof active.godPrompts === 'string'
        ? active.godPrompts
        : (typeof active.god_prompts === 'string' ? active.god_prompts : null),
      demigodsLoaded: typeof active.demigodsLoaded === 'boolean'
        ? active.demigodsLoaded
        : (typeof active.demigods_loaded === 'boolean' ? active.demigods_loaded : null),
      changes: typeof active.changes === 'number' ? active.changes : null,
      backupPath: typeof active.backupPath === 'string'
        ? active.backupPath
        : (typeof active.backup_path === 'string' ? active.backup_path : null),
      noOp: active.noOp === true,
      version: 1,
    };
    writeJson(STRATEGY_STATE_FILE, migrated);
    mirrorLegacy(migrated);
    return migrated;
  }

  const providers = readJson<{ strategy?: string }>(LEGACY_PROVIDERS_FILE);
  if (providers && typeof providers.strategy === 'string' && providers.strategy) {
    const migrated: StrategyState = { ...DEFAULT_STATE, strategy: providers.strategy };
    writeJson(STRATEGY_STATE_FILE, migrated);
    return migrated;
  }

  return { ...DEFAULT_STATE };
}

/** Persist the applied strategy — the ONE writer. */
export function writeStrategyState(patch: Partial<StrategyState>): StrategyState {
  const next: StrategyState = {
    ...readStrategyState(),
    ...patch,
    appliedAt: patch.appliedAt ?? new Date().toISOString(),
    version: 1,
  };
  writeJson(STRATEGY_STATE_FILE, next);
  mirrorLegacy(next);
  return next;
}

/**
 * Keep the legacy files pointing at the SAME strategy. They stay for
 * backward compatibility (older builds, exported settings) but are never
 * read as authoritative when strategy.json exists.
 */
function mirrorLegacy(state: StrategyState): void {
  try {
    const providers = readJson<Record<string, unknown>>(LEGACY_PROVIDERS_FILE) ?? {};
    if (providers.strategy !== state.strategy) {
      writeJson(LEGACY_PROVIDERS_FILE, { ...providers, strategy: state.strategy });
    }
  } catch { /* non-fatal */ }
  try {
    const active = readJson<Record<string, unknown>>(LEGACY_ACTIVE_FILE) ?? {};
    if (active.strategy !== state.strategy) {
      writeJson(LEGACY_ACTIVE_FILE, {
        ...active,
        strategy: state.strategy,
        applied_at: state.appliedAt,
      });
    }
  } catch { /* non-fatal */ }
}

/**
 * True when the state file and the applied opencode.json agree on the
 * strategy. Used by the self-check surface (drift is reported, never hidden).
 * opencode.json does not carry the strategy id, so this checks the shape:
 * a full-arsenal apply must carry the god agents.
 */
export function strategyDrift(root: string): { ok: boolean; detail: string } {
  const state = readStrategyState();
  const cfg = readJson<{ agent?: Record<string, unknown> }>(path.join(root, 'opencode.json'));
  if (!cfg?.agent) {
    return { ok: false, detail: `opencode.json missing or unreadable at ${root}` };
  }
  const godCount = Object.keys(cfg.agent).length;
  const expectedMin = 10; // the 10 gods are always present
  if (godCount < expectedMin) {
    return { ok: false, detail: `opencode.json carries ${godCount} agents (expected ≥${expectedMin})` };
  }
  if (state.noOp) {
    return { ok: true, detail: `strategy ${state.strategy} — last apply was a no-op (N37 marker)` };
  }
  return { ok: true, detail: `strategy ${state.strategy} — ${godCount} agents applied${state.appliedAt ? ` at ${state.appliedAt}` : ''}` };
}
