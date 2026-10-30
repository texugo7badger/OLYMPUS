---
title: Query Performance
category: data
stacks: []
god: persephone
last_updated: 2026-10-30
sources:
  - https://use-the-index-luke.com/
  - https://www.postgresql.org/docs/current/using-explain.html
  - https://www.postgresql.org/docs/current/indexes.html
---

# Query Performance

## When to use
Any query on a growing table, any endpoint with a latency budget, and every
"N+1" suspicion. Measure before adding an index.

## Non-negotiables
- Read the plan: `EXPLAIN (ANALYZE, BUFFERS)`. Look for seq scans on large
  tables, nested loops with high row counts, and sorts spilling to disk.
- Index for the query shape: equality columns first, then range, then sort.
  Composite index order matters; a separate index per column is not the same.
- Avoid `SELECT *` in hot paths; fetch the columns the caller needs.
- Paginate with keyset (`WHERE (created_at, id) < (...)`) for large feeds;
  OFFSET degrades linearly.
- Batch/join to kill N+1; one query for a list is usually cheaper than N.
- Connection pooling is mandatory in serverless/high-concurrency; size it to
  the database, not to the app's ego.
- Cache with an explicit invalidation story; a cache without one is a bug
  with a delay.

## Checklist
- [ ] The hot query has a plan and a latency number.
- [ ] Indexes match the actual WHERE/ORDER BY/JOIN shape.
- [ ] List endpoints are keyset-paginated.
- [ ] N+1 eliminated or bounded.
- [ ] Slow query logging/alerts exist.
- [ ] No unbounded query without a LIMIT in a request path.

## Anti-patterns
- Adding an index for every column "just in case" (write amplification).
- Wrapping indexed columns in functions (`WHERE lower(email) = ...`) without
  an expression index.
- `COUNT(*)` on a huge table for a UI badge.
- Caching personalized data in a shared key.
- Using a distributed cache to hide a missing index.

## Sources
- Use The Index, Luke: https://use-the-index-luke.com/
- PostgreSQL EXPLAIN: https://www.postgresql.org/docs/current/using-explain.html
- PostgreSQL indexes: https://www.postgresql.org/docs/current/indexes.html
