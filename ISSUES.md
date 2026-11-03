# The 22 open issues — status map at v0.0.70

> v0.0.70 is the stability release. It closes the crash class and the mobile
> UX class; the rest stays open with a named target. No issue is closed
> without probe evidence.

| Issue | Title | Status at v0.0.70 | Target |
|---|---|---|---|
| #291 | detached supervisor + auto-resume on app restart | **partial** — server watchdog + respawn + INTERRUPTED verdict; the walker still dies with the server | v0.0.71 |
| #287 | stop hops from starting unmanaged servers/builds | open — the preview manager refuses double-spawn, hops still can | v0.0.71 |
| #293 | stream bounded tool output/progress | **partial** — live tokens/files/last tool in the task sheet; the modal's thinking is still settle-only | v0.0.71 |
| #288 | persist the full recipe + Hop Detail drawer | **partial** — build snapshot (model/strategy/build/talent) in the sheet | v0.0.71 |
| #306 | source hops must run build/lint | open | v0.0.71 |
| #305 | visual gate for UI hops | open | v0.0.71 |
| #308 | work card GREEN but not mounted | open | v0.0.71 |
| #278 | capture tokens on the warm transport | open — recent AIME rows carry `null` | v0.0.71 |
| #277 | per-model 5h/weekly/monthly caps | open | v0.0.72 |
| #279 | cost:audit reconciliation gate | open | v0.0.72 |
| #269 | epic(cost): cost truth | open (parent) | v0.0.72 |
| #272 | epic(telemetry): context/benchmark/counts | open (parent) | v0.0.72 |
| #271 | epic(hop): campaign truth + reliability | open (parent) | v0.0.71 |
| #270 | epic(mcp): MCP lifecycle | open (parent) | v0.0.73 |
| #283 | lane-scoped health, probe-before-enable, quarantine | open | v0.0.73 |
| #284 | repair or retire tamp/serena/opendesign/docker/postgres/git | open | v0.0.73 |
| #317 | every MCP first-class — vendor all + cure matrix | open | v0.0.73 |
| #274 | epic(autonomy): per-god chats | open (parent) | v0.0.74 |
| #303 | element/component picker → god chat/queue | open | v0.0.74 |
| #304 | per-god chats (10 tabs/sessions/queues) | open | v0.0.74 |
| #318 | user-sovereignty decision ledger + cognitive protocol | open | v0.0.74 |
| #273 | epic(design): live preview + magic wand | open (parent) | v0.0.74 |

## What v0.0.70 did close (the class, not the issue number)

- The app no longer sits on `ERR_CONNECTION_REFUSED`: a 10s health watchdog
  respawns a dead dev server and reloads when it answers; the `did-fail-load`
  respawn check now handles the null `nextProcess` (the actual bug).
- The phone scrolls: the root `<body>` no longer carries `overflow-hidden`.
- The phone sends voice: `/m` uses the same `useHoldToTalk` as the studio
  (server STT + browser fallback), not the browser-only dictation.
- The phone is one screen: ring + hold-to-talk + god row; the details sheet
  holds the rest.
- One canvas on the phone (the ring); the desktop panel's particle budget is
  96→64.
