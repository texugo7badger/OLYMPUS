/**
 * POST /api/olympus/demigods/sync
 *
 * Re-scans .opencode/prompts/agents/demigods/<god>/*.txt and rebuilds
 * opencode.demigods.json with any new demigods discovered.
 *
 * This is the "self-configuring" piece: when a god creates a new demigod
 * prompt file (via the demigod-author tool, or by hand-editing), this
 * endpoint syncs the registry so the dispatch tool can auto-inject the
 * new demigod on the next dispatch.
 *
 * ALSO: if a GO strategy is active (all demigods pre-loaded in opencode.json),
 * injects any newly-discovered demigods into opencode.json so they're
 * immediately available without a restart.
 *
 * Body:
 *   { applyToOpencodeJson?: boolean }  — default true. If false, only
 *   updates opencode.demigods.json without touching opencode.json.
 *
 * Returns:
 *   {
 *     ok: true,
 *     total: number,           — total demigods in registry
 *     added: string[],         — names of demigods added in this sync
 *     updated: string[],       — names of demigods updated (model/prompt changed)
 *     removed: string[],       — names of demigods removed (file deleted)
 *     injected_into_opencode: string[],  — names injected into opencode.json
 *                                              (only if GO strategy active)
 *   }
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { NextRequest, NextResponse } from 'next/server';
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join, basename, resolve } from 'node:path';
import { homedir } from 'node:os';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const OLYMPUS_ROOT = process.env.OLYMPUS_ROOT || process.cwd();
const DEMIGODS_DIR = join(OLYMPUS_ROOT, '.opencode', 'prompts', 'agents', 'demigods');
const DEMIGODS_JSON = join(OLYMPUS_ROOT, 'opencode.demigods.json');
const OPENCODE_JSON = join(OLYMPUS_ROOT, 'opencode.json');
const ACTIVE_STRATEGY_FILE = join(homedir(), '.olympus', 'active-strategy.json');
const RELOAD_SENTINEL = join(homedir(), '.olympus', 'demigods-registry.reload');

const GOD_IDS = new Set([
  'apollo', 'atlas', 'artemis', 'athena', 'dionysus', 'hephaestus',
  'hermes', 'persephone', 'prometheus', 'callimachus',
]);

// Default model for newly-discovered demigods. apply-strategy.js will
// rewrite this with the correct inherited model when the user runs it.
const DEFAULT_DEMIGOD_MODEL = 'opencode-go/deepseek-v4-flash';

interface DiscoveredDemigod {
  name: string;          // kebab-case (e.g., 'build-resolver')
  parent_god: string;
  prompt_file: string;   // relative path: .opencode/prompts/agents/demigods/<god>/<name>.txt
  size_bytes: number;
  mtime: string;
}

/**
 * Walk .opencode/prompts/agents/demigods/<god>/*.txt and return a list
 * of all demigods discovered on disk.
 *
 * Filenames use underscores (build_resolver.txt) but demigod names use
 * hyphens (build-resolver) — we normalize.
 */
function scanDemigodsOnDisk(): DiscoveredDemigod[] {
  const discovered: DiscoveredDemigod[] = [];
  if (!existsSync(DEMIGODS_DIR)) return discovered;

  for (const god of readdirSync(DEMIGODS_DIR, { withFileTypes: true })) {
    if (!god.isDirectory()) continue;
    if (!GOD_IDS.has(god.name)) continue;  // skip non-god dirs

    const godDir = join(DEMIGODS_DIR, god.name);
    for (const file of readdirSync(godDir)) {
      if (!file.endsWith('.txt')) continue;
      const fullPath = join(godDir, file);
      try {
        const stat = statSync(fullPath);
        // Convert filename to demigod name: build_resolver.txt -> build-resolver
        const baseName = basename(file, '.txt');
        const demigodName = baseName.replace(/_/g, '-');
        const relativePath = `.opencode/prompts/agents/demigods/${god.name}/${file}`;
        discovered.push({
          name: demigodName,
          parent_god: god.name,
          prompt_file: relativePath,
          size_bytes: stat.size,
          mtime: stat.mtime.toISOString(),
        });
      } catch {}
    }
  }

  return discovered;
}

/**
 * Read the existing opencode.demigods.json registry.
 */
function loadRegistry(): any {
  if (!existsSync(DEMIGODS_JSON)) {
    return {
      _meta: {
        description: 'OLYMPUS demigod registry',
        version: '1.0.0',
        generated_from: 'scan',
        gods: {},
        total: 0,
      },
      demigods: {},
    };
  }
  try {
    return JSON.parse(readFileSync(DEMIGODS_JSON, 'utf-8'));
  } catch {
    return {
      _meta: {
        description: 'OLYMPUS demigod registry',
        version: '1.0.0',
        generated_from: 'scan',
        gods: {},
        total: 0,
      },
      demigods: {},
    };
  }
}

/**
 * Determine if a GO strategy is currently active (all demigods pre-loaded
 * in opencode.json). We check the state file first; if missing, we fall
 * back to counting agents in opencode.json (>10 = GO active).
 */
function isGoStrategyActive(): boolean {
  // Check state file
  if (existsSync(ACTIVE_STRATEGY_FILE)) {
    try {
      const state = JSON.parse(readFileSync(ACTIVE_STRATEGY_FILE, 'utf-8'));
      if (state.demigods_loaded === true) return true;
      if (state.demigods_loaded === false) return false;
    } catch {}
  }

  // Fall back to agent count in opencode.json
  if (!existsSync(OPENCODE_JSON)) return false;
  try {
    const cfg = JSON.parse(readFileSync(OPENCODE_JSON, 'utf-8'));
    const agentCount = Object.keys(cfg.agent || {}).length;
    return agentCount > 10;
  } catch {
    return false;
  }
}

