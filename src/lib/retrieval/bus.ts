/**
 * retrieval/bus.ts — v0.1.3: the single hybrid retrieval entry point.
 *
 * FTS5/BM25 and 768d dense results are fused with Reciprocal Rank Fusion
 * (RRF, k=60) — ranks, not incompatible scores. Hard scope filters run
 * before the final list: kind, god, project, stack, stale/expiry.
 *
 * The bus is additive: no Ollama => FTS5 only; no index => empty block.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { embedQuery } from './embedding.js';
import {
  getRetrievalStore,
  searchFts,
  searchDense,
  getDocsByIds,
  filterHit,
  toHit,
} from './store.js';
import type { RetrievalHit, RetrievalKind, RetrievalQuery } from './types.js';

export const RRF_K = 60;

export async function retrieve(opts: RetrievalQuery): Promise<RetrievalHit[]> {
  const query = String(opts.query || '').trim();
  if (!query) return [];
  const limit = Math.max(1, Math.min(20, opts.limit ?? 6));
  const pool = Math.max(30, limit * 8);
  const store = getRetrievalStore();
  try {
    const fts = searchFts(store, query, pool);
    const vector = opts.dense === false ? null : await embedQuery(query);
    const dense = vector ? searchDense(store, vector, pool) : [];
    const rank = new Map<string, { fts: number | null; dense: number | null; score: number }>();
    for (const r of fts) {
      const cur = rank.get(r.docId) || { fts: null, dense: null, score: 0 };
      cur.fts = r.rank;
      cur.score += 1 / (RRF_K + r.rank);
      rank.set(r.docId, cur);
    }
    for (const r of dense) {
      const cur = rank.get(r.docId) || { fts: null, dense: null, score: 0 };
      cur.dense = r.rank;
      cur.score += 1 / (RRF_K + r.rank);
      rank.set(r.docId, cur);
    }
    if (rank.size === 0) return [];
    const docs = getDocsByIds(store, [...rank.keys()]);
    const ftsSnippet = new Map(fts.map((r) => [r.docId, r.snippet]));
    const hits: RetrievalHit[] = [];
    for (const [docId, r] of rank) {
      const doc = docs.get(docId);
      if (!doc) continue;
      if (!filterHit(doc, {
        kinds: opts.kinds,
        god: opts.god,
        project: opts.project,
        stacks: opts.stacks,
        includeStale: opts.includeStale,
      })) continue;
      hits.push(toHit(doc, r.score, r.fts, r.dense, ftsSnippet.get(docId)));
    }
    hits.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
    // A long document produces several chunks; return one hit per document
    // (highest-ranked chunk) so the prompt is not padded with near-duplicates.
    const seenDoc = new Set<string>();
    const unique: RetrievalHit[] = [];
    for (const hit of hits) {
      const root = hit.docId.split('#')[0];
      if (seenDoc.has(root)) continue;
      seenDoc.add(root);
      unique.push(hit);
      if (unique.length >= limit) break;
    }
    return unique;
  } catch (err: any) {
    if (process.env.OLYMPUS_DEBUG === '1') console.error('[retrieval]', err?.message || err);
    return [];
  }
}

export function formatRetrievalBlock(hits: RetrievalHit[], budgetChars = 4_000, title = 'OLYMPUS-RETRIEVAL'): string {
  if (hits.length === 0) return '';
  const lines = [
    `[${title} — cited local context. Use only what is relevant; never copy blindly.]`,
  ];
  let budget = Math.max(400, budgetChars);
  for (const hit of hits) {
    const rel = hit.sourcePath.replace(/^.*\/OLYMPUS-VAULT\//, 'vault/').replace(/^.*\/\.opencode\//, '.opencode/');
    const one = `- [${hit.kind}] ${hit.title} — ${hit.snippet.replace(/\s+/g, ' ').slice(0, 420)} (${rel})`;
    if (one.length > budget) break;
    lines.push(one);
    budget -= one.length;
  }
  return lines.length > 1 ? lines.join('\n') : '';
}

/** Convenience for prompt assembly. Never throws, never blocks a hop. */
export async function composeRetrievalBlock(opts: RetrievalQuery): Promise<string> {
  try {
    const hits = await retrieve(opts);
    return formatRetrievalBlock(hits, opts.budgetChars ?? 4_000);
  } catch {
    return '';
  }
}

export function retrievalMetrics(hits: RetrievalHit[]) {
  return hits.map((h) => ({
    docId: h.docId,
    kind: h.kind,
    title: h.title,
    score: Math.round(h.score * 10000) / 10000,
    ftsRank: h.ftsRank,
    denseRank: h.denseRank,
    project: h.project,
    stale: h.stale,
  }));
}
