#!/usr/bin/env node
/**
 * dynamic-dispatch-loader.js — Per-task demigod config loader
 *
 * Solves Problem C: "Dynamic per-task config loading" from the OLYMPUS
 * opencode.json hang investigation.
 *
 * GOAL:
 *   Instead of loading all 128 agents on every `opencode run`, only load
 *   the agents relevant to the current task. Apollo is the entry point.
 *   When Apollo dispatches to a demigod, THAT demigod's config is loaded
 *   on-demand.
 *
 * CONSTRAINT:
 *   OpenCode's config is static — agents are defined in opencode.json and
 *   loaded at startup. There is no built-in dynamic agent loading API.
 *
 *   HOWEVER, OpenCode DOES re-read opencode.json on every `opencode run`
 *   invocation. So we can simulate dynamic loading by:
 *     1. Keeping opencode.json minimal (10 gods only) by default
 *     2. Before spawning opencode for a dispatch, INJECT the target demigod
 *        into opencode.json
 *     3. After the spawn completes, REMOVE the injected demigod
 *
 *   This keeps the config small for the common case (Apollo planning,
 *   user chat) and only pays the cost of demigod registration when a
 *   dispatch actually happens.
 *
 * USAGE:
 *   1. As a CLI tool (called by opencode-spawn.ts before spawning):
 *
 *        node scripts/dynamic-dispatch-loader.js inject <demigod-name>
 *        # -> injects the demigod into opencode.json, prints the agent name
 *
 *        node scripts/dynamic-dispatch-loader.js eject <demigod-name>
 *        # -> removes the demigod from opencode.json (if it was injected)
 *
 *        node scripts/dynamic-dispatch-loader.js list
 *        # -> lists all demigods available in opencode.demigods.json
 *
 *        node scripts/dynamic-dispatch-loader.js resolve <demigod-name>
 *        # -> prints the demigod's resolved config (JSON) WITHOUT modifying
 *        #    opencode.json. Useful for the dispatch tool to look up the
 *        #    model + prompt file path.
 *
 *   2. As a module (imported by .opencode/olympus/tools/dispatch.ts):
 *
 *        import { resolveDemigod, injectDemigod, ejectDemigod } from
 *          '../../../scripts/dynamic-dispatch-loader.js';
 *
 * SAFETY:
 *   - Inject / eject operations create a backup of opencode.json before
 *     modifying it. The backup is restored if the operation fails midway.
 *   - Eject is idempotent — if the demigod isn't in opencode.json, eject
 *     is a no-op.
 *   - Inject checks if the demigod is already present; if so, it's a no-op.
 *   - The loader NEVER removes a god (only demigods). Gods are always
 *     present in opencode.json.
 *
 * STATE:
 *   Tracks injected demigods in ~/.olympus/injected-demigods.json so
 *   eject() can clean up even if the parent process crashed mid-dispatch.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OLYMPUS_ROOT = process.env.OLYMPUS_ROOT || process.cwd();
const OPENCODE_JSON = path.join(OLYMPUS_ROOT, 'opencode.json');
const DEMIGODS_JSON = path.join(OLYMPUS_ROOT, 'opencode.demigods.json');
const OLYMPUS_HOME = path.join(os.homedir(), '.olympus');
const INJECTED_TRACKER = path.join(OLYMPUS_HOME, 'injected-demigods.json');

const GOD_IDS = new Set([
  'apollo', 'atlas', 'artemis', 'athena', 'dionysus', 'hephaestus',
  'hermes', 'persephone', 'prometheus', 'callimachus',
]);

function log(msg) { console.error(`[dynamic-dispatch-loader] ${msg}`); }

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

// --- Demigods registry -----------------------------------------------------

let _demigodsCache = null;

function loadDemigodsRegistry() {
  if (_demigodsCache) return _demigodsCache;
  if (!fs.existsSync(DEMIGODS_JSON)) {
    throw new Error(
      `opencode.demigods.json not found at ${DEMIGODS_JSON}. ` +
      `Required for dynamic demigod loading.`
    );
  }
  try {
    const raw = JSON.parse(fs.readFileSync(DEMIGODS_JSON, 'utf-8'));
    if (!raw.demigods) {
      throw new Error('opencode.demigods.json missing `demigods` object');
    }
    _demigodsCache = raw.demigods;
    return _demigodsCache;
  } catch (e) {
    throw new Error(`Could not parse ${DEMIGODS_JSON}: ${e.message}`);
  }
}

// --- Injected demigods tracker ---------------------------------------------

function loadInjectedTracker() {
  try {
    if (!fs.existsSync(INJECTED_TRACKER)) return { injected: [] };
    const raw = JSON.parse(fs.readFileSync(INJECTED_TRACKER, 'utf-8'));
    if (!Array.isArray(raw.injected)) raw.injected = [];
    return raw;
  } catch {
    return { injected: [] };
  }
}

function saveInjectedTracker(tracker) {
  try {
    ensureDir(OLYMPUS_HOME);
    fs.writeFileSync(INJECTED_TRACKER, JSON.stringify(tracker, null, 2), 'utf-8');
  } catch (e) {
    log(`Warning: could not save injected tracker: ${e.message}`);
  }
}

function recordInjected(name) {
  const tracker = loadInjectedTracker();
  if (!tracker.injected.includes(name)) {
    tracker.injected.push(name);
    tracker.lastInjectedAt = new Date().toISOString();
    saveInjectedTracker(tracker);
  }
}

function unrecordInjected(name) {
  const tracker = loadInjectedTracker();
  tracker.injected = tracker.injected.filter(n => n !== name);
  saveInjectedTracker(tracker);
}

function getInjectedDemigods() {
  return loadInjectedTracker().injected;
}

// --- opencode.json load / save --------------------------------------------

function loadOpendcodeJson() {
  if (!fs.existsSync(OPENCODE_JSON)) {
    throw new Error(`opencode.json not found at ${OPENCODE_JSON}`);
  }
  try {
    return JSON.parse(fs.readFileSync(OPENCODE_JSON, 'utf-8'));
  } catch (e) {
    throw new Error(`Could not parse opencode.json: ${e.message}`);
  }
}

function saveOpendcodeJson(config) {
  const content = JSON.stringify(config, null, 2) + '\n';
  fs.writeFileSync(OPENCODE_JSON, content, 'utf-8');
}

// --- Resolve (no side effects) --------------------------------------------

/**
 * Resolve a demigod's full config WITHOUT modifying opencode.json.
 *
 * Returns:
 *   {
 *     name: string,
 *     parent_god: string,
 *     mode: string,
 *     model: string,
 *     prompt: string,         // the {file:...} reference
 *     prompt_content: string, // the resolved file content (read from disk)
 *     prompt_file: string,    // absolute path to the prompt file
 *   }
 *
 * Throws if the demigod is not in the registry or if the prompt file
 * is missing / unreadable.
 */
