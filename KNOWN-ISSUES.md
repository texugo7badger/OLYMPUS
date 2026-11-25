# OLYMPUS — Known issues and post-0.1.0 backlog

> v0.1.0 · 2026-11-25 · **Nothing here is hidden.** These are the limits the
> release does not claim, with the reason and the next step. The deterministic
> gates are green; the battery is 57/57; the live UI gate is
> `node scripts/verify-v010-ui.mjs`.

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

## Post-0.1.0 backlog (GitHub issues closed as deferred)

- **#345** build lineage / champion-challenger / cost per build.
- **#332** native Android/iOS home-screen widgets.
- **#318** full decision ledger + cognitive protocol (partial in 0.1.0).
- **#269** invoice reconciliation + per-model caps (partial in 0.1.0).

The per-god-chat epics (#274, #304) and the magic-wand epics (#273, #303) are
closed as **superseded by the 0.1.0 Apollo-only + Activity Inspector + mark
batch design**, not as delivered features.

## How to report

Open a GitHub issue with the `type(scope): title` taxonomy. A release claim
without a probe, a test or a measured artifact is not accepted.
