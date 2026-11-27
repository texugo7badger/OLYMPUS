/**
 * resonance-index.ts — v0.1.4: the Symphony Resonance Index.
 *
 * The arsenal-resonance log is append-only and grew to thousands of rows. The
 * resolver scanned it on every dispatch and averaged per-arsenal confidence,
 * which is why the "quick-circuit" layer never fired: the average of several
 * 0.4-confidence suggestions can never reach 0.85, no matter how proven the
 * task class is.
 *
 * This index pre-aggregates (god, task signature) into one row with an
 * outcome-driven coherence:
 *
 *   coherence = (successes + 1) / (samples + 2)   // Laplace, never a lucky 1/1
 *   quick     = samples >= 3 && coherence >= 0.85
 *
 * A query compares the incoming signature against the indexed signatures with
 * Jaccard similarity (>= 0.4), then returns the best match's proven arsenal.
 * The index is machine-local (~/.olympus/resonance.db); the vault log remains
 * the source of truth and a full rebuild is deterministic.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { getVaultRoot } from '../vault-root.js';
import { normalizeOutcome } from '../learning/outcome.js';
import { computeTaskSignature, signatureTokens, signatureSimilarity, isUsefulSignature, isFixtureSignature } from './resonance-signature.js';

export interface ResonanceArsenal {
  skills: Record<string, { successes: number; total: number }>;
  mcps: Record<string, { successes: number; total: number }>;
  demigods: Record<string, { successes: number; total: number }>;
}

export interface ResonanceMatch {
  signature: string;
  similarity: number;
  samples: number;
  successes: number;
  failures: number;
  coherence: number;
  quickCircuit: boolean;
  lastTs: string | null;
  suggestedSkills: Array<{ skill: string; confidence: number; samples: number }>;
  suggestedMcps: Array<{ mcp: string; confidence: number; samples: number }>;
  suggestedDemigods: Array<{ demigod: string; confidence: number; samples: number }>;
}

export interface ResonanceBackfillResult {
  rows: number;
  signatures: number;
  quickCircuits: number;
  seconds: number;
  dbPath: string;
}

const HOME = () => process.env.OLYMPUS_HOME || path.join(os.homedir(), '.olympus');
export const RESONANCE_DB = () => process.env.OLYMPUS_RESONANCE_DB || path.join(HOME(), 'resonance.db');
const ARSENAL_LOG = () => path.join(getVaultRoot(), '03_Index', 'arsenal-resonance.jsonl');
const MIN_SAMPLES = 3;
const QUICK_THRESHOLD = 0.85;
const MATCH_THRESHOLD = 0.4;

interface StoredRow {
  god: string;
  signature: string;
  tokens: string;
  samples: number;
  successes: number;
  failures: number;
  coherence: number;
  quick_circuit: number;
  arsenal: string;
  last_ts: string | null;
}

function coherence(successes: number, failures: number): number {
  const samples = successes + failures;
  if (samples === 0) return 0;
  return Math.round(((successes + 1) / (samples + 2)) * 1000) / 1000;
}

function emptyArsenal(): ResonanceArsenal {
  return { skills: {}, mcps: {}, demigods: {} };
}

function bump(map: Record<string, { successes: number; total: number }>, name: string, success: boolean): void {
  const row = map[name] || { successes: 0, total: 0 };
  row.total += 1;
  if (success) row.successes += 1;
  map[name] = row;
}

export function openResonanceStore(dbPath = RESONANCE_DB()): Database.Database {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS resonance_signatures (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      god TEXT NOT NULL,
      signature TEXT NOT NULL,
      tokens TEXT NOT NULL,
      samples INTEGER NOT NULL DEFAULT 0,
      successes INTEGER NOT NULL DEFAULT 0,
      failures INTEGER NOT NULL DEFAULT 0,
      coherence REAL NOT NULL DEFAULT 0,
      quick_circuit INTEGER NOT NULL DEFAULT 0,
      arsenal TEXT NOT NULL DEFAULT '{}',
      last_ts TEXT,
      UNIQUE(god, signature)
    );
    CREATE INDEX IF NOT EXISTS resonance_god ON resonance_signatures(god);
    CREATE INDEX IF NOT EXISTS resonance_quick ON resonance_signatures(quick_circuit);
    CREATE TABLE IF NOT EXISTS resonance_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  `);
  return db;
}

function readLogRows(): Array<Record<string, unknown>> {
  const file = ARSENAL_LOG();
  if (!fs.existsSync(file)) return [];
  const rows: Array<Record<string, unknown>> = [];
  let content = '';
  try { content = fs.readFileSync(file, 'utf-8'); } catch { return []; }
  for (const line of content.split('\n')) {
    if (!line.trim()) continue;
    try { rows.push(JSON.parse(line)); } catch { /* skip a torn line */ }
  }
  return rows;
}

