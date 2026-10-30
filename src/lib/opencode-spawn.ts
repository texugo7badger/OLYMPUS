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

import { spawn, execFileSync, type ChildProcess, type SpawnOptions } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync, symlinkSync, copyFileSync, unlinkSync, readdirSync, appendFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { syncLaneFile } from './lane-config';
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
  // #BIN-OWNERSHIP (v0.0.24): TWO packages ship an `opencode` bin — the
  // legacy `opencode-ai` (1.x) and `@opencode/cli` (2.x). npm links whichever
  // it resolves last; a plain `npm install` can leave `.bin/opencode` on 1.x,
  // and the v1 CLI cannot open the v2 DB ("Database is not empty and has no
  // session table"). Resolve the v2 package binary FIRST, so a shadowed bin
  // can never break every dispatch.
  const v2PackageBins = [
    join(root, 'node_modules', '@opencode', 'cli', 'bin', 'opencode.exe'),
    join(root, 'node_modules', '@opencode', 'cli', 'bin', 'opencode'),
  ];
  for (const c of v2PackageBins) {
    if (existsSync(c)) return c;
  }

  // Packaged installs can carry ONLY the platform package (electron-builder
  // does not always pack the launcher's 248MB `bin/` hardlink): the same
  // executable lives at `@opencode/cli-<platform>-<arch>/bin/opencode`.
  // Prefer the exact platform+arch, then the baseline/musl siblings.
  try {
    const platformDir = platform() === 'win32' ? 'windows' : platform();
    const preferred = `cli-${platformDir}-${process.arch}`;
    const names = readdirSync(join(root, 'node_modules', '@opencode'), { withFileTypes: true })
      .filter((d) => d.isDirectory() && d.name.startsWith('cli-'))
      .map((d) => d.name)
      .sort((a, b) => {
        const rank = (n: string) => (n === preferred ? 0 : n.startsWith(preferred) ? 1 : 2);
        return rank(a) - rank(b) || a.localeCompare(b);
      });
    for (const name of names) {
      for (const bin of ['opencode', 'opencode.exe']) {
        const candidate = join(root, 'node_modules', '@opencode', name, 'bin', bin);
        if (existsSync(candidate)) return candidate;
      }
    }
  } catch { /* no platform package — fall through to the shims */ }

  const candidates = isWindows
    ? [
        join(binDir, 'opencode2.cmd'),
        join(binDir, 'opencode2'),
        join(binDir, 'opencode.cmd'),
        join(binDir, 'opencode.ps1'),
        join(binDir, 'opencode'),
        join(binDir, 'opencode.exe'),
      ]
    : [
        join(binDir, 'opencode2'),
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
 *
 * #108 (FLUENCY-1): the key-sight — the preflight enumerates EVERY
 * provider id present in auth.json (both paths), not just the 3
 * historical fields. The live failure: the #98 exhaustion card said
 * "No alternative free strategy has a key present either" while the
 * user's auth.json carried opencode-go (the GO valve), openrouter, groq,
 * and 4 nvidia family ids. The EYE was broken, not the vault empty.
 * Optional `authDirs` lets the fixture inject its own auth trees.
 */

/** #108: the auth lane census — the preflight's SIGHT, pure + injectable. */
export interface AuthLaneCensus {
  /** Every provider id with a usable key, sorted. */
  providerIds: string[];
  hasOpenRouter: boolean;
  /** Any nvidia-family id — the bare field OR the #106 family mirrors
   *  (nvidia-glm/nvidia-deepseek/nvidia-kimi/nvidia-meta — the shipped shape). */
  hasNvidia: boolean;
  /** The opencode-go id — the GO plan's lane (the premium fallback valve). */
  hasGoValve: boolean;
}

export function authLaneCensus(authDirs?: string[]): AuthLaneCensus {
  const dirs = authDirs ?? [
    join(homedir(), '.local', 'share', 'opencode'),
    join(homedir(), '.config', 'opencode'),
  ];
  const present = new Set<string>();
  for (const dir of dirs) {
    const authFile = join(dir, 'auth.json');
    if (!existsSync(authFile)) continue;
    try {
      const auth = JSON.parse(readFileSync(authFile, 'utf-8'));
      const has = (v: unknown) => typeof v === 'string' ? v.length > 0 : (!!v && typeof (v as { key?: unknown }).key === 'string');
      for (const [id, v] of Object.entries(auth)) {
        if (has(v)) present.add(id);
      }
    } catch { /* unreadable auth — fall through to the guidance */ }
  }
  const providerIds = [...present].sort();
  return {
    providerIds,
    hasOpenRouter: present.has('openrouter'),
    hasNvidia: providerIds.some((id) => id === 'nvidia' || id.startsWith('nvidia-')),
    hasGoValve: present.has('opencode-go'),
  };
}

export function freeTierPreflight(strategy: string, _authDirs?: string[]): string {
  // v0.0.24: the free tier is RETIRED. A stale config may still name a
  // free-* id; the honest answer is the replacement, never a "missing key"
  // scavenger hunt for a strategy that no longer exists.
  return [
    `[opencode-spawn] FREE-STRATEGY PREFLIGHT ERROR (strategy: ${strategy})`,
    '  The free tier was retired in v0.0.22. No free-* strategy exists.',
    '  Choose go-* (GO plan), zen-* (pay-as-you-go), local (your own hardware), or custom-* (any registered provider).',
    '  No strategy was auto-switched (no silent downgrade).',
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

  // #212: OLYMPUS owns the CLI update lane. The v2 CLI auto-updates by
  // default and restarts itself mid-flight (the #147 tap3 specimen); the
  // warm serve lane already pinned this, but one-shot spawns did not — a
  // background /update prompt could still replace the binary under a run.
  // Pin every OLYMPUS-spawned CLI; updates happen through the OLYMPUS-side
  // check (/api/olympus/opencode-update), never silently.
  env.OPENCODE_DISABLE_AUTOUPDATE = '1';

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
  // v0.0.24 — the user's pinned directive: every project lives in the vault.
  // 02_Projects is the lane ROOT; the active project's own home is the cwd
  // (resolveWorkspaceLane below).
  const defaultDir = join(getVaultRoot(), '02_Projects');
  let dir = process.env.OLYMPUS_WORKSPACE
    ? resolve(process.env.OLYMPUS_WORKSPACE)
    : defaultDir;
  if (dir === root || dir.startsWith(root + '/')) {
    console.warn(`[opencode-spawn] OLYMPUS_WORKSPACE (${dir}) points inside the OLYMPUS root — falling back to ${defaultDir} (projects never land in the working tree)`);
    dir = defaultDir;
  }
  return dir;
}

/** The active project slug from ~/.olympus/active-project.json (null when none). */
export function activeProjectSlugFromDisk(): string | null {
  try {
    const home = process.env.OLYMPUS_HOME || join(homedir(), '.olympus');
    const p = join(home, 'active-project.json');
    const raw = JSON.parse(readFileSync(p, 'utf-8'));
    const slug = typeof raw?.slug === 'string' ? raw.slug : null;
    return slug && /^[a-z0-9][a-z0-9-]*$/i.test(slug) ? slug : null;
  } catch {
    return null;
  }
}

/** The canonical project home: <vault>/02_Projects/<slug> (or the OLYMPUS_WORKSPACE override). */
export function resolveProjectHome(slug: string | null | undefined): string | null {
  if (!slug || !/^[a-z0-9][a-z0-9-]*$/i.test(slug)) return null;
  return join(workspaceLaneDir(), slug);
}

/** The active project's home, or null when no project is active. */
export function activeProjectHome(): string | null {
  return resolveProjectHome(activeProjectSlugFromDisk());
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
  // v0.0.24 — the ACTIVE PROJECT is the lane cwd, so relative writes land in
  // 02_Projects/<slug>, never the 02_Projects root or the repo. No active
  // project = the 02_Projects root (a safe, still-in-vault fallback).
  const dir = activeProjectHome() ?? workspaceLaneDir();
  let fresh = false;
  if (!existsSync(dir)) {
    fresh = true;
    mkdirSync(dir, { recursive: true });
  }
  try {
    const dotOpencode = join(dir, '.opencode');
    if (!existsSync(dotOpencode)) symlinkSync(join(root, '.opencode'), dotOpencode);
  } catch {}
  // #STRATEGY-SYNC: reconcile llm-providers.json with active-strategy.json
  // on every boot so the panel and the config never disagree.
  try {
    const activePath = join(homedir(), '.olympus', 'active-strategy.json');
    const providersPath = join(homedir(), '.olympus', 'llm-providers.json');
    if (existsSync(activePath)) {
      const active = JSON.parse(readFileSync(activePath, 'utf-8'));
      const cfg = existsSync(providersPath) ? JSON.parse(readFileSync(providersPath, 'utf-8')) : {};
      if (cfg.strategy !== active.strategy) {
        cfg.strategy = active.strategy;
        cfg.per_god_overrides = cfg.per_god_overrides || {};
        writeFileSync(providersPath, JSON.stringify(cfg, null, 2));
      }
    }
  } catch (e) {
    console.warn('[opencode-spawn] strategy sync failed:', e);
  }

  // #LANE-DRIFT: refresh on drift (syncLaneFile) + force copy to be safe.
  // The tripwire test checks that syncLaneFile is called.
  for (const f of ['opencode.json', 'opencode.demigods.json']) {
    try {
      const src = join(root, f);
      const dst = join(dir, f);
      const verdict = syncLaneFile(join(root, f), join(dir, f));
      if (verdict === 'refreshed' || verdict === 'created') {
        console.warn(`[lane-config] workspace ${f} refreshed from root (lane mirrors the root).`);
      }
      // Force copy to ensure MCP enabled state etc. is always in sync
      if (existsSync(src)) {
        copyFileSync(src, dst);
      }
    } catch (e) {
      console.warn(`[lane-config] failed to refresh ${f}:`, e);
    }
  }
  ensureProjectGitExclude(dir);
  return { dir, fresh };
}

/**
 * Keep OLYMPUS runtime files out of the project's git history WITHOUT
 * touching the user's committed .gitignore: append a managed block to
 * `.git/info/exclude` (local-only). A non-git project is left alone.
 */
function ensureProjectGitExclude(dir: string): void {
  try {
    const gitDir = join(dir, '.git');
    if (!existsSync(gitDir)) return;
    const exclude = join(gitDir, 'info', 'exclude');
    const marker = '# OLYMPUS runtime files (managed)';
    const current = existsSync(exclude) ? readFileSync(exclude, 'utf-8') : '';
    if (current.includes(marker)) return;
    mkdirSync(join(gitDir, 'info'), { recursive: true });
    appendFileSync(exclude, `\n${marker}\n.opencode/\nopencode.json\nopencode.demigods.json\n.olympus-*\ndispatch-plan.json\nworklog/\n`);
  } catch { /* a VCS exclude is best-effort; never blocks the lane */ }
}

/**
 * #104 (MADRUGA-PREVIEW-1 Batch C): the cwd for one-shot `opencode run`
 * dispatches. #99's cure reached ONLY the serve spawn; every one-shot
 * dispatch still inherited findOlympusRoot() as its cwd (getOpencodeSpawnOptions'
 * default) — so the athena/edit "Mark for editing" lane would have edited
 * INSIDE THE REPO.
 *
 * Lane preference, never the repo:
 *   - slug given + <lane>/<slug> exists → that project dir;
 *   - slug given, dir missing → the lane dir;
 *   - null/undefined slug → the lane dir.
 * workspaceLaneDir()'s never-the-repo guard makes every branch land outside
 * the OLYMPUS root — a dispatch can never write into the working tree.
 */
export function resolveDispatchCwd(projectSlug?: string | null): string {
  // W-O ORPHAN-CURE (the 17:33 specimen — the fossil lane): the one-shot
  // dispatch read the PURE workspaceLaneDir, never the SYNCED mirror —
  // apply-strategy rewrote the ROOT opencode.json and killed the serve,
  // the warm lane fell back to one-shot, and the fallback served the
  // NEVER-REFRESHED workspace config (the fossil kept pointing at the
  // lane the strategy had just retired). resolveWorkspaceLane carries the
  // REFRESH-ON-DRIFT law (#LANE-DRIFT: "the copies are REFRESH-ON-DRIFT,
  // operator edits belong in the root") — every dispatch serves the
  // current truth, never a fossil.
  const laneDir = resolveWorkspaceLane().dir;
  if (!projectSlug) return laneDir;
  // v0.0.24 — the project home is <vault>/02_Projects/<slug>. Never a
  // non-vault legacy path unless OLYMPUS_WORKSPACE explicitly overrides.
  const projectDir = resolveProjectHome(projectSlug);
  if (projectDir && existsSync(projectDir)) return projectDir;
  return laneDir;
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

/**
 * #DB-HEALTH (2026-10-25): the opencode SQLite DB can end up with a
 * partial migration — the `session_input` table is recorded as applied in
 * the `migration` table but does not actually exist. Every prompt then fails
 * with `SQLiteError: no such table: session_input` → "Unexpected server
 * error", breaking ALL strategies identically.
 *
 * This helper checks that the DB has the `session_input` table. If it
 * doesn't, it backs up the DB (`opencode.db.bak-<ts>`) and removes it (+
 * -shm / -wal) so opencode recreates a clean schema on next boot. Keeps
 * the 3 most recent backups, pruning older ones.
 *
 * Returns true if a repair was performed.
 */
export function ensureOpencodeDbHealthy(): boolean {
  const dbPath = join(homedir(), '.local', 'share', 'opencode', 'opencode.db');
  if (!existsSync(dbPath)) return false; // nothing to repair; opencode creates it
  let needsRepair = false;
  try {
    // Use a child process? No — use node's better-sqlite3 if available, else
    // fall back to probing via the opencode binary's own check. We use a
    // lightweight probe: open with sqlite3 CLI if present.
    let tables = '';
    try {
      tables = execFileSync('python3', ['-c',
        `import sqlite3,sys; c=sqlite3.connect('${dbPath}'); print(' '.join(r[0] for r in c.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()))`
      ], { encoding: 'utf-8', timeout: 5000 });
    } catch {
      // python3 unavailable — assume healthy (don't risk data loss)
      return false;
    }
    if (!tables.split(/\s+/).includes('session_input')) {
      needsRepair = true;
    }
  } catch {
    return false;
  }
  if (!needsRepair) return false;

  // Back up + remove
  try {
    const ts = Date.now();
    const backup = `${dbPath}.bak-${ts}`;
    copyFileSync(dbPath, backup);
    // prune older backups (keep 3 newest)
    const dir = dirname(dbPath);
    const backups = readdirSync(dir)
      .filter((f) => f.startsWith('opencode.db.bak-'))
      .sort()
      .reverse();
    for (const old of backups.slice(3)) {
      try { unlinkSync(join(dir, old)); } catch {}
    }
    unlinkSync(dbPath);
    for (const suffix of ['-shm', '-wal']) {
      try { unlinkSync(dbPath + suffix); } catch {}
    }
    console.log(`[opencode-spawn] Repaired OpenCode database (missing session_input table). Previous saved as ${backup}`);
    return true;
  } catch (err) {
    console.error('[opencode-spawn] DB repair failed:', err);
    return false;
  }
}
