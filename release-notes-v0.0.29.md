# OLYMPUS v0.0.29 — THE LIVING FLOOR

The AIME campaign ran to completion (6/6) and exposed the seams that made it *look*
dead: the gates were silently demoted, chat went mute during a walk, the hop ledger was
invisible, and Nakkas could not boot. This release fixes those, and updates OpenCode to
2.2.5 — which finally cures #266.

## 1. OpenCode 2.2.5 — #266 is CURED

Probed against a real `opencode serve` on 2.2.5:

| Endpoint | Result |
|---|---|
| `POST /session` (v1) | **405** — the old warm lane did exactly this and always fell back to spawn |
| `POST /api/session` (v2) | **200** |
| `POST /api/session/:id/agent` | **204** |
| `POST /api/session/:id/model` | **204** |
| `POST /api/session/:id/prompt` `{ text }` | **200** |
| `POST /api/session/:id/prompt` `{ prompt: { text } }` | **400 Missing key at ["text"]** |
| `GET /api/session/:id/message` · `GET /api/event` · `POST /api/session/:id/interrupt` | **200** |

The warm server now probes `GET /api/session` once at creation and selects v2; older
builds keep v1. **The bare `{ text }` body is the v2 dialect** — the chat probe already
tries it first.

## 2. The normalizer no longer eats the gates

`normalizePlanForWalk`'s `SUPPORTED` regex knew only `file-exists:` / `build` / `lint`.
Every `file-contains:` / `file-omits:` / `design-score:` in the live AIME plan was
**demoted to `file-exists:<first artifact>`** — visible in the terminal as dozens of
"not a supported class" lines. All four classes are supported now. (The AIME artifacts
were re-checked with the real content gates: all PASS anyway.)

## 3. Chat stays open during a walk

The walk lock is checked **before** the plan-freshness guard. The 23:17 specimen: a
4-minute Apollo turn during the b1 hop ended in "the plan predates this turn" and the
user got no answer. A live campaign now logs one line and lets the assistant reply.

## 4. The hop ledger is real

The walk's children are spawn processes; their usage never reached `cost.jsonl`. A
29-minute Athena hop with 5,766 output tokens left Athena at **0** on the dashboard.
`readCostRows` now merges the active project's `.olympus-hop-telemetry.jsonl`
(tagged `hop-telemetry`, session-deduped, priced via `priceTokens`).

Measured after the fix (live API):

```
charged $0 · list $0.101 · reqs 42 · activeGods 3
  apollo     deepseek-v4.1-flash   req 35   in 194233  out 17019  list $0.0016
  athena     qwen3.7-plus          req  5   in    120  out 42087  list $0.0674
  dionysus   deepseek-v4.1-flash   req  2   in 167443  out 11401  list $0.0320
```

## 5. Money that adds up, honestly

GO is a subscription: the provider reports `cost: 0` for every step. Step-finish rows
now carry `spend_estimated_usd` (list price); aggregates keep **4 decimals** (sub-cent
no longer rounds to `$0.00`); the header and Cost pane say
**"GO plan — $0 charged · list $X"**. Labels: "Sub-agent capacity" (it was the catalog,
not routes) and "Sub-agents (used/cap)".

## 5b. The lane config survives the campaign

The post-campaign cleanup **deleted** `opencode.json`, `opencode.demigods.json` and the
`.opencode` symlink from a fully-walked lane, and `resolveWorkspaceLane` force-copied
the root config over it — resetting every per-lane MCP choice. The cleanup keeps the
config on disk (`.gitignore` keeps it out of git); the lane sync now captures and
re-applies the lane's `mcp[*].enabled` map. AIME restored: 132 agents, 7 servers ON
(playwright, nakkas, no git).

## 6. Nakkas boots

`npx nakkas@latest` resolved `@resvg/resvg-js` without its optional native package
(`@resvg/resvg-js-linux-x64-gnu` → MODULE_NOT_FOUND). `scripts/mcp-nakkas.mjs` pins
nakkas 0.5.0 **and** the platform package into the same npx environment (musl-aware),
stdio inherited. Verified with a real JSON-RPC handshake: **3 tools** — `render_svg`,
`preview`, `save`. Enabled in the AIME lane.

## 7. AIME — 6/6 GREEN

`b1` brand primitives · `b2` auth/onboarding · `b4` hero/deck · `f3-7` e2e spec ·
`design-review` · `b3` verify. `BRAND-CHECK.md`: **build exit 0, lint exit 0**.

Known (non-visible): the unused `src/components/aime-card.tsx` export still carries
pre-contract paint (cloud mark, gradients, glow). No route renders it.

## Apply

```bash
cd ~/Projects/olympus
npm install                    # lock already pins @opencode/cli 2.2.5
node node_modules/@opencode/cli/postinstall.mjs   # now covered by allowScripts
npm run build                  # Next + standalone verify + Electron package
olympus start
```

Close OLYMPUS before the build — the walk is complete, the lock is released.

## Manual test (v0.0.29)

1. Header: **v0.0.29**, cost chip shows `$0 charged · list $X` (not a bare `$0.00`).
2. Cost pane: **3 gods active** after a walk; Athena/Dionysus rows carry tokens;
   "Sub-agent capacity 122"; the per-god column says **used / cap**.
3. Nakkas: enable it in the MCP panel → status ALIVE, 3 tools (`render_svg`, `preview`,
   `save`). A `render_svg` call returns a PNG preview.
4. Chat during a walk: start a campaign, send a message — you get an answer, plus one
   "Campaign already walking this lane — chat stays available" log line. No stale-plan
   refusal.
5. Warm transport: the next walk's telemetry shows `transport: "warm"` (no more spawn
   fallback), and the hop starts in seconds, not minutes.
6. Plan paste: 2 `##` blocks + 2 `DONE:` + a quoted phrase → routes to the active
   project; never mints the quoted phrase.
7. AIME: `npx tsc --noEmit --incremental false` → 0; `npm run lint` → 0 errors.

## Known, still true

- **A bare `continue` cannot resume a plan written in a previous turn.**
  `estimateComplexity` classifies it `architectural · planning=yes`, so `expectPlan` is
  true and the freshness guard refuses the on-disk plan. The working resume prompt is
  **`Walk the AIME plan that is already on disk.`** (`simple · planning=no`).
- **Hop input tokens are a floor** when the provider reports cache reads separately:
  the telemetry sums `step-finish.input` only. The output and the count are real.
- `aime-card.tsx` (unused export) still violates the brand contract.
- The design-review hop reports the signed-in dashboard as *unverified for rendering*
  (no preview server was started during the hop); the build and the static read are green.
