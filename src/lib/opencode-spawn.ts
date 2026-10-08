/**
 * opencode-spawn — shared helper for spawning the local `opencode` CLI.
 *
 * Resolves the local binary (node_modules/.bin/opencode), builds the env
 * with node_modules/.bin on PATH, and spawns the process. Always uses the
 * project-local install — never a global one.
 *
 * UPDATE (config-aware spawning):
 *   Two new functions are added for strategy-aware spawning:
 *
 *   - `verifyConfigShape()` — reads ~/.olympus/active-strategy.json and
 *     checks that opencode.json matches the recorded shape. Returns a
 *     diagnostic object. Used by /api/olympus/health and the strategy
 *     picker to detect drift.
 *
 *   - `prepareConfigForSpawn(opts)` — called before spawnOpencode() to
 *     ensure the config is in the right state. If `injectDemigod` is
 *     requested, calls the dynamic-dispatch-loader to inject the demigod
 *     into opencode.json before spawning. The caller is responsible for
 *     calling `cleanupAfterSpawn()` to eject the demigod when done.
 *
 *   - `cleanupAfterSpawn(token)` — ejects any demigods that were injected
 *     by prepareConfigForSpawn(). Safe to call multiple times.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { spawn, type ChildProcess, type SpawnOptions } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync, symlinkSync, copyFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { platform, homedir } from 'node:os';
import { decryptValue } from './env-crypto';
import { getVaultRoot } from './vault-root';

const isWindows = platform() === 'win32';

/**
 * Walk up from a starting directory looking for the Olympus project root,
 * identified by the presence of BOTH `package.json` (name === 'olympus')
 * AND `opencode.json`. Falls back to `process.cwd()` if not found.
 *
 * The lookup is cached so repeated calls are cheap (the API routes hit
 * this on every request).
 */
let _cachedRoot: string | null = null;

