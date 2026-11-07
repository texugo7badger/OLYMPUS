# OLYMPUS Roadmap

**v0.0.89 is the current release** (2026-11-07) — Atlas stays on: the
server-side warden (deterministic, no Apollo prompt) keeps opted-in campaigns
walking, pins Atlas to HY3 and writes one decision box; the Parthenon command
deck lands on desktop and mobile over the animated Nakkas SVG; the GO cost
window gains the usage-vs-pace forecast (renewal, daily burn, hit date, hatched
forecast). **v0.0.88** — the campaign that
finishes: plan generations + definition hashes + staged next plans; Atlas
deterministic verdicts and a cause-specific recovery policy that resumes the
walk by itself; campaign context/steering law so a follow-up never rewrites a
live plan; one health line on the Parthenon and the phone; tool budget 20 with
per-hop overrides; warm token truth; 23 public CI suites; 68 builds + build
packs with a ToxicSkills-style scan; a reversible 61-demigod archive (71
agents); a measured 3→4 concurrency experiment; and the note-8 harness (claim
still not made). **v0.0.87** — Apollo speaks, Atlas thinks, the ledger tells
the truth: Apollo narrates every long turn and fails fast on a dead lane;
Atlas patrols every park with a deterministic retry/replan/ask-user verdict;
the GO ledger reads the walker's real token rows, the cost screen adds an
hourly chart, tips and a recent-request log; measured tok/s is shown across
the Parthenon, task sheet, demigod chips, phone and briefing; the PWA status
strip follows the theme background. **v0.0.86** — every god live, every park
named: the Parthenon renders all ten gods from second zero with a durable
per-god terminal, the turn ceiling is 30 min with a 40-min hop hard cap and a
48 KB reasoning prelude, parks are classified by cause with mid-hop lane
failover and honest partial-plan reporting, and the Build Hub ships Phase 0
plus 12 new builds with a `builds:check` gate and dispatch-time build
injection.
**v0.0.86** — every god live, every park named:
the Parthenon renders all ten gods from second zero with a durable per-god
terminal (a mark-preview request lands in Athena's thread and she steers her
current work), the turn ceiling is 30 min with a 40-min hop hard cap and a
48 KB reasoning prelude, parks are classified by cause with mid-hop lane
failover and honest partial-plan reporting, the dead-lane chip names the lane
and retries it, and the Build Hub ships Phase 0 plus 12 new builds with a
`builds:check` gate and dispatch-time build injection.
**v0.0.85** was the Apollo companion in
your pocket: `/m` and `/m/widget` are two installable PWAs with the same
themed icon, one worker and in-app switching; a zero-token briefing (current
hop, parked reason, recent settles, next hops) spoken by Apollo and every
god; real mobile/desktop captures of the live preview with a critique lane;
one notification feed on PC and phone, with native OS notifications while
the PWA runs. The native home-screen widget is the v0.1.0 priority.
**v0.0.84** was the park that survives a resume:
a machine auto-resume keeps the quarantine instead of re-running the hops
that just parked; the park stays on disk from the initial write until the
hop passes (the AIME 55/78 silent-stop specimen). A human start still
retries — the explicit decision.
**v0.0.84** was the animated preview, the real share, mark and handoff:
AIME dev origins allowed; share uses the direct tunnel app; revoke kills it;
`/m` preview sheet with mark → Athena; a 95% context offers a one-click
handoff + clean window; per-model cost caps and the strict cost gate; clickable
hops on the PC left column and the phone cost sheet. **v0.0.83** was the user
lane and the measured speed:
measured telemetry in the studio, hourly bounded sessions, agent-scoped tok/s,
user-activity lease holding new hops, Apollo-only mobile mic into the terminal
queue, mobile particle field/performance/all themes, Cost-panel GO bar.
**v0.0.82** was the markview bridge and the two dead clicks:
references stage/queue with priority and auto-drain; the project switcher and
notification panel are portals; the profile scan is bounded/cached.
**v0.0.81** was public core + measured frames + the fix pass:
notifications open, mobile creative is chat-only, voices stop reading logs,
restarts ask, the GO Plus bar matches the console, tok/s is measured and the
stable-version channel lands in Settings. The original v0.0.81 cut was:
ten pure suites + CI, the fps probe, hygiene/security, the honest 7.x
checkpoint. v0.0.80 was alignment + fast preview:
five explainable signals, a bounded Athena turn, a static skeleton served
locally. v0.0.79 was the secure preview share:
scoped/expiring/revocable link, reverse proxy with URL rewriting, copy/
WhatsApp/Telegram/revoke. v0.0.78 was voice + phone + suspend:
the voice ladder probed + VOICE.md, the phone queue/resume, and the suspend
drill. v0.0.77 was the creative flow:
hop click → live sheet (desktop + phone), god chat with mic + queue, god↔god
session, queue dedupe, SVG support buttons. v0.0.76 was the god chat:
the Parthenon opens a conversation with the focused god (own agent, own
session, last thought + status), and the voice orb follows the theme.
v0.0.75 was the live-truth + themes release:
Eclipse (inverse Celestial) and Paper (manga) replace the old Paper/Arctic
slots; the reference grid resets on filter and `references:refresh` diffs the
sitemap within the daily budget. v0.0.75 was the live-truth release:
God Intelligence counts turns + hops from the lane telemetry, the campaign
reads the lane state + plan, and the hop sheet is lane-scoped and live.
v0.0.74 was the clean-input release:
Ctrl+V attachments become `[name]` tokens, the agents census publishes the
pruning evidence (122/14/3), and every Documentation page carries a diagram.
v0.0.73 was the detached-walk release:
one process per lane that survives the app, boot adoption (bounded), a
start/stop/status route and a green crash drill. v0.0.72 added the campaign
cost audit, opt-in spend caps, a docs gate and the strategy guard. See [CHANGELOG.md](CHANGELOG.md) and
[TOKEN-ECONOMY.md](TOKEN-ECONOMY.md) for the measured numbers.

