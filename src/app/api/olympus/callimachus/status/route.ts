/**
 * GET /api/olympus/callimachus/status — v0.0.98.2: the curator's last run.
 *
 * The brain-health card can say WHEN Callimachus last curated and WHEN the
 * next regular/deep window opens, instead of a static "0 dispatches". Reads
 * only the lockfile mtime + the instinct/knowledge directories; no model.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { requireReadAuth } from '@/lib/auth';
import { NO_CACHE_HEADERS } from '@/app/api/olympus/_lib/no-cache';
import { getVaultRoot } from '@/lib/vault-root';
import { withTtl } from '@/lib/ttl-cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const HOME = () => process.env.OLYMPUS_HOME || path.join(os.homedir(), '.olympus');
const LAST_RUN = () => path.join(HOME(), 'callimachus-last-run.json');

function countMd(dir: string): number {
  try {
    return fs.readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isFile() && e.name.endsWith('.md')).length;
  } catch { return 0; }
}

function instinctCounts(god: string): { seed: number; empirical: number; archived: number; total: number } {
  const base = path.join(getVaultRoot(), '05_Auto_Learning', 'instincts', god);
  const seed = countMd(path.join(base, 'seed'));
  const empirical = countMd(path.join(base, 'empirical'));
  const archived = countMd(path.join(base, '_archive'));
  return { seed, empirical, archived, total: seed + empirical + archived };
}

/** v0.1.1 — the live census the God Intelligence card reads. */
function instinctCensus() {
  const root = path.join(getVaultRoot(), '05_Auto_Learning', 'instincts');
  const out = { quickCircuits: 0, technical: 0, project: 0, total: 0 };
  let gods: fs.Dirent[] = [];
  try { gods = fs.readdirSync(root, { withFileTypes: true }); } catch { return out; }
  for (const god of gods) {
    if (!god.isDirectory()) continue;
    for (const tier of ['seed', 'empirical']) {
      const dir = path.join(root, god.name, tier);
      let files: string[] = [];
      try { files = fs.readdirSync(dir).filter((f) => f.endsWith('.md')); } catch { continue; }
      for (const file of files) {
        let text = '';
        try { text = fs.readFileSync(path.join(dir, file), 'utf-8').slice(0, 2000); } catch { continue; }
        out.total++;
        if (/^quick_circuit:\s*true\s*$/m.test(text) || (/^confidence:\s*0\.8[5-9]/m.test(text) && /^samples:\s*[2-9]/m.test(text))) out.quickCircuits++;
        if (/^kind:\s*project\s*$/m.test(text) || /^scope:\s*project\s*$/m.test(text)) out.project++;
        else out.technical++;
      }
    }
  }
  return out;
}

export async function GET(req: NextRequest) {
  const denied = requireReadAuth(req);
  if (denied) return denied;
  const body = await withTtl('callimachus-status', () => {
    const lock = path.join(HOME(), 'callimachus.lock');
    let lastRunAt: string | null = null;
    let lockAgeMs: number | null = null;
    try {
      const st = fs.statSync(lock);
      lastRunAt = st.mtime.toISOString();
      lockAgeMs = Math.max(0, Date.now() - st.mtimeMs);
    } catch {
      try {
        const last = JSON.parse(fs.readFileSync(LAST_RUN(), 'utf-8'));
        if (typeof last?.at === 'string') lastRunAt = last.at;
      } catch { /* never run in this home */ }
    }
    const last = lastRunAt ? Date.parse(lastRunAt) : null;
    const nextRegularAt = last ? new Date(last + 5 * 60_000).toISOString() : null;
    const nextDeepAt = last ? new Date(last + 24 * 3600_000).toISOString() : null;
    const knowledge = countMd(path.join(getVaultRoot(), '04_Knowledge', 'references', 'vault'))
      + countMd(path.join(getVaultRoot(), '04_Knowledge', 'references', 'brain'));
    return {
      ok: true,
      lastRunAt,
      lockAgeMs,
      nextRegularAt,
      nextDeepAt,
      regularCooldownMs: 5 * 60_000,
      deepCooldownMs: 24 * 3600_000,
      instincts: instinctCounts('callimachus'),
      knowledgeDocs: knowledge,
      active: lockAgeMs != null && lockAgeMs < 5 * 60_000,
      census: instinctCensus(),
    };
  }, { ttlMs: 10_000 });
  return NextResponse.json(body, { headers: NO_CACHE_HEADERS });
}
