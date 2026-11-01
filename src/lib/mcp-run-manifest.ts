/**
 * mcp-run-manifest.ts — v0.0.30 (#B3).
 *
 * THE SPECIMEN (AIME, 2026-10-31): the lane spawned 16 MCP servers / 107
 * tools for every hop, including tamp/serena/opendesign/postgres/docker,
 * while the plan declared only four (chrome-devtools, context7, nakkas,
 * playwright). The unused fleet burned startup time and tool-schema tokens;
 * the broken ones poisoned the run log.
 *
 * A campaign manifest is the union of the plan's declared MCPs plus the
 * curated baseline. The lane's opencode.json is filtered to exactly that
 * set; everything else stays installed but disabled. The warm server reads
 * one small, healthy arsenal per lane.
 *
 * The manifest is scoped to a lane root and re-applied after every
 * ensureLaneConfig refresh (the refresh copies the root config over the
 * lane; without the re-apply the manifest would be wiped before each hop).
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/** The curated baseline every lane keeps (44 tools at the time of v0.0.30). */
export const BASELINE_MCPS = [
  'filesystem',
  'memory',
  'context7',
  'sequential-thinking',
  'olympus-craft',
] as const;

/**
 * Servers whose command is known-broken at v0.0.30. They stay installed but
 * are never enabled by a manifest until their definition is repaired:
 *   - tamp: the npm package has no executable ("could not determine
 *     executable to run");
 *   - serena: the mcp-compressor wrapper closes the initialize response.
 */
export const KNOWN_BROKEN_MCPS = new Set(['tamp', 'serena']);

/** The per-lane manifest (campaign-scoped). */
const manifests = new Map<string, string[]>();

export function setRunMcpManifest(laneRoot: string, manifest: string[]): void {
  manifests.set(path.resolve(laneRoot), [...new Set(manifest.map(String))]);
}

export function getRunMcpManifest(laneRoot: string): string[] | null {
  return manifests.get(path.resolve(laneRoot)) ?? null;
}

export function clearRunMcpManifest(laneRoot: string): void {
  manifests.delete(path.resolve(laneRoot));
}

/**
 * Build the manifest from a validated plan. The plan's `hop.mcp` is the
 * strongest signal; the baseline is always present; `git` is added only
 * when the lane is a git repository (the AIME lane is not — its 12 git
 * tools failed on every run).
 */
export function buildRunMcpManifest(
  plan: { hops?: Array<{ mcp?: string | null }> },
  laneRoot?: string,
): string[] {
  const out: string[] = [];
  const add = (name: string | null | undefined) => {
    const n = typeof name === 'string' ? name.trim() : '';
    if (!n || KNOWN_BROKEN_MCPS.has(n) || out.includes(n)) return;
    out.push(n);
  };
  for (const name of BASELINE_MCPS) add(name);
  for (const hop of plan?.hops ?? []) add(hop?.mcp ?? null);
  if (laneRoot && existsSync(path.join(laneRoot, '.git'))) add('git');
  return out;
}

/**
 * Apply a manifest to a parsed opencode.json object. Only entries that
 * already exist are toggled (the manifest never invents a server). Returns
 * the names actually enabled + the number of flags that changed.
 */
export function applyRunManifestToConfig(
  config: any,
  manifest: string[],
): { enabled: string[]; changed: number } {
  const mcp = config?.mcp;
  if (!mcp || typeof mcp !== 'object') return { enabled: [], changed: 0 };
  const want = new Set(manifest.map(String));
  let changed = 0;
  const enabled: string[] = [];
  for (const [name, entry] of Object.entries<any>(mcp)) {
    if (!entry || typeof entry !== 'object') continue;
    const next = want.has(name);
    if (next) enabled.push(name);
    if (Boolean(entry.enabled) !== next) {
      entry.enabled = next;
      changed++;
    }
  }
  return { enabled, changed };
}

/** Apply the manifest to the lane's opencode.json. Write only on change. */
export function applyRunManifestFile(
  laneRoot: string,
  manifest: string[],
): { ok: boolean; enabled: string[]; changed: number; error?: string } {
  const file = path.join(laneRoot, 'opencode.json');
  try {
    if (!existsSync(file)) return { ok: false, enabled: [], changed: 0, error: 'lane opencode.json is absent' };
    const config = JSON.parse(readFileSync(file, 'utf-8'));
    const result = applyRunManifestToConfig(config, manifest);
    if (result.changed > 0) {
      writeFileSync(file, JSON.stringify(config, null, 2) + '\n', 'utf-8');
    }
    return { ok: true, ...result };
  } catch (e: any) {
    return { ok: false, enabled: [], changed: 0, error: e?.message || String(e) };
  }
}