export function findOlympusRoot(): string {
  if (_cachedRoot) return _cachedRoot;

  // 1. OLYMPUS_ROOT env var (set by the Electron main process when it
  //    spawns Next.js — see electron/main.ts + native-terminal.ts).
  if (process.env.OLYMPUS_ROOT && existsSync(join(process.env.OLYMPUS_ROOT, 'opencode.json'))) {
    _cachedRoot = process.env.OLYMPUS_ROOT;
    return _cachedRoot;
  }

  // 2. Walk up from process.cwd().
  let dir = process.cwd();
  for (let i = 0; i < 12; i++) {
    if (existsSync(join(dir, 'opencode.json')) && existsSync(join(dir, 'package.json'))) {
      try {
        // Confirm it's the Olympus package (not some other project that
        // happens to have an opencode.json). Use readFileSync instead of
        // require() — Turbopack doesn't support dynamic require() with
        // variable paths.
        const pkgRaw = readFileSync(join(dir, 'package.json'), 'utf-8');
        const pkg = JSON.parse(pkgRaw);
        if (pkg?.name === 'olympus') {
          _cachedRoot = dir;
          return _cachedRoot;
        }
      } catch {}
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  // 3. Fallback — assume cwd is the root. This matches the old behavior
  //    and is correct when Next.js is launched from the project root
  //    (which is always — see package.json's "dev" / "electron:dev" scripts).
  _cachedRoot = process.cwd();
  return _cachedRoot;
}

/**
 * Resolve the local `opencode` binary path.
 *
 * Returns the absolute path to the binary, or `null` if not found.
 * The lookup checks:
 *   1. `<root>/node_modules/.bin/opencode` (or `.cmd` / `.ps1` on Windows)
 *   2. `<root>/node_modules/opencode-ai/bin/opencode.js` (the package's
 *      own bin shim — used as a last resort if the .bin symlink is missing)
 */
export function findOpencodeBinary(root: string = findOlympusRoot()): string | null {
  const binDir = join(root, 'node_modules', '.bin');

  // On Windows, the opencode binary is `opencode.exe` (an ELF binary
  // with a .exe extension). The .bin directory has `opencode` (shell
  // shim), `opencode.cmd`, and `opencode.ps1`. We prefer the `.cmd`
  // shim — it's the most reliable for spawn with shell:true.
  const candidates = isWindows
    ? [
        join(binDir, 'opencode.cmd'),
        join(binDir, 'opencode.ps1'),
        join(binDir, 'opencode'),
        join(binDir, 'opencode.exe'),
      ]
    : [
        join(binDir, 'opencode'),
      ];

  for (const c of candidates) {
    if (existsSync(c)) return c;
  }

  // The opencode-ai package ships `bin/opencode.exe` (yes, even on Linux —
  // it's an ELF binary with a misleading extension). npm symlinks it into
  // node_modules/.bin/opencode. If for some reason the symlink is missing
  // (rare — broken npm install, manual cleanup), fall back to the package
  // directly. This won't work on Windows (different binary), but on Unix
  // it's a safe fallback.
  if (!isWindows) {
    const pkgBin = join(root, 'node_modules', 'opencode-ai', 'bin', 'opencode.exe');
    if (existsSync(pkgBin)) return pkgBin;
  }

  return null;
}

/**
 * Build the env for spawned `opencode` processes.
 *
 * Prepends `<root>/node_modules/.bin` to PATH so the opencode CLI (and any
 * subprocesses it spawns — bun, node, scripts, etc.) can find project-
 * local binaries. Also loads ~/.olympus/.env and <root>/.env so API keys
 * are available without polluting the global environment.
 *
 * The env is built FRESH on every call (no caching) so changes to .env
 * files are picked up without a server restart.
 */

/**
 * Issue #56 (BATCH 12d): free-strategy spawn preflight. Checks the same
 * key sources as scripts/apply-strategy.js (OpenCode auth.json FIRST,
 * then app env) — the old warning checked env only, a false negative for
 * every user whose keys live in OpenCode's own provider settings.
 * Returns a single structured message: either an INFO line (key located)
 * or a multi-line PREFLIGHT ERROR naming the missing key, the exact
 * remedy, and the alternative free strategies whose keys ARE present.
 * Purely diagnostic — never blocks the spawn, never switches strategies.
 */
export function freeTierPreflight(strategy: string): string {
  // Key presence, auth.json first (Priority 1) — env is checked by the
  // caller's chain (we only reach here when NO env free key is set).
  const present = new Set<string>();
  for (const dir of [join(homedir(), '.local', 'share', 'opencode'), join(homedir(), '.config', 'opencode')]) {
    const authFile = join(dir, 'auth.json');
    if (!existsSync(authFile)) continue;
    try {
      const auth = JSON.parse(readFileSync(authFile, 'utf-8'));
      const has = (v: unknown) => typeof v === 'string' ? v.length > 0 : (!!v && typeof (v as { key?: unknown }).key === 'string');
      if (has(auth.openrouter)) present.add('openrouter');
      if (has(auth.groq)) present.add('groq');
      if (has(auth.nvidia)) present.add('nvidia');
    } catch { /* unreadable auth — fall through to the guidance */ }
  }

  // Required key per strategy (same semantics as validateFreeFallbackKeys:
  // free-nvidia-build needs NVIDIA; every other free strategy needs
  // OpenRouter ids, which work with openrouter OR nvidia keys present).
  const needsNvidiaOnly = strategy === 'free-nvidia-build';
  const satisfied = needsNvidiaOnly
    ? present.has('nvidia')
    : present.has('openrouter') || present.has('nvidia');

  if (satisfied) {
    const source = needsNvidiaOnly ? 'nvidia' : (present.has('openrouter') ? 'openrouter' : 'nvidia');
    return `[opencode-spawn] INFO: strategy '${strategy}' — required key found in OpenCode auth.json (${source}). No env key needed; proceeding.`;
  }

  const missing = needsNvidiaOnly ? 'NVIDIA_API_KEY' : 'OPENROUTER_API_KEY';
  const remedy = needsNvidiaOnly
    ? 'add NVIDIA as a provider inside OpenCode (Settings → Providers) or export NVIDIA_API_KEY — free key at https://build.nvidia.com'
    : 'add OpenRouter as a provider inside OpenCode (Settings → Providers) or export OPENROUTER_API_KEY — free key at https://openrouter.ai/keys';
  const alternatives: string[] = [];
  if (needsNvidiaOnly) {
    if (present.has('openrouter')) alternatives.push('free-openrouter / free-big-pickle (OpenRouter key present)');
  } else if (present.has('nvidia')) {
    alternatives.push('free-nvidia-build (NVIDIA key present)');
  }
  const altLine = alternatives.length
    ? `  Alternatives whose key IS present: ${alternatives.join('; ')} — switch explicitly via: node scripts/apply-strategy.js --strategy <id>\n`
    : '  No alternative free strategy has a key present either.\n';
  return [
    `[opencode-spawn] FREE-STRATEGY PREFLIGHT ERROR (strategy: ${strategy})`,
    `  Missing: ${missing} — ${strategy} cannot make model requests without it; runs will fail with APIError.`,
    `  Remedy: ${remedy}.`,
    altLine.trimEnd(),
    '  No strategy was auto-switched (no silent downgrade). The spawn proceeds and will fail until the key is added.',
  ].join('\n');
}

export function buildOpencodeEnv(
  root: string = findOlympusRoot(),
  extraEnv: Record<string, string> = {},
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };

  // Load .env files (same logic as electron/native-terminal.ts buildEnv).
  // Duplicated here because the Next.js server doesn't go through the
  // Electron main process — it has its own env. API routes that spawn
  // opencode need the same API keys.
  const envFiles = [
    join(homedir(), '.olympus', '.env'),
    join(root, '.env'),
  ];

  for (const f of envFiles) {
    try {
      if (!existsSync(f)) continue;
      const content = readFileSync(f, 'utf-8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx < 0) continue;
        const key = trimmed.slice(0, eqIdx).trim();
        const value = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
        if (key) {
          // Decrypt encrypted values (stored as enc:base64...)
          // If decryption fails, fall back to the raw value (plaintext
          // or encrypted — either way it's better than silently dropping it).
          const decrypted = decryptValue(value);
          env[key] = decrypted !== null ? decrypted : value;
          if (decrypted === null && value.startsWith('enc:')) {
            console.log('[opencode-spawn] WARNING: failed to decrypt ' + key + ', using raw value (may be invalid)');
          }
        }
      }
    } catch {}
  }

  // Prepend node_modules/.bin to PATH (project-local binaries take
  // precedence over any global opencode install).
  const pathSep = isWindows ? ';' : ':';
  const localBinDir = join(root, 'node_modules', '.bin');
  const existingPath = env.PATH || '';
  env.PATH = [localBinDir, existingPath].filter(Boolean).join(pathSep);

  // Map OLYMPUS_* prefix to provider-specific env vars that OpenCode expects.
  // OpenCode's free-tier providers look for their own env vars:
  //   groq/xxx models  → GROQ_API_KEY
  //   openrouter/xxx models → OPENROUTER_API_KEY
  //   nvidia/xxx models → NVIDIA_API_KEY
  if (env.OLYMPUS_GROQ_KEY && !env.GROQ_API_KEY) {
    env.GROQ_API_KEY = env.OLYMPUS_GROQ_KEY;
    console.log('[opencode-spawn] Mapped OLYMPUS_GROQ_KEY → GROQ_API_KEY (' + env.GROQ_API_KEY.substring(0, 8) + '...)');
  }
  if (env.OLYMPUS_OPENROUTER_KEY && !env.OPENROUTER_API_KEY) {
    env.OPENROUTER_API_KEY = env.OLYMPUS_OPENROUTER_KEY;
    console.log('[opencode-spawn] Mapped OLYMPUS_OPENROUTER_KEY → OPENROUTER_API_KEY (' + env.OPENROUTER_API_KEY.substring(0, 8) + '...)');
  }
  if (env.OLYMPUS_NVIDIA_KEY && !env.NVIDIA_API_KEY) {
    env.NVIDIA_API_KEY = env.OLYMPUS_NVIDIA_KEY;
    console.log('[opencode-spawn] Mapped OLYMPUS_NVIDIA_KEY → NVIDIA_API_KEY (' + env.NVIDIA_API_KEY.substring(0, 8) + '...)');
  }

  // Final check: log status of API keys for debugging. Only warn about
  // missing free-tier keys when the active strategy actually uses them
  // (GO / Zen users don't need Groq/OpenRouter keys — auth lives in
  // OpenCode's own auth.json).
  const activeStrategy = (() => {
    try {
      const cfg = JSON.parse(readFileSync(join(homedir(), '.olympus', 'llm-providers.json'), 'utf-8'));
      return typeof cfg.strategy === 'string' ? cfg.strategy : '';
    } catch { return ''; }
  })();
  const isFreeStrategy = activeStrategy.startsWith('free-');
  if (env.GROQ_API_KEY) {
    console.log('[opencode-spawn] GROQ_API_KEY is set (' + env.GROQ_API_KEY.substring(0, 8) + '...)');
  } else if (env.OPENROUTER_API_KEY) {
    console.log('[opencode-spawn] OPENROUTER_API_KEY is set (' + env.OPENROUTER_API_KEY.substring(0, 8) + '...)');
  } else if (env.NVIDIA_API_KEY) {
    console.log('[opencode-spawn] NVIDIA_API_KEY is set (' + env.NVIDIA_API_KEY.substring(0, 8) + '...)');
  } else if (isFreeStrategy) {
    // Issue #56 (BATCH 12d): the old single-line warning checked ONLY the
    // app env — a false negative whenever the key lives in OpenCode's own
    // auth.json (the 12b finding: 7x "No free-tier API keys found" while
    // auth.json HAD all three). Emit ONE structured preflight that checks
    // the same priority chain as apply-strategy (auth.json first, then
    // env), names the exact remedy, and names the alternatives whose keys
    // ARE present. NEVER auto-switches — explicit guidance only; the spawn
    // proceeds (no silent downgrade, no behavior gate).
    const preflight = freeTierPreflight(activeStrategy);
    if (preflight.startsWith('[opencode-spawn] FREE-STRATEGY PREFLIGHT ERROR')) {
      console.error(preflight);
    } else {
      console.log(preflight);
    }
  }

  // Useful context for the spawned opencode process.
  env.OLYMPUS_ROOT = root;
  // Issue #30 (D1): the plugin must follow the same vault the app serves.
  // A bare OLYMPUS_VAULT inherited from the app's own environment is not
  // canonical — it would shadow the active root resolved by Settings →
  // Switch Vault or OLYMPUS_VAULT_DIR, splitting the plugin's tree from the
  // one the UI reads. Inject unconditionally; the extraEnv merge below stays
  // highest priority so a caller can still override.
  env.OLYMPUS_VAULT = getVaultRoot();

  // Merge caller-supplied env (highest priority).
  Object.assign(env, extraEnv);

  // Session 3g (issue #25): mark this process as OLYMPUS-managed.
  //
  // The olympus-hooks plugin is registered at PROJECT level (.opencode/), so
  // opencode loads it in EVERY process started inside this repo — including
  // Zed's external agent and manual CLI runs. Metrics capture is
  // machine-global (~/.olympus/metrics/cost.jsonl), so those foreign runs
  // were appending spend attributed to whatever god happened to be recorded
  // in the global active-agent tracker.
  //
  // This is the single injection point for the flag (every OLYMPUS-spawned
  // opencode goes through buildOpencodeEnv), and it is set AFTER the
  // extraEnv merge so a caller cannot accidentally strip it. The plugin
  // registers no hooks unless it sees exactly '1', so anything OLYMPUS does
  // not spawn stays silent.
  env.OLYMPUS_MANAGED = '1';

  // The opencode CLI respects NO_COLOR / FORCE_COLOR. Default to no color
  // for clean log parsing (the SSE stream parses opencode output as
  // JSONL — ANSI escapes would break it).
  if (!('FORCE_COLOR' in env)) env.FORCE_COLOR = '0';
  if (!('NO_COLOR' in env)) env.NO_COLOR = '1';

  return env;
}

/**
 * Get the spawn options for an `opencode` invocation.
 *
 * Returns `{ executable, cwd, env }`. The `executable` is the absolute
 * path to the local opencode binary (preferred) or the bare `'opencode'`
 * string (fallback). The `cwd` is the Olympus root. The `env` includes
 * `node_modules/.bin` on PATH.
 */
export function getOpencodeSpawnOptions(
  extraEnv: Record<string, string> = {},
): { executable: string; cwd: string; env: NodeJS.ProcessEnv } {
  const root = findOlympusRoot();
  const env = buildOpencodeEnv(root, extraEnv);
  const localBin = findOpencodeBinary(root);
  return {
    executable: localBin ?? 'opencode',  // fall back to PATH lookup
    cwd: root,
    env,
  };
}

// --- #99: the workspace lane -------------------------------------------------

export interface WorkspaceLane {
  /** The absolute lane directory — where interactive-session projects land. */
  dir: string;
  /** true ONLY on the call that created the lane (the ask/notice fires once). */
  fresh: boolean;
}

/**
 * #103 (MADRUGA-PREVIEW-1 Batch B): the PURE lane resolver — no mkdir, no
 * symlink, no copies. The GET probe path (the Live Preview status route and
 * any read-only consumer) must never create anything on disk; only
 * resolveWorkspaceLane() bootstraps.
 *
 * Resolution order:
 *   1. OLYMPUS_WORKSPACE env — the explicit operator override, used verbatim;
 *   2. default: ~/.local/share/olympus/workspace.
 *
 * The never-the-repo guard: a workspace that resolves TO the OLYMPUS root or
 * INSIDE it (operator misconfiguration) falls back to the default — projects
 * never silently land in the working tree.
 */
export function workspaceLaneDir(): string {
  const root = findOlympusRoot();
  const defaultDir = join(homedir(), '.local', 'share', 'olympus', 'workspace');
  let dir = process.env.OLYMPUS_WORKSPACE
    ? resolve(process.env.OLYMPUS_WORKSPACE)
    : defaultDir;
  if (dir === root || dir.startsWith(root + '/')) {
    console.warn(`[opencode-spawn] OLYMPUS_WORKSPACE (${dir}) points inside the OLYMPUS root — falling back to ${defaultDir} (projects never land in the working tree)`);
    dir = defaultDir;
  }
  return dir;
}

/**
 * #99 (UAT-BUILD-1 Batch C): resolve + bootstrap the WORKSPACE LANE — the
 * directory interactive-session projects land in. NEVER the repo/install
 * root: the 2026-10-07 UAT created exemplo-landingpage/ INSIDE the OLYMPUS
 * working tree because the session serve inherited findOlympusRoot() as its
 * cwd (DB-evidenced: the warm session's messages carry path.cwd = the repo).
 *
 * The lane is bootstrapped with the UAT-kit's proven shape
 * (reports/uat-r1/SPAWN-INVOCATION.sh): .opencode symlinked to the root's
 * overlay, opencode.json + opencode.demigods.json copied from the root.
 * Copies are created-if-missing (never clobbered — refresh semantics belong
 * to the #78 drift-detector class); Windows junction semantics ride the
 * packaged-lane pass. The pure resolution is workspaceLaneDir() (one root
 * of truth — #103).
 */
export function resolveWorkspaceLane(): WorkspaceLane {
  const root = findOlympusRoot();
  const dir = workspaceLaneDir();
  let fresh = false;
  if (!existsSync(dir)) {
    fresh = true;
    mkdirSync(dir, { recursive: true });
  }
  try {
    const dotOpencode = join(dir, '.opencode');
    if (!existsSync(dotOpencode)) symlinkSync(join(root, '.opencode'), dotOpencode);
  } catch {}
  for (const f of ['opencode.json', 'opencode.demigods.json']) {
    try {
      const src = join(root, f);
      const dst = join(dir, f);
      if (existsSync(src) && !existsSync(dst)) copyFileSync(src, dst);
    } catch {}
  }
  return { dir, fresh };
}

// --- Strategy-aware config verification -----------------------------------

const OLYMPUS_HOME = join(homedir(), '.olympus');
const STATE_FILE = join(OLYMPUS_HOME, 'active-strategy.json');
const INJECTED_TRACKER = join(OLYMPUS_HOME, 'injected-demigods.json');

/**
 * The shape of the active-strategy state file written by apply-strategy.js.
 */
export interface ActiveStrategyState {
  strategy: string;
  applied_at: string;
  agent_count: number;
  god_prompts: 'file_refs' | 'inlined' | 'unknown';
  demigods_loaded: boolean;
  plugins_enabled: number;
  changes: number;
  backup_path?: string;
}

/**
 * Read the active-strategy state file.
 *
 * Returns null if the file doesn't exist (strategy was never applied via
 * apply-strategy.js — the user may be running with a hand-edited config).
 */
export function readActiveStrategyState(): ActiveStrategyState | null {
  try {
    if (!existsSync(STATE_FILE)) return null;
    const raw = JSON.parse(readFileSync(STATE_FILE, 'utf-8'));
    if (!raw || typeof raw !== 'object') return null;
    return raw as ActiveStrategyState;
  } catch {
    return null;
  }
}

/**
 * Verify that opencode.json matches the active-strategy state.
 *
 * Reads opencode.json and compares its shape (agent count, plugin count,
 * god prompt type) against the state file. Returns a diagnostic object
 * with `ok: true` if they match, `ok: false` plus a list of `drifts`
 * if they don't.
 *
 * Used by:
 *   - /api/olympus/health (to surface config drift in the UI)
 *   - prepareConfigForSpawn (to warn before spawning with a drifted config)
 */
export function verifyConfigShape(): {
  ok: boolean;
  state: ActiveStrategyState | null;
  actual: {
    agent_count: number;
    god_prompts: string;
    plugins_enabled: number;
    model: string;
    small_model: string;
  } | null;
  drifts: string[];
} {
  const drifts: string[] = [];
  const state = readActiveStrategyState();

  const root = findOlympusRoot();
  const opencodeJsonPath = join(root, 'opencode.json');
  let actual: {
    agent_count: number;
    god_prompts: string;
    plugins_enabled: number;
    model: string;
    small_model: string;
  } | null = null;

  try {
    if (!existsSync(opencodeJsonPath)) {
      drifts.push('opencode.json not found');
      return { ok: false, state, actual: null, drifts };
    }
    const cfg = JSON.parse(readFileSync(opencodeJsonPath, 'utf-8'));
    const agents = Object.keys(cfg.agent || {});
    const apolloPrompt = cfg.agent?.apollo?.prompt || '';
    actual = {
      agent_count: agents.length,
      god_prompts: apolloPrompt.startsWith('{file:') ? 'file_refs' : 'inlined',
      plugins_enabled: (cfg.plugin || []).length,
      model: cfg.model || '',
      small_model: cfg.small_model || '',
    };

    if (!state) {
      // No state file — can't verify, but don't flag as drift
      return { ok: true, state: null, actual, drifts };
    }

    if (actual.agent_count !== state.agent_count) {
      drifts.push(
        `agent_count: state=${state.agent_count} actual=${actual.agent_count}`
      );
    }
    if (actual.god_prompts !== state.god_prompts) {
      drifts.push(
        `god_prompts: state=${state.god_prompts} actual=${actual.god_prompts}`
      );
    }
    if (actual.plugins_enabled !== state.plugins_enabled) {
      drifts.push(
        `plugins_enabled: state=${state.plugins_enabled} actual=${actual.plugins_enabled}`
      );
    }
  } catch (e: any) {
    drifts.push(`could not parse opencode.json: ${e.message}`);
  }

  return { ok: drifts.length === 0, state, actual, drifts };
}

// --- Dynamic demigod injection --------------------------------------------

/**
 * The set of demigods that were injected by the most recent
 * prepareConfigForSpawn() call. Used by cleanupAfterSpawn() to know
 * what to eject.
 */
let _injectedByThisProcess: Set<string> = new Set();

/**
 * Load the injected-demigods tracker file.
 */
function loadInjectedTracker(): { injected: string[]; lastInjectedAt?: string } {
  try {
    if (!existsSync(INJECTED_TRACKER)) return { injected: [] };
    const raw = JSON.parse(readFileSync(INJECTED_TRACKER, 'utf-8'));
    if (!Array.isArray(raw.injected)) raw.injected = [];
    return raw;
  } catch {
    return { injected: [] };
  }
}

/**
 * Save the injected-demigods tracker file.
 */
function saveInjectedTracker(tracker: { injected: string[]; lastInjectedAt?: string }) {
  try {
    if (!existsSync(OLYMPUS_HOME)) mkdirSync(OLYMPUS_HOME, { recursive: true });
    writeFileSync(INJECTED_TRACKER, JSON.stringify(tracker, null, 2), 'utf-8');
  } catch (e) {
    console.log('[opencode-spawn] WARNING: could not save injected tracker: ' + (e as Error).message);
  }
}

/**
 * Inject a demigod into opencode.json for the next spawn.
 *
 * This is the dynamic per-task config loading mechanism:
 *   1. Caller calls prepareConfigForSpawn({ injectDemigod: 'build-resolver' })
 *   2. This function reads opencode.demigods.json, finds build-resolver's
 *      config, and writes it into opencode.json's `agent` block.
 *   3. spawnOpencode() is called — opencode sees the demigod in its config
 *      and can spawn it via `--agent build-resolver`.
 *   4. After the spawn completes (or errors), the caller MUST call
 *      cleanupAfterSpawn() to remove the injected demigod.
 *
 * Safety:
 *   - Never injects a god ID (gods are always present).
 *   - No-op if the demigod is already in opencode.json (e.g. GO-plan
 *     strategy with all 118 demigods pre-loaded).
 *   - Tracks the injection in ~/.olympus/injected-demigods.json so
 *     cleanupAfterSpawn() can eject even if this process crashes.
 *
 * Returns true if a demigod was injected, false if it was already present.
 */
export function injectDemigodForSpawn(demigodName: string): boolean {
  const GOD_IDS = new Set([
    'apollo', 'atlas', 'artemis', 'athena', 'dionysus', 'hephaestus',
    'hermes', 'persephone', 'prometheus', 'callimachus',
  ]);
  if (GOD_IDS.has(demigodName)) {
    console.log('[opencode-spawn] WARNING: refusing to inject god "' + demigodName + '"');
    return false;
  }

  const root = findOlympusRoot();
  const opencodeJsonPath = join(root, 'opencode.json');
  const demigodsJsonPath = join(root, 'opencode.demigods.json');

  try {
    if (!existsSync(opencodeJsonPath)) {
      console.log('[opencode-spawn] WARNING: opencode.json not found, cannot inject');
      return false;
    }
    if (!existsSync(demigodsJsonPath)) {
      console.log('[opencode-spawn] WARNING: opencode.demigods.json not found, cannot inject');
      return false;
    }

    const cfg = JSON.parse(readFileSync(opencodeJsonPath, 'utf-8'));
    if (cfg.agent && cfg.agent[demigodName]) {
      // Already present — no-op
      return false;
    }

    const registry = JSON.parse(readFileSync(demigodsJsonPath, 'utf-8'));
    const d = registry.demigods?.[demigodName];
    if (!d) {
      console.log('[opencode-spawn] WARNING: demigod "' + demigodName + '" not in registry');
      return false;
    }

    // Inject
    if (!cfg.agent) cfg.agent = {};
    cfg.agent[demigodName] = {
      mode: d.mode || 'subagent',
      model: d.model,
      prompt: d.prompt,
    };

    writeFileSync(opencodeJsonPath, JSON.stringify(cfg, null, 2) + '\n', 'utf-8');
    _injectedByThisProcess.add(demigodName);

    // Record in tracker (for crash recovery)
    const tracker = loadInjectedTracker();
    if (!tracker.injected.includes(demigodName)) {
      tracker.injected.push(demigodName);
      tracker.lastInjectedAt = new Date().toISOString();
      saveInjectedTracker(tracker);
    }

    console.log('[opencode-spawn] Injected demigod "' + demigodName + '" (parent: ' + d.parent_god + ', model: ' + d.model + ')');
    return true;
  } catch (e: any) {
    console.log('[opencode-spawn] WARNING: could not inject demigod "' + demigodName + '": ' + e.message);
    return false;
  }
}

/**
 * Eject a demigod from opencode.json.
 *
 * SAFETY: Only removes demigods that were INJECTED by this loader (i.e.,
 * present in the `_injectedByThisProcess` Set OR recorded in the
 * injected-demigods tracker file). If the demigod was pre-loaded by a
 * GO-strategy apply-strategy.js run, eject is a no-op (returns false) —
 * use apply-strategy.js to switch to free-tier instead.
 *
 * Safe to call multiple times.
 * Never ejects a god.
 */
export function ejectDemigodAfterSpawn(demigodName: string): boolean {
  const GOD_IDS = new Set([
    'apollo', 'atlas', 'artemis', 'athena', 'dionysus', 'hephaestus',
    'hermes', 'persephone', 'prometheus', 'callimachus',
  ]);
  if (GOD_IDS.has(demigodName)) return false;

  // Safety: only eject if we injected it (or it's in the tracker from a
  // previous crash recovery). This prevents accidentally removing a demigod
  // that was pre-loaded by apply-strategy.js as part of a GO strategy.
  const tracker = loadInjectedTracker();
  const wasInjectedByUs = _injectedByThisProcess.has(demigodName) ||
                         tracker.injected.includes(demigodName);
  if (!wasInjectedByUs) {
    return false;
  }

  const root = findOlympusRoot();
  const opencodeJsonPath = join(root, 'opencode.json');

  try {
    if (!existsSync(opencodeJsonPath)) return false;
    const cfg = JSON.parse(readFileSync(opencodeJsonPath, 'utf-8'));
    if (!cfg.agent || !cfg.agent[demigodName]) return false;

    delete cfg.agent[demigodName];
    writeFileSync(opencodeJsonPath, JSON.stringify(cfg, null, 2) + '\n', 'utf-8');
    _injectedByThisProcess.delete(demigodName);

    // Remove from tracker (reuse the tracker we already loaded above)
    tracker.injected = tracker.injected.filter(n => n !== demigodName);
    saveInjectedTracker(tracker);

    console.log('[opencode-spawn] Ejected demigod "' + demigodName + '"');
    return true;
  } catch (e: any) {
    console.log('[opencode-spawn] WARNING: could not eject demigod "' + demigodName + '": ' + e.message);
    return false;
  }
}

/**
 * Prepare the opencode config for a spawn.
 *
 * Currently supports:
 *   - `injectDemigod`: inject a single demigod into opencode.json before
 *     spawning. The caller MUST call cleanupAfterSpawn() afterwards to
 *     remove it.
 *
 * Returns a token that should be passed to cleanupAfterSpawn().
 *
 * Future extensions:
 *   - `verifyStrategy`: call verifyConfigShape() and warn if drifted
 *   - `ensureStrategy`: run apply-strategy.js if config is drifted
 */
export function prepareConfigForSpawn(opts: {
  injectDemigod?: string;
  verifyShape?: boolean;
}): {
  injectedDemigods: string[];
  shapeWarnings: string[];
} {
  const injectedDemigods: string[] = [];
  const shapeWarnings: string[] = [];

  if (opts.verifyShape) {
    const result = verifyConfigShape();
    if (!result.ok) {
      for (const drift of result.drifts) {
        shapeWarnings.push(drift);
        console.log('[opencode-spawn] WARNING: config drift — ' + drift);
      }
    }
  }

  if (opts.injectDemigod) {
    if (injectDemigodForSpawn(opts.injectDemigod)) {
      injectedDemigods.push(opts.injectDemigod);
    }
  }

  return { injectedDemigods, shapeWarnings };
}

/**
 * Clean up after a spawn — eject any demigods that were injected.
 *
 * Safe to call multiple times. Always called after spawnOpencode() when
 * prepareConfigForSpawn({ injectDemigod }) was used.
 */
export function cleanupAfterSpawn(): void {
  // Iterate over a copy because ejectDemigodAfterSpawn mutates the set.
  const toEject = [..._injectedByThisProcess];
  for (const name of toEject) {
    ejectDemigodAfterSpawn(name);
  }
  _injectedByThisProcess.clear();
}

/**
 * Eject ALL demigods that were injected (per the tracker file).
 *
 * Use this for crash recovery — if a previous process injected a demigod
 * and crashed before calling cleanupAfterSpawn(), that demigod is still
 * in opencode.json. Call this on startup to clean up.
 */
export function cleanupOrphanedInjections(): { ejected: string[]; skipped: string[] } {
  const tracker = loadInjectedTracker();
  const ejected: string[] = [];
  const skipped: string[] = [];
  for (const name of tracker.injected) {
    if (ejectDemigodAfterSpawn(name)) {
      ejected.push(name);
    } else {
      skipped.push(name);
    }
  }
  if (ejected.length > 0) {
    console.log('[opencode-spawn] Cleaned up ' + ejected.length + ' orphaned demigod injection(s): ' + ejected.join(', '));
  }
  return { ejected, skipped };
}

// --- Spawn ----------------------------------------------------------------

/**
 * Spawn `opencode` with the given args.
 *
 * This is the canonical way to spawn opencode from any API route.
 * It resolves the local binary, sets the correct cwd (Olympus root so
 * opencode.json is found), and prepends `node_modules/.bin` to PATH.
 *
 * @param args       Args to pass to opencode (e.g. `['run', '--agent', 'apollo', text]`).
 * @param options    Extra spawn options. `extraEnv` is merged into the env
 *                   (caller values win). `cwd` defaults to the Olympus root.
 *                   Other options (stdio, detached, etc.) are forwarded to
 *                   Node's `spawn`.
 * @returns          The ChildProcess (same as `child_process.spawn`).
 */
export function spawnOpencode(
  args: string[],
  options: {
    extraEnv?: Record<string, string>;
    cwd?: string;
    stdio?: SpawnOptions['stdio'];
    detached?: boolean;
    shell?: boolean;
  } = {},
): ChildProcess {
  const { executable, cwd: defaultCwd, env } = getOpencodeSpawnOptions(options.extraEnv);
  const cwd = options.cwd ?? defaultCwd;

  // #68 / BENCH-MADRUGA-1 D3 (BATCH 13): pin PWD to the spawn cwd. opencode
  // resolves its session directory from a heritable $PWD over process.cwd()
  // when they disagree — a parent process (bench driver, harness) spawning
  // with cwd=<project> while its own PWD=<parent> misdirected every such
  // run one level above the intended folder (two poisoned campaign
  // launches, preserved under ~/olympus-bench/madruga-1/aborted-run-2/).
  // Pinning AFTER the extraEnv merge but as the LAST word on PWD; callers
  // may still override via extraEnv.PWD when they genuinely want a
  // different display dir — no other env semantics change.
  if (!('PWD' in (options.extraEnv ?? {}))) {
    env.PWD = cwd;
  }

  // CRITICAL: stdin must be 'ignore', NOT 'pipe'.
  //
  // opencode is a TUI application built with Bun. When its stdin is a pipe
  // (the default for Node's spawn), it detects that stdin is NOT a TTY but
  // still tries to read from it — and blocks forever waiting for input.
  //
  // Setting stdin to 'ignore' gives opencode /dev/null as stdin, which
  // causes it to immediately detect EOF and proceed with the `run` command
  // without waiting for terminal input.
  //
  // stdout and stderr remain as 'pipe' so we can capture the output.
  const defaultStdio: SpawnOptions['stdio'] = ['ignore', 'pipe', 'pipe'];

  return spawn(executable, args, {
    cwd,
    env,
    stdio: options.stdio ?? defaultStdio,
    detached: options.detached ?? false,
    shell: options.shell ?? false,
    // On Windows, spawning a .cmd or .exe binary with stdio:['ignore',...]
    // requires shell:true. Without it, Node.js throws EINVAL (errno -4071).
    // This is a known Node.js behavior since CVE-2024-27980 — .cmd/.bat/.exe
    // files can't be spawned directly with shell:false on Windows.
    //
    // We detect Windows + .cmd/.exe/.ps1 extensions and enable shell mode.
    // On Unix, shell stays false (the binary is a real ELF executable).
    ...(isWindows && /\.(cmd|exe|bat|ps1)$/i.test(executable) ? { shell: true } : {}),
  });
}

/**
 * Synchronous check: is the local opencode binary available?
 *
 * Used by the /api/olympus/health route to report the CLI subsystem status
 * accurately (green only when the local binary is present).
 */
export function isOpencodeInstalled(): boolean {
  return findOpencodeBinary() !== null;
}
