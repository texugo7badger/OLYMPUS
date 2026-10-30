/**
 * agreement-metric.ts — the classifier's feedback loop (v0.0.26).
 *
 * THE GAP: `scripts/agreement-metric.mjs` existed but ran only when a human
 * invoked it. The classifier — the first decision of every turn — had no
 * automated feedback.
 *
 * The computation lives HERE (TypeScript) rather than shelling out to the
 * script: Turbopack statically resolves a spawned script path and fails the
 * build (`Can't resolve '/ROOT/scripts/...'`). The CLI script remains the
 * human reference; this is the runtime copy, pinned by the same fixtures.
 *
 * Join discipline (same as the script):
 *   1. EXACT-ID: dispatch.classification_id === classification.meta.classificationId
 *   2. TS-PROXIMITY: the most recent classification before the dispatch
 *      inside the window (marked `join: 'ts'`).
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import fs from 'node:fs';
import path from 'node:path';
import { getVaultRoot } from './vault-root';

export interface AgreementSummary {
  classifications: number;
  dispatches: number;
  joined_pairs: number;
  id_joined_pairs: number;
  ts_joined_pairs: number;
  matches: number;
  mismatches: number;
  agreement_rate: number | null;
  unjoined_classification: number;
  unjoined_dispatch: number;
}

export interface AgreementPair {
  ts: string;
  intent: string;
  executed: string;
  match: boolean;
  join: 'id' | 'ts';
  classification_id: string | null;
}

export interface AgreementRow {
  ts: string;
  window_min: number;
  summary: AgreementSummary;
  pairs: AgreementPair[];
}

/** The demigod → god map from the repo's prompt tree (unprefixed names). */
function demigodGodMap(demigodDir: string): Map<string, string> {
  const out = new Map<string, string>();
  try {
    for (const god of fs.readdirSync(demigodDir, { withFileTypes: true })) {
      if (!god.isDirectory()) continue;
      for (const f of fs.readdirSync(path.join(demigodDir, god.name))) {
        if (!f.endsWith('.txt')) continue;
        out.set(f.slice(0, -4).replace(/_/g, '-'), god.name);
      }
    }
  } catch { /* unreadable dir */ }
  return out;
}

function readEvents(file: string, maxLines = 50_000): any[] {
  try {
    const lines = fs.readFileSync(file, 'utf-8').split('\n').filter(Boolean);
    const tail = lines.length > maxLines ? lines.slice(-maxLines) : lines;
    return tail.map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  } catch {
    return [];
  }
}

const isClassification = (ev: any) =>
  (ev.action === 'classification' || ev.type === 'classification') &&
  ev.meta && typeof ev.meta.routeTo === 'string' && ev.meta.routeTo.length > 0;

const classificationId = (ev: any): string | null => {
  const id = ev.meta && (ev.meta.classificationId || ev.meta.classification_id);
  return typeof id === 'string' && id ? id : null;
};

const isDispatch = (ev: any) => ev.action === 'dispatch' || ev.action === 'symphony-dispatch';
const dispatchClassificationId = (ev: any): string | null => {
  const id = ev.classification_id ?? ev.classificationId;
  return typeof id === 'string' && id ? id : null;
};

function executedGod(ev: any, map: Map<string, string>): string | null {
  const demigod = typeof ev.demigod === 'string' && ev.demigod ? ev.demigod : null;
  if (demigod && map.has(demigod)) return map.get(demigod) as string;
  return typeof ev.god === 'string' && ev.god ? ev.god : null;
}

