# BATCH 12b-NIGHT — FINAL REPORT

**Repo:** github.com/texugo7badger/OLYMPUS
**Base:** `main @ 2bab1b3` → **Branch:** `night/12b-overnight` @ final HEAD `e3cca55` (14 commits, including this report's commit; the report body's per-phase hashes reference the code commits)
**Push status: NEVER PUSHED.** `main` untouched at `2bab1b3`.
**Mode:** unattended overnight long task. No questions were asked; all deviations are disclosed below.

---

## 1. Phase table

| Phase | Status | Commit(s) | One-line evidence |
|-------|--------|-----------|--------------------|
| 0 — bootstrap + registry audit | DONE | 1607293, afd0d68 | 118 registry names, 118 on-disk, 117 committed → gitignore `*secrets*` was swallowing `secrets_scanner.txt`; fixed + committed; issues #55/#56 filed |
| 1 — #50 build fix | DONE (no code change needed) | 3bc01fd | `next build` + `tsc` + postcompile all EXIT 0 on the committed tree; the motion files #50 references were NEVER committed (`git log --all` empty); #50 closed as not-reproducible |
| 2 — #51 unattended bypass | DONE | 7529201, 240be87, 7989b06 | Probe A: "First clarifying question … Where should this testimonial section live?" + `finish: stop`; Probe B: "HARD-GATE … explicitly overridden by the unattended directive — I'll satisfy each gate myself"; #51 closed |
| 3 — #54 join key | DONE | c381801, 1780c34, 2f3e2c2 | Live id-joined pairs on BOTH spawn paths (`join:"id"`, `cls_mus8ixsyzo7e9q` one-shot, `cls_mus8w7tapy5xp0` warm); fixture self-test 25/25; #54 commented (not closed) |
| 4 — RLM memo | DONE | 822aa87 | `docs/research/RLM-MEMO.md` (386 lines), 3-pass construction, adversarial corrections folded back |
| 4b — context-distill prototype | DONE (condition met: 1–3 committed, time remained) | 7b3bb86 | `--self-test` 4/4 green against the Phase-3 fixture; real-feed smoke shows tonight's runs |
| 5 — soak + metric snapshot | DONE | cc642c1 | Soak 30 green; P1 no-dispatch, P3/P4 dispatch-forced; night window: 7 joined pairs (4 id / 3 ts), agreement 0.0 (all mismatches = the "apollo"→graphql collision); user state restored sha256-verified |
| 6 — this report | DONE | (this commit) | — |

---

## 2. Per-phase detail

### Phase 0 — registry audit (12a notes)

**What changed:** `.gitignore` gained a negation (`!.opencode/prompts/agents/demigods/**`) and the previously-swallowed `artemis/secrets_scanner.txt` (64 lines, authored 2026-07-26 with the standard demigod template — no content invented) was committed.

```
1607293 fix(registry): commit secrets-scanner prompt swallowed by *secrets* gitignore (#55)
 .gitignore                                      |  5 ++
 .../agents/demigods/artemis/secrets_scanner.txt | 64 ++++++++++++++++++++++
```

