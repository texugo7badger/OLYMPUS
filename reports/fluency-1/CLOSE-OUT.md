# MADRUGA-FLUENCY-1 — CLOSE-OUT (the fluency + intake night, report-day 2026-10-09)

> The durable close-out packet, WRITTEN TO DISK BEFORE the chat summary (**#101**'s rule: the chat
> message is a pointer, never the payload). The night rode exactly **8 ff-only merges**:
> `dddf15c` (Stage 0 paper) → `168295d` (Batch A — #107) → `e6bf404` (Batch B — #108) →
> `de58ef1` (Batch C1 — the hop runtime core) → `098e422` (Batch C2 — the planner contract + docs)
> → `bcde5d8` (Batch D1 — the intake core + trigger) → `79728dc` (Batch D2 — the route wiring) →
> the close paper (this file + the rider). All pushed on origin/main.

## 1. Why this session exists

The user's UAT re-run (2026-10-09 16:17–16:23Z, the Lumina CRM architectural build through Apollo
on free-nvidia-build, R4 `4e6b35ac…`) died on retry exhaustion at ~80%: two "Service temporarily
overloaded" bursts absorbed (5s retry, work continued — fixtures.ts 484 lines + globals.css 221
lines written), a third outlived retry 2/2 (15s) → task exit −1, ~5.5 min of work lost. The
verdict: **the machine must deliver a finished-product feel even on free pools** — fluency +
quality on free mode, the free-token economy proven with measured data, the GO plan the fallback
valve never the default. Plus the pinned intake directives (no folder at open; the first prompt
decides; autonomous registration; the dev server auto-runs for the live preview).

The doctrine, extended one sentence (landed in AGENTS.md + TOKEN-ECONOMY.md, Batch C2):
**Models are lanes; the cable carries context. Sessions are lanes; the disk carries the campaign.**

## 2. Entry gates (all green BEFORE work — verbatim in `s0/ENTRY-GATES.md` + `s0/e8-anchor-pings.txt`)

| Gate | Verdict |
|---|---|
| E1 | `main == origin/main == 3aa298a` (FREE-1 close paper); nothing races; the FREE-1 frontier sha-fill rode this session's Stage 0 |
| E2 | budget-guard BOTH surfaces exit 0 against R4 (10 lanes + generator 16/16); `glm-5.2` = 0; sync **9/9** |
| E3 | open set re-derived: {76, 78–96, 100, 101} = **22 rows** — the brief's own enumeration matches exactly (its headline "21" was an off-by-one in the brief; disclosed); next free **#107** |
| E4 | battery **27/27 suites + tsc 0** on this session's OWN run (the frontier's 30 = 27 + sync + guard + tsc) |
| E5 | R4 `4e6b35ac7611fb583cc453edef743d470f68443394fb52aa48020357e6929619` (33568 bytes) snapshotted to `/tmp/opencode/fluency-1/opencode.json.r4-snapshot`; NEVER staged, NEVER committed |
| E6 | no listeners on :3777/:3015/:3737/:3740; the user's Zed ACP + stremio foreign, untouched; his `SPAWN-INVOCATION.sh` UAT edit foreign, untouched |
| E7 | worktree evaluated, **not needed — the principal tree used directly** (disclosed): budget-guard's LIVE surface must read the R4 bytes, which exist only in the principal tree (R4 is never committed) |
| E8 | **all 5 anchors re-probed** (the user's run died on glm-5.3 TODAY): `z-ai/glm-5.3` **200/709ms** (the killing pool serving again), flash **200/30989ms**, kimi-k3 **200/1042ms**, muse-glimmer **200/1864ms**; **deepseek DEAD AGAIN — HTTP 000 at 60s** (second consecutive night; zero god assignments in R4, disclosed) |

## 3. The filings

`#107` (retry crescendo) · `#108` (preflight key-sight) · `#109` (hop runtime) · `#110`
(autonomous intake + dev-server trigger) — `FILING-LOG.md`; all taxonomy-clean at creation.

## 4. The work — the eight merges

### 4.1 Stage 0 — paper (`dddf15c`)
Filings #107–#110 + tonight's IN PROGRESS QUEUE row + the FREE-1 frontier sha-fill `3aa298a` +
`reports/fluency-1/` (FILING-LOG + CLOSE-OUT skeleton + the entry gates + the E8 probe record).

### 4.2 Batch A — #107 the retry crescendo (`168295d`) — **#107 CLOSED @ `168295d`**
`resolveRetryPlan()` — the default crescendo `[5s, 30s, 120s, 300s]` (~7.5 min patience; $0 on
free, only time) + 0–30% jitter, attempts = list + 1, env-overridable
(`OLYMPUS_RETRY_BACKOFF_MS` / `OLYMPUS_RETRY_RATE_LIMIT_MS` / `OLYMPUS_RETRY_JITTER`);
`classifyRetry` (now exported) splits the provider class: **429 = the key-limit lane** (fixed
cap-aware backoff), 503 / provider_overloaded / stream_idle_timeout / 5xx = the crescendo;
400/401/403/404 never. The #98 card gains the **patience ledger** ("waited 30ms across 3 retries
(upstream 429 x3)") and the count follows the env list. Suite RED 4 → **GREEN 79/79**.
Cross-linked to #83 (the D14/D15 class; the sizing MATRIX stays #83's scope — closing it on the
crescendo alone would be evidence-less, so it stays OPEN with the pointer — disclosed deviation
from the brief's "closes #83", the brief's own taxonomy rule wins).

