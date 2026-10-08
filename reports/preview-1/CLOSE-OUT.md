# CLOSE-OUT — MADRUGA-PREVIEW-1 (the preview truth night, 2026-10-08)

> The durable close-out packet, WRITTEN TO DISK BEFORE the chat summary (**#101**'s rule: the chat
> message is a pointer, never the payload). The night rode exactly 4 ff-only merges (paper + A + B + C);
> this file + the QUEUE DONE row + the PREVIEW-1 register rows land on disk at close and ride the NEXT
> session's Stage 0 paper commit (the discipline holds; the disk is truth in the meantime).

## 1. Why this session exists

The user, mid-manual-UAT, hit the first real product wall: **the Live Preview panel never opened his
project — in ANY build, on ANY port, with any workaround.** He ran his dev server himself
(`npm run dev -- -p 3015` in the workspace lane, Next 14.2.35, "Ready in 2.8s"), the panel showed the
spinner and `:3015 · offline` forever, and the tip told him to `cd` into a fossil pre-#99 bench path.
When he asked the interactive Apollo lane to start the dev server, Apollo narrated a success that was
not real (the phantom-success specimen, filed as #105). Tonight: the probe call, the path, the
dispatch cwd — the panel becomes HONEST and ALIVE. The dev-server *automation* (the durable manager)
is #86's own arc, not tonight's.

**The headline, stated plainly for the user: your own steps were correct. Your `-H 127.0.0.1`
workaround was correct. No client-side workaround could ever have worked. The defect was the panel's
own dead call** — the component fetched `/api/olympus/live-preview/status` while the route serves
`/api/olympus/live-preview`: no such route, no middleware, no rewrites. The fetch 404'd on every probe
since the initial import; Next served an HTML error page; `r.json()` threw; the catch branch set
`offline` forever — every project, every port, every stack, every build since `57366b6`. The TCP probe
route worked the whole time; nobody ever reached it.

## 2. Entry gates (all VERIFIED — this session's own runs)

| Gate | Result |
|---|---|
| E1 | `main == origin/main == 6491a8e` (CLOSE-1's trail: `a458290` + the honest addendum `6491a8e`) |
| E1b (R4) | live opencode.json sha256 `5534ceab9cfe160da3c5efa4a13c1e8dc8c3df6c2be0d3f0c5b65decabbd3d52` (31863 bytes) — byte-identical to the CLOSE-1 baseline; snapshotted to `/tmp/opencode/preview-1/opencode.json.r4-snapshot`; NEVER staged, NEVER committed; **byte-identical again at close** |
| E2 | budget-guard BOTH surfaces exit 0 (LIVE 9 lanes; GENERATOR 16/16; "All 9 generation lanes sized >= 8192"); `grep -c "glm-5.2" opencode.json` = **0**; check-strategy-sync 9/9 exit 0 |
| E3 | open set exactly **#76 + #78–#96 + #100 + #101 = 22** (gh re-derived; re-derived AGAIN before any create per E-5 — both runs 22) |
| E4 | **battery-23 green, this session's own run**: 20 suites via npx tsx all exit 0 + context-distill self-test 4/4 + telemetry-slice self-test 10/10 + `npx tsc --noEmit` exit 0. Logs: `/tmp/opencode/preview-1-battery/` |
| E5 | the app's :3737 server NOT running at entry (recorded honestly — no listener; the code-level proof stands on its own: component `:44` vs the route location re-derived in source, `ls src/app/api/olympus/live-preview/` = `route.ts` only, `next.config.ts` rewrites = `[]`, `git log --follow` on both files = the single initial-import commit `57366b6`); the live pair rode the exit gate |

Serve states at entry (2026-10-08T01:27:50Z, verbatim `ss`): **:3777 DOWN** (no listener, no
`opencode serve` process — it ended since CLOSE-1; NEVER killed, NEVER respawned by this session,
state recorded honestly at entry and close). **The user's own dev server ALIVE** on
`127.0.0.1:3015` (next-server PID 1172572, up since 21:39 box — his UAT server, never touched).

## 3. The work — four ff-only merges, all pushed (`origin/main @ 880dcc8`)

### 3.1 Stage 0 — paper (`7cc8a1b`)

Filings #102–#105 (existing labels only; bodies carry o que / por que / spec / aceitação / EVIDÊNCIA;
tracker re-verified 22-open immediately before each create):

- **#102** `fix(dev-server)` [bug, harness, dev-server] — the dead probe call + the dual-stack hardening.
- **#103** `fix(registry)` [bug, registry] — the note/lane staleness (the tip misdirects to the pre-#99 bench).
- **#104** `fix(harness)` [bug, harness] — the one-shot dispatch cwd (athena/edit would edit inside the repo).
- **#105** `fix(harness)` [bug, harness, free-tier] — the phantom-success narration (the doctrine filing; cure rides #86's arc).

The **#86 scope comment** (`6050338268`): the automation arc concretized — the durable dev-server
manager (start/stop API, detached spawn, pidfile, killed on project-switch/app-quit) + the honest-claim
rule (no god claims a live process without a probe). The user's double "Start npm run dev … so run on
Live Preview" is the demand evidence. QUEUE rows updated (CLOSE-1's shas `a458290`+`6491a8e` filled;
the PREVIEW-1 row added).