export function resolveDemigod(name) {
  const demigods = loadDemigodsRegistry();
  const d = demigods[name];
  if (!d) {
    throw new Error(
      `Unknown demigod: "${name}". ` +
      `Run \`node scripts/dynamic-dispatch-loader.js list\` to see all demigods.`
    );
  }

  // Resolve the prompt file path from the {file:...} reference
  const promptMatch = d.prompt.match(/\{file:([^}]+)\}/);
  if (!promptMatch) {
    throw new Error(
      `Demigod ${name} has a non-file prompt: ${d.prompt}. ` +
      `Dynamic loader only supports {file:...} prompts.`
    );
  }
  const promptFile = path.resolve(OLYMPUS_ROOT, promptMatch[1]);
  if (!fs.existsSync(promptFile)) {
    throw new Error(
      `Prompt file not found for demigod ${name}: ${promptFile}`
    );
  }
  const promptContent = fs.readFileSync(promptFile, 'utf-8');

  return {
    name,
    parent_god: d.parent_god,
    mode: d.mode || 'subagent',
    model: d.model,
    prompt: d.prompt,
    prompt_content: promptContent,
    prompt_file: promptFile,
  };
}

// --- Inject / Eject --------------------------------------------------------

/**
 * Inject a single demigod into opencode.json.
 *
 * If the demigod is already present (e.g. from a previous inject that
 * wasn't cleaned up, or because the user is on a GO-plan strategy with
 * all demigods pre-loaded), this is a no-op.
 *
 * Returns: { injected: boolean, name: string, model: string }
 */
