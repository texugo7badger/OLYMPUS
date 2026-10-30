/**
 * agreement-metric.ts — the classifier's feedback loop (v0.0.26).
 *
 * THE GAP: `scripts/agreement-metric.mjs` existed but ran only when a human
 * invoked it. The classifier — the first decision of every turn — had no
 * automated feedback. This module runs the SAME metric (it shells out to the
 * script's `--json` mode; one implementation, no drift) and persists one row
 * per heartbeat window to `07_Reviews/agreement.jsonl`.
 *
 * Triggered by the Callimachus heartbeat (which fires on session.idle),
 * surfaced by GET /api/olympus/agreement and the Short-Circuit Health panel.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
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

export interface AgreementRow {
  ts: string;
  window_min: number;
  summary: AgreementSummary;
  /** Small recent pair sample for the drill-down (never the whole feed). */
  pairs: Array<{ ts: string; intent: string; executed: string; match: boolean; join: string }>;
}

function repoRoot(): string {
  try {
    return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  } catch {
    return process.cwd();
  }
}

export function agreementLogPath(vaultRoot = getVaultRoot()): string {
  return path.join(vaultRoot, '07_Reviews', 'agreement.jsonl');
}

/** Run the offline metric through its JSON mode (one source of truth). */
export function runAgreementMetric(opts: {
  feedPath?: string;
  windowMin?: number;
  timeoutMs?: number;
} = {}): Promise<{ summary: AgreementSummary; pairs: any[] }> {
  const feed = opts.feedPath ?? path.join(getVaultRoot(), '06_Activity_Feed', 'live.jsonl');
  const script = path.join(repoRoot(), 'scripts', 'agreement-metric.mjs');
  const windowMin = opts.windowMin ?? 60;
  return new Promise((resolve, reject) => {
    execFile('node', [script, feed, '--window-min', String(windowMin), '--json'], {
      encoding: 'utf-8',
      timeout: opts.timeoutMs ?? 20_000,
      maxBuffer: 8 * 1024 * 1024,
    }, (err, stdout, stderr) => {
      if (err) { reject(new Error(String(stderr || err.message || err))); return; }
      try {
        const parsed = JSON.parse(String(stdout));
        if (!parsed?.summary) throw new Error('metric returned no summary');
        resolve({ summary: parsed.summary, pairs: Array.isArray(parsed.pairs) ? parsed.pairs : [] });
      } catch (e: any) {
        reject(new Error(`metric output was not JSON: ${e?.message || e}`));
      }
    });
  });
}

/** Run + persist one row (best-effort; never throws into the heartbeat). */
export async function recordAgreementWindow(opts: {
  vaultRoot?: string;
  feedPath?: string;
  windowMin?: number;
} = {}): Promise<AgreementRow | null> {
  const vaultRoot = opts.vaultRoot ?? getVaultRoot();
  try {
    const { summary, pairs } = await runAgreementMetric(opts);
    const row: AgreementRow = {
      ts: new Date().toISOString(),
      window_min: opts.windowMin ?? 60,
      summary,
      pairs: pairs.slice(-20).map((p) => ({
        ts: String(p.ts ?? ''), intent: String(p.intent ?? ''), executed: String(p.executed ?? ''),
        match: p.match === true, join: String(p.join ?? ''),
      })),
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