/**
 * Rebuild the whole index from the vault log. Deterministic, idempotent and
 * safe to call when the DB is missing. The log is the source of truth.
 */
export function backfillResonanceIndex(): ResonanceBackfillResult {
  const t0 = Date.now();
  const rows = readLogRows();
  const groups = new Map<string, {
    god: string;
    signature: string;
    successes: number;
    failures: number;
    lastTs: string | null;
    arsenal: ResonanceArsenal;
  }>();

  for (const raw of rows) {
    const god = String(raw.god || '').trim().toLowerCase();
    const signature = computeTaskSignature(String(raw.task_signature || raw.task || ''));
    if (!god || !signature || !isUsefulSignature(signature)) continue;
    const outcome = normalizeOutcome(raw.outcome, {
      contractViolation: raw.contract_violation === true,
      hadError: Boolean(raw.error),
    }).outcome;
    if (outcome === 'unknown') continue; // unknown is not evidence
    const key = `${god}\u0000${signature}`;
    let group = groups.get(key);
    if (!group) {
      group = { god, signature, successes: 0, failures: 0, lastTs: null, arsenal: emptyArsenal() };
      groups.set(key, group);
    }
    const success = outcome === 'success';
    if (success) group.successes += 1;
    else group.failures += 1;
    const ts = typeof raw.ts === 'string' ? raw.ts : null;
    if (ts && (!group.lastTs || ts > group.lastTs)) group.lastTs = ts;
    if (raw.skill) bump(group.arsenal.skills, String(raw.skill), success);
    if (raw.mcp) bump(group.arsenal.mcps, String(raw.mcp), success);
    if (raw.demigod) bump(group.arsenal.demigods, String(raw.demigod), success);
  }

  const db = openResonanceStore();
  try {
    const insert = db.prepare(`
      INSERT INTO resonance_signatures
        (god, signature, tokens, samples, successes, failures, coherence, quick_circuit, arsenal, last_ts)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const tx = db.transaction(() => {
      db.exec('DELETE FROM resonance_signatures');
      for (const group of groups.values()) {
        const samples = group.successes + group.failures;
        const score = coherence(group.successes, group.failures);
        insert.run(
          group.god,
          group.signature,
          [...signatureTokens(group.signature)].sort().join(' '),
          samples,
          group.successes,
          group.failures,
          score,
          samples >= MIN_SAMPLES && score >= QUICK_THRESHOLD && !isFixtureSignature(group.signature) ? 1 : 0,
          JSON.stringify(group.arsenal),
          group.lastTs,
        );
      }
      db.prepare('INSERT OR REPLACE INTO resonance_meta (key, value) VALUES (?, ?)')
        .run('lastIndexedAt', new Date().toISOString());
      db.prepare('INSERT OR REPLACE INTO resonance_meta (key, value) VALUES (?, ?)')
        .run('sourceRows', String(rows.length));
    });
    tx();
    const signatures = (db.prepare('SELECT COUNT(*) AS n FROM resonance_signatures').get() as { n: number }).n;
    const quick = (db.prepare('SELECT COUNT(*) AS n FROM resonance_signatures WHERE quick_circuit = 1').get() as { n: number }).n;
    return {
      rows: rows.length,
      signatures,
      quickCircuits: quick,
      seconds: Math.round(((Date.now() - t0) / 1000) * 10) / 10,
      dbPath: RESONANCE_DB(),
    };
  } finally {
    db.close();
  }
}

function toSuggestions(map: Record<string, { successes: number; total: number }>, key: 'skill' | 'mcp' | 'demigod') {
  return Object.entries(map)
    .filter(([, v]) => v.total >= MIN_SAMPLES)
    .map(([name, v]) => ({ name, confidence: Math.round((v.successes / v.total) * 1000) / 1000, samples: v.total }))
    .sort((a, b) => b.confidence - a.confidence || b.samples - a.samples)
    .slice(0, 5)
    .map((r) => key === 'skill' ? { skill: r.name, confidence: r.confidence, samples: r.samples }
      : key === 'mcp' ? { mcp: r.name, confidence: r.confidence, samples: r.samples }
        : { demigod: r.name, confidence: r.confidence, samples: r.samples });
}

/**
 * Query the index. Returns null when the DB is absent/empty (the caller keeps
 * its log-scan fallback), and a match only when Jaccard >= 0.4.
 */
export function queryResonance(opts: { task: string; god: string }): ResonanceMatch | null {
  const dbPath = RESONANCE_DB();
  if (!fs.existsSync(dbPath)) return null;
  const taskSignature = computeTaskSignature(opts.task);
  const taskTokens = signatureTokens(taskSignature);
  if (taskTokens.size === 0) return null;

  const db = openResonanceStore(dbPath);
  try {
    const total = (db.prepare('SELECT COUNT(*) AS n FROM resonance_signatures').get() as { n: number }).n;
    if (total === 0) return null;
    const rows = db.prepare(`
      SELECT god, signature, tokens, samples, successes, failures, coherence, quick_circuit, arsenal, last_ts
      FROM resonance_signatures
      WHERE god = ? OR god = 'all'
    `).all(opts.god) as StoredRow[];
    if (rows.length === 0) return null;

    let best: { row: StoredRow; similarity: number } | null = null;
    for (const row of rows) {
      const sim = signatureSimilarity(taskTokens, new Set(row.tokens.split(' ').filter(Boolean)));
      if (sim < MATCH_THRESHOLD) continue;
      if (!best || sim > best.similarity || (sim === best.similarity && row.samples > best.row.samples)) {
        best = { row, similarity: sim };
      }
    }
    if (!best) return null;

    let arsenal: ResonanceArsenal = emptyArsenal();
    try { arsenal = JSON.parse(best.row.arsenal) as ResonanceArsenal; } catch { /* keep empty */ }
    const quickCircuit = best.row.samples >= MIN_SAMPLES
      && best.row.coherence >= QUICK_THRESHOLD
      && !isFixtureSignature(best.row.signature);

    return {
      signature: best.row.signature,
      similarity: Math.round(best.similarity * 1000) / 1000,
      samples: best.row.samples,
      successes: best.row.successes,
      failures: best.row.failures,
      coherence: best.row.coherence,
      quickCircuit,
      lastTs: best.row.last_ts,
      suggestedSkills: toSuggestions(arsenal.skills || {}, 'skill') as ResonanceMatch['suggestedSkills'],
      suggestedMcps: toSuggestions(arsenal.mcps || {}, 'mcp') as ResonanceMatch['suggestedMcps'],
      suggestedDemigods: toSuggestions(arsenal.demigods || {}, 'demigod') as ResonanceMatch['suggestedDemigods'],
    };
  } catch {
    return null;
  } finally {
    db.close();
  }
}

export interface ResonanceSignatureRow {
  god: string;
  signature: string;
  samples: number;
  successes: number;
  failures: number;
  coherence: number;
  quickCircuit: boolean;
  lastTs: string | null;
}

/** The dashboard's read side: the most-sampled signatures, quick first. */
export function listResonanceSignatures(limit = 20): ResonanceSignatureRow[] {
  const dbPath = RESONANCE_DB();
  if (!fs.existsSync(dbPath)) return [];
  const db = openResonanceStore(dbPath);
  try {
    const rows = db.prepare(`
      SELECT god, signature, samples, successes, failures, coherence, quick_circuit, last_ts
      FROM resonance_signatures
      ORDER BY quick_circuit DESC, samples DESC, coherence DESC
      LIMIT ?
    `).all(Math.max(1, Math.min(100, limit))) as StoredRow[];
    return rows.map((r) => ({
      god: r.god,
      signature: r.signature,
      samples: r.samples,
      successes: r.successes,
      failures: r.failures,
      coherence: r.coherence,
      quickCircuit: r.quick_circuit === 1,
      lastTs: r.last_ts,
    }));
  } catch {
    return [];
  } finally {
    db.close();
  }
}

export function resonanceStats() {
  const dbPath = RESONANCE_DB();
  if (!fs.existsSync(dbPath)) {
    return { ready: false, dbPath, signatures: 0, quickCircuits: 0, lastIndexedAt: null };
  }
  const db = openResonanceStore(dbPath);
  try {
    const signatures = (db.prepare('SELECT COUNT(*) AS n FROM resonance_signatures').get() as { n: number }).n;
    const quick = (db.prepare('SELECT COUNT(*) AS n FROM resonance_signatures WHERE quick_circuit = 1').get() as { n: number }).n;
    const last = (db.prepare("SELECT value FROM resonance_meta WHERE key = 'lastIndexedAt'").get() as { value?: string } | undefined)?.value ?? null;
    return { ready: signatures > 0, dbPath, signatures, quickCircuits: quick, lastIndexedAt: last };
  } finally {
    db.close();
  }
}
