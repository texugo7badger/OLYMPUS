# UAT-FIX-1 — THE STABILIZATION RECON REPORT (paper night)

> MADRUGA-UAT-FIX-1 · recon + filings + the build plan · paper-only, zero code changed on this branch.
> Report-day 2026-10-08; the UAT run's real span: **2026-10-07T16:44–16:52Z** (13:44–13:52 BRT, box clock).
> The doctrine, verbatim (texugo): the internal agent tests and stabilizes the machine FIRST; his manual
> UAT comes only when OLYMPUS at least works. The v0.0.3 Monday tag is SOFT ("ainda temos uma semana,
> não precisamos de pressa").

## 1. Origin — the user's night (verbatim evidence)

texugo's first interactive UAT attempt, inside the app, on **free-nvidia-build** (his curative apply at
16:44Z, live lanes verified). Five defects surfaced; four land on the tracker tonight, one is #86's live
case study:

- **F1 — Settings duplicate-key crash** (REAL UI defect): "Encountered two children with the same key,
  `nvidia/nvidia/nemotron-3-nano-omni-30b-a3b-reasoning`… at settings-dialog.tsx:1073 (`<option key={c} value={c}>`)".
- **F2 — provider-overload raw death**: Apollo classified (frontend · architectural → athena), 4 skills
  loaded, todos written, FIVE files written (+1040 lines) — then
  `retry 1/2: Transport failure — retrying in 5s; session context preserved [fetch failed]` →
  `OpenCode error: "Service temporarily overloaded"` → `OpenCode run failed → Task failed (exit code -1)`.
  His immediate "Continue!" hit the SAME overload instantly — no backoff, no guidance. The warm session
  WAS preserved (the one thing that worked).
- **F3 — project created INSIDE the repo**: `exemplo-landingpage/` now sits untracked in the working tree.
- **F4 — the half-built state**: warm session 6EVE3gnm + five files + NO lockfile + NO app/page.tsx —
  exactly #86's crash/recovery class. Filed as evidence on #86, not a new issue.
- **F5 — the user's feature request (filed, NOT built)**: mid-development, when Athena finishes the front
  and the first page is renderable, OLYMPUS should ASK if he wants to see it; accepting runs `npm run dev`
  and renders the preview INSIDE OLYMPUS so he can modify by clicking the screen through Athena.

## 2. Entry gates (VERIFIED — the recon night's own run; re-derived at the build night's entry)