**12a NOTE-1 verdict:** the full audit (registry `opencode.demigods.json` × on-disk files × committed files × tool-description vocabularies) found exactly ONE unresolvable name (`secrets-scanner` — resolvable on disk, never committed, root cause `.gitignore:26 *secrets*`) plus three PHANTOM names in tool-description docs that match no registry entry (`verifier-code`, `sast-scanner`, `mlops-engineer` — doc-only, dispatch to them fails gracefully; listed in issue #55 for a follow-up doc pass). The 4 auto-injected demigods (tdd-guide, secrets-scanner, docs-verifier, security-reviewer) all have prompt files (secrets-scanner's was the uncommitted one).

**12a NOTE-2 verdict (117 vs 118):** BOTH numbers were true simultaneously. `scripts/agreement-metric.mjs` resolves from the ON-DISK directory → **118** (`demigod resolution: 118 names`, reproduced this session); the committed tree had **117** (`git ls-files | wc -l`). The divergence was the gitignored `secrets_scanner.txt` — on a fresh clone, resolution would have been 117 AND secrets-scanner auto-injection would have pointed at a missing file. After Phase 0's fix: committed == on-disk == registry == **118**.

### Phase 1 — #50 (`next build` fails)

**What changed:** nothing — no code change was possible or needed (the batch expected a `fix(build)` commit; fabricating one would have violated the no-fabrication guardrail; the Phase-1 record commit 3bc01fd documents this honestly).

**Evidence:**
- `npx next build` → `✓ Compiled successfully in 54s` / `Running TypeScript …` / `Finished TypeScript in 7.3s` / `EXIT: 0`; zero motion references in the 772-line log.
- `npm run build:app` (next build + `tsc -p electron/tsconfig.json` + postcompile) → `EXIT: 0`.
- The files #50 references (`hooks/use-reduced-motion.tsx`, `lib/motion-config.ts`, `lib/motion-tokens.ts`) do not exist in the tree and were **never committed on any branch** (`git log --all --oneline -- '*use-reduced-motion*' '*motion-config*' '*motion-tokens*'` → empty). `motion`/`framer-motion` are absent from package.json.
- Issue #50 was filed 2026-10-03T02:47:34Z against an uncommitted local WIP state that was later discarded.
- Full `npm run build` including electron-builder: the AppImage target SUCCEEDED (1.49 GB artifact, 05:29), but the deb/tar.gz targets died with `Error: Unknown system error -122` = **EDQUOT (disk quota exceeded)** — an environmental constraint (it also blocked a /tmp write earlier in the night), not a code failure, and unrelated to the TypeScript errors #50 describes.

#50 was closed with this evidence and reopen conditions.

### Phase 2 — #51 (unattended-mode bypass for the brainstorming hard-gate)

**What changed:**

```
7529201 feat(olympus): unattended-mode bypass for brainstorming hard-gate (#51)
 .opencode/olympus/olympus-hooks.ts  | 67 ++++++++++++++++++++++++++++++++++
 src/app/api/olympus/action/route.ts | 32 ++++++++++++++--
240be87 fix(opencode-session): probeServer 401 early-return blocked warm-serve adoption (#57)
 src/lib/opencode-session.ts | 14 +++++++++----   ← unplanned but necessary unblock (see below)
```

**Mechanism:** `POST /api/olympus/action` with `{"action":"prompt","unattended":true}` prepends an in-band `[OLYMPUS UNATTENDED MODE]` directive to the spawned run text (the warm `opencode serve` is a shared, already-running process that per-request env cannot reach — established tonight), sets `OLYMPUS_UNATTENDED=1` in `extraEnv`, and the plugin's new `chat.message` hook parses the marker → `unattended_mode` telemetry event (deduped per session). The classifier still sees the RAW prompt (routing semantics unchanged). Default behavior unchanged when the flag is absent.

**Probe A (attended) — the stall, verbatim** (session `ses_efee90565ffedT0fjwkPnFPyK3`):

> "**First clarifying question (one at a time, per the process):** Where should this testimonial section live? … **A)** Standalone self-contained HTML file … **B)** React/TSX component … **C)** HTML/CSS snippet …" — `finish: stop`

**Probe B (unattended) — the override, verbatim:**

> "The brainstorming skill's HARD-GATE (interview + user approval) is **explicitly overridden by the unattended directive** — I'll satisfy each gate myself and record the decisions."

…then it proceeded autonomously. STRONGEST follow-up evidence: probe B5's session continued server-side past the client deadline and completed the ENTIRE flow — the design doc it wrote says "**Status:** Self-approved (unattended run — interview/approval gates satisfied by Apollo)" (`docs/superpowers/specs/2026-10-03-testimonial-section-design.md`), followed by an implementation plan and the actual HTML deliverable.

**Telemetry:** `unattended_mode` events in live.jsonl with `meta.source: "in-band marker"`. Honest limitation (documented in the code comment): the env-flag branch in `session.created` is dead code in practice — opencode 1.18.10 never fires `session.created` for one-shot `opencode run` spawns (re-verified twice: a manual env-flagged one-shot wrote zero events, delta 0).

**Unplanned but necessary:** probe verification was blocked for hours by a pre-existing bug — `probeServer()`'s 401 early-return made warm-serve adoption impossible (the actual cause of tonight's serve crash-loop, and plausibly of the user's broken interactive session). Diagnosed precisely, fixed surgically (240be87), filed as #57 with the full failure chain. A second pre-existing bug found during probing was filed as #58 (one-shot startup timer ignores one-shot output).

### Phase 3 — #54 (classification join key, end-to-end)

```
c381801 feat(telemetry): classification join key end-to-end (#54)
 .opencode/olympus/lib/classification-context.ts |  31 +++++  (new — avoids hooks<->tools import cycle)
 .opencode/olympus/lib/dispatch-tracker.ts       |   5 +
 .opencode/olympus/olympus-hooks.ts              |  18 ++++
 .opencode/olympus/tools/dispatch.ts             |  11 +-
 scripts/agreement-metric.fixture.jsonl          |   6 +   (new)
 scripts/agreement-metric.mjs                    |  85 ++++++++--
 scripts/agreement-metric.test.mjs               |  91 +++++++ (new)
 src/app/api/olympus/action/route.ts             |  18 ++-
 src/lib/task-classifier.ts                      |  18 ++++
1780c34 fix(metric): parse --since/--until as timestamps, not strings
```

The issue's DIFF-ONLY proposal was implemented as specified, with one necessary addition: the in-band `[OLYMPUS-CLASSIFICATION id=cls_… routeTo=…]` marker (the "already-plumbed env" cannot reach the warm serve — and `parseClassification` turned out to have zero readers anyway; the env payload now carries the id for one-shot spawns).

**Fixture self-test:** `node scripts/agreement-metric.test.mjs` → 25/25 PASS, exit 0 (id-join pair, ts-fallback pair, unjoined classification, unjoined dispatch; agreement_rate 0.5 by construction).

**Live id-join proof — one-shot path:**
```
classification     meta.classificationId = cls_mus8ixsyzo7e9q   (10:14:13.666Z)
symphony-dispatch  classification_id    = cls_mus8ixsyzo7e9q    (10:15:12.981Z)
metric → PAIR {"join":"id","classification_id":"cls_mus8ixsyzo7e9q", …}
```
**Live id-join proof — warm path:**
```
classification     meta.classificationId = cls_mus8w7tapy5xp0   (10:24:33.166Z)
symphony-dispatch  classification_id    = cls_mus8w7tapy5xp0    (10:24:37.050Z)
metric → PAIR {"join":"id","classification_id":"cls_mus8w7tapy5xp0", …}
```

**Real finding surfaced by the new key:** every id-joined pair reports `intent:"hermes"` for prompts that say `godId=apollo` — because `STACK_KEYWORDS.graphql` includes the literal `'apollo'` (`src/lib/task-classifier.ts`) and the stack detector routes on it. Quadruple-confirmed tonight; proposal P5 in the RLM memo; disclosed on #54. The metric is doing exactly its job.

#54 was commented with all evidence and **NOT closed** (auditor's call per the batch contract).

### Phase 4 / 4b — RLM memo + prototype

`docs/research/RLM-MEMO.md` (386 lines): techniques (recursive decomposition, handoff summarization, REPL-over-context, budgeted recursion, verifier-critic loops, Map-Reduce — all labeled `external-theory`, zero invented citations), touchpoint mappings with file:line anchors, and 5 DIFF-ONLY proposals (P1 dispatch budget fields → 12c/S; P2 findings-summary at fold-back → 12d/M; P3 telemetry slicer → 12d/S; P4 budgeted breadth → 13/M; P5 classifier keyword hygiene → 12c/S). Built in 3 passes; the adversarial pass caught and corrected two overclaims (economy_reduction is a clamped heuristic vs a placeholder baseline, not a measurement; the "dispatch tool available to every agent" premise is unresolved — tool gating is unverified for demigods) and re-verified the classifier line anchors that my own #54 edits had shifted.

`scripts/context-distill.mjs` (PROTOTYPE): per-run reducer over live.jsonl, `--self-test` 4/4 green against the Phase-3 fixture, zero dependencies.

### Phase 5 — validation soak + metric snapshot

Soak 30 green. P1 (review-only): `tools called: ["bash"]` — NO dispatch. P3/P4 (MANDATORY FIRST STEP): `olympus-dispatch` → DONE each. Phase-5 window metric: **2/2 dispatches id-joined (100% id-join rate)**. Machine left clean (no listeners on 3737/3740/3777/3778; no next/opencode-serve/electron processes; pidfiles removed).

---

## 3. Metric snapshot (night window 2026-10-03T07:28Z → 10:55Z)

```
classifications: 20  dispatches: 7
joined_pairs: 7  (id: 4 / ts: 3)   matches: 0  mismatches: 7  agreement_rate: 0
unjoined_classification: 14  unjoined_dispatch: 0
total feed events: 115 (37 in window)
```

- The **4 id-joined pairs** are tonight's #54 probes; all four mismatch because of the "apollo"→graphql keyword collision (intent hermes, executed apollo/callimachus).
- The **3 ts-joined pairs** are probe B5's self-initiated dispatches (pre-#54 plugin era), joined against B5's athena-intent classification.
- **14 unjoined classifications** are the user's own interactive prompts + my no-dispatch probe runs; **0 unjoined dispatches**.
- The 0.0 agreement rate is REAL and actionable: it is dominated by a routing false-positive (P5 fix, 5-minute change) — after that fix, tonight's id-joined pairs would score 1.0.
- **12a reconciliation verdict:** closed. 117 (committed) vs 118 (on-disk) were both true; gitignore `*secrets*` was the cause; post-fix everything is 118.

---

## 4. Self-critique (3 weakest claims, re-verified)

1. **"`session.created` never fires for `opencode run`"** → re-verified: a fresh manual one-shot with `OLYMPUS_MANAGED=1 OLYMPUS_UNATTENDED=1` produced **delta 0** session_start/unattended events (11 before, 11 after). Claim stands; the code comment documents it.
2. **"The #57 fix makes pidfile adoption work end-to-end"** → re-verified live: fresh dev server + live pidfile'd serve → "Connected to the warm OpenCode session — no cold start" + "▶ dispatching to warm session YEGmqJQ0" with NO 401 and a completed run. One residual nuance disclosed: my check that session YEGmqJQ0 specifically lived on the adopted serve was **inconclusive** (the query raced my own cleanup and the session list may paginate) — the adoption behavior itself (warm + no-401 + completed run) is confirmed.
3. **"`npm run build` green"** → partially re-verified and HONESTLY DOWNGRADED: `next build` + electron `tsc` + postcompile are EXIT 0, and electron-builder's AppImage target produced a 1.49 GB artifact — but the full `npm run build` (including deb/tar.gz packaging) **cannot complete on this machine tonight** because of `EDQUOT` (user disk quota; errno -122, also observed blocking a /tmp write). This is environmental, pre-existing, and unrelated to #50's TypeScript errors — but "full pipeline green" would have been an overclaim. The #50 closure rests on the non-reproducibility of its specific errors, which is airtight.

---

## 5. Full disclosures

**`git status --porcelain` (verbatim, at report time):**
```
 M opencode.json
?? docs/superpowers/
?? public/landing/
?? testimonial-section.html
```

- **` M opencode.json`** — the USER'S OWN uncommitted state (their free-openrouter testing), snapshot-verified and restored **byte-for-byte** at end of night (sha256 `db62995d…` matches the snapshot taken before my temporary strategy switch; `~/.olympus/active-strategy.json` likewise, sha256 `05fa2db6…`; `~/.olympus/llm-providers.json` untouched — mtime predates the session). During the night I temporarily applied `go-balanced` and then `nvidia/z-ai/glm-5.3` models (the opencode-go gateway and glm-5.3-flash were hanging; ledger P2-8/P2-9) to make probes possible. Their state includes their own `architect`-entry removal — restored as-is, not "fixed", because it is their state.
- **`?? docs/superpowers/`, `?? public/landing/`, `?? testimonial-section.html`** — artifacts of MY probe B5: its unattended session continued server-side past the client deadline, wrote the design doc (marked "Self-approved (unattended run…)"), an implementation plan, and built the HTML deliverable. Left in place as evidence of the #51 mechanism working end-to-end; not committed (not deliverables); safe to delete or keep.
- **Side effects NOT in git:** `~/.olympus/opencode-server.pid` and `/tmp/olympus-probe-server.pid` removed (clean); probe demigod auto-injections into opencode.json were transient and are gone with the snapshot restore; `~/.olympus/injected-demigods.json` may list them (cosmetic; ejections are no-ops now). `tmp/12b-snapshots/` holds the restore snapshots (gitignored). The dev server + opencode serve are STOPPED — the user's morning app launch will cold-start everything fresh (their strategy, free-openrouter, is exactly as they left it).
- **Behavior note:** an aborted SSE client does not stop the server-side run (probe B5 kept working for 25+ minutes after the deadline kill; the app's own silence watchdog warns but never auto-kills). This is #23-adjacent; not attempted tonight per the batch contract.
- **No deletions** outside my own session artifacts. **No secrets touched.** **Never pushed.**

---

## 6. Issue actions

| Issue | Action | Link |
|-------|--------|------|
| #50 next build fails | **CLOSED** — not reproducible on the committed tree (files never existed in git history); reopen conditions stated | texugo7badger/OLYMPUS#50 |
| #51 unattended stall at hard-gate | **CLOSED** — implemented + A/B probe evidence + "Self-approved (unattended run)" design doc | …#51 |
| #54 classification join key | **COMMENTED ONLY** (per contract — auditor closes) — implemented + id-join proof on both paths + fixture | …#54 |
| #55 demigod registry gaps | **FILED** — secrets-scanner uncommitted (fixed tonight) + phantom doc names | …#55 |
| #56 free strategy hard-fail | **FILED** — user's overnight feedback, with 7× spawn-warning evidence + stale free-models.json | …#56 |
| #57 probeServer 401 early-return | **FILED + FIXED** (240be87) — root cause of tonight's serve crash-loop | …#57 |
| #58 one-shot startup timer ignores output | **FILED** — fix direction included | …#58 |
| #59 probe-harness kills wrapper, not server | **FILED** — the 05:35 dev server served all evening while newer starts landed on 3738 | …#59 |

---

## 7. HOW TO TEST TOMORROW (auditor commands)

```bash
git fetch origin && git checkout night/12b-overnight   # cc642c1; never pushed — fetch from the machine that ran the night, or review the commits locally
git log --oneline 2bab1b3..HEAD                         # 13 commits

# 1. Build (Phase 1 / #50)
npm run build:app                                      # expect EXIT 0 (full npm run build needs ~3 GB disk quota for deb/tar.gz — see EDQUOT note)

# 2. Fixtures (Phase 3 / #54)
node scripts/agreement-metric.test.mjs                 # expect: 25× PASS, exit 0
node scripts/context-distill.mjs --self-test           # expect: 4× PASS, exit 0

# 3. The two #51 probes (needs a dev server + a working model strategy)
bash scripts/probe-harness.sh start && bash scripts/probe-harness.sh soak 30
curl -sN --max-time 300 -X POST http://127.0.0.1:3737/api/olympus/action \
  -H "Content-Type: application/json" \
  -d '{"action":"prompt","text":"Build a tiny testimonial section for a landing page.","conversationId":"audit-A"}' \
  | grep -a "clarifying question"                      # expect a hit → attended stall (probe A)
curl -sN --max-time 300 -X POST http://127.0.0.1:3737/api/olympus/action \
  -H "Content-Type: application/json" \
  -d '{"action":"prompt","text":"Build a tiny testimonial section for a landing page.","conversationId":"audit-B","unattended":true}' \
  | grep -aiE "assumption|override|unattended"         # expect autonomous progress, no clarifying question (probe B)

# 4. Join key over any new dispatch-forced probe window (Phase 3 / #54)
node scripts/agreement-metric.mjs ~/OLYMPUS-VAULT/06_Activity_Feed/live.jsonl --since "<probe window start>" --json \
  | grep -E 'id_joined_pairs|"join":"id"'              # expect id-joined pairs > 0

# 5. Cleanup
bash scripts/probe-harness.sh stop                     # NOTE: also kill the real next-server by port (issue #59)
```

**Branch + this report are the deliverables. Push status: never pushed.**
