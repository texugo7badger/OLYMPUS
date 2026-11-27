# OLYMPUS — Known issues and post-0.1.0 backlog

> v0.1.5 · 2026-11-27 · **Nothing here is hidden.** These are the limits the
> release candidate does not claim, with the reason and the next step. The
> deterministic gates are green; the battery is 66 suites; the v0.1.5 live UI
> gate is `node scripts/verify-v015-ui.mjs` (the v0.1.4 test gate remains
> `verify-v014-ui.mjs`; the stable v0.1.2 gate remains `verify-v012-ui.mjs`).

## Declared limits (not errors)

| Limit | Status | Why / next step |
|---|---|---|
| 8-hour model soak | **Not run** | The 100-hop deterministic certification passed (100/100, p50/p95 189/225 ms). The 8-hour soak needs a real campaign on a paid lane; run `npm run soak -- --minutes 480 --interval 10` when a campaign can own the machine. Declared in [HYGIENE.md](HYGIENE.md) and [V1-READINESS.md](V1-READINESS.md). |
| Native home-screen widgets (Android Glance / iOS WidgetKit) | Not built | The PWA installs; a native widget needs a Capacitor/TWA wrapper. Tracked as post-0.1.0. |
| Build lineage, champion/challenger, context cost per build | Not built | Needs ≥5 samples per build and a lineage tree in the Build Hub. Tracked as post-0.1.0. |
| Full user-sovereignty decision ledger | Partial | `design-decisions.jsonl` + the in-chat DesignChoiceCard + the status brief provenance exist. The full `preferences.md`, delegation rules and option gate remain post-0.1.0. |
| Per-model cost caps / invoice reconciliation | Partial | Step cost, list value and “invoice unknown” are surfaced; the per-hop ledger and cache are in place. The provider invoice is not exposed by the GO API, so it cannot be claimed. |
| Per-god chats (10 tabs) | **Intentionally retired** | v0.1.0 makes Apollo the only conversational god and adds the latest-activity sheet per god. Ten parallel chat lanes multiplied the dead-lane/context failure modes this release fixes. The decision is recorded in this file and the Activity Inspector. |
| Magic-wand DOM/component picker | **Superseded** | The durable mark queue (preview window + live preview), batch-to-Apollo and Quick Edit cover the outcome without a second planning lane. |
| 23 moderate transitive advisories | Declared | 0 high / 0 critical; `npm audit --audit-level=high` is the gate. The dependency lane is tracked separately. |
| AIME campaign still walking | Active lane | The campaign is the launch evidence and remains user-owned; it is not a release blocker. |
| Initial retrieval index build | **Heavy on this host** | 644 docs / 1,032 chunks / 14.3 MB took 955 s. Run `npm run retrieval:index` once before a campaign; incremental is 1 s. Hibernate pauses the worker safely. |
| Hybrid query latency | **Model-bound** | Warm `nomic-embed-text:v1.5` query ~150 ms; hybrid p95 **235–286 ms**. FTS-only fallback is 2 ms. |
| Retrieval eval set | **Small (15 queries)** | In-repo regression set, P@5 100% vs 73% FTS. Grow it from real project tasks before claiming universal gains. |
| AIME instinct cleanup | **Audit done, apply pending** | 190 empirical: 187 AIME project-scoped, 1 fixture, **0 true duplicates** (38 trigger-similarity candidates rejected), 0 stale/global-AIME. `npm run instincts:audit` is read-only; quarantine/restore are byte-verified. Nothing moved before the AIME v0.1.3 test. |
| Resonance quick circuits | **0 real today** | 8,235 rows → 609 signatures. The first backfill's 31 hits were hop ids, and 3 were fixtures; the vocabulary rejects both. The mechanism is tested (12/13 = 0.867 fires); the new writer logs the hop prompt, so real repeats will earn the first one. |
| Derived build promotion | **Evidence-gated, manual** | Derived loadouts are validated and cold; promotion needs 5+ samples at 80%+ coherence plus a human click. No automatic promotion. |
| RLM context envelope | **Behind `OLYMPUS_RLM=1`** | Depth ≤2, ≤4 children, budget-capped; off is byte-identical to v0.1.3. Enable by default only after a real campaign eval in v0.1.5. |
| Embedding cache | **Rebuilds cheap, first build heavy** | The cache skips unchanged text and the job no longer dies at the request timeout. The one-time local embedding cost (~16 min here) remains; it is 0 provider tokens. |

## Post-0.1.0 backlog (GitHub issues closed as deferred)

- **#345** build lineage / champion-challenger / cost per build.
- **#332** native Android/iOS home-screen widgets.
- **#318** full decision ledger + cognitive protocol (partial in 0.1.0).
- **#269** invoice reconciliation + per-model caps (partial in 0.1.0).

## v0.1.5 backlog (new on 2026-11-27)

- **Cleanup** — dead editor/terminal/sync-map/plasma surfaces removed; nine unused devDependencies pruned.
- **Docs truth** — README/AGENTS/TESTING and the strategy comments corrected.
- **Stable promotion** — waits for the AIME test on v0.1.4 and the user's explicit approval.

## v0.1.4 backlog (new on 2026-11-27)

- **Symphony Resonance Index** — implemented; 0 real quick circuits in the historical log.
- **Build Compiler** — implemented; derived shelf + evidence-gated promotion.
- **RLM envelope** — implemented behind `OLYMPUS_RLM=1`.
- **Retrieval first-run** — embedding cache + background job + progress UI.
- **AIME audit** — read-only done; quarantine apply after the AIME test.
- **v0.1.2 regressions** — brain outline, strategy fallback, cost loader, god-detail guard.

## v0.1.3 backlog (new on 2026-11-27)

- **Local hybrid retrieval** (FTS5 + 768d + RRF) and Context7 cache — implemented in this branch.
- **ECC learning** confidence/scope/1-in-10 — implemented in this branch.
- **AIME instinct revalidation/cleanup** — deferred to v0.1.4.

## v0.1.2 backlog (shipped on 2026-11-26)

- **#378** Sync Map is not live — remove or repair.
- **#379** Cost dashboard takes too long to connect to the real GO limit.
- **#380** Craft becomes a native-app hub (Blender/Godot/video editors), not only ArtCraft.
- **#381** Reference “Use” opens an editable terminal prompt; add new free/open-source sources.
- **#382** Callimachus continuous economical heartbeat that curates quick circuits.
- **#383** Split Craft (app hub) and References into distinct menus.

The per-god-chat epics (#274, #304) and the magic-wand epics (#273, #303) are
closed as **superseded by the 0.1.0 Apollo-only + Activity Inspector + mark
batch design**, not as delivered features.

## How to report

Open a GitHub issue with the `type(scope): title` taxonomy. A release claim
without a probe, a test or a measured artifact is not accepted.