/** Pure: compute the metric over an event list. */
export function computeAgreement(events: any[], opts: {
  demigodDir: string;
  windowMin: number;
  now?: number;
}): { summary: AgreementSummary; pairs: AgreementPair[] } {
  const map = demigodGodMap(opts.demigodDir);
  const windowMs = Math.max(1, opts.windowMin) * 60_000;
  const now = opts.now ?? Date.now();
  const classifications = events.filter(isClassification).map((ev) => ({
    ts: Date.parse(ev.ts), routeTo: String(ev.meta.routeTo), id: classificationId(ev), raw: ev,
  })).filter((c) => Number.isFinite(c.ts)).sort((a, b) => a.ts - b.ts);
  const dispatches = events.filter(isDispatch).map((ev) => ({
    ts: Date.parse(ev.ts), executed: executedGod(ev, map), id: dispatchClassificationId(ev), raw: ev,
  })).filter((d) => Number.isFinite(d.ts) && d.executed).sort((a, b) => a.ts - b.ts);

  const byId = new Map(classifications.filter((c) => c.id).map((c) => [c.id as string, c]));
  const usedClass = new Set<any>();
  const usedDispatch = new Set<any>();
  const pairs: AgreementPair[] = [];

  for (const d of dispatches) {
    let cls = d.id ? byId.get(d.id) : undefined;
    let join: 'id' | 'ts' = 'id';
    if (!cls) {
      join = 'ts';
      for (const c of classifications) {
        if (c.ts > d.ts) break;
        if (d.ts - c.ts > windowMs) continue;
        if (!usedClass.has(c)) cls = c;
      }
    }
    if (!cls) continue;
    usedClass.add(cls);
    usedDispatch.add(d);
    pairs.push({
      ts: new Date(d.ts).toISOString(),
      intent: cls.routeTo,
      executed: d.executed as string,
      match: cls.routeTo === d.executed,
      join,
      classification_id: cls.id,
    });
  }

  const matches = pairs.filter((p) => p.match).length;
  const summary: AgreementSummary = {
    classifications: classifications.length,
    dispatches: dispatches.length,
    joined_pairs: pairs.length,
    id_joined_pairs: pairs.filter((p) => p.join === 'id').length,
    ts_joined_pairs: pairs.filter((p) => p.join === 'ts').length,
    matches,
    mismatches: pairs.length - matches,
    agreement_rate: pairs.length ? Math.round((matches / pairs.length) * 1000) / 1000 : null,
    unjoined_classification: classifications.filter((c) => !usedClass.has(c)).length,
    unjoined_dispatch: dispatches.filter((d) => !usedDispatch.has(d)).length,
  };
  return { summary, pairs };
}

export function agreementLogPath(vaultRoot = getVaultRoot()): string {
  return path.join(vaultRoot, '07_Reviews', 'agreement.jsonl');
}

export function runAgreementMetric(opts: {
  feedPath?: string;
  demigodDir?: string;
  windowMin?: number;
} = {}): { summary: AgreementSummary; pairs: AgreementPair[] } {
  const feed = opts.feedPath ?? path.join(getVaultRoot(), '06_Activity_Feed', 'live.jsonl');
  const demigodDir = opts.demigodDir ?? path.join(process.cwd(), '.opencode', 'prompts', 'agents', 'demigods');
  return computeAgreement(readEvents(feed), {
    demigodDir,
    windowMin: opts.windowMin ?? 60,
  });
}

/** Run + persist one row (best-effort; never throws into the heartbeat). */
export function recordAgreementWindow(opts: {
  vaultRoot?: string;
  feedPath?: string;
  demigodDir?: string;
  windowMin?: number;
} = {}): AgreementRow | null {
  const vaultRoot = opts.vaultRoot ?? getVaultRoot();
  try {
    const { summary, pairs } = runAgreementMetric(opts);
    const row: AgreementRow = {
      ts: new Date().toISOString(),
      window_min: opts.windowMin ?? 60,
      summary,
      pairs: pairs.slice(-20),
    };
    const file = agreementLogPath(vaultRoot);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, JSON.stringify(row) + '\n', 'utf-8');
    return row;
  } catch {
    return null;
  }
}

/** The persisted series, newest last, bounded. */
export function readAgreementSeries(opts: { vaultRoot?: string; limit?: number } = {}): AgreementRow[] {
  const file = agreementLogPath(opts.vaultRoot ?? getVaultRoot());
  const limit = Math.max(1, Math.min(opts.limit ?? 200, 1000));
  try {
    const lines = fs.readFileSync(file, 'utf-8').split('\n').filter(Boolean);
    return lines.slice(-limit).map((l) => {
      try { return JSON.parse(l) as AgreementRow; } catch { return null; }
    }).filter(Boolean) as AgreementRow[];
  } catch {
    return [];
  }
}
