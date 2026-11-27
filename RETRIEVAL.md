# OLYMPUS — Retrieval & Learning (v0.1.3)

> Local-first hybrid retrieval: **FTS5/BM25 + 768d embeddings + Reciprocal Rank Fusion**. No cloud embedding call, no data leaving the machine. This document is the contract for the v0.1.3 foundation; the RLM/resonance layer is v0.1.4.

## Why this exists

The v0.1.2 audit found seven separate retrieval lanes with different scoring rules, a broken skill index (metadata rowid off-by-one, L2 reported as cosine), an empty arsenal/pattern feedback loop, and Context7 answers that vanished with the turn. v0.1.3 fixes the contract and adds one local hybrid index.

## The index

- **Embedding model:** `nomic-embed-text:v1.5`, **768 dimensions**, 8192-token context, Apache-2.0, served by local Ollama.
- **Prefixes:** `search_document:` for indexed text; `search_query:` for queries.
- **Storage:** `~/.olympus/retrieval.db` — SQLite WAL + FTS5 + `sqlite-vec` (`vec0`, float[768]).
- **Chunking:** 3,500-char soft max, 400-char overlap, headings/paragraphs preserved.
- **Sources:** `.opencode/skills/**/SKILL.md`, `04_Knowledge/references/**/*.md`, `05_Auto_Learning/instincts/**/*.md`, `05_Auto_Learning/patterns/*.md`, Context7 cache.
- **Fusion:** RRF `k=60` over FTS5 ranks and dense KNN ranks; hard filters for kind, god, project, stacks, stale/expiry.
- **Deduplication:** one hit per source document (best chunk), bounded prompt block (`OLYMPUS-RETRIEVAL`).

### Commands

```bash
npm run retrieval:index            # incremental (content-hash skip)
npm run retrieval:index -- --force # rebuild the index (vault untouched)
npm run retrieval:eval             # 15-query FTS vs hybrid P@5/MRR
npm run retrieval:bench            # docs, DB size, p50/p95 latency
node scripts/build-skill-index.js  # rebuild the separate TF-IDF skill index
```

The API is `GET/POST /api/olympus/retrieval/search` and `GET/POST /api/olympus/retrieval/reindex`.

## Measured on this host (2026-11-27)

Corpus: 644 documents from the OLYMPUS repo + `~/OLYMPUS-VAULT` (including the AIME project notes); 1,032 chunks.

| Metric | Result |
|---|---:|
| Index size | **14.3 MB** |
| Embedded chunks | **1,032 / 1,032** |
| Initial build | **955 s** (15m 55s, 100% local GPU/CPU) |
| Incremental build (no changes) | **1 s** |
| FTS-only query p50 / p95 | **1 ms / 2 ms** |
| Hybrid query p50 / p95 | **205 ms / 286 ms** (range 184–205 / 235–286) |
| Warm embedding call | **142–157 ms** |
| Cold embedding call (model load) | ~1.8 s |

Eval set: 15 queries, human-labeled expected source substrings. This is an in-repo regression set, not a universal benchmark.

| Metric | FTS5 | Hybrid |
|---|---:|---:|
| P@5 | 73% | **100%** |
| MRR@5 | 0.733 | **0.933** |

The dense lane is what recovers the queries whose words do not match the source (e.g. “OWASP authentication session cookie” → `OWASP Top 10`, `Authentication Patterns`).

**Honest limits:** the initial build is heavy on this machine; run it once before a campaign and keep hibernate pauses on. Query latency is dominated by the local embedding model (~150 ms warm). The eval set is small; grow it from real project tasks before making broader claims.

## Context7 cache

When a `context7` tool call returns a usable answer, the overlay appends a local cache entry to `~/.olympus/context7-cache.jsonl`:

```json
{
  "ts": "...",
  "libraryId": "/vercel/next.js",
  "query": "middleware",
  "answer": "...",
  "source": "mcp__context7__query-docs",
  "hash": "...",
  "expiresAt": "..."
}
```

The next `retrieval:index` turns it into a cited `doc` with TTL (30 days default, `OLYMPUS_CONTEXT7_TTL_DAYS`). Expired docs are excluded unless `includeStale` is requested. This is how Context7 becomes learning instead of a one-turn lookup.

## Learning contract (ECC continuous-learning-v2)

The ECC v3.0 skill remains the contract. v0.1.3 fixes the implementation:

- `successes` + `failures` are the source of truth; `samples = successes + failures`.
- Confidence: `success_rate * sqrt(samples) / (1 + sqrt(samples))`, cap 0.95.
- Project-scoped memory cannot leak into another project (`instinctPriorContext` + gate).
- A **quick circuit** is a hint; a **short-circuit** is a decision. Only a quick circuit with confidence ≥0.85 and matching scope can short-circuit.
- 1-in-10 would-be short-circuits is forced to re-deliberate (persisted counter).
- Dispatch outcomes recalibrate instincts deterministically (`src/lib/learning/recalibrate.ts`), with a checkpoint in `~/.olympus/instinct-recalibrate-state.json`.
- Failure penalty remains immediate for a short-circuited dispatch; Callimachus PRUNE/archive keeps recycling possible.

The AIME instincts are **not deleted** in v0.1.3. The migration script is dry-run by default:

```bash
npm run migrate:instincts            # dry-run: count what would change
npm run migrate:instincts -- --apply # explicit migration
```

The full AIME cleanup/revalidation is a v0.1.4 decision after the AIME v0.1.2 finish.

## Hibernation

- An index run is **content-hash idempotent**; an interrupted batch never leaves a partial document.
- Hibernate writes `~/.olympus/retrieval-paused`, pauses between batches, checkpoints WAL and best-effort unloads the local model.
- Resume removes the pause file; the next run skips every unchanged chunk.
- Tests: `scripts/retrieval-hibernate.test.mjs` (paused run writes no docs, resume indexes, repeat is idempotent).

## Out of scope for v0.1.3

- RLM context envelope (recursive decomposition) — v0.1.4.
- Resonance Index for Symphony signatures — v0.1.4.
- AIME instinct deletion/revalidation — v0.1.4.
- Neural reranker — only if eval shows a precision gap after RRF.
