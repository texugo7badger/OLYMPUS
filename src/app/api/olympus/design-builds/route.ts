/**
 * /api/olympus/design-builds — v0.0.32 (Epic P seed): the build registry.
 *
 * GET  → the seed builds + user builds, joined with the arsenal-resonance
 *        outcomes (tier/samples/rate/lastUsed).
 * POST → create a user build (never overwritten by seeds).
 *
 * Files: ~/.olympus/design-builds.json (user), the vault's
 * 03_Index/arsenal-resonance.jsonl (evidence).
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { NextResponse, NextRequest } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  SEED_DESIGN_BUILDS,
  getMatrixBuilds,
  mergeBuildStats,
  normalizeUserBuild,
  type DesignBuild,
  type ResonanceRow,
} from '@/lib/design-builds';
import { NO_CACHE_HEADERS } from '@/app/api/olympus/_lib/no-cache';
import { getMcpEnvVarKeys } from '@/lib/mcp-api-requirements';
import { loadIntegrationEnv } from '@/lib/integration-env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function home(): string {
  return process.env.OLYMPUS_HOME || path.join(os.homedir(), '.olympus');
}

function vaultRoot(): string {
  return process.env.OLYMPUS_VAULT || path.join(os.homedir(), 'OLYMPUS-VAULT');
}

function userBuildsPath(): string {
  return path.join(home(), 'design-builds.json');
}

function readUserBuilds(): DesignBuild[] {
  try {
    const raw = JSON.parse(fs.readFileSync(userBuildsPath(), 'utf-8'));
    const list = Array.isArray(raw) ? raw : Array.isArray(raw?.builds) ? raw.builds : [];
    return list.filter((b: any) => b && typeof b.id === 'string' && typeof b.god === 'string');
  } catch {
    return [];
  }
}

function readResonance(limit = 5000): ResonanceRow[] {
  try {
    const file = path.join(vaultRoot(), '03_Index', 'arsenal-resonance.jsonl');
    const lines = fs.readFileSync(file, 'utf-8').trim().split('\n').slice(-limit);
    const rows: ResonanceRow[] = [];
    for (const line of lines) {
      try { rows.push(JSON.parse(line)); } catch { /* torn line */ }
    }
    return rows;
  } catch {
    return [];
  }
}

export async function GET(req: NextRequest) {
  const user = readUserBuilds();
  const seeds = SEED_DESIGN_BUILDS.filter((s) => !user.some((u) => u.id === s.id));
  // v0.0.86 (H5) — the 200 `mx-*` matrix entries are ON DEMAND only:
  // `?matrix=1`. The default hub is the curated shelf (48 builds today).
  const matrix = req.nextUrl.searchParams.get('matrix') === '1' ? getMatrixBuilds() : [];
  const builds = mergeBuildStats([...seeds, ...user, ...matrix], readResonance());
  builds.sort((a, b) => {
    const order = { hot: 0, warm: 1, cold: 2 };
    return order[a.stats.tier] - order[b.stats.tier] || a.name.localeCompare(b.name);
  });
  // v0.0.86 (H4) — the honest optional-key badge: an MCP that needs a key
  // which is not set is present-but-locked, not silently ready.
  const env = loadIntegrationEnv();
  const withKeys = builds.map((b) => {
    const needsKeys = b.mcps.flatMap((mcp) =>
      getMcpEnvVarKeys(mcp)
        .filter((key) => !env[key])
        .map((key) => ({ mcp, key })));
    return needsKeys.length ? { ...b, needsKeys } : b;
  });
  return NextResponse.json({
    ok: true,
    builds: withKeys,
    resonanceRows: readResonance().length,
    matrix: matrix.length,
    curated: seeds.length + user.length,
  }, { headers: NO_CACHE_HEADERS });
}

export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ ok: false, error: 'invalid JSON' }, { status: 400 });
  }
  const build = normalizeUserBuild(body?.build ?? body);
  if (!build) {
    return NextResponse.json({ ok: false, error: 'name and god are required' }, { status: 400 });
  }
  const builds = readUserBuilds();
  builds.push(build);
  try {
    fs.mkdirSync(path.dirname(userBuildsPath()), { recursive: true });
    fs.writeFileSync(userBuildsPath(), JSON.stringify({ version: 1, builds }, null, 2) + '\n', 'utf-8');
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
  return NextResponse.json({ ok: true, build }, { headers: NO_CACHE_HEADERS });
}
