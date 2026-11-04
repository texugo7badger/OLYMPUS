# OLYMPUS Roadmap

**v0.0.80 is the current release** (2026-11-04) — alignment + fast preview:
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