/**
 * Inject a demigod into opencode.json (if not already present).
 */
function injectIntoOpencodeJson(name: string, entry: any): boolean {
  if (!existsSync(OPENCODE_JSON)) return false;
  try {
    const cfg = JSON.parse(readFileSync(OPENCODE_JSON, 'utf-8'));
    if (!cfg.agent) cfg.agent = {};
    if (cfg.agent[name]) return false;  // already present

    cfg.agent[name] = {
      mode: entry.mode || 'subagent',
      model: entry.model,
      prompt: entry.prompt,
    };
    writeFileSync(OPENCODE_JSON, JSON.stringify(cfg, null, 2) + '\n', 'utf-8');
    return true;
  } catch {
    return false;
  }
}

/**
 * Touch the reload sentinel so the dispatch tool reloads its registry cache.
 */
function touchReloadSentinel(): void {
  try {
    const dir = join(homedir(), '.olympus');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(
      RELOAD_SENTINEL,
      JSON.stringify({ ts: new Date().toISOString(), source: 'sync-api' }),
      'utf-8',
    );
  } catch {}
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const applyToOpencodeJson = body.applyToOpencodeJson !== false;

    // 1. Scan disk for all demigod prompt files
    const discovered = scanDemigodsOnDisk();

    // 2. Load existing registry
    const registry = loadRegistry();
    if (!registry.demigods) registry.demigods = {};
    if (!registry._meta) registry._meta = {};
    if (!registry._meta.gods) registry._meta.gods = {};

    // 3. Build the new registry from disk, preserving model overrides
    // from the existing registry where present.
    const newDemigods: Record<string, any> = {};
    const godCounts: Record<string, number> = {};

    for (const d of discovered) {
      const existing = registry.demigods[d.name];
      const entry = {
        parent_god: d.parent_god,
        mode: existing?.mode || 'subagent',
        // Preserve the model from the existing registry if present;
        // otherwise use the default. apply-strategy.js will rewrite this
        // with the correct inherited model.
        model: existing?.model || DEFAULT_DEMIGOD_MODEL,
        prompt: `{file:${d.prompt_file}}`,
      };
      newDemigods[d.name] = entry;
      godCounts[d.parent_god] = (godCounts[d.parent_god] || 0) + 1;
    }

    // 4. Compute diffs
    const added: string[] = [];
    const updated: string[] = [];
    const removed: string[] = [];

    for (const [name, entry] of Object.entries(newDemigods)) {
      if (!registry.demigods[name]) {
        added.push(name);
      } else {
        const old = registry.demigods[name];
        if (
          old.parent_god !== entry.parent_god ||
          old.prompt !== entry.prompt ||
          old.model !== entry.model
        ) {
          updated.push(name);
        }
      }
    }

    for (const name of Object.keys(registry.demigods)) {
      if (!newDemigods[name]) {
        removed.push(name);
      }
    }

    // 5. Write the new registry
    registry.demigods = newDemigods;
    registry._meta.total = Object.keys(newDemigods).length;
    registry._meta.gods = godCounts;
    registry._meta.last_synced = new Date().toISOString();
    registry._meta.description = `OLYMPUS demigod registry — ${registry._meta.total} demigods across ${Object.keys(godCounts).length} gods`;

    writeFileSync(DEMIGODS_JSON, JSON.stringify(registry, null, 2) + '\n', 'utf-8');

    // 6. Touch the reload sentinel
    touchReloadSentinel();

    // 7. If GO strategy is active, inject newly-added demigods into opencode.json
    const injectedIntoOpencode: string[] = [];
    if (applyToOpencodeJson && isGoStrategyActive()) {
      for (const name of added) {
        if (injectIntoOpencodeJson(name, newDemigods[name])) {
          injectedIntoOpencode.push(name);
        }
      }
    }

    return NextResponse.json({
      ok: true,
      total: registry._meta.total,
      added,
      updated,
      removed,
      injected_into_opencode: injectedIntoOpencode,
      go_strategy_active: isGoStrategyActive(),
      message: `Synced ${discovered.length} demigods from disk. ${added.length} added, ${updated.length} updated, ${removed.length} removed.${injectedIntoOpencode.length > 0 ? ` ${injectedIntoOpencode.length} injected into opencode.json (GO strategy active).` : ''}`,
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err.message },
      { status: 500 },
    );
  }
}

/**
 * GET /api/olympus/demigods/sync
 *
 * Returns the current demigod registry without modifying it. Useful for
 * the UI to display the demigod fleet.
 */
export async function GET() {
  try {
    if (!existsSync(DEMIGODS_JSON)) {
      return NextResponse.json({
        ok: true,
        total: 0,
        demigods: {},
        message: 'No registry yet. POST to /api/olympus/demigods/sync to scan disk and build the registry.',
      });
    }
    const registry = JSON.parse(readFileSync(DEMIGODS_JSON, 'utf-8'));
    return NextResponse.json({
      ok: true,
      total: registry._meta?.total || Object.keys(registry.demigods || {}).length,
      gods: registry._meta?.gods || {},
      last_synced: registry._meta?.last_synced || null,
      demigods: registry.demigods || {},
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err.message },
      { status: 500 },
    );
  }
}