### 3.2 Batch A — #102 the probe truth (`cd46fb0`)

RED (verbatim, `scripts/dev-server-probe.test.mjs` — new suite #24): `FAIL G1 route EXISTS for fetch
path /api/olympus/live-preview/status — expected …/live-preview/status/route.ts — the fetch 404s:
Next serves an HTML error page, r.json() throws, the catch sets offline forever` (+ the module-missing
A2 FAIL + 5 content-pin FAILs = **8/10 at RED**). Cure: the one-line headline (the `/status` suffix
dropped) + new `src/lib/dev-server-probe.ts` (`probeDevServer(port, timeoutMs=1500)`: 127.0.0.1 AND
::1 in parallel, first connect wins, simultaneous success → ipv4 wins, bracketed IPv6 url) + the route
on the shared probe (`host` surfaced; the response url is the REACHABLE url) + the component threading
(`effectiveUrl = status?.url ?? previewUrl` into the iframe src + the "open" href; the local guess is
only the pre-first-probe fallback). **GREEN 16/16** (this box has ::1 — all four dual-stack cases ran;
no documented-exception needed).

### 3.3 Batch B — #103 the note/lane reconciliation (`b3575ac`)

RED (`scripts/project-context.test.mjs` — suite #25, child-gate hermetic): **7/7 FAILED** (both exports
missing + the route/component pins). Cure: the pure `workspaceLaneDir()` extracted from
`resolveWorkspaceLane()` (NO mkdir/symlink/copies — the GET probe path never creates anything; one
root of truth) + `reconcileProjectPath(slug)` (self-heal ONLY when the note path is dead on disk and a
lane copy exists — the note repointed; an ALIVE fossil (the pre-#99 bench, still on disk on this box)
is SURFACED `source: 'note-stale'`, never clobbered; never resolves into the OLYMPUS root — the #99
incident shape self-heals to the lane when a copy exists, else the lane dir itself; null-safe) + the
status route carrying `path` + `pathSource` + the panel tip rendering the RESOLVED path with the one
dim stale-note line (a line, not a modal). **GREEN 17/17.**

### 3.4 Batch C — #104 the dispatch cwd (`880dcc8`)

RED (`scripts/dispatch-cwd.test.mjs` — suite #26, child-gate hermetic): **5/5 FAILED**
(`resolveDispatchCwd is not a function` in both children + the route pins). Cure:
`resolveDispatchCwd(projectSlug?)` (slug + `<lane>/<slug>` exists → the project dir; missing → the lane
dir; null → the lane dir; the never-the-repo guard inherited from `workspaceLaneDir()` — every branch
lands outside the working tree) threaded into the athena/edit spawn's `cwd:` option. **Only this lane
tonight** — the other six call sites (heartbeat `:101`, action `:444`/`:733`, intake `:134`,
doc-summarizer `:174`, compact `:25`) stay as-is, enumerated in #104 + its close comment as the
follow-up audit (bookkeeping lanes; changed blind = out of scope). **GREEN 9/9.**

## 4. The live exit gate — the user's exact scenario, re-run GREEN on this box (verbatim)

The app's Next server was started BY THE SESSION on :3737 (mirroring `electron:dev`'s exact lane;
my own process, killed with the session; the user's processes never touched — disclosed here).

**The E5 pair, REVERSED (2026-10-08T02:32:59Z, against the USER'S OWN still-running dev server):**

```
== 1. the dead path /api/olympus/live-preview/status (must stay 404 — never a route again) ==
HTTP 404
== 2. the live route /api/olympus/live-preview (must be 200 + running:true) ==
{"running":true,"port":3015,"url":"http://127.0.0.1:3015","host":"ipv4","responseTimeMs":8,
 "project":"exemplo-landingpage","slug":"exemplo-landingpage",
 "path":"/home/texugo/.local/share/olympus/workspace/exemplo-landingpage","pathSource":"note-stale"}
HTTP 200
```

That single response carries the whole night: `running:true` against HIS server (the panel that stayed
offline through his entire UAT goes green), the REACHABLE url the iframe threads, the RESOLVED lane
path the tip now shows, and `note-stale` — the fossil (the bench copy, still alive on disk) surfaced
honestly, never clobbered.

**Panel green <= 3s:** `responseTimeMs: 3` on the re-probe (2026-10-08T02:34:46Z, after the user's
server ended externally — see §6 — and a session-spawned lane dev server stood in, his exact command
`npm run dev -- -p 3015`, "Ready in 2.6s"). The panel polls on mount + every 3000ms; the probe settles
in 3ms — green within one cycle.

**The iframe RENDERS the landing page:** the iframe src is `status.url`; a GET to that exact url:

```
HTTP 200
<title>Nexus — Automação Inteligente para Equipes Modernas</title>
```

(The full-window visual render is the one rung the session cannot drive headless — the p5 precedent's
substitute class: the API + content + the component content-pins [iframe src threads `effectiveUrl`]
carry the evidence; the user's next panel open renders it for real — no code path remains that can
show offline against a live server.)

**The tip:** `path: /home/texugo/.local/share/olympus/workspace/exemplo-landingpage` — the RESOLVED
lane path, with the one dim line under it (`note path is stale — the project lives at <lane path>`)
because `pathSource === 'note-stale'` (the note still points at the bench — surfaced, not clobbered).

**Mark → send to Athena (the #104 live probe):** POST /api/olympus/athena/edit (02:37:05Z, a READ-ONLY
verification instruction, dispatchId `athena-edit-1791427026037-iabgmq`) → the dispatched session's DB
record (opencode.db `session` `ses_ee6a0d35bffexAmEu66DGjwSK9`, created 02:37:10Z) carries
`directory: /home/texugo/.local/share/olympus/workspace/exemplo-landingpage` — **the PROJECT dir, not
the repo**; the run completed read-only (its reply in the session record; no file writes). Post-dispatch
`git status --porcelain` on the OLYMPUS repo: only the two known never-staged user mods — **zero new
files inside the OLYMPUS repo.**

## 5. STATE AT END

- **Frontier:** `main @ 880dcc8` == `origin/main` (pushed; the 4-merge trail `7cc8a1b` → `cd46fb0` →
  `b3575ac` → `880dcc8`; every merge ff-only, every branch deleted after its merge).
- **Tracker:** #102/#103/#104 **CLOSED** with merge-sha evidence comments (`6051311402` / `6051311882`
  / `6051312393`); **#105 OPEN** (the phantom-narration filing; cure rides #86's arc, cross-linked both
  ways); #86 OPEN (three comments: recon + FLIGHT LOG + tonight's scope concretization); #76 untouched
  — **the user's manual UAT remains THE gate.** Open set: #76 + #78–#96 + #100 + #101 + #105 = **23**.
- **Machine:** battery **26** (23 at entry + the three new suites; the count follows the merges — 24 at
  Batch A, 25 at B, 26 at C — every report says so) — green on the session's OWN runs at entry, per
  batch, and at close (23 suites exit 0 + context-distill 4/4 + telemetry-slice 10/10); tsc 0; guard
  both surfaces exit 0; sync 9/9; `glm-5.2` = 0; R4 `5534ceab…` byte-identical at entry and close.
  Logs: `/tmp/opencode/preview-1-battery/{,batchA,batchB,batchC,atclose}/`.
- **Battery suites added tonight:** `dev-server-probe.test.mjs` (16/16), `project-context.test.mjs`
  (17/17), `dispatch-cwd.test.mjs` (9/9) — all child-gate hermetic (tmp OLYMPUS_ROOT/VAULT/HOME/
  WORKSPACE; the real vault, lane, and repo never touched by any fixture).
- **The :3777 serve:** DOWN at entry, DOWN at close — never killed, never respawned (the #86 pilot's
  journal in opencode.db is serve-restart-proof; its arc continues).

## 6. Honest disclosures

1. **The user's :3015 dev server churned mid-gate.** At entry (01:27:50Z) and through the first live
   pair (02:32:59Z) it was HIS server the fixed probe found GREEN. Between 02:33Z and 02:34Z it ended
   (external to any session command — no kill from this session; the same class as CLOSE-1's serve
   handoff). The gate re-ran with a session-spawned dev server (his exact command, in his project
   lane), which was killed with the session's own processes afterward. The 02:32:59Z record against
   HIS server stands — timestamped above.
2. **Session-spawned processes:** the app's Next server on :3737 + the lane dev server on :3015 (both
   after the churn) — started for the gate, both dead at close (the harness reaped them between turns;
   ports verified free; zero orphans). The user's own lanes were never touched.
3. **The opencode CLI's `run --agent <subagent>` fallback:** the live dispatch logged
   `agent "athena" is a subagent, not a primary agent. Falling back to default agent` — upstream CLI
   semantics, orthogonal to #104 (the cwd + the session record are the issue's surface). Recorded, not
   acted on.
4. **The push surface:** GitHub reported 1 high dependabot alert on the push (the standing dependabot
   lane — pre-existing, out of tonight's scope; recorded here so it is not lost).
5. **This close-out packet (QUEUE DONE row + this file + the PREVIEW-1 register rows) rides the next
   session's Stage 0 paper commit** — the 4-merge discipline held exactly; the disk is truth in the
   meantime (this paragraph is the pointer's own honesty).

## 7. Taxonomy check (standing rule)

| Issue | Shape | Labels | Verdict |
|---|---|---|---|
| #102 | fix(dev-server): the dead probe call + dual-stack | bug, harness, dev-server | in-pattern (scope + type + areas all in the vocabulary; closed with merge-sha evidence) |
| #103 | fix(registry): the note/lane staleness | bug, registry | in-pattern |
| #104 | fix(harness): the one-shot dispatch cwd | bug, harness | in-pattern (residual six-site audit dispositioned in the close comment) |
| #105 | fix(harness): the phantom-success narration | bug, harness, free-tier | in-pattern (OPEN by design — cure rides #86) |
| #86 (comment only) | feat(recovery) — untouched | enhancement, autonomy | in-pattern (no taxonomy change; a scope comment) |

Closures this night: #102/#103/#104 — every close comment links commit sha + the RED/GREEN suite
output + the live-gate transcript. #105 stays open (cross-linked); #86 updated (comment); #76
untouched.

## 8. The bar for the next gate

The panel is HONEST and ALIVE: a live dev server makes it green within one probe cycle; the tip tells
the truth (the lane path, staleness surfaced); a Mark-for-editing dispatch lands in the project, never
the repo. **The user's manual UAT (issue #76's bar) is THE gate — re-run his exact scenario in the
app.** The durable dev-server manager + the honest-claim rule (#86 + #105) are the next arc; the
queue's open set (23) is the backlog.