### 4.3 Batch B — #108 the preflight key-sight (`e6bf404`) — **#108 CLOSED @ `e6bf404`**
`authLaneCensus(authDirs?)` enumerates EVERY provider id in both auth.json paths; the nvidia
family satisfaction (bare id OR the #106 family mirrors); the GO valve detected (`opencode-go`);
`freeTierPreflight` renders the census + alternatives + the GO line; `retryExhaustionGuidance`
computes alternatives from the CENSUS + names the GO valve: `GO key present: node
scripts/apply-strategy.js --strategy go-balanced (premium valve)`. Never auto-switches. New suite
#28 RED 4 → **GREEN 20/20**. The live card on this box now names all 8 real lanes
(`groq, nvidia, nvidia-deepseek, nvidia-glm, nvidia-kimi, nvidia-meta, opencode-go, openrouter`)
+ both free alternatives + the GO valve — exactly what the 16:23Z death should have shown.

### 4.4 Batch C — #109 the hop runtime (`de58ef1` + `098e422`)
`src/lib/hop-runtime/`: `plan-schema.ts` (the dispatch-plan.json contract; a 15-row garbage
table dies loudly at plan time; `MAX_HOP_BUDGET_TOKENS` 16384 = the #76 bar; `after[]` DAG edges
+ cycle check), `hop-state.ts` (park/resume; corrupt-state refusal), `verify.ts`
(deterministic-first: file-exists per artifact + build/lint — 0 tokens; `review:'llm'` the
honest not-wired note), `walker.ts` (the spine: prompt = slice + FILE POINTERS; concurrency ≤ 3
the #106 law; park on exhaustion/verify-fail/dispatch-fail with in-flight settle; durable state
after every settle; per-hop telemetry JSONL; the default `spawnHopDispatcher` rides the one-shot
model-lane transport with the **#107 crescendo INSIDE** — `resolveRetryPlan` + `classifyRetry`
reused). The `[OLYMPUS-PLANNER]` contract block on the action route (gated on
`classification.needsPlanning`, riding AFTER the prompt — the #65 marker-order pins stayed
green). AGENTS.md + TOKEN-ECONOMY.md gain the doctrine sentence + the hop economics. Suite #29
RED 6 → **GREEN 40/40** (the cap used + held — max in flight exactly 3 across 4 runnable roots;
topological order; park + resume across two walks with 4 telemetry rows; the liar-hop
verify-fail park; verify burns zero dispatches).

### 4.5 Batch D — #110 the autonomous intake + the trigger (`bcde5d8` + `79728dc`)
`project-intent.ts`: `classifyFirstPrompt` (pure, deterministic, no LLM — word-set Jaccard;
quoted/`called|named|titled` extraction with stopword filtering; derived names; 1 match →
existing, ≥ 2 → the HITL `ask` seam, none → new) + `resolveAndRegisterIntent` (new →
`quickIntake` with the classifier's stack hints + `setActiveProject`; the lane project dir
explicit — `02_Projects/<slug>`). `dev-server-trigger.ts`: `detectFrontendDevScript` (dev script
+ frontend marker) + `maybeStartDevServer` (gate → manager.start → bounded probe poll → the
**#105 doctrine**: probe evidence or the honest refusal). `intake-orchestrator.ts`:
`laneProjectDir` threading + `quickIntake` manualStacks. The action-route wiring: the intent
stage before dispatch (trivial-gated, non-fatal), the outcome as a session log event, the
post-success dev-server trigger. Suite #30 RED 6 → **GREEN 31/31** (the 9-row classification
table; the 6-row gate table; the e2e through the REAL manager on real ephemeral servers —
probe-green with latency + url + HTTP 200 marker + clean stop; the three honest refusals; the
lane-dir + route pins).

### 4.6 The rider (the close paper) — disclosed
Three REAL bugs found by the live exit gate + one by re-reading, all cured in the rider:
1. `src/lib/stack-detector.ts:112` used `require('path')` in ESM → the intake crashed
   (`require is not defined`) on ANY route call. Cured with the top-level import.
2. `resolveAndRegisterIntent` pre-mkdir'd the lane dir → collided with createProject's
   existence check; AND `createProject` rejected a bare dir containing no project. Cured: no
   pre-mkdir + the guard now means a REAL project (`project.md` present) — a duplicate of a
   real project still throws (suite re-run green).
3. The walker's `--format json` parser missed the bare `{type:'step-finish', tokens}` shape
   (probe-verified against the live CLI). Cured tolerant of both shapes.
4. The smoke harness itself: the lane reset ordering + the `noDuplicate` arithmetic (harness
   bugs, cured; the intake proof then went GREEN).

## 5. The exit gates — VERBATIM

| Gate | Verdict |
|---|---|
| **The intake autonomy proof** | **GREEN** (`s5/intake-proof-transcript.txt`, 0 LLM tokens): no project → the prompt created `fluency-smoke` in `~/OLYMPUS-VAULT/02_Projects/` with `name: Fluency Smoke`, the description, `stacks: [html, css, javascript]`, path + livePreviewPort + vscode workspace; the active project set; a SECOND matching prompt → `existing: fluency-smoke` (score 0.50), **zero duplicates** |
| **The live smoke on FREE** | **BLOCKED — the free pools are globally throttled at smoke time (REPORTED, not claimed — #105)**: NVIDIA raw curl **HTTP 429 ×4 across ~40 min of silence** (`{"status":429}`) and OpenRouter `google/gemma-4-31b-it:free` also 429 ("temporarily rate-limited upstream") at 01:32–01:47Z; no local consumer exists (only the user's stremio/Zed ACP; no live nvidia connections). **The machinery evidence nonetheless**: (a) run 1 — the flash lane dispatched, verify-failed honestly (artifacts not yet on disk), **PARKED with state + telemetry rows**, the resume re-dispatched and the artifacts DID land (index.html 1574B + styles.css 2976B written by the model during the slow window — the disk carried the campaign); the resume was killed at the 15-min per-hop ceiling seconds after the writes; (b) the diagnostic `--print-logs` run captured the exact 429 class + opencode's internal retry cadence; (c) the suite's e2e proves the trigger path end-to-end on real servers |
| **The preview proof** | **GREEN at the suite level** (real manager + real ephemeral server: probe-green latency + url + HTTP 200 + marker + clean stop — `s4/batchD-GREEN.txt`); the LIVE lane trigger was blocked by the throttle (no package.json written on the lane) — REPORTED |
| Battery | **30/30 suites + tsc 0** at close on this session's OWN run (`/tmp/opencode/fluency-1-battery/atclose/`) — entry 27, +auth-lane-census, +hop-runtime, +first-prompt-intake |
| Guard / sync / glm-5.2 | both surfaces exit 0; **9/9**; **0** |
| R4 | **byte-identical** at entry + close (`4e6b35ac…`, 33568 bytes) — untouched; never staged/committed |
| Frozen pair | **zero-diff** (`live-preview.tsx` + the preview route, `3aa298a..HEAD`) |
| CJK / orphans | **0 CJK** in the night's total diff + the rider; zero session orphans; no listeners on the four ports; stremio + the user's Zed ACP foreign, untouched |
| The never-staged pair | `opencode.json` (R4) + `reports/uat-r1/SPAWN-INVOCATION.sh` (the user's UAT edit) — never staged by this session |

## 6. Honest findings (disclosed, none hidden)

1. **The brief's E3 count was an off-by-one** ("exactly 21" vs its own enumerated set = 22);
   the tracker was re-derived and matches the ENUMERATION. No drift, next free #107 as briefed.
2. **#83 stays OPEN** (the brief's parenthetical said "#107 closes #83"): #83's acceptance is a
   measured sizing MATRIX (K-sweep + re-read ratio + variance) — the crescendo cures the CLASS,
   the matrix remains open scope; the cross-link is recorded on both issues (the brief's own
   taxonomy rule requires evidence for closure).
3. **The batchC battery's first run was polluted by MY OWN toolkit**: a per-suite `timeout 180`
   wrapper SIGKILL'd the exit-gate suite mid-run and orphaned a `next dev` — which the
   exit-gate suite's OWN hygiene check then caught (the check WORKED). The orphan was killed;
   the battery re-run green with the plain house invocation (no wrapper). Disclosed as a
   tooling lesson, not a product defect.
4. **The live smoke found three real product bugs** (require-in-ESM in stack-detector; the
   mkdir/createProject collision; the createProject bare-dir guard) + one parser gap — all
   cured in the rider, all suites re-run green. This is the exit gate doing its job: the
   bugs were INVISIBLE to the battery (no suite exercised the full conversational intake E2E).
5. **The flash lane's generation latency is glacial under contention** — the athena hop
   needed 8–10 minutes to write two files (vs. its 30s ping). The smoke was re-planned onto
   apollo (glm-5.3, the 709ms lane) + hephaestus (kimi) — but the 429 throttle then blocked
   the re-run entirely. The doctrine note for the user: the flash lane is fine for volume
   (titles/compaction) but a poor big-write lane under load; reassignment is a table edit.
6. **The free-tier weather tonight is the rush-hour class the user hit TODAY** — first 503s
   (his run), now global 429s (our smoke window). The machinery now ABSORBS (the crescendo)
   and PARKS (the hop runtime) this weather; tonight's smoke itself became the specimen.
7. **The smoke project's disposition**: `~/OLYMPUS-VAULT/02_Projects/fluency-smoke/` exists
   (note + the run-1 artifacts: index.html/styles.css + node_modules/vite from the preview
   attempt); it is now the ACTIVE project. This is the proof's own output — delete it via the
   app or keep it; disclosed for the user's call.
8. **E7 worktree deviation + the rider's scope** — both disclosed above; no other deviations.
9. The dependabot advisory (#60) surfaced on every push — pre-existing, out of scope, untouched.

## 7. Taxonomy check

- `#107 fix(harness): … [bug, harness, free-tier]` — CLOSED @ `168295d` with the RED→GREEN +
  battery evidence.
- `#108 fix(harness): … [bug, harness, free-tier]` — CLOSED @ `e6bf404` with the census +
  live-card evidence.
- `#109 feat(harness): … [enhancement, harness, free-tier]` — closes with this packet (the
  suite 40/40 + the run-1 park/resume evidence + the smoke-blocked disclosure).
- `#110 feat(intake): … [enhancement, autonomy, dev-server]` — closes with this packet (the
  suite 31/31 + the deterministic intake proof transcript).
- Zero CJK in the night's total diff (`3aa298a..the close paper` grep-count **0**).
- Issues touched: #107/#108 (filed + closed by this session), #83 (cross-link comment only,
  stays open).

## 8. The frontier for the auditor + the user

The auditor re-verifies at the frontier: the 8-merge ff chain (`dddf15c` → `168295d` →
`e6bf404` → `de58ef1` → `098e422` → `bcde5d8` → `79728dc` → the close paper), re-runs the
three NEW suites (auth-lane-census 20/20, hop-runtime 40/40, first-prompt-intake 31/31) +
the full battery (30), re-derives the open set (#76 + #78–#96 + #100 + #101 + #109/#110 until
re-closed), re-runs the deterministic intake proof, and re-probes the anchors. **The user's
own full UAT re-run (the real Lumina) remains HIS gate after tonight** — the machinery now
makes it survivable: bursts are absorbed by the #107 crescendo, and a burst that outlives it
PARKS a hop (state + artifacts on disk) instead of losing a 5.5-minute monolith. The smoke's
own throttle window is the live demonstration: the disc carries the campaign.
