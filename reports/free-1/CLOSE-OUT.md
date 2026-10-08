# MADRUGA-FREE-1 — CLOSE-OUT (the distributed pantheon night)

> The durable close-out packet, WRITTEN TO DISK BEFORE the chat summary (**#101**'s rule: the chat
> message is a pointer, never the payload). The night rode exactly **5 ff-only merges**, all
> pushed on origin/main: `7b00180` (Stage 0 paper) → `5812f44` (Batch A — the distribution) →
> `7018ced` (Batch B — the refresh anchor-pin) → `a4225db` (Batch C — the verification rider +
> the docs) → the close paper.

## 1. Why this session exists

The user's UAT attempt (2026-10-08) died on `Service temporarily overloaded` — the harness
behaved correctly (#98: retry, context preserved, honest exhaustion card, zero files written),
but the STRATEGY'S SHAPE was the defect: `free-nvidia-build` pinned apollo+atlas (the entry
lane, the single most-loaded) on `nvidia/nemotron-3-ultra-550b-a55b` — the most-contended
serving pool — 7 other gods shared ONE `z-ai/glm-5.3` pool, and callimachus+vaultLlm sat on a
banned nemotron nano. The user's directive: **fix the free tier — the maximum of the NVIDIA
free catalog with DIFFERENT model lanes per god, sharing context through Symphony. NO
Nemotron (the user's ban: low effective context).** Filed as **#106** (labels:
enhancement+free-tier+harness; the live failure transcript as the body).

The same anchor models are the GO plan's open-weight line (verified present in the GO
catalog: `opencode-go/glm-5.3`, `opencode-go/glm-5.3-flash`, `opencode-go/kimi-k3`,
`opencode-go/deepseek-v4.1-flash` — sized honestly; nothing missing).

## 2. Entry gates (all green BEFORE work — verbatim evidence)

