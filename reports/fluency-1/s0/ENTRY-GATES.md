# FLUENCY-1 — Entry gates (all green BEFORE work; verbatim, 2026-10-09)

| Gate | Verdict |
|---|---|
| E1 | `git fetch`; `main == origin/main == 3aa298a` (the FREE-1 close paper — no IN PROGRESS QUEUE row pending from another session, nothing races; the FREE-1 frontier-record sha-fill `3aa298a` rides THIS session's Stage 0 paper) |
| E2 | budget-guard BOTH surfaces exit 0 against the live R4 bytes (LIVE 10 lanes >= 8192 + GENERATOR 16/16 — the suite's own tail: `All 10 generation lanes sized >= 8192`); `grep -c 'glm-5.2' opencode.json` = **0**; check-strategy-sync **9/9** exit 0 |
| E3 | open set re-derived via `gh issue list --state open`: exactly **#76 + #78–#96 + #100 + #101 = 22 rows** — the enumerated set matches the expected set precisely. (Honest note: the session brief's "exactly 21" is an off-by-one in the brief's own arithmetic — its enumerated set 1+19+2 = 22; the enumeration is the truth and it MATCHES. No drift.) #106 CLOSED @ `5812f44`. Next free number **#107** — filed at Stage 0. |
| E4 | **battery green on this session's OWN run**: 27/27 suites via `npx tsx` + tsc 0 errors (`npx tsc --noEmit`), in the principal tree against the live bytes. Logs: `/tmp/opencode/fluency-1-battery/entry/`. Honest count at entry: 27 suites + sync + budget-guard + tsc = the frontier's 30, all green. |
| E5 | R4 live config sha256 `4e6b35ac7611fb583cc453edef743d470f68443394fb52aa48020357e6929619` (33568 bytes) — byte-identical to the FREE-1 baseline; snapshotted to `/tmp/opencode/fluency-1/opencode.json.r4-snapshot`; NEVER staged, NEVER committed |
| E6 | Foreign processes: the user's Zed ACP runtime + stremio — foreign, untouched, nothing killed. **No listener on :3777 / :3015 / :3737 / :3740** (`ss -tlnp` re-derived). The user's working-tree edit to `reports/uat-r1/SPAWN-INVOCATION.sh` (his UAT-prep: the exemplo-landingpage slug pin + free-nvidia-build) — foreign, untouched, never staged. |
| E7 | Worktree evaluated, **not needed — the principal tree used directly** (honest adaptation, disclosed): budget-guard's LIVE surface reads the working-tree config, and the R4 bytes exist ONLY in the principal tree (R4 is never committed, so a worktree at `3aa298a` would carry the stale committed config and the LIVE surface would not be the live bytes). Per-batch branches in-tree are safe: no batch touches `opencode.json`, so branch-switching carries the two foreign dirty files untouched; `git add` always takes explicit paths, never `-A`. |
| E8 | **The live lane probe — re-probed ALL 5 anchors BEFORE building** (the user's run died on the glm-5.3 pool at 16:23Z TODAY): `z-ai/glm-5.3` **HTTP 200 / 709ms** (the killing pool is serving again), `z-ai/glm-5.3-flash` **HTTP 200 / 30,989ms** (variable latency — recorded honestly, same shape as FREE-1's 32s ping), `moonshotai/kimi-k3` **HTTP 200 / 1,042ms** (the 16-token truncated content is tokenizer-salad on a min-budget ask; usage=16 served), `meta/muse-glimmer-30b` **HTTP 200 / 1,864ms**; **`deepseek-ai/deepseek-v4.1-flash` DEAD AGAIN — HTTP 000 at 60s, the second consecutive night** (carries ZERO god assignments in R4; its family entry stays in the pinned set, disclosed). No reassignment needed tonight. Verbatim: `reports/fluency-1/s0/e8-anchor-pings.txt`. |

## The probe transcript (verbatim, s0/e8-anchor-pings.txt)

```
probe time: 2026-10-08T20:40:32Z  key: nvapi-XRaF… (the user's own key)
z-ai/glm-5.3 | HTTP 200 | 709ms | content=null (reasoning-first) usage=16 finish=length
z-ai/glm-5.3-flash | HTTP 200 | 30989ms | content=null (reasoning-first) usage=16 finish=length
moonshotai/kimi-k3 | HTTP 200 | 1042ms | content="<|close|>şaningRosnaturalaringOperation (reasoning-first) usage=16 finish=length
meta/muse-glimmer-30b | HTTP 200 | 1864ms | content=null (reasoning-first) usage=16 finish=length
deepseek-ai/deepseek-v4.1-flash | HTTP 000 | 60024ms | NO BODY (curl --max-time 60 expired)
```
