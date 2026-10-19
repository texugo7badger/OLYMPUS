#!/usr/bin/env node
/**
 * incremental-skill-index.js — the debounced skill-index watcher (RAG-CERT A1).
 *
 * v0.0.6 CURE — one schema, one builder. The old incremental upserts probed a
 * legacy `skills` table the builder never writes (build-skill-index.js owns
 * skill_vectors + skill_metadata + skill-vocab.json), so the watcher exited
 * on EVERY Electron launch ("schema migration pending v0.0.2") and exit(1)
 * when the DB was absent — the index never got built, the router's skill
 * hints silently died. The vec0 table's fixed dimensionality means a new
 * vocabulary term requires a full rebuild anyway; true incremental upsert
 * was a lie. This watcher now:
 *
 *   - SELF-HEALS: builds the index when absent (spawns the builder), never
 *     exit(1) — the app-start spawn (electron/main.ts) is the install wiring.
 *   - WATCHES the .opencode/skills tree (every *.md under it) and re-spawns
 *     the builder DEBOUNCED (default 10s after the last event;
 *     OLYMPUS_SKILL_INDEX_DEBOUNCE_MS), so a burst of skill edits costs ONE
 *     rebuild. If a rebuild is already in flight, one more is queued — never
 *     stacked, never dropped.
 *   - --once: one builder pass + exit (idempotent rebuild).
 *
 * Usage:
 *   node scripts/incremental-skill-index.js                # self-heal + watch
 *   node scripts/incremental-skill-index.js --once         # one build + exit
 *   node scripts/incremental-skill-index.js --verbose      # debug logging
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import chokidar from 'chokidar';

const OLYMPUS_ROOT = process.env.OLYMPUS_ROOT || process.cwd();
const VAULT_ROOT = process.env.OLYMPUS_VAULT || process.env.OLYMPUS_VAULT_DIR || join(homedir(), 'OLYMPUS-VAULT');
const DB_PATH = join(VAULT_ROOT, '03_Index', 'skill-vec.db');
const SKILLS_ROOT = join(OLYMPUS_ROOT, '.opencode', 'skills');

const SCRIPTS_DIR = dirname(fileURLToPath(import.meta.url));
const BUILDER = join(SCRIPTS_DIR, 'build-skill-index.js');

const VERBOSE = process.argv.includes('--verbose');
const ONCE = process.argv.includes('--once');
const DEBOUNCE_MS = Number(process.env.OLYMPUS_SKILL_INDEX_DEBOUNCE_MS) > 0
  ? Number(process.env.OLYMPUS_SKILL_INDEX_DEBOUNCE_MS)
  : 10_000;

function log(msg) { if (VERBOSE) console.log(`[skill-index] ${msg}`); }
function ok(msg) { console.log(`[skill-index] ✓ ${msg}`); }
function err(msg) { console.error(`[skill-index] X ${msg}`); }

// ─── The builder is the single schema authority ─────────────────────────────

function runBuilderSync() {
  const r = spawnSync(process.execPath, [BUILDER], {
    cwd: OLYMPUS_ROOT,
    stdio: VERBOSE ? 'inherit' : 'ignore',
    env: { ...process.env, OLYMPUS_ROOT, OLYMPUS_VAULT: VAULT_ROOT, OLYMPUS_VAULT_DIR: VAULT_ROOT },
  });
  return r.status === 0;
}

// ─── Debounced rebuild (never stacked, never dropped) ────────────────────────

let rebuildTimer = null;
let rebuilding = false;
let queued = false;

function scheduleRebuild() {
  if (rebuilding) { queued = true; return; }
  if (rebuildTimer) {
    clearTimeout(rebuildTimer);
    log('Rebuild re-armed (burst debounce).');
  }
  rebuildTimer = setTimeout(() => {
    rebuildTimer = null;
    doRebuild();
  }, DEBOUNCE_MS);
}

async function doRebuild() {
  if (rebuilding) { queued = true; return; }
  rebuilding = true;
  try {
    await new Promise((resolve) => {
      const child = spawn(process.execPath, [BUILDER], {
        cwd: OLYMPUS_ROOT,
        stdio: VERBOSE ? 'inherit' : 'ignore',
        env: { ...process.env, OLYMPUS_ROOT, OLYMPUS_VAULT: VAULT_ROOT, OLYMPUS_VAULT_DIR: VAULT_ROOT },
      });
      child.on('exit', (code) => resolve(code));
      child.on('error', () => resolve(-1));
    });
    log('Rebuild finished.');
  } catch (e) {
    err(`Rebuild failed: ${e.message}`);
  } finally {
    rebuilding = false;
    if (queued) { queued = false; scheduleRebuild(); }
  }
}

// ─── Watcher ─────────────────────────────────────────────────────────────────

function startWatcher() {
  ok(`Watching ${SKILLS_ROOT} for skill changes (debounced ${DEBOUNCE_MS}ms full rebuild)...`);
  ok(`DB: ${DB_PATH}`);

  const watcher = chokidar.watch(join(SKILLS_ROOT, '**/*.md'), {
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 },
  });

  watcher.on('add', (filePath) => { log(`File added: ${filePath}`); scheduleRebuild(); });
  watcher.on('change', (filePath) => { log(`File changed: ${filePath}`); scheduleRebuild(); });
  watcher.on('unlink', (filePath) => { log(`File deleted: ${filePath}`); scheduleRebuild(); });
  watcher.on('error', (e) => err(`Watcher error: ${e.message}`));

  const shutdown = (sig) => {
    ok(`Shutting down watcher (${sig})...`);
    if (rebuildTimer) clearTimeout(rebuildTimer);
    watcher.close().finally(() => process.exit(0));
    // Hard-stop safety if close() hangs.
    setTimeout(() => process.exit(0), 2000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

// ─── Entry ───────────────────────────────────────────────────────────────────

if (!existsSync(BUILDER)) {
  err(`Builder not found: ${BUILDER}`);
  process.exit(1);
}

if (ONCE) {
  ok('One builder pass (--once)...');
  process.exit(runBuilderSync() ? 0 : 1);
}

// Self-heal: an absent index is BUILT here — never the old exit(1) refusal.
if (!existsSync(DB_PATH)) {
  ok('skill-vec.db absent — self-heal build (the builder is the schema authority)...');
  if (!runBuilderSync()) {
    err('Self-heal build failed — watcher starts anyway and will retry on the next skill change.');
  }
} else {
  log('Index present — watching.');
}

startWatcher();
