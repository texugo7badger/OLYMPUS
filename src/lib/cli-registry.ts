/**
 * CLI descriptor for OLYMPUS v0.0.1.
 *
 * v0.0.1 ships with OpenCode as the only CLI. The multi-CLI registry
 * (claude, gemini, qwen, aider) was removed in v0.0.1 — OLYMPUS is
 * OpenCode-only.
 *
 * This file is intentionally tiny. It exists only to provide the OpenCode
 * CLI metadata (binary name, default port, env key, install hints) used by:
 *   - src/lib/custom-frames-engine.ts (the OpenCode TUI frame preset)
 *   - src/lib/vscodium-launcher.ts + ttyd-launcher.ts (env var injection)
 *   - src/app/api/olympus/ttyd/launch/route.ts (default port)
 *
 * The LLM strategy layer (LLM_STRATEGIES, GOD_IDS, BUILTIN_PROVIDERS, etc.)
 * now lives in `./model-strategies.ts`. This file re-exports those symbols
 * so existing imports keep working during the v0.0.1 migration, but new
 * code should import directly from `./model-strategies`.
 *
 * If you need to add a new CLI in the future, restore the multi-CLI registry
 * pattern — but for v0.0.1, OpenCode is the only one.
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

export type CLIStatus = 'stable' | 'beta' | 'planned';

export interface CLIEntry {
  id: string;
  displayName: string;
  binary: string;
  port: number;
  args?: string[];
  envKey?: string;
  providerHint?: string;
  installHint: { platform: string; command: string; note?: string }[];
  icon: string;
  status: CLIStatus;
  /** When true, the CLI is shown in the Frames tab as a preset. */
  showInFrames: boolean;
}

/**
 * The OpenCode CLI descriptor. v0.0.1: the only CLI OLYMPUS supports.
 */
export const OPENCODE_CLI: CLIEntry = {
  id: 'opencode',
  displayName: 'OpenCode',
  binary: 'opencode',
  port: 7681,
  args: [],
  envKey: 'OPENCODE_GO_API_KEY',
  providerHint: 'opencode-go',
  installHint: [
    { platform: 'macOS', command: 'brew install opencode-ai/tap/opencode', note: 'OpenCode CLI (default OLYMPUS CLI)' },
    { platform: 'Linux', command: 'curl -fsSL https://opencode.ai/install | bash', note: 'OpenCode CLI (default OLYMPUS CLI)' },
    { platform: 'Windows', command: 'scoop install opencode', note: 'OpenCode CLI (default OLYMPUS CLI)' },
  ],
  icon: 'Terminal',
  status: 'stable',
  showInFrames: true,
};

/**
 * v0.0.1: the registry is a single entry. Kept as an array for backwards
 * compatibility with any code that iterates BUILTIN_CLI_REGISTRY.
 */
export const BUILTIN_CLI_REGISTRY: CLIEntry[] = [OPENCODE_CLI];

/**
 * The default active CLI. v0.0.1: always 'opencode'.
 */
export const DEFAULT_CLI_ID = 'opencode' as const;

/**
 * Lookup a CLI entry by id. v0.0.1: only 'opencode' resolves.
 * Pure, client-safe.
 */
export function getCliById(id: string): CLIEntry | undefined {
  return BUILTIN_CLI_REGISTRY.find(c => c.id === id);
}

/**
 * Get the active CLI entry. v0.0.1: always returns the OpenCode entry
 * (the env var + override are honored for forward-compat but have no effect
 * in v0.0.1 since the registry has only one entry).
 * Pure, client-safe.
 */
export function getActiveCli(_override?: string | null): CLIEntry {
  return OPENCODE_CLI;
}

/**
 * List all CLI entries that should appear in the Frames tab.
 * v0.0.1: only OpenCode.
 * Pure, client-safe.
 */
export function getFramesVisibleClis(): CLIEntry[] {
  return BUILTIN_CLI_REGISTRY.filter(c => c.showInFrames);
}

/**
 * The default port for a given CLI id. v0.0.1: always 7681 (OpenCode).
 */
export function defaultPortForCli(_cliId: string): number {
  return OPENCODE_CLI.port;
}

// ─── Re-exports from model-strategies.ts ────────────────────────────────
// The LLM strategy layer has been moved to ./model-strategies.ts.
// These re-exports preserve backwards compatibility with existing imports.
// New code should import directly from ./model-strategies.

export type {
  LLMStrategyTier,
  LLMStrategy,
  GodId,
  LLMStrategyConfig,
  LLMProvider,
} from './model-strategies';

export {
  GOD_IDS,
  LLM_STRATEGIES,
  DEFAULT_LLM_STRATEGY,
  isCustomStrategy,
  isBuiltinStrategy,
  VAULT_LLM_MODEL,
  BUILTIN_PROVIDERS,
  DEFAULT_PROVIDER_ID,
  DEFAULT_FREE_PROVIDER_ID,
  getProviderById,
} from './model-strategies';