| Gate | Verdict |
|---|---|
| E1 | `main == origin/main == 101d5c7` — the RESOLVE-1 night never landed (no IN PROGRESS row, nothing to race, no RESOLVE-1 payload); the SERVE-1 working-tree sha-fill (the QUEUE row's fifth sha `101d5c7` + the close-out trail) was THIS session's Stage 0 payload, re-applied in the worktree byte-identical to the principal tree's diff (verified by diff-of-diffs) |
| E2 | budget-guard BOTH surfaces exit 0 (LIVE 9 lanes ≥ 8192; GENERATOR 16/16); `grep -c 'glm-5.2' opencode.json` = **0**; check-strategy-sync **9/9** exit 0 |
| E3 | open set exactly **#76 + #78–#96 + #100 + #101 = 22** (gh re-derived before any mutation); next free number **#106** — filed at Stage 0 |
| E4 | **battery-28 green on this session's OWN run** (25 suites via npx tsx + context-distill 4/4 + telemetry-slice 10/10 + tsc 0), run in the healed worktree. Logs: `/tmp/opencode/free-1-battery/entry/` |
| E5 | R4 live config sha256 `5534ceab9cfe160da3c5efa4a13c1e8dc8c3df6c2be0d3f0c5b65decabbd3d52` (31863 bytes) — byte-identical to the SERVE-1 baseline (the live config UNCHANGED since UAT-FIX-1: the user's failed UAT ran against exactly these bytes); snapshotted to `/tmp/opencode/free-1/opencode.json.r4-snapshot`; NEVER staged, NEVER committed |
| E6 | Only foreign processes at entry (the Zed external-agents opencode ACP PID 9193 — the user's editor runtime; stremio) — nothing touched, nothing killed; no listener on :3777 / :3015 / :3737 / :3740 |
| E7 | The worktree heal (SERVE-1's recorded finding, pre-paid): `/home/texugo/Projects/olympus-free-1` from `101d5c7`, node_modules hardlinked, the gitignored runtime artifacts copied (`.opencode/package.json` tsx CJS mode + package-lock + `.opencode/.gitignore` + both dist dirs) — the full battery green in the worktree on the first run |
| E8 | **The live probe gate — `reports/free-1/s0/E8-LIVE-MODEL-VERIFICATION.md`**: 80 models live TODAY (the list fetched + committed at `s0/nvidia-models-2026-10-08.json`); all 5 anchors PRESENT; the pings: `z-ai/glm-5.3` **HTTP 200 / 834ms**, `z-ai/glm-5.3-flash` **HTTP 200** (one ping slow at 32,367ms — recorded honestly), `moonshotai/kimi-k3` **HTTP 200 / 1,181ms** (said "OK"), `meta/muse-glimmer-30b` **HTTP 200 / 1,963ms**; **`deepseek-ai/deepseek-v4.1-flash` DEAD — 3 consecutive timeouts (60s curl; 90,335ms + 90,364ms read timeouts) — EXCLUDED from the assignment, disclosed**; honest context windows per the LIVE model cards (kimi-k3 **1,048,576**; muse-glimmer-30b **131,072** — NOT 1M; glm-5.3/flash 1M per the curated overrides) |

## 3. The distribution — the final anchor table (every adjustment disclosed)

**The law** (asserted by suite #26 `scripts/free-pantheon.test.mjs`, 40 assertions): every god
on exactly ONE family-lane anchor; ZERO nemotron anywhere (gods + vault + small); the three
heavy paths on three DISTINCT pools; the volume lane = flash; ≤3 gods per anchor; every
assigned id probe-verified; all four mirror surfaces agree; the generator table carries only
the family lanes with honest limits.

| God / role | Lane | Pool | The why |
|---|---|---|---|
| apollo | `nvidia-glm/z-ai/glm-5.3` | GLM-5.3 (753B) | the entry/interviewer — **ADJUSTED**: the default put apollo on deepseek-v4.1-flash (8B-active fast lane), but that pool was DEAD at the E8 probe (3× timeouts — excluded, disclosed); apollo takes the house's own go-max-quality shape (GLM-5.3, the sacred apollo pin in the GO plan) |
| atlas | `nvidia-glm/z-ai/glm-5.3-flash` | flash | telemetry/reasoning on the fast lane (the directive's default) |
| artemis | `nvidia-kimi/moonshotai/kimi-k3` | Kimi K3 (2.8T) | security/audit — long-horizon analysis (the directive's default) |
| athena | `nvidia-glm/z-ai/glm-5.3-flash` | flash | the frontend-kit god — **ADJUSTED**: the default put athena on glm-5.3, but apollo took that pool; athena moves to the flash lane (320B/18B-active MULTIMODAL MoE — role-fit PLUS for her visual-verification lane; 1M ctx keeps the frontend-kit headroom) |
| dionysus | `nvidia-glm/z-ai/glm-5.3` | GLM-5.3 | verification/quality — strong reasoning (the directive's default) |
| hephaestus | `nvidia-kimi/moonshotai/kimi-k3` | Kimi K3 | the build god — the strongest long-horizon coding + agentic anchor (the directive's default; the heavy-code path gets the 2.8T, NOT the 30B) |
| hermes | `nvidia-meta/meta/muse-glimmer-30b` | Muse Glimmer (29.6B) | the messenger — **ADJUSTED**: the default put hermes on deepseek (dead pool); hermes takes the alternate fast anchor (multimodal, tool-calling, SWE-Bench 76.0 for a 30B) — the honest window 131,072 recorded, never inflated |
| persephone | `nvidia-glm/z-ai/glm-5.3` | GLM-5.3 | schema work wants strength (the flash lane was full at the ≤3 cap) |
| prometheus | `nvidia-kimi/moonshotai/kimi-k3` | Kimi K3 | planning — long-horizon (the directive's default) |
| callimachus | `nvidia-glm/z-ai/glm-5.3-flash` | flash | the heartbeat/summarizer — the FAST lane (the directive's explicit pin) |
| vaultLlm | `nvidia-glm/z-ai/glm-5.3-flash` | flash | vault notes = volume, not depth (the directive's explicit pin) |
| small_model | `nvidia-glm/z-ai/glm-5.3-flash` | flash | titles/compaction = volume work; **ADJUSTED**: the old free small_model was the banned `openrouter/nvidia/nemotron-3-nano-30b:free` — zero nemotron covers the small lane too |

Anchor census: GLM-5.3 = 3 gods (apollo, dionysus, persephone) · flash = 3 gods + 2 roles
(atlas, athena, callimachus + vault + small) · Kimi K3 = 3 gods (hephaestus, artemis,
prometheus) · Muse Glimmer = 1 god (hermes) · DeepSeek = **ZERO** (dead pool — its family
entry stays in the pinned set, disclosed). **The heavy three: apollo (GLM-5.3), athena
(flash), hephaestus (Kimi K3) — three distinct pools. Zero nemotron anywhere.**

**The provider split** (`NVIDIA_FAMILY_PROVIDERS` in apply-strategy.js): `nvidia-glm` /
`nvidia-deepseek` / `nvidia-kimi` / `nvidia-meta` — each `npm: @ai-sdk/openai-compatible` +
`options.baseURL: https://integrate.api.nvidia.com/v1` + ONLY its family's models with
honest limits (output 16384 — the #76 bar; contexts = the live model cards). **Empirically
verified end-to-end BEFORE the design was committed**: a scratch config with exactly this
shape dispatched `nvidia-glm/z-ai/glm-5.3` → "OK" through the real opencode binary (both the
`options.apiKey` form and the auth.json-per-family-id form — the latter is the shipped
shape). Key sourcing: the sanctioned apply mirrors the user's own `nvidia` auth.json key to
the four family ids (the standard /connect storage; NO new secret material; auth.json is
never tracked by git). Fixtures XDG-isolate the mirror (see the honest finding below).

**Symphony verified, untouched** (the user's context-sharing directive): no bus code changed;
the telemetry-pulse + symphony-cable suites green in every battery run; **the live dispatch
smoke** (§6.3) proves the cable flows with the mixed-model pantheon. The design principle,
stated for the record: **the cable carries context between pools; models are lanes, not
silos.**

## 4. The work — five ff-only merges, all pushed

### 4.1 Stage 0 — paper (`7b00180`)
The filing **#106** + tonight's IN PROGRESS QUEUE row + SERVE-1's rolling sha-fill (the
fifth merge sha `101d5c7` in the QUEUE row + the close-out trail — the payload the previous
night left riding this session) + `reports/free-1/` (FILING-LOG + this skeleton) + the E8
record (the live model list + the pings verbatim).

### 4.2 Batch A — the distribution (`5812f44`)
`feat(strategies): the distributed free pantheon — per-god model lanes, no single pool, no
nemotron…`
- **RED-first suite #26** `scripts/free-pantheon.test.mjs`: RED **20 violations naming the
  defect verbatim** — `apollo/atlas=nvidia/nvidia/nemotron-3-ultra-550b-a55b`,
  `callimachus/vaultLlm=nvidia/nvidia/nemotron-3-nano-omni-30b-a3b-reasoning`,
  `nvidia/z-ai/glm-5.3=7` (the single pool), the heavy three sharing pools, the family lanes
  absent, `NVIDIA_FAMILY_PROVIDERS` absent (`reports/free-1/s1/RED-verbatim.txt`) →
  **GREEN 40/40**.
- **The cure across four mirror surfaces**: model-strategies.ts (canonical: gods, vaultLlm,
  terminalModel, reasoning/codeModel, the description, FREE_MODEL_CLASSES → the 5 family
  lanes, the NVIDIA_FREE_MODELS family filter) + apply-strategy.js (BUILTIN_STRATEGIES +
  FREE_MODEL_LIMITS → the family lanes with honest limits + `NVIDIA_FAMILY_PROVIDERS` +
  `SMALL_MODEL_FREE_NVIDIA` + the anchor-pin `getNvidiaBuildModelMap` + the family-provider
  writer + the auth mirror + the L4 preflight's family remap + the XDG-respecting auth dirs)
  + olympus-hooks.ts STRATEGY_GODS + settings-dialog.tsx (the mirror + the catalog + the
  description — **which also killed a latent duplicate**: `nvidia/nvidia/nemotron-3-nano-omni-30b-a3b-reasoning`
  appeared TWICE in ALL_CLASSES, #97's exact crash class, hidden behind the dedup boundary) +
  provider-settings.tsx (the description) + check-strategy-sync.js (the family prefixes in
  all 8 alternation sites — without them the checker would go blind on family ids).
- **`free-lane-generator.test.mjs` updated to the doctrine**: the fixture's fake "stronger
  nemotron live #1" must appear NOWHERE in a generated config (the anchor-pin, asserted);
  the retired-anchor loud failure (a stub catalogue without a pinned id → exit 1 + the D19
  message + the suggestion; `--force` warns loudly); the family entries + honest limits +
  the old single-provider block GONE, asserted at the generated-config level. 26/26.
- **The GO catalog verified**: all four anchors present in `KNOWN_GO_MODELS` — nothing
  missing.

### 4.3 The sanctioned apply (R4's legal move) + the new baseline
Snapshot at E5 (`5534ceab…`) → `node scripts/apply-strategy.js --strategy free-nvidia-build`
→ **56 changes**: every god moved to its family lane, the four family providers written, the
old single-`nvidia` provider block F3b-cleaned (all four nemotron-era lanes removed + the
empty block), the auth family mirror written IN THE OPEN (`mirrored the NVIDIA key to 4
family auth entries`), the L4 preflight GREEN. **The NEW R4 baseline:
`4e6b35ac7611fb583cc453edef743d470f68443394fb52aa48020357e6929619` (33568 bytes)** —
byte-stable across two re-applies (idempotent; the re-apply logs "all anchor lanes verified
live (41 models in the refresh list)" after the Batch C rider). Budget-guard BOTH surfaces
GREEN against the new bytes (LIVE 10 lanes + GENERATOR 16/16); glm-5.2 = 0. The 3 remaining
`nemotron` strings in the live bytes are the **openrouter** provider block's limit metadata
(the other free strategies' catalog — zero assignments use them; the ban governs
assignments, which are clean).

### 4.4 Batch B — the refresh anchor-pin (`7018ced`)
`fix(scripts): the refresh anchor-pin — the free-model scorer serves the distribution, never
overrides it…` — `NVIDIA_ANCHOR_PINS` (the user-pinned set on the family lanes), the curated
`NVIDIA_RENAMES` table (applied ONLY when the old id left the list AND the new id is live —
never a heuristic guess), the dead-anchor LOUD path (stderr + `dead_anchors` + exit 1 after
the write), **the nemotron ban on the ranked lists FOREVER** (16 ids banned loudly at the
live run), the within-set scorer, import-safe with the pure resolver exported. **Suite #27**
`scripts/refresh-anchor-pin.test.mjs`: RED 6 → **GREEN 16/16** (the stronger-nemotron list
changes nothing; the rename updates; the dead anchor flags with zero swap). **The live
refresh run GREEN** (`s2/refresh-live.txt`): 14 OpenRouter models, 41 NVIDIA models
post-ban, **all 5 anchors verified OK** with within-set scores — and the deepseek anchor's
role note carries its dead-pool disclosure.

### 4.5 Batch C — the verification rider + the docs (`a4225db`)
The **honest finding**: after the live refresh, a re-apply screamed a FALSE "10 lane(s) not
in the live refresh list" — the apply-side availability check compared bare ids against the
refresh file's `nvidia/`-prefixed ids, and the generator fixture carried a FANTASY shape
(bare ids) so the suite never caught the drift. RED-first (the false positive, verbatim) →
the check normalizes (`rawId || id`, prefix-stripped) + the fixture carries the REAL shape +
the happy-path assertion ("all anchor lanes verified live") → GREEN 27/27. **The docs
surface**: MODEL-STRATEGIES.md (the distributed doctrine + the anchor table + the provider
split + the ban), TOKEN-ECONOMY.md (the anchor lanes, the 40-RPM aggregate vs per-model
pool contention, the Symphony compression math that fits 9 gods + the vault in the window),
AGENTS.md (the standing note: **models are lanes; the cable carries context**).

## 5. STATE AT END (the machine truth, the session's own runs)

| Gate | Verdict |
|---|---|
| The user's failure path | **DEAD** — two live dispatches through the new lanes, ZERO "Service temporarily overloaded" (§6) |
| The doctrine, asserted | free-pantheon **40/40**; free-lane-generator **27/27**; refresh-anchor-pin **16/16**; sync **9/9** |
| Battery | **30 at close** (27 suites + 2 self-tests + tsc 0) — green at entry (28), per batch (29/30), and at close, on the session's OWN runs; the honest count follows the two new suites. Logs: `/tmp/opencode/free-1-battery/{entry,batchA,batchB,batchC,atclose}/` |
| Guard | BOTH surfaces exit 0 against the NEW live bytes (LIVE 10 lanes ≥ 8192; GENERATOR 16/16) |
| R4 | **`4e6b35ac…` (33568 bytes) — the new baseline** (the distributed pantheon); the E5 restore target `5534ceab…` never needed; NEVER staged, NEVER committed |
| glm-5.2 | 0 |
| The never-staged pair | `opencode.json` (the apply's bytes — R4) + `reports/uat-r1/SPAWN-INVOCATION.sh` (the user's UAT-prep edits) — never staged by this session, working-tree-only |
| Hygiene | zero CJK in the night's total diff (`git diff 101d5c7..a4225db` grep-count **0**); zero orphans (every session-spawned process exited; only the user's own Zed ACP + stremio remain — never touched); no listener on :3777/:3015/:3737/:3740; the worktree removed at close |
| Tracker | **#106 CLOSED** with merge-sha + evidence (the close comment carries the RED→GREEN tails, the E8 record, the new R4, the live proofs); open set re-derived: **exactly 21** (#76 + #78–#96 + #100 + #101); #76/#86/#100/#101 untouched |
| The frozen surface | the live-preview component + route (PREVIEW-1's freeze) — untouched (zero diffs in the night's total); #100 untouched |

## 6. The live proofs (verbatim — `reports/free-1/s2/`)

### 6.1 The user's failure path, re-run green — apollo's lane
```
2026-10-08T17:36:15Z
$ ./node_modules/.bin/opencode run "reply with exactly: OK"
> apollo · z-ai/glm-5.3
OK
APOLLO EXIT: 0   (17:36:25Z)
```
The user's exact path — an interactive first-turn dispatch through the entry god — now rides
the GLM-5.3 pool through the `nvidia-glm` family entry. **ZERO "Service temporarily
overloaded".**

### 6.2 Athena's lane
```
2026-10-08T17:36:50Z
$ ./node_modules/.bin/opencode run --model nvidia-glm/z-ai/glm-5.3-flash "reply with exactly: OK"
> apollo · z-ai/glm-5.3-flash
OK
ATHENA-LANE EXIT: 0   (17:37:58Z)
```
(`--agent athena` honestly refuses — she is a subagent, not a primary; the lane proof rides
her exact model lane + family entry instead — the transport her dispatches take. The flash
pool's variable latency (68s for this 16-token ask) is recorded honestly — it completes,
zero overload.)

### 6.3 The Symphony dispatch smoke (the cable flows with the mixed pantheon)
```
$ opencode run --print-logs "Use the olympus-dispatch tool exactly once … dispatch a tiny
  task to the code-verifier demigod … then reply DISPATCHED"
⚙ olympus-dispatch {"artifacts":["/tmp/opencode/verify-2plus2-result.txt"],"budgetTokens":256,
  "demigod":"code-verifier","doneCondition":"code-verifier replies OK after verifying 2+2=4",
  "godId":"apollo","outputShape":"single-line reply: OK","task":"verify that 2+2=4 and reply OK"}
… message="stream providerID=nvidia-glm modelID=z-ai/glm-5.3 session.id=ses_ee34d… agent=apollo mode=primary"
DISPATCHED      SMOKE EXIT: 0
```
The bus grew 6 → 8 records: seq 7 the **dispatch** (apollo → code-verifier,
`parentGod: hephaestus` — the Kimi K3 lane — with the Vault anchor), seq 8 the
**dispatch-outcome** — an honest `failure` with the E4 contract violation verbatim: *"dispatch
declared 1 artifact(s) and produced ZERO"* (the 256-token-budget demigod never wrote its
declared artifact — the enforcement fired EXACTLY as designed, the CERT-P1 shape the
symphony-cable suite tests hermetically; a tight budget, not a machinery defect). **The
cable carries context between pools — the mixed-model pantheon flows end-to-end.**

### 6.4 The live refresh (Batch B's proof — `s2/refresh-live.txt`)
```
NVIDIA ban: 16 nemotron id(s) excluded from the ranked lists (the user's ban — forever)
NVIDIA Build: 41 chat models fetched (public list, nemotron banned)
  anchor OK nvidia-glm/z-ai/glm-5.3            (ctx 1000000, within-set score 100 — the entry lane)
  anchor OK nvidia-glm/z-ai/glm-5.3-flash       (ctx 1000000, within-set score 105 — the volume lane)
  anchor OK nvidia-kimi/moonshotai/kimi-k3      (ctx 1048576, within-set score 100 — the coding lane)
  anchor OK nvidia-meta/meta/muse-glimmer-30b  (ctx 131072,  within-set score 20.6 — the alternate fast)
  anchor OK nvidia-deepseek/deepseek-ai/deepseek-v4.1-flash (… the dead-pool disclosure in the role note)
REFRESH EXIT: 0    (2026-10-08T17:52:26Z → 17:52:27Z)
```

## 7. Honest findings + observations (disclosed, none hidden)

1. **The fixture auth leak (mine, fixed in the open):** my FIRST post-cure battery run
   executed the generator suite BEFORE the XDG isolation existed — the fixture's applies
   mirrored the family keys into the REAL `~/.local/share/opencode/auth.json` (the user's
   OWN key under 4 family aliases — no new secret material, but an unintended write from a
   test). Detected by post-run inspection; the entries were REMOVED (the 4-key pre-night
   state restored); the fixtures got `XDG_DATA_HOME` isolation (checked into Batch A); the
   SANCTIONED apply then wrote the same entries in the open, logged. The suite's R4 guards
   covered ~/.olympus + the repo config but not auth.json — the isolation closes that class.
2. **The availability-check false positive (mine, RED-first fix in Batch C):** §4.5 — the
   fixture tested a fantasy refresh-file shape; the check now reads the real one.
3. **The latent ALL_CLASSES duplicate (pre-existing, killed by the catalog replacement):**
   `nvidia/nvidia/nemotron-3-nano-omni-30b-a3b-reasoning` appeared TWICE in
   settings-dialog.tsx's ALL_CLASSES — #97's exact crash class, invisible while the dedup
   boundary held. The nvidia section's replacement to the 5 family lanes removed it.
4. **The deepseek pool is dead tonight** — 3 consecutive probe timeouts; the anchor is
   EXCLUDED (zero gods) with its family entry retained for the pinned set. Its recovery
   (or a future reassignment) is a refresh + apply away, honestly disclosed every time the
   anchor prints its role note.
5. **The flash pool's variable latency** — one ping at 32,367ms, the lane proof at 68s for
   a 16-token ask; both completed. If the flash lane degrades further, the volume work can
   move to Muse Glimmer (the alternate fast) in a single apply — the doctrine makes
   reassignment a table edit, never a rewrite.
6. **Docs observation (NOT tonight's scope):** TOKEN-ECONOMY.md's GO/ZEN tables still say
   "GLM-5.2" for Apollo in prose (the models are GLM-5.3 since the rotation; AN-S4-3 fixed
   only the free-NVIDIA mentions). A one-line docs errata for a future paper night.
7. **The dependabot advisory (#60)** surfaced on every push tonight — pre-existing, out of
   scope, untouched.

## 8. Taxonomy check

- `#106 feat(free-tier): the distributed pantheon — per-god model lanes, no single pool, no
  Nemotron (the user's UAT dead on "Service temporarily overloaded") [enhancement,
  free-tier, harness]` — on-pattern at filing; **CLOSED** with the merge sha + the full
  evidence (the RED→GREEN tails, the E8 probe record, the new R4, the live proofs).
- Zero CJK in the night's total diff (`git diff 101d5c7..a4225db` — grep-count 0).
- Issues touched tonight: only #106 (filed + closed by this session). #76/#86/#100/#101
  verified untouched in the open set.

## 9. The frontier for the auditor + the user

The auditor re-verifies at the frontier: the 5-merge ff chain (`7b00180` → `5812f44` →
`7018ced` → `a4225db` → the close paper), re-runs the new suites on an independent bench
(free-pantheon 40/40, refresh-anchor-pin 16/16, free-lane-generator 27/27), re-probes the
anchors, re-derives the open set (exactly 21). **Then the user re-runs his UAT (the Lumina
build) on the distributed pantheon — his run is the gate.**
