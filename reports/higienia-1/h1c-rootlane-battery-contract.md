# HIGIENIA-1 / H1c — #95 + #94 CURED + #101 CLOSED WITH EVIDENCE: the root-lane kill-switch, the battery contract, the durable-packet rule

**Closes #95, closes #94, closes #101.**

## #95 — the root-session lane: pinned + the structural kill-switch

The finding: the injection itself ALREADY LANDED (with #99's batch, `7584752` — the
app-spawned serve carries `OLYMPUS_ROOT_SESSION: '1'`, the #77 heartbeat lane fires with
no manual export) — but it was never PINNED and never got the kill-switch the filing
demands. This batch: the **preservation pin** (the injection at the serve spawn, now
immune to silent regression) + the **kill-switch**: `~/.olympus/root-session-lane-off` —
touch the file, restart, the lane is off; the opt-in is by design, the opt-out is now
structural too. The child/one-shot spawns are untouched (they carry `OLYMPUS_MANAGED`
only — the #25 contract, telemetry-pulse's foreign-shape pin green throughout).

## #94 — the battery contract, pinned and declared

`scripts/battery.mjs` + `npm run battery`: the invocation of record (`npx tsx`, NEVER
bare node), the 600s per-suite patience (the flat-300s lesson institutionalized), and the
DECLARED environment — a fresh clone reads pointers, not stack traces:
- the opencode-run state (`.opencode/package.json`, created by one `opencode models`
  run — without it the dispatch-spine class dies `__filename is not defined`): declared
  in the header;
- `project-exit-gate` needs `~/olympus-bench` (the FIXTURES corpus) — a NAMED SKIP when
  absent;
- `generation-contract` + `parallel-pantheon` read REAL vault state (the LIVE-VS-VAULT
  surface, N29's declaration class) — declared as environment, not regression.
Per-suite status lines; skips counted + declared, never silent; exit 0 only on green.
**The proof of the cure is the cure itself: this batch's battery ran as
`npm run battery` — 30 PASS / 0 FAIL / 0 SKIP.** Pinned: the script + the invocation +
the patience + the declared prerequisites + the npm wiring.

## #101 — CLOSED WITH EVIDENCE (the rule is standing and practiced)

The ask — "the close-out packet must be a durable file" — has been the house's STANDING
RULE since the filing: the QUEUE's standing-rules section ("the close-out packet is a
FILE: every night's final report lands as `reports/<arc>/CLOSE-OUT.md` BEFORE the chat
summary — the chat message is a pointer, never the payload") + AGENTS.md's doctrine line
+ the practice trail: `reports/uat-close-1/CLOSE-OUT.md`, `reports/smoke-1/CLOSE-OUT.md`,
`reports/preview-2/CLOSE-OUT.md`, `reports/plano-master-1/CLOSE-OUT.md` — every arc's
close since the filing landed on disk first. The rule is enforced by practice + by the
auditor's frontier re-verification (every close cites its file). Nothing left to build;
the closure cites the standing rule + the four-file practice trail.

**RED → GREEN:** 5 named FAILs (the kill-switch absent + the 4 #94 pins; the #95
injection preservation pin passed from the start — it landed at `7584752`) →
opencode-session FULL + `npm run battery` 30/0/0 + tsc 0.

**HIGIENIA-1 WAVE STATUS: H0 `8fdb39a` · H1a `796ba76` · H1b `2154f5e` · H1c this
merge — 9 issues closed this wave (#74 refreshed, #82, #80, #87, #93, #111, #95, #94,
#101) + the 3 dependabot PRs absorbed. Next per the plan: the user's MANUAL TEST, then
HIGIENIA-2 (H3-H5).**
