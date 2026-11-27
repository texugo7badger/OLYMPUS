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
import {
  censusInstincts,
  listQuickCircuits,
  readCurationState,
  readBudgetState,
  CURATION_INTERVAL_MS,
} from '@/lib/callimachus-loop';

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

/* The census lives in callimachus-loop.ts so every surface reads the SAME
 * definition: a quick circuit is `quick_circuit: true`, never a confidence
 * heuristic (v0.1.2 removed the 33 synthetic "quick circuits"). */

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
    const curation = readCurationState();
    const budget = readBudgetState();
    const anchor = curation?.at ?? lastRunAt;
    const last = anchor ? Date.parse(anchor) : null;
    const nextRegularAt = last ? new Date(last + CURATION_INTERVAL_MS).toISOString() : null;
    const nextDeepAt = last ? new Date(last + 24 * 3600_000).toISOString() : null;
    const knowledge = countMd(path.join(getVaultRoot(), '04_Knowledge', 'references', 'vault'))
      + countMd(path.join(getVaultRoot(), '04_Knowledge', 'references', 'brain'));
    return {
      ok: true,
      lastRunAt,
      lastCurationAt: curation?.at ?? null,
      lockAgeMs,
      nextRegularAt,
      nextDeepAt,
      regularCooldownMs: CURATION_INTERVAL_MS,
      deepCooldownMs: 24 * 3600_000,
      cadenceMs: CURATION_INTERVAL_MS,
      instincts: instinctCounts('callimachus'),
      knowledgeDocs: knowledge,
      active: lockAgeMs != null && lockAgeMs < 5 * 60_000,
      census: censusInstincts(),
      quickCircuitList: listQuickCircuits(8),
      curation: curation?.result ?? null,
      recalibration: curation?.recalibration ?? null,
      budget,
      loop: {
        enabled: process.env.OLYMPUS_CALLIMACHUS_LOOP !== '0',
        deterministicEveryMs: CURATION_INTERVAL_MS,
        modelMaxPerHour: budget.maxPerHour,
        modelTokenTarget: budget.tokenTarget,
        modelPassesLastHour: budget.modelPasses.length,
        nextModelAt: budget.nextModelPassAt,
      },
    };
  }, { ttlMs: 10_000 });
  return NextResponse.json(body, { headers: NO_CACHE_HEADERS });
}
