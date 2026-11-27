/**
 * learning/recalibrate.ts — v0.1.3: fold real dispatch outcomes into instincts.
 *
 * The ECC contract says confidence is outcome-driven. The old loop only read
 * `instinct_id` events in Callimachus's prose; no deterministic writer used
 * them. This module consumes dispatch_outcome events since a checkpoint,
 * updates successes/failures/samples, and recomputes the ECC confidence.
 *
 * It is idempotent per event timestamp (checkpoint file), never touches seed
 * instincts, and never deletes anything.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getVaultRoot } from '../vault-root';
import { normalizeOutcome } from './outcome';
import { computeInstinctConfidence } from './confidence';

const HOME = () => process.env.OLYMPUS_HOME || path.join(os.homedir(), '.olympus');
const CHECKPOINT = () => path.join(HOME(), 'instinct-recalibrate-state.json');

function readJson<T>(file: string): T | null {
  try { return JSON.parse(fs.readFileSync(file, 'utf-8')) as T; } catch { return null; }
}

function field(text: string, key: string): string {
  const m = new RegExp(`^${key}:\\s*(.*)$`, 'm').exec(text);
  return m ? m[1].trim().replace(/^["']|["']$/g, '') : '';
}

function setField(text: string, key: string, value: string): string {
  if (new RegExp(`^${key}:\\s*.*$`, 'm').test(text)) return text.replace(new RegExp(`^${key}:\\s*.*$`, 'm'), `${key}: ${value}`);
  return text.replace('\n---\n', `\n${key}: ${value}\n---\n`);
}

function findInstinct(god: string, id: string): string | null {
  const dir = path.join(getVaultRoot(), '05_Auto_Learning', 'instincts', god, 'empirical');
  const direct = path.join(dir, `${id}.md`);
  if (fs.existsSync(direct)) return direct;
  try {
    for (const f of fs.readdirSync(dir)) {
      if (f.endsWith('.md') && f.replace(/\.md$/, '') === id) return path.join(dir, f);
    }
  } catch { /* no pool */ }
  return null;
}

export interface RecalibrateResult {
  fromTs: string | null;
  toTs: string | null;
  events: number;
  updated: number;
  skipped: number;
}

export function recalibrateFromOutcomes(opts: { maxEvents?: number } = {}): RecalibrateResult {
  const state = readJson<{ lastTs?: string }>(CHECKPOINT());
  const fromTs = state?.lastTs ?? null;
  const feed = path.join(getVaultRoot(), '06_Activity_Feed', 'live.jsonl');
  if (!fs.existsSync(feed)) return { fromTs, toTs: fromTs, events: 0, updated: 0, skipped: 0 };

  let lines: string[] = [];
  try { lines = fs.readFileSync(feed, 'utf-8').split('\n').filter(Boolean).slice(-(opts.maxEvents ?? 50_000)); } catch { return { fromTs, toTs: fromTs, events: 0, updated: 0, skipped: 0 }; }
  const events = lines.map((line) => { try { return JSON.parse(line); } catch { return null; } })
    .filter((e) => e && e.ts && (!fromTs || String(e.ts) > fromTs))
    .sort((a, b) => String(a.ts).localeCompare(String(b.ts)));

  let updated = 0;
  let skipped = 0;
  let toTs = fromTs;
  for (const ev of events) {
    toTs = String(ev.ts || toTs || '');
    if (ev.action !== 'dispatch_outcome' && ev.action !== 'hop_outcome') continue;
    const instinctId = String(ev.instinct_id || ev.instinctId || '').trim();
    const god = String(ev.god || ev.parent_god || '').trim().toLowerCase();
    if (!instinctId || !god) { skipped++; continue; }
    const file = findInstinct(god, instinctId);
    if (!file) { skipped++; continue; }
    try {
      let text = fs.readFileSync(file, 'utf-8');
      if (field(text, 'source') === 'seed' || field(text, 'immutable') === 'true') { skipped++; continue; }
      const outcome = normalizeOutcome(ev.outcome ?? ev.status, {
        contractViolation: ev.contract_violation === true,
        hadError: Boolean(ev.error),
      }).outcome;
      if (outcome === 'unknown') { skipped++; continue; }
      const successes = Number(field(text, 'successes') || 0) + (outcome === 'success' ? 1 : 0);
      const failures = Number(field(text, 'failures') || 0) + (outcome === 'failure' ? 1 : 0);
      const counts = computeInstinctConfidence({ successes, failures });
      text = setField(text, 'successes', String(successes));
      text = setField(text, 'failures', String(failures));
      text = setField(text, 'samples', String(counts.samples));
      text = setField(text, 'confidence', counts.confidence.toFixed(3));
      text = setField(text, 'last_used', JSON.stringify(ev.ts));
      fs.writeFileSync(file, text, 'utf-8');
      updated++;
    } catch {
      skipped++;
    }
  }

  try {
    fs.mkdirSync(path.dirname(CHECKPOINT()), { recursive: true });
    fs.writeFileSync(CHECKPOINT(), JSON.stringify({ lastTs: toTs, updatedAt: new Date().toISOString() }, null, 2) + '\n', { mode: 0o600 });
  } catch { /* checkpoint is best-effort */ }
  return { fromTs, toTs, events: events.length, updated, skipped };
}
