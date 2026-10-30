---
title: Schema Design & Migrations
category: data
stacks: []
god: persephone
last_updated: 2026-10-30
sources:
  - https://www.postgresql.org/docs/current/
  - https://www.prisma.io/docs/orm/prisma-migrate
  - https://stripe.com/blog/online-migrations
---

# Schema Design

## When to use
Before the first table, and every time a column changes in production. The
schema is a contract; migrations are how you change a contract without
breaking callers.

## Non-negotiables
- Model the invariants in the database: primary keys, foreign keys, unique
  constraints, check constraints. Application-only validation drifts.
- Choose keys deliberately: surrogate PK for identity, natural unique keys
  for business rules. Never expose a sequential PK as a public id.
- Normalize until it hurts, denormalize with a measured reason. Duplicated
  facts need an owner and a sync path.
- Timestamps in UTC (`timestamptz` in Postgres); money in integer minor units
  or `numeric`, never float.
- Nullable means "unknown", not "optional". If a field is required, enforce it.
- Indexes are part of the schema: every FK used in joins, every unique rule,
  every hot filter. Measure with `EXPLAIN`, do not guess.

## Zero-downtime migrations (expand / contract)
1. **Expand**: add the new column/table nullable; write to both old and new.
2. **Backfill** in bounded batches; make it resumable and idempotent.
3. **Switch reads** to the new shape behind a flag.
4. **Contract**: drop the old column only after no writer/reader uses it.
Never combine a destructive change with a deploy in one step.

## Checklist
- [ ] Constraints encode the business invariants.
- [ ] Every migration has a forward path and a rollback/contract plan.
- [ ] Large tables are backfilled in batches, not a single UPDATE.
- [ ] Indexes justified by a query plan, not by vibes.
- [ ] The app and schema can run one version apart during deploy.

## Anti-patterns
- `ALTER TABLE ... ADD COLUMN NOT NULL DEFAULT` on a huge table without a
  plan (lock/timeout risk).
- Storing JSON blobs for everything to avoid schema decisions.
- Using the ORM's auto-sync in production.
- A migration that assumes an empty table.
- Soft deletes everywhere with no retention policy.

## Sources
- PostgreSQL docs: https://www.postgresql.org/docs/current/
- Prisma Migrate: https://www.prisma.io/docs/orm/prisma-migrate
- Stripe, Online migrations: https://stripe.com/blog/online-migrations
