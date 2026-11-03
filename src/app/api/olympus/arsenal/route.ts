/**
 * /api/olympus/arsenal — v0.0.32: the whole arsenal, for the talent search.
 *
 * GET → { skills[], mcps[], demigods[] }
 *   skills    .opencode/skills/<dir> (top-level)
 *   mcps      opencode.json mcp keys
 *   demigods  .opencode/prompts/agents/demigods/<god>/<name>.txt
 *
 * 30s cache; the lists are filesystem truth, not a copy.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import { NO_CACHE_HEADERS } from '@/app/api/olympus/_lib/no-cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ROOT = process.cwd();
let cache: { at: number; body: { skills: string[]; mcps: string[]; demigods: string[] } } | null = null;

function listDirs(dir: string): string[] {
  try {
    return fs.readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith('.'))
      .map((d) => d.name)
      .sort();
  } catch { return []; }
}

/** Skills are NESTED (superpowers/writing-plans/SKILL.md, accessibility/...).
 *  The old top-level listing missed 100+ skills, so builds referenced names
 *  the arsenal "did not have". Walk to depth 3 and index the canonical
 *  basename (the name the builds and the skill index use). */
function listSkills(): string[] {
  const base = path.join(ROOT, '.opencode', 'skills');
  const out = new Set<string>();
  const walk = (dir: string, depth: number) => {
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (!e.isDirectory() || e.name.startsWith('.')) continue;
      const full = path.join(dir, e.name);
      try { if (fs.existsSync(path.join(full, 'SKILL.md'))) out.add(e.name); } catch { /* ignore */ }
      if (depth < 3) walk(full, depth + 1);
    }
  };
  walk(base, 0);
  return [...out].sort();
}

function listDemigods(): string[] {
  const base = path.join(ROOT, '.opencode', 'prompts', 'agents', 'demigods');
  const out = new Set<string>();
  try {
    for (const god of fs.readdirSync(base, { withFileTypes: true })) {
      if (!god.isDirectory()) continue;
      for (const f of fs.readdirSync(path.join(base, god.name))) {
        if (f.endsWith('.txt')) out.add(f.replace(/\.txt$/, '').replace(/_/g, '-'));
      }
    }
  } catch { /* absent */ }
  return [...out].sort();
}

export async function GET() {
  if (cache && Date.now() - cache.at < 30_000) {
    return NextResponse.json({ ok: true, ...cache.body }, { headers: NO_CACHE_HEADERS });
  }
  let mcps: string[] = [];
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'opencode.json'), 'utf-8'));
    mcps = Object.keys(cfg?.mcp ?? {}).sort();
  } catch { /* absent */ }
  const body = {
    skills: listSkills(),
    mcps,
    demigods: listDemigods(),
  };
  cache = { at: Date.now(), body };
  return NextResponse.json({ ok: true, ...body }, { headers: NO_CACHE_HEADERS });
}