| Gate | Result |
|---|---|
| E1 | `main == origin/main == 7307530` (7307530697153456cb4a87a87e987c4cc5a4c97e); only main local + the 5 dependabot remotes (observe-only) |
| E1b (R4) | live opencode.json sha256 `5534ceab9cfe160da3c5efa4a13c1e8dc8c3df6c2be0d3f0c5b65decabbd3d52` (31863 bytes) — snapshotted at build entry to `/tmp/opencode/uat-fix-1/opencode.json.snap`; the restore target. The R4 baseline moved legally (the user's curative apply 2026-10-07 16:44Z + strategy switches in-app). NEVER committed. |
| E2 | budget-guard BOTH surfaces exit 0 (live 8 lanes + generator 16 lanes, all output=16384; "All 9 generation lanes sized ≥ 8192"); `grep -c "glm-5.2" opencode.json` = **0** — the curative apply holds |
| E2b | check-strategy-sync: all 9 strategies in sync, exit 0 |
| E3 | open set exactly #76 + #78–#96 (20 issues); #67/#69/#70/#77 CLOSED. Re-verified again immediately before the filings (E-5 discipline) |
| E4 | battery-22 fully green, every suite exit 0: 19 suites via `npx tsx` (invocation of record — BATT-ENV #94) + context-distill 4/4 + telemetry-slice 10/10 + `npx tsc --noEmit` exit 0. Logs: recon `/tmp/opencode/uat-fix-1-battery/`, build `/tmp/opencode/uat-build-1-battery/` |

## 3. F1 — the Settings duplicate-key crash — ROOT CAUSE **VERIFIED**

**The exact line:** `src/lib/model-strategies.ts:833-834` — `'nvidia/nvidia/nemotron-3-nano-omni-30b-a3b-reasoning'`
carried **twice, adjacent, verbatim** in `FREE_MODEL_CLASSES` (line 811). Not a union bug — the static
catalog itself. Introduced by `5cb2db7` (SWEEP-1 S2+S3, "the static-map dead pin + the refresh doctrine
residue"); `git tag --contains 5cb2db7` → **empty** — unreleased; **v0.0.3 would be the first carrier**.

**Chain (verified end-to-end):** `:861` `NVIDIA_FREE_MODELS = FREE_MODEL_CLASSES.filter(c => c.startsWith('nvidia/'))`
preserves dupes (10 entries, 9 unique) → `:883` `modelClassesForStrategy('free-nvidia-build')` returns it
(no dedupe anywhere in `:870-894`) → `settings-dialog.tsx:871` `displayClasses = perStrategy` (`:866-878`)
→ **`:1072-1077` `{displayClasses.map(c => <option key={c} value={c}>`** — the user's verbatim crash site (:1073).

**Blast radius (enumerated via npx tsx against the live module, not guessed):** dupes exist ONLY in
`FREE_MODEL_CLASSES`/`NVIDIA_FREE_MODELS` — poisoned catalogs: **free-nvidia-build + every custom-\***;
GO/ZEN/openrouter CLEAN. Secondary consumer: `src/app/api/olympus/providers/gods/route.ts:200` + `:379`
(`available_classes` — data-only, no crash).

**Why nothing caught it (the invariant gap, grep-proven):** `check-strategy-sync.js` contract is
`LLM_STRATEGIES` ↔ `BUILTIN_STRATEGIES` parity + 5 mirrors + pricing — **zero catalog-array references**
(its own header contract; 9/9 green was CORRECT per contract). **Zero of the 19 battery suites reference
the catalogs** (`grep -l "modelClassesForStrategy|FREE_MODEL_CLASSES|NVIDIA_FREE_MODELS" scripts/*.test.mjs`
→ empty). budget-guard reads the live config + the generator table (single entry at `apply-strategy.js:368`
— clean); tsc accepts a legal duplicate literal.

**Cure decision (the plan's Batch A):** BOTH, defense in depth — delete the duplicate literal (root) +
`[...new Set(...)]` at the `modelClassesForStrategy` return boundary (every consumer structurally safe) +
new battery suite #23 `scripts/catalog-uniqueness.test.mjs` (RED-first). check-strategy-sync keeps its
parity contract (the behavioral invariant belongs to the battery, not the text-parity checker).

## 4. F2 — the provider-overload raw death — ROOT CAUSE **VERIFIED** (DB-evidenced)

**The exact line — the starvation:** `src/lib/opencode-session.ts:1872-1873`:

```ts
if (state.gotError) {
  return { code: 1, …, error: 'OpenCode reported an error during the run', statusCode: providerStatus };
}
```

**The chain (tonight's verbatim sequence, all hops verified):**
1. Attempt 0 died with a real transport failure (`fetch failed`) → catch path `:1922-1930` keeps
   `err.message` → `classifyRetry` matches `TRANSPORT_DEAD_RE` → **"retry 1/2: Transport failure —
   retrying in 5s"** fired (the engine works when fed).
2. Attempt 1: the provider overload arrived as a message-level error — persisted VERBATIM in opencode.db,
   twice: `{"name":"UnknownError","data":{"message":"\"Service temporarily overloaded\""}}` — **no
   statusCode** (UnknownError carries none → the structured lane can't classify either). Surfaced to the
   UI via `:1214` (in-stream part) / `:1822` (info.error) → `gotError = true` → **`:1873` collapses to the
   generic string**, throwing the real text away.
3. `classifyRetry('OpenCode reported an error during the run', undefined)` (`:1393-1407`): matches nothing
   → **`null`** → `:1346` returns immediately. **No "retry 2/2", no backoff, no `retryExhaustionGuidance`**
   (`:1416` — which already names the strategy + authorized alternatives via the preflight key-presence
   chain + the switch command — exists and never fires).
4. Surface: `action/route.ts:858` `fail("OpenCode run failed: …")` → SSE `action_done code:-1` (:548/:608)
   → `interactive-terminal.tsx:755` "Task failed (exit code -1)".
5. "Continue!" = fresh attempt 0 (re-classification `cls_muycj3h9k2xnr7` at 16:52:56.542Z, inherited from
   `cls_muycaq7fub4e2w`), pool still overloaded → same collapse → instant death, no backoff.

**The irony preserved:** `PROVIDER_OVERLOADED_RE = /provider[ _-]?overloaded|overloaded/i` (:1372) and the
whole #61 machinery were built for exactly this ("the free-tier pools 503 constantly"). The classifier is
starved of its own error text.

**DB tombstones (warm session):** two assistant messages with `finish=null`, `output tokens: 0`, at
**16:52:16.602Z** (the retry's attempt) and **16:52:56.601Z** (the "Continue!" — 59ms after the
re-classification). Zero parts contain "overloaded" (the error streamed, then lived on the message rows).

**Cure decision (Batch B):** capture the real text at BOTH ingestion paths (`:1206-1215` part case →
`state.lastErrorText`; `:1812-1823` info.error likewise) → thread into the `:1873` return (real text wins,
generic stays fallback; `code:1` + `statusCode` contracts unchanged) → `PROVIDER_OVERLOADED_RE` matches →
the EXISTING 3-attempt/5s/15s engine takes over → on real exhaustion the existing guidance fires. Plus the
terminal failure branch renders the last error + guidance block instead of bare `exit -1`. **Deliberately
unchanged:** the retry budget/backoff (duplicate side-effect window documented at `:1292-1298`; #83 sizes
it from measurement).

**Binary drift (recorded, not rabbit-holed):** box runtime `node_modules/opencode-ai` = **1.18.10**
(matches the user's note); `@opencode-ai/plugin` installed = **1.18.33** (package.json says `"latest"`);
dependabot PR open → 1.18.34.

## 5. F3 — the project created inside the repo — ROOT CAUSE **VERIFIED**

**Mechanism:** `src/lib/opencode-spawn.ts` — `findOlympusRoot()` (OLYMPUS_ROOT env → walk-up for
`opencode.json` + `package.json name==='olympus'` → cwd fallback); `getOpencodeSpawnOptions()` returns
`cwd: root` (:344-351); the session serve spawn (`opencode-session.ts` ensureServer → spawnOpencode
`['serve','--port',port]`) passes **no cwd override** → in app/dev the "Olympus root" IS the repo →
everything the gods build lands in the working tree. DB proof: the warm session's assistant messages carry
`path: {"cwd":"/home/texugo/Projects/olympus","root":"/home/texugo/Projects/olympus"}` verbatim. The same
hazard: packaged Electron lane (`electron/main.ts:146-183`), CLI terminal (`olympus-terminal.js:257`
`flag('cwd') || process.cwd()`).

**The kit proves the discipline exists:** `reports/uat-r1/SPAWN-INVOCATION.sh` (the user's own edit today)
builds in `~/olympus-bench/uat-gate/projects/<slug>` — an OUTSIDE lane. The app's interactive lane never
got the rule.

**Inventory (verbatim):** `exemplo-landingpage/` — 5 files, 48K, untracked: `package.json`,
`next.config.js`, `app/layout.tsx`, `app/globals.css`, `tsconfig.json`. **No lockfile, no app/page.tsx.**

**Exit-gate (run for the record — the verdict is evidence, not a defect):**
`node scripts/project-exit-gate.mjs exemplo-landingpage` → **FAIL**: [FAIL] 1. lockfile · [FAIL] 2. npm-ci
(unrunnable) · [SKIP] 3. build · [SKIP] 4. dev-curl-200 · [PASS] 5. symlinks · [PASS] 6. imports-deps ·
[FAIL] 7. composition (app/page.tsx MISSING). 

**Cure decision (Batch C):** explicit workspace root outside the repo — `OLYMPUS_WORKSPACE` env → default
`~/.local/share/olympus/workspace/<slug>`; spawn threads it as cwd; first-run explicit ask seam (app lane);
thread through the #95 seam (OLYMPUS_ROOT_SESSION wiring, `olympus-hooks.ts:882-885`). Disposition of the
stray: decision (i) resume-in-proper-lane (pre-approved via the auditor — also #86's pilot) vs (ii)
fresh-lane; both spec'd in the plan, (i) recommended.

## 6. F4 — the warm session (the #86 evidence payload)

Warm session `ses_ee8bd9486ffe0ZuDzL6EVE3gnm` ("Olympus Terminal — 2026-10-07T16:46:31.242Z", span
16:46:31Z → 16:52:56Z, 6.4 min): 16 messages — 3 user + 13 assistant (11 `finish=tool-calls`, 2
`finish=null`/`output:0` = the death turns). Tools: `skill×4, todowrite×4, bash×1, write×5` — matches the
user's verbatim "4 skills loaded, todos written, FIVE files written". 2 message-level UnknownError
"Service temporarily overloaded" records. live.jsonl (176 lines): the globals.css write at 16:52:03.538Z,
the inherited re-classification at 16:52:56.542Z. **The warm server is STILL ALIVE**
(`opencode serve --port 3777`, PID 993264, up since 13:46 BRT) — the journal-replay pilot's raw material
intact. Evidence comment filed: #86 (comment 6045530622).

## 7. AN7 — the finish-reason sweep (before anything is cleaned)

Today's opencode.db (3 sessions: `…hi7tJ64H` 16:33Z, 1 msg — the strategy-switch attempt; `…6EVE3gnm`
16:46Z — the UAT run; `…WmaluhVF` 17:01Z, 29 tool-calls / 8 null-finish — post-UAT activity, attributed
by shape only, honestly un-interrogated): assistant finishes = **`tool-calls` and `null` ONLY — zero
`finish=length` anywhere: the #76 sizing (16384) holds LIVE**. Crashed turns honestly leave `finish=null`
(no lying stop-reasons). Vault: `~/OLYMPUS-VAULT/06_Activity_Feed/live.jsonl` (176 lines) is the only feed;
`03_Index/arsenal-resonance.jsonl` = 1 line. Nothing purged tonight.

## 8. The filings (real numbers; bodies verbatim in the tracker + `FILING-LOG.md`)

| Finding | Issue | Title (type(scope)) | Labels |
|---|---|---|---|
| F1 | **#97** | fix(registry): duplicate model id in FREE_MODEL_CLASSES — Settings crashes with React duplicate keys on free-nvidia-build + custom-* | bug, registry |
| F2 | **#98** | fix(harness): provider-overload errors die raw — the in-stream error text never reaches classifyRetry | bug, harness, free-tier |
| F3 | **#99** | fix(harness): interactive sessions resolve cwd to the OLYMPUS repo — user projects land inside the working tree | bug, harness |
| F5 | **#100** | feat(dev-server): the mid-development "render it live?" preview offer (the user's request) | enhancement, dev-server |
| F4 | — | evidence comment on **#86** (6045530622) — the warm-session payload; NO new issue (charter's instruction) | — |

## 9. The build plan (the night's real deliverable — executed as MADRUGA-UAT-BUILD-1)

Four stages, one ff-only merge each; every batch: RED → cure → battery → guard → sync → tsc → ff-merge →
push → re-derive sha → evidence comment → close. `opencode.json` + `SPAWN-INVOCATION.sh` +
`exemplo-landingpage/` NEVER staged. Step 0 of every stage: re-verify the opencode.json snapshot sha.

- **Stage 0 (paper, this commit):** the filings + this report + the registers + root QUEUE.md.
- **Batch A (F1/#97):** RED — new `scripts/catalog-uniqueness.test.mjs` (all 9 strategies + 5 family
  arrays + custom-* + React-key-safety); cure — delete the `:834` literal + `[...new Set()]` boundary in
  `modelClassesForStrategy`; GREEN; battery-23; guard; sync; tsc; merge/push; CHANGELOG `[Unreleased]`
  Fixed line at merge time; evidence comment + close #97.
- **Batch B (F2/#98):** RED — two deterministic fixtures in `scripts/opencode-session.test.mjs`
  (stubbed feed, no network: in-stream UnknownError/"Service temporarily overloaded" without statusCode
  must produce retry 1/2 + retry 2/2; exhaustion must emit `retryExhaustionGuidance` naming strategy +
  alternatives); cure — `state.lastErrorText` capture at both ingestion paths + thread into `:1873`; the
  terminal failure branch renders error + guidance instead of bare exit -1; budget UNCHANGED (E-4);
  battery-23; merge/push; CHANGELOG; evidence comment + close #98.
- **Batch C (F3/#99):** cure — workspace resolution in `opencode-spawn.ts` (`OLYMPUS_WORKSPACE` →
  `~/.local/share/olympus/workspace/<slug>`), serve/session spawn threads cwd, first-run ask seam, #95
  seam threading, docs note; Electron packaged lane honestly assessed, not forced; disposition (i)
  (E-6 pre-approved): move `exemplo-landingpage/` → the workspace, resume `ses_ee8bd…6EVE3gnm` against
  the LIVE :3777 serve, continue toward exit-gate GREEN (the resume bar); the outcome (green or the next
  honest wall) is #86's flight log; battery-23; merge/push; CHANGELOG; evidence comment + close #99.

**Near-arc consequence, honestly stated (his call, his words):** stabilization sits BEFORE the manual UAT;
the Monday v0.0.3 tag may slip depending on these batches + the user's re-UAT. ROADMAP.md untouched
tonight per the charter — the errata batch rides the build night.

## 10. Taxonomy check (standing rule)

| Issue | Shape | Labels | Verdict |
|---|---|---|---|
| #97 | fix(registry) ✓ | bug + registry | in-pattern |
| #98 | fix(harness) ✓ | bug + harness + free-tier | in-pattern |
| #99 | fix(harness) ✓ | bug + harness | in-pattern |
| #100 | feat(dev-server) ✓ | enhancement + dev-server | in-pattern (scope word registered; follows the #85 feat(ui) precedent for UI-shaped features while staying in the registered vocabulary) |
| #86 (commented) | feat(recovery) | enhancement, autonomy | in-pattern per GAP-1 campaign conventions; no retitle (campaign-era scope word preserved; vocabulary drift vs the AGENTS.md set logged as an errata candidate, not acted on) |

No closes tonight by the recon; the build night closes #97/#98/#99 with merge-sha evidence per stage.

## 11. Self-critique — the 3 weakest

1. **F2's delivery-path ambiguity:** the DB proves the collapse at `:1873` and the message-level error
   records, but not which ingestion path (`:1214` in-stream part vs `:1822` info.error) fired tonight. The
   cure captures BOTH, so the ambiguity dies with either fix — but it is an honest unknown.
2. **The `…WmaluhVF` session (17:01Z, 29 tool-calls)** is logged by shape only — not attributed to a
   specific actor or action. Recorded, un-interrogated.
3. **F5's spec is sketch-level** (draft acceptance bar) — its real design decisions (pane embedding,
   click-to-edit round-trip, ask-gate placement) deserve their own night; filing it fully-specified
   tonight would fabricate certainty.

## 12. STATE AT END (recon close; superseded by the build night's close-out block)

- Frontier: `main @ 7307530` — unchanged by the recon (paper only, zero code).
- Tracker: #76 + #78–#96 + **#97–#100** open (24); #86 carries the evidence comment; nothing closed.
- Machine: battery-22 green (both runs — recon's + build entry's), guard both surfaces exit 0, sync 9/9,
  tsc 0. Live opencode.json sha `5534ceab…` (snapshotted; restore target).
- The warm serve :3777 ALIVE (PID 993264) — the #86 pilot asset; DO NOT KILL.
- Untracked/user dirt (never staged): `opencode.json`, `reports/uat-r1/SPAWN-INVOCATION.sh`,
  `exemplo-landingpage/`. Note: the AGENTS.md hygiene list's `docs/superpowers/`, `public/landing/`,
  `testimonial-section.html` no longer exist in-tree (stale warning, recorded honestly).
- `git status --porcelain` at the recon's close, verbatim:
  ```
   M opencode.json
   M reports/uat-r1/SPAWN-INVOCATION.sh
  ?? exemplo-landingpage/
  ```
