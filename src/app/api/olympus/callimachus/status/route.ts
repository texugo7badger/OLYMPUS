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
    } catch { /* never run in this home */ }
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
    };
  }, { ttlMs: 10_000 });
  return NextResponse.json(body, { headers: NO_CACHE_HEADERS });
}
