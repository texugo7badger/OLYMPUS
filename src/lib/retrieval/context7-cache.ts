/**
 * retrieval/context7-cache.ts — v0.1.3: make Context7 docs durable.
 *
 * Context7 answers are ephemeral by default: the turn ends and the library
 * docs vanish. This module captures the result of a context7 tool call into
 * an append-only local cache, then the indexer turns it into a cited `doc`
 * with a TTL. Stale docs are still retrievable only when explicitly asked.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import type { RetrievalDocument } from './types.js';

const HOME = () => process.env.OLYMPUS_HOME || path.join(os.homedir(), '.olympus');
const CACHE = () => path.join(HOME(), 'context7-cache.jsonl');
const TTL_MS = Math.max(1, Number(process.env.OLYMPUS_CONTEXT7_TTL_DAYS) || 30) * 86_400_000;

export interface Context7CacheEntry {
  ts: string;
  libraryId: string;
  query: string;
  answer: string;
  source: string;
  hash: string;
  expiresAt: string;
}

function textOf(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value == null) return '';
  try { return JSON.stringify(value); } catch { return String(value); }
}

function extractAnswer(output: unknown): string {
  if (!output || typeof output !== 'object') return textOf(output);
  const obj = output as Record<string, unknown>;
  for (const key of ['output', 'content', 'text', 'result', 'answer', 'data']) {
    const value = obj[key];
    if (typeof value === 'string' && value.trim()) return value;
    if (Array.isArray(value)) {
      const joined = value.map((v: any) => (typeof v === 'string' ? v : v?.text || v?.content || '')).filter(Boolean).join('\n');
      if (joined.trim()) return joined;
    }
  }
  return textOf(output);
}

/**
 * Called from the overlay's tool.execute.after hook. Returns true when a
 * usable entry was persisted. Never throws into the hook.
 */
export function recordContext7Result(toolName: string, args: unknown, output: unknown): boolean {
  try {
    const name = String(toolName || '').toLowerCase();
    if (!name.includes('context7')) return false;
    const a = (args && typeof args === 'object' ? args : {}) as Record<string, any>;
    const libraryId = String(a.libraryId || a.library_id || a.libraryName || a.library_name || '').trim();
    const query = String(a.query || a.topic || a.prompt || '').trim();
    const answer = extractAnswer(output).trim();
    if (!answer || answer.length < 20) return false;
    const payload = { libraryId, query, answer: answer.slice(0, 12_000), source: name };
    const hash = crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
    const entry: Context7CacheEntry = {
      ts: new Date().toISOString(),
      libraryId,
      query,
      answer: payload.answer,
      source: name,
      hash,
      expiresAt: new Date(Date.now() + TTL_MS).toISOString(),
    };
    fs.mkdirSync(path.dirname(CACHE()), { recursive: true });
    fs.appendFileSync(CACHE(), JSON.stringify(entry) + '\n', 'utf-8');
    return true;
  } catch {
    return false;
  }
}

export function listContext7Docs(limit = 200): RetrievalDocument[] {
  let lines: string[] = [];
  try { lines = fs.readFileSync(CACHE(), 'utf-8').split('\n').filter(Boolean).slice(-limit); } catch { return []; }
  const seen = new Set<string>();
  const docs: RetrievalDocument[] = [];
  for (const line of lines) {
    try {
      const e = JSON.parse(line) as Context7CacheEntry;
      if (!e?.answer || seen.has(e.hash)) continue;
      seen.add(e.hash);
      const title = `${e.libraryId || 'library'} · ${e.query || 'docs'}`.slice(0, 160);
      docs.push({
        docId: `doc:context7:${e.hash.slice(0, 24)}`,
        kind: 'doc',
        sourcePath: CACHE(),
        title,
        text: `${title}\n\n${e.answer}`,
        project: null,
        stacks: [],
        god: 'all',
        hash: e.hash,
        updatedAt: e.ts,
        expiresAt: e.expiresAt,
        stale: Date.parse(e.expiresAt) < Date.now(),
      });
    } catch { /* skip malformed */ }
  }
  return docs;
}

export function context7CachePath(): string {
  return CACHE();
}