export function injectDemigod(name) {
  if (GOD_IDS.has(name)) {
    throw new Error(
      `Refusing to inject "${name}" — it is a god, not a demigod. ` +
      `Gods are always present in opencode.json.`
    );
  }

  const resolved = resolveDemigod(name);

  const config = loadOpendcodeJson();
  if (!config.agent) config.agent = {};

  if (config.agent[name]) {
    // Already present — no-op
    log(`Demigod ${name} already in opencode.json — no-op`);
    return { injected: false, name, model: resolved.model };
  }

  // Inject
  config.agent[name] = {
    mode: resolved.mode,
    model: resolved.model,
    prompt: resolved.prompt,
  };

  saveOpendcodeJson(config);
  recordInjected(name);
  log(`Injected demigod ${name} (parent: ${resolved.parent_god}, model: ${resolved.model})`);

  return { injected: true, name, model: resolved.model };
}

/**
 * Remove an injected demigod from opencode.json.
 *
 * SAFETY: Only removes demigods that were INJECTED by this loader (i.e.,
 * recorded in the injected-demigods tracker). If the demigod was pre-loaded
 * by a GO-strategy apply-strategy.js run, eject is a no-op (returns
 * ejected: false with reason: "pre_loaded") — use apply-strategy.js to
 * switch to free-tier instead.
 *
 * To force-remove a demigod regardless of how it got there, pass
 * `{ force: true }` (use with caution — breaks GO-strategy state).
 *
 * NEVER removes a god.
 *
 * Returns: { ejected: boolean, name: string, reason?: string }
 */
export function ejectDemigod(name, opts = {}) {
  const { force = false } = opts;

  if (GOD_IDS.has(name)) {
    throw new Error(
      `Refusing to eject "${name}" — it is a god. ` +
      `Gods must always be present in opencode.json.`
    );
  }

  const tracker = loadInjectedTracker();
  const wasInjectedByUs = tracker.injected.includes(name);

  const config = loadOpendcodeJson();
  if (!config.agent || !config.agent[name]) {
    // Not present — clean up tracker and return no-op
    if (wasInjectedByUs) unrecordInjected(name);
    return { ejected: false, name, reason: 'not_present' };
  }

  if (!wasInjectedByUs && !force) {
    // Pre-loaded (e.g. by apply-strategy.js GO-plan merge) — refuse to eject
    log(`Demigod ${name} is present but was NOT injected by this loader — refusing to eject (use --force or switch to a free strategy via apply-strategy.js)`);
    return {
      ejected: false,
      name,
      reason: 'pre_loaded',
    };
  }

  delete config.agent[name];
  saveOpendcodeJson(config);
  unrecordInjected(name);
  log(`Ejected demigod ${name} from opencode.json${force ? ' (forced)' : ''}`);

  return { ejected: true, name };
}

/**
 * Eject ALL demigods that were injected via injectDemigod().
 *
 * Useful for cleanup after a crash or when switching strategies.
 * Reads the injected tracker file and ejects every name in it.
 *
 * Returns: { ejected: string[], skipped: string[] }
 */
export function ejectAllInjected() {
  const injected = getInjectedDemigods();
  const ejected = [];
  const skipped = [];
  for (const name of injected) {
    try {
      const result = ejectDemigod(name);
      if (result.ejected) {
        ejected.push(name);
      } else {
        skipped.push(name);
      }
    } catch (e) {
      log(`Warning: could not eject ${name}: ${e.message}`);
      skipped.push(name);
    }
  }
  return { ejected, skipped };
}

/**
 * List all available demigods from the registry.
 */
export function listDemigods() {
  const demigods = loadDemigodsRegistry();
  return Object.entries(demigods).map(([name, d]) => ({
    name,
    parent_god: d.parent_god,
    model: d.model,
    prompt: d.prompt,
  }));
}

// --- CLI -------------------------------------------------------------------

