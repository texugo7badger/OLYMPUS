---
title: Knowledge Ops (Vault Curation)
category: vault
stacks: []
god: callimachus
last_updated: 2026-10-30
sources:
  - https://diataxis.fr/
  - https://adr.github.io/
  - https://www.writethedocs.org/guide/docs-as-code/
---

# Knowledge Ops

## When to use
Every time the brain learns something worth keeping: a reusable pattern, a
proven fix, a decision, a reference. Knowledge that is not curated becomes
noise the next session pays for.

## Non-negotiables
- Every note has frontmatter: title, category, stacks, god, last_updated,
  sources. No source, no claim.
- Separate the four documentation modes (Diátaxis): tutorial, how-to,
  reference, explanation. Do not mix them in one file.
- Deduplicate before adding: search the vault, merge into the existing note,
  or archive the stale one. Two competing notes are worse than one old note.
- Keep provenance: link the issue/commit/report that produced the knowledge.
- Expire aggressively. A stale "best practice" is a trap; mark it or archive
  it. TTL pruning is part of the lifecycle.
- Prefer small, composable notes over monoliths. The index/search is the
  entry point, not a table of contents nobody updates.

## Checklist
- [ ] Frontmatter complete and valid.
- [ ] The note states when to use it and when NOT to.
- [ ] Claims carry a source (URL/doc/commit).
- [ ] Existing related notes were checked and linked.
- [ ] The note has an owner god/category.
- [ ] A stale date or superseded marker exists where relevant.

## Anti-patterns
- A giant "everything I know" document with no structure.
- Copy-pasted vendor marketing as if it were an engineering rule.
- Orphan notes that no index or category links to.
- Duplicating the same pattern under five names.
- Keeping obsolete instructions because deleting feels risky (archive them).

## Sources
- Diátaxis: https://diataxis.fr/
- ADR: https://adr.github.io/
- Write the Docs, Docs as Code: https://www.writethedocs.org/guide/docs-as-code/