> The plan of record for the climb to v0.0.81 is the maintainer's
> `ROADMAP.md` in `~/.opencode/plan/` (ladder, runbook, definition of done).
> This file is the public, short version: what ships next and what evidence
> closes each step. A version without evidence does not count.

## Where the score stands

The independent analysis v3 (v0.0.71) scored **6.29 → 6**: product shipped,
score flat. The three chronic debts are the reason:

| Debt | State | Closed by |
|---|---|---|
| Cost | measured tokens/hop, list value, invoice unknown | v0.0.72 (this release) |
| Focus | 132 agents, +3.958 lines, no pruning | v0.0.74 |
| People | 2 stars, 0 forks, 0 external user | v0.0.78 |

The ladder alone is worth ~7.1. **8.0 requires pruning + public tests + one
external user.** 9.0 and 10.0 are community and sustainability, not versions.

## The ladder

| Version | Theme | Evidence that closes it |
|---|---|---|
| **v0.0.81** | Public core + FPS + checkpoint | 10 suites + CI; fps probe; 7.x |
| **v0.0.80** | Alignment + fast preview | meter + one-turn skeleton |
| **v0.0.79** | Secure preview share | scoped link + proxy |
| **v0.0.78** | Voice + phone + suspend | ladder + drill |
| **v0.0.77** | Creative flow | hop sheet + mic + queue + god↔god |
| **v0.0.76** | God chat | Parthenon conversation per god |
| **v0.0.75** | Live truth | dashboard = lane telemetry; hop sheet live |
| **v0.0.74** | Clean input + census + docs | paste → `[name]`; census 122/14/3; SVG on every doc |
| **v0.0.73** | Detached supervisor (#291) | one process per lane; crash drill; boot adoption; start/stop/status |
| **v0.0.72** | Cost truth + docs gate + spend caps | `cost:audit` measured; caps tested; `docs:check` green; strategy guard |
| v0.0.73 | 8-hour soak | soak report: 0 lost hops, RSS bounded, p50/p95 |
| v0.0.74 | The pruning | census 132 → ~30 dispatched; negative line delta; #317 cancelled |
| v0.0.75 | Public tests + control | a clone runs the pure core; hop detail; real ETA; per-god chats |
| v0.0.76 | Measured 60 FPS + renderer | `fps:probe` p50 ≥ 58 on four surfaces; 24h uptime; Mark + Atelier |
| v0.0.77 | AIME 79/79 | frozen plan finished; per-hop report; 0 unnamed parks |
| v0.0.78 | Distribution + first external user | one human issue; one campaign on another machine |
| v0.0.79 | Checkpoint 8 (honest) | independent review confirms 8.0 or says 7.x |
| v0.0.80 | Headless worker < 1.5 GB | RSS measured; campaign 100% headless |
| v0.0.81 | 100-hop + 7 days + external campaign | 100/100; a campaign from another machine published |

## Rules of the climb

1. **Minors only** — never `0.0.x.1`, never skip a number.
2. **No new surface before the 8** — no theme, voice, panel or screen. Extend
   what exists. v0.0.74 must shrink the product.
3. **AIME is the exam, not the workspace** — read-only until the maintainer
   asks.
4. **No claim without a probe** — tokens need a row, FPS needs the probe,
   "running" needs the health probe.
5. **Docs move with the tag** — `npm run docs:check` is part of the gate.
6. **#317 (vendor-all MCP) is cancelled** — the curated 39 tools are the asset.
7. **Evidence is public, raw campaign data is private.**

## v0.0.72 in one screen

- `npx tsx scripts/cost-audit.ts --lane <project>` — tokens, cache hit,
  p50/p95, list value, invoice, null-token gaps.
- `~/.olympus/cost-caps.json` — 5h / weekly / monthly caps on the list value;
  a cap parks the hop by name (`cost-cap-*`).
- `npm run docs:check` — VERSION, README, CHANGELOG, ROADMAP, STABILITY and
  the retired 97% claim are gated.
- Strategy switch while a walk is live → refused with the holder named.

## After v0.1.0 — updates, changelog and the community as part of OLYMPUS

- **Update flow (stable and dev channels).** When a new build is available,
  OLYMPUS asks before updating; the update runs behind the branded animated
  loader with the OLYMPUS mark and a real progress bar. A multilingual,
  simple changelog explains the new features, fixes and known bugs. Stable
  and development channels are separate: the dev channel shows what is being
  built in real time, with an explicit “possible bugs” warning, and never
  silently replaces the stable tag.
- **The community builds the base.** Users can export/import instincts,
  skills, MCPs and vault knowledge as signed build packs; a non-developer can
  publish a pack through the app (upload/push) without touching the repo.
  The OriginKit/reference catalog feeds the same pipeline. Each OLYMPUS learns
  from its own user, and the community can share what worked.
- **Free lanes are community experiments, not a promise.** The official build
  does not ship a “free strategy” that failed the benchmark; the UI makes it
  easy to find/test a community free build and warns about small contexts,
  weak tool use and rate limits. A working free recipe can be pushed back as a
  build pack.
- **The 8-hour night benchmark.** A scheduled overnight campaign produces the
  benchmark/log bundle (workflow, token spend, instincts and knowledge
  learned, per-hop truth) that becomes the evidence for the next model,
  prompt and routing decisions.

## v0.1.0 — the native OLYMPUS app and the real home-screen widget (priority)

The v0.0.85 companion is an installable **PWA**: `/m` and `/m/widget` have
their own themed manifests, icons and service worker, and the phone can add
both to the home screen with the same mark in the active palette. A PWA can
not place a live **home-screen widget** on Android/iOS — the OS only exposes
widgets to native apps. That is a platform limit, not a missing script.

- **Delivery:** a thin Capacitor/TWA wrapper reuses the same `/m` and
  `/m/widget` surfaces (one codebase, no second UI), with **Glance** for the
  Android/Samsung home-screen widget and **WidgetKit** for iOS. The wrapper
  reads the same session token, theme store and notification feed.
- **The widget:** campaign progress, the in-flight hop, the parked reason,
  the next hops and the briefing — read-only, refreshed by WorkManager, with
  one tap opening `/m/widget` (never the PC screen).
- **Notifications:** the wrapper adds true background push (Web Push
  subscription + VAPID, or FCM/APNs) so a settled hop reaches the phone even
  when the PWA process is gone. Until then the PWA notifies while it is
  running; the UI says so explicitly.
- **Acceptance:** installable APK/IPA, themed launcher icon, one widget per
  home screen, background notification on hop done/park, and the same
  briefing in the user's language. The PWA remains the zero-install lane.
