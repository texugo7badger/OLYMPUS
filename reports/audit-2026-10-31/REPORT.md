# OLYMPUS runtime audit — 2026-10-31

Status: measured on the maintainer's machine, v0.0.29 working tree.
Scope: the AIME day-of-build (17:27–23:14Z), the hop runtime, cost ledger, MCP
surface, context/benchmark telemetry, and the live preview.
Full backlog: [docs/plans/v0.0.30-truth-first.md](../../docs/plans/v0.0.30-truth-first.md).

## Verdict

OLYMPUS produced real artifacts (63/84 hop attempts completed; the AIME site
was live), but the measurement layer lied in three places and the campaign
could not survive an app restart:

1. **Benchmark 4.4% success / 129 errors was mostly noise.** 138 rows: 8
   success, 130 error; **all 130 error rows have 0 tokens and 0 tool calls**
   (failed session starts, not failed work). The 8 work rows carry 1.34M
   tokens and 840 tool calls.
2. **Cost mixed three currencies.** The screen summed OpenCode's per-step
   `cost` (its own model-price field) with a heuristic list estimate and
   called it "spend"; the GO invoice is not exposed. The "$12/5h" aggregate
   is not a GO cap — the documented limits are per-model (5h = 20% of that
   model's monthly dollar cap).
3. **MCPs could not reach the gods.** The env loader did not read
   `~/.olympus/api-configs.json` (the UI store), and `permission.ask` resolved
   every MCP call as **Apollo** (empty session id), whose allowlist is
   github + mcp-gateway — both dead. The plan's own `hop.mcp` was never used
   to filter the lane.
4. **The context indicator read the wrong schema.** OpenCode 2.2.5 stores
   sessions in `session_v2` / `session_message`; the route queried `session` /
   `message`, threw, fell back to absent JSON files, and showed 0% forever.
5. **A hop wiped the live AIME database at 23:01:10Z.** works 226→0,
   relations 191→0, library 12→0, users 3+1→1 stray, 453 covers orphaned.
   The warm hop lane auto-approved every permission; there was no destructive
   gate or backup preflight.

## The AIME day in numbers

Session `ses_e6cff61b8ffew49Y2ze6x0WFjX` (17:27:33–23:14:08Z):

| Signal | Measured |
|---|---|
| User turns / assistant messages / idles | 16 / 154 / 15 (14 succeeded, 1 interrupted) |
| Total wait between an idle and the next prompt | **306.2 min** |
| Largest waits | 105.3 min (17:31→19:16), 57.3 (20:14→21:17), 38.0 (21:24→22:09), 27.6 (19:23→19:53), 27.3 (22:09→22:37), 17.7 (22:37→22:55) |
| "continue"/"travado" prompts | 5 "continue" + 2 variants |
| Campaigns | 18 `campaign_start`, 13 `campaign_end`, **5 without end** |
| Hops | 51 `hop_start`, 35 `hop_done`, **11 `hop_parked`** (9 unique; d3-media 3x), **5 starts without settle** |
| Heartbeats | 998; 135 >20 min; max 1,755s (29.25 min) |
| Reported progress | 2/31 (19:53), 2/32 (20:12), 5/34 (21:17), 7/38 (22:09), 8/38 (22:37/22:55), 29 left (23:00); the live plan then had 42 hops |
| Real work distribution | Athena 557, Persephone 548, Hephaestus 329, Apollo 168, Dionysus 96, Atlas 11 activity rows |
| Top files touched | compose.ts 28, page.tsx 14, onboarding/page.tsx 13, catalog/sync/route.ts 12, swipe-deck.tsx 10 |

### Why the user felt "parked / no return / no idea what is being built"

- **App restart killed the walk.** Native terminal module reloaded at 17:25 and
  21:16; OpenCode server `ServeError` repeated on 3777/3778; campaign
  `cmp_mvwuij4rq856u3` last event 21:15, app restart 21:16, user "continue!"
  21:17. The walker is in-process; five campaigns never ended.
- **The stall window was 10 minutes and did not fail over.** `d3-media`
  parked at 22:07 (silence), 22:34 (ceiling), 22:52 (silence again); the
  auto transport only fell back to spawn on *setup* failures, not on a
  stalled turn.
- **The per-god UI was not live.** Parthenon showed 0 dispatches for
  Athena/Hephaestus/Persephone while the activity feed recorded 557/329/548
  rows. The "building now" mini-card used the **parked** hop id
  (`d.hops?.parked?.hopId`), the **project slug** as the god, empty
  artifacts, and 0 elapsed. The hop detail lacked skill/MCP/demigod/verify.
- **Long deterministic work ran as an LLM hop.** `d2-populate` spent 21+ min
  with the catalog at 0 and was ceiling-killed; the catalog reached 226 only
  later. It should be a zero-token script step with streamed progress.
- **Plan scope changed without a version.** CAL-2: 5 hops; `plan.md`: 15
  sections; live plan: 42 hops. The user approved "38 hops" at 23:00; the
  plan had 42. A pasted campaign id (`cmp_live_EZ...`) did not match the lane
  (`cmp_mvx02unt8boiy5`).

## Cost (5h window at audit time)

| Figure | Value |
|---|---|
| Cost rows | 2,033 (893 step-finish + 1,140 estimates) |
| Input / output / cache read / reasoning | 2,919,405 / 1,037,431 / 89,733,683 / 328,978 |
| OpenCode step cost | **$1.7272** |
| Heuristic list value | **$1.7480** |
| Invoice | **not exposed** (GO subscription) |
| Per-god step/list | Hephaestus 1.1362/1.3087; Athena 0.5210/0.0408; Persephone 0.0223/0.2062; Apollo 0.0388/0.1005; Dionysus 0.0083/0.0366; Atlas 0.0006/0.0258; system 0/0.0294 |

Campaign window 20:19–23:20Z: 1,104 rows; step $0.7573; list $0.6525;
input 1,612,575; output 615,485; cache 54,899,686.

The screenshot's $2.56 per-god sum is step+list; the header's "$0 charged ·
list $2.65" describes a different quantity. Neither is an invoice.

Cache read / output ratio: **86:1** (89.7M / 1.04M). With 107 MCP tool schemas
and a 100k-ish context per step, this is the efficiency problem — not the
dollar figure.

## MCP (measured)

- 28 servers: **10 alive, 107 tools, 5 enabled-but-dead, 1 auth, 12 disabled**.
- Enabled-but-dead: tamp, serena, postgres, docker, opendesign.
- AIME lane log (17 runs): originkit 19 failures, tamp 17, serena 17,
  opendesign 17, git 17, postgres 15, docker 15, olympus-craft 6, context7 2,
  chrome-devtools 2.
- The plan declared only chrome-devtools, context7, nakkas, playwright (20/42
  hops), yet the lane spawned the 16-server fleet for every hop.
- `git` is alive at the repo root and dead in the AIME lane (no `.git`).
- API keys saved in `~/.olympus/api-configs.json` were not read by the Next
  spawn path; originkit stayed 401 while the UI said "configured".

## Hop truth and gates

- 84 attempts: 63 completed, 17 dispatch-failed, 4 verify-failed; 998.8 min;
  median 9.9 min; p90 25.0 min; 18/84 at ≥24 min.
- `f0-1` ran 6 times; `d3-media` parked 3 times in 45 min.
- The work card was marked "HOP COMPLETE — ALL GATES GREEN" while the same
  file says "**No mount yet** — Component ready but not used in production
  pages". The test page URL said `localhost:3737` (wrong; the app is 3038).
- `_handoff.md` reports a Turbopack `distDirRoot` error and a clean tsc; the
  hop was accepted without a build check.
- Dev log: `mapWorksToCards()` called from the server but defined on the
  client; 4/6 landing sections rendered at `opacity: 0` (51/171 leaves in one
  section). The login form made **zero** requests to `/api/auth` and set no
  cookies.

## What v0.0.30 changes (shipped in this branch)

- `src/lib/integration-env.ts` — one env loader for api-configs.json + .env +
  process.env; used by `buildOpencodeEnv` and every MCP probe.
- `.opencode/src/olympus-router` — last-session fallback + per-god/per-session
  equip; permission.ask no longer defaults to Apollo.
- `src/lib/mcp-run-manifest.ts` — campaign manifest = plan `hop.mcp` +
  curated baseline; lane config filtered; known-broken servers excluded;
  `git` only in a git lane.
- `src/lib/destructive-guard.ts` + walker/warm-server — destructive command
  denial in unattended hops; database backup before a destructive hop.
- `src/app/api/olympus/context-usage/route.ts` — `session_v2` /
  `session_message` support; "unknown" instead of a fake 0%.
- `src/lib/benchmarks.ts` + panel — zero-activity starts go to
  `no-start.jsonl`, excluded from the work success rate.
- `src/lib/olympus.ts` — Atlas is a god (132 agents); army counts from disk;
  the aggregate $12/5h fiction is hidden; cost labels split step/list/invoice.
- `src/lib/hop-runtime` — 5-minute silence default; warm stall retries on
  spawn once; MCP manifest applied/re-applied per lane; lost-hop truth from
  the walk lock; mini-card names the real running hop/god.
- `src/components/olympus/live-preview.tsx` — manager truth is a second
  "running" source.

## Open issues (see the plan for the full 47)

The day's new epic H (campaign reliability/live god comms) carries 16 issues.
The highest-value remaining v0.0.30 items: H1 detached supervisor /
auto-resume, H4 proactive notifications, H7 streamed hop output, H8 script
steps, H10 visual/login gate, H11 build gate, H12 one server per lane,
H15 mounted/used check. E1/E2/F1 (webview + magic wand + full god chats) are
v0.0.31.