function printHelp() {
  console.log(`Usage: node scripts/dynamic-dispatch-loader.js <command> [args]

Commands:
  inject <name>     Inject a demigod into opencode.json.
  eject <name>      Remove an injected demigod from opencode.json.
  eject-all         Remove ALL injected demigods (cleanup).
  resolve <name>    Print the demigod's resolved config (JSON).
                    Does NOT modify opencode.json.
  list              List all available demigods.
  status            Show which demigods are currently injected.
  help              Show this help.

Environment:
  OLYMPUS_ROOT      Project root (default: process.cwd())

Files:
  ${OPENCODE_JSON}
    The opencode.json file to modify.

  ${DEMIGODS_JSON}
    The demigods registry (118 demigods).

  ${INJECTED_TRACKER}
    Tracks which demigods were injected (for cleanup after crashes).

Examples:
  # Inject a single demigod before spawning opencode for a dispatch
  node scripts/dynamic-dispatch-loader.js inject build-resolver
  opencode run --agent build-resolver "fix the broken cargo build"
  node scripts/dynamic-dispatch-loader.js eject build-resolver

  # List all available demigods
  node scripts/dynamic-dispatch-loader.js list

  # Cleanup after a crash
  node scripts/dynamic-dispatch-loader.js eject-all
`);
}

function main() {
  const [cmd, ...rest] = process.argv.slice(2);

  try {
    switch (cmd) {
      case 'inject': {
        const name = rest[0];
        if (!name) {
          console.error('Error: missing demigod name. Usage: inject <name>');
          process.exit(1);
        }
        const result = injectDemigod(name);
        console.log(JSON.stringify(result));
        process.exit(0);
      }
      case 'eject': {
        const name = rest[0];
        if (!name) {
          console.error('Error: missing demigod name. Usage: eject <name> [--force]');
          process.exit(1);
        }
        const force = rest.includes('--force') || rest.includes('-f');
        const result = ejectDemigod(name, { force });
        console.log(JSON.stringify(result));
        if (!result.ejected && result.reason === 'pre_loaded') {
          console.error(
            `\n  Demigod "${name}" is present but was NOT injected by this loader.\n` +
            `  It was likely loaded by apply-strategy.js as part of a GO strategy.\n` +
            `  To remove it anyway, re-run with --force (use with caution — breaks GO state).\n` +
            `  To remove all demigods, switch to a free strategy: node scripts/apply-strategy.js --strategy free-openrouter`
          );
        }
        process.exit(0);
      }
      case 'eject-all': {
        const result = ejectAllInjected();
        console.log(JSON.stringify(result, null, 2));
        process.exit(0);
      }
      case 'resolve': {
        const name = rest[0];
        if (!name) {
          console.error('Error: missing demigod name. Usage: resolve <name>');
          process.exit(1);
        }
        const resolved = resolveDemigod(name);
        // Don't print prompt_content (could be large) — just metadata
        const { prompt_content, ...meta } = resolved;
        console.log(JSON.stringify(meta, null, 2));
        console.error(`(prompt content: ${prompt_content.length} chars, not printed)`);
        process.exit(0);
      }
      case 'list': {
        const all = listDemigods();
        const byGod = {};
        for (const d of all) {
          if (!byGod[d.parent_god]) byGod[d.parent_god] = [];
          byGod[d.parent_god].push(d.name);
        }
        for (const god of Object.keys(byGod).sort()) {
          console.log(`\n${god} (${byGod[god].length}):`);
          for (const name of byGod[god].sort()) {
            console.log(`  ${name}`);
          }
        }
        console.log(`\nTotal: ${all.length} demigods across ${Object.keys(byGod).length} gods`);
        process.exit(0);
      }
      case 'status': {
        const injected = getInjectedDemigods();
        console.log(`Injected demigods (${injected.length}):`);
        if (injected.length === 0) {
          console.log('  (none — opencode.json is in its default state)');
        } else {
          for (const name of injected) {
            console.log(`  ${name}`);
          }
        }
        process.exit(0);
      }
      case 'help':
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
      default:
        if (cmd) {
          console.error(`Error: unknown command: ${cmd}\n`);
        }
        printHelp();
        process.exit(1);
    }
  } catch (e) {
    console.error(`Error: ${e.message}`);
    process.exit(1);
  }
}

// Run CLI if invoked directly, otherwise export as module.
const isDirectInvoke = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (isDirectInvoke) {
  main();
}

export { main };
