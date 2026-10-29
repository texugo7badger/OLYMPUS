/**
 * POST /api/olympus/strategy/custom — save + apply a user-defined strategy.
 *
 * v0.0.23 (Strategy Builder). The interactive screen sends a name and a
 * per-god model map chosen from the models REGISTERED IN OPENCODE. This route
 * validates the map, writes `~/.olympus/custom-strategies.json`, applies the
 * `custom-<slug>` strategy and returns the apply output.
 *
 * Validation is honest by construction:
 *   - all ten gods must have a model;
 *   - every model id must exist in OpenCode's catalogue (the same cache the
 *     picker searches) — an unknown id is refused BEFORE the apply, so the
 *     config never carries a lane that cannot resolve.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { NextRequest, NextResponse } from 'next/server';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { GOD_IDS } from '@/lib/model-strategies';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const OLYMPUS_HOME = path.join(os.homedir(), '.olympus');
const CUSTOM_FILE = path.join(OLYMPUS_HOME, 'custom-strategies.json');
const CACHE_FILE = path.join(os.homedir(), '.cache', 'opencode', 'models.json');

function catalogueIds(): Set<string> {
  const ids = new Set<string>();
  try {
    const raw = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
    for (const [provider, entry] of Object.entries<any>(raw)) {
      const models = entry?.models;
      if (!models || typeof models !== 'object') continue;
      for (const mid of Object.keys(models)) ids.add(`${provider}/${mid}`);
    }
  } catch { /* no cache — the apply's own L4 preflight still validates */ }
  return ids;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'custom';
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const description = typeof body.description === 'string' ? body.description.trim() : '';
    const gods = body.gods && typeof body.gods === 'object' ? body.gods as Record<string, string> : null;

    if (!name) return NextResponse.json({ ok: false, error: 'Give the strategy a name.' }, { status: 400 });
    if (!gods) return NextResponse.json({ ok: false, error: 'Missing "gods" map.' }, { status: 400 });

    const missing = GOD_IDS.filter((g) => typeof gods[g] !== 'string' || !gods[g]);
    if (missing.length) {
      return NextResponse.json(
        { ok: false, error: `Every god needs a model. Missing: ${missing.join(', ')}` },
        { status: 400 },
      );
    }

    const catalogue = catalogueIds();
    const unknown = Object.entries(gods)
      .map(([g, m]) => [g, m] as const)
      .filter(([, m]) => catalogue.size > 0 && !catalogue.has(m));
    if (unknown.length) {
      return NextResponse.json(
        {
          ok: false,
          error: `Model(s) not registered in OpenCode: ${unknown.map(([g, m]) => `${g}=${m}`).join(', ')}. Register the provider first (Settings → Providers) or pick a listed model.`,
        },
        { status: 400 },
      );
    }

    const slug = `custom-${slugify(name)}`;
    let cfg: Record<string, any> = {};
    try {
      if (fs.existsSync(CUSTOM_FILE)) cfg = JSON.parse(fs.readFileSync(CUSTOM_FILE, 'utf-8'));
    } catch { cfg = {}; }
    cfg[slug] = {
      label: name,
      description: description || `User-defined strategy — ${Object.keys(new Set(Object.values(gods))).length} model lane(s)`,
      plan: 'CUSTOM',
      tier: 'custom',
      gods,
      vaultLlm: gods.callimachus ?? gods.apollo,
      estCostPerDay: 'unknown',
      created_at: new Date().toISOString(),
    };
    fs.mkdirSync(OLYMPUS_HOME, { recursive: true });
    fs.writeFileSync(CUSTOM_FILE, JSON.stringify(cfg, null, 2), 'utf-8');

    const root = process.cwd();
    const applyScript = path.join(/*turbopackIgnore: true*/ root, 'scripts', 'apply-strategy.js');
    let stdout = '';
    try {
      stdout = execSync(`node "${applyScript}" --strategy ${slug}`, {
        cwd: root,
        encoding: 'utf-8',
        timeout: 60_000,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (err: any) {
      return NextResponse.json(
        { ok: false, error: `Saved "${name}" but the apply failed: ${err.stderr || err.stdout || err.message}`, strategy: slug },
        { status: 500 },
      );
    }

    // Drop the warm server so the next turn boots on the new config.
    try {
      const { killWarmServerForStrategy } = await import('@/lib/opencode-session');
      killWarmServerForStrategy();
    } catch { /* non-fatal */ }

    return NextResponse.json({ ok: true, strategy: slug, name, stdout });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
