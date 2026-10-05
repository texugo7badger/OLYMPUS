# OLYMPUS Architecture

> OLYMPUS v0.0.2 — multi-agent AI operating system on OpenCode, packaged as a standalone Electron desktop app. 10 gods · 118 demigods · Symphony v1.0 · VaultBrain v3.0 · AGPL-3.0-or-later.

## Overview

OLYMPUS is a multi-agent AI operating system built on OpenCode. It runs as a standalone Electron desktop app with a built-in terminal (shared live with your IDE via the Terminal Bridge), an Editor Bridge launchpad (replaces the built-in Monaco editor — see [EDITORS.md](EDITORS.md)), and a 3D brain atlas that visualizes the entire agent fleet.

```
┌─────────────────────────────────────────────────────────┐
│                    Electron Window                      │
│  ┌───────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ Activity  │  │  Left Pane   │  │   Right Pane     │  │
│  │ Bar (48px)│  │  (Brain /    │  │   (Terminal /    │  │
│  │           │  │   Vault /    │  │    Editor Bridge │  │
│  │ 10 gods   │  │   Cost /     │  │    / Vault /     │  │
│  │ + nav     │  │   God Detail)│  │    Frames)       │  │
│  └───────────┘  └──────────────┘  └──────────────────┘  │
│  ┌─────────────────────────────────────────────────────┐│
│  │              Status Bar (28px)                      ││
│  └─────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────┘
         │
         ▼
   OpenCode CLI (spawns agents, runs tools, captures hooks)
         │
         ▼
   ~/OLYMPUS-VAULT/ (instincts, patterns, activity feed, indices)
```

---

## Agents

**128 agents total: 10 gods + 118 demigods.**

- Gods are identified by NAME (the `GOD_NAMES` set), not by prefix.
- Demigods are unprefixed. A demigod named `build-resolver` lives at `.opencode/prompts/agents/demigods/hephaestus/build_resolver.txt`.
- Apollo is `mode: "primary"` (talks to the user). The other 9 gods (including Atlas) are `mode: "subagent"` (invoked by Apollo). All 118 demigods are `mode: "subagent"`.

See [AGENTS.md](AGENTS.md) for the full god/demigod roster.

---

## Editor Bridge + Terminal Bridge

OLYMPUS does not ship a built-in code editor. Instead:

- **Editor Bridge tab** (replaces the old IDE tab) — a launchpad that detects installed editors (Zed, VSCode, VSCodium, Cursor), lets the user pick one, and launches it on the active project. Also shows the Terminal Bridge status.
- **Terminal Bridge** — a WebSocket server on `127.0.0.1:3740` (token-gated, token at `~/.olympus/terminal-bridge-token`) that exposes the in-app PTY sessions to any client that speaks the protocol — the `olympus terminal` CLI, your editor's built-in terminal, etc.

See [EDITORS.md](EDITORS.md) for the full protocol reference + per-OS editor install commands.

---

## Persistent OpenCode Session (warm server)

Every conversation message in the Interactive Terminal runs on **one warm `opencode serve` instance** instead of a fresh `opencode run` per message:

- The **first message** of an app run lazily spawns `opencode serve --port <port>` (the only cold start, ~2s boot; the first free-tier model call can still take 5-10s).
- Every **subsequent message reuses the running server** via its HTTP API — no process/plugin cold start, context retained.
- Each chat conversation maps to one opencode session: `~/.olympus/opencode-sessions.json` (`conversationId → sessionId`). The Interactive Terminal sends a `conversationId` with every prompt/answer/context/new-session POST.
- If the server cannot start or dies mid-run, the route **falls back to one-shot `opencode run --format json --session <id>`** (context still retained); the next request re-probes and respawns the server.

Implementation: `src/lib/opencode-session.ts` (server lifecycle + event mapping), consumed by `src/app/api/olympus/action/route.ts`.

| Detail | Value |
|--------|-------|
| Default port | `3777` (env override `OLYMPUS_OPENCODE_PORT`; scans +5 if busy) |
| Bind | `127.0.0.1` only, per-instance random password (`OPENCODE_SERVER_PASSWORD`) |
| PID file | `~/.olympus/opencode-server.pid` — leftover servers from crashes are reused; killed on app exit |
| Log | `~/.olympus/opencode-server.log` (rotated at 1 MB) |
| Session map | `~/.olympus/opencode-sessions.json` (50 entries max, 7-day TTL) |
| Lifecycle | killed on app exit; orphaned servers from crashes are detected and reused |

Live events (`GET /event`) are mapped to the same UI event shapes the one-shot CLI emitted (`step_start` / `text` / `step_finish` / `tool.call` / `tool.response` / `error`), so the frontend is unchanged. The OLYMPUS overlay + router plugins load in serve mode exactly as in one-shot mode (verified: full command/tool/agent/permission config), so dispatch tracking, instinct capture, `session.idle` Callimachus heartbeat, and live.jsonl capture all work identically.

---

```
┌────────────────────────────────────────────────────────────────┐
│  Electron Main Process (electron/main.ts)                      │
│  • Spawns Next.js on localhost:3737                            │
│  • Native BrowserWindow (1600×1000)                            │
│  • node-pty PTYs (shared by IPC + the Terminal Bridge)         │
│  • Terminal Bridge :3740  (token-gated, 127.0.0.1 only)        │
│  • <webview> for embedded frames · IPC bridge                  │
└────────────────────────────────────────────────────────────────┘
                          ↕                            ↕
┌────────────────────────────────────────────────────────────────┐
│  Next.js Server (localhost:3737)                               │
│  • API routes: /api/olympus/*, /api/vault/*, /api/symphony/*   │
│  • /api/olympus/editor/{detect,launch,status} — editor mgmt    │
│  • SSE streams + WebSocket bridge (:3738)                      │
│  • React 19 + Next.js 16 dashboard                             │
└────────────────────────────────────────────────────────────────┘
                          ↕
┌────────────────────────────────────────────────────────────────┐
│  OpenCode + Agents                                             │
│  • Warm `opencode serve` (:3777) — one persistent instance per  │
│    app run, reused by every terminal message (no cold start)    │
│  • 10 OLYMPUS gods → 118 demigods → 18 tools + 19 MCP servers   │
│  • Cascading compression (caveman → strategic-compact →        │
│    Symphony harmonics)                                         │
│  • Cache instrumentation (olympus-go-cache + context-cache +   │
│    native OpenCode caching)                                    │
│  • Self-curating brain (VaultBrain v3.0)                       │
└────────────────────────────────────────────────────────────────┘
```

---

## Symphony

Symphony is the always-on standard language between Gods and Demigods. Every dispatch is a `VibrationalSignature` — there is no textual dispatch path.

### 5 axioms

1. **Lossless** — the original payload is preserved in the Vault's Resonance Registry.
2. **Coherence-gated** — dispatches below the coherence baseline (0.90) trigger fallback.
3. **Composable** — signatures chain: a demigod's harmonic can become the parent of a new signature.
4. **Auditable** — every signature + harmonic + consensus is logged to `~/OLYMPUS-VAULT/05_Auto_Learning/vibrations/registry.jsonl`.
5. **Zero-cost** — Symphony runs as pure local code (no LLM tokens).

### 4 strata

| Stratum | Role | Components |
|---------|------|------------|
| **Composer** | Emit signatures | Gods (via `olympus-dispatch` tool) |
| **Conductor** | Broadcast + fuse | `src/lib/symphony/core/conductor.ts` |
| **Orchestra** | Return harmonics | Demigods (execute tasks, return `HarmonicPattern`) |
| **Choir** | Decode for user | `src/lib/symphony/core/choir.ts` |

### API surface

- `runSymphonyCycle(composer, payload, targetOrchestra, invokeDemigod)` — compose → conduct → decode. Single entry point.
- `legacyPayloadToSignature(payload, composer, targetOrchestra)` — wrap a textual handoff into a signature.
- `signatureToLegacyPrompt(sig)` — unwrap a signature back into a textual prompt (for demigods that haven't been Symphony-enabled).
- `reconstructPayload(sig)` — lossless reconstruction from the Vault anchor.

### Arsenal Resolver

Symphony also powers the **Arsenal Resolver** — a quick-circuit layer for arsenal selection. It queries the Arsenal Resonance log for past dispatch outcomes matching the current task signature (Jaccard similarity ≥ 0.4). If coherence ≥ 0.85, a quick-circuit fires — returning the proven skills/MCPs/demigods as hints. Gods are not dependent on quick-circuits.

---

## Brain Atlas

The brain atlas is a 3D visualization rendered with Three.js (WebGL2) or Canvas2D (fallback). It shows:

- **10 god nodes** positioned in brain-lobe regions (frontal, parietal, temporal, cerebellum, brain stem)
- **Instinct nodes** — seed + empirical instincts per god
- **Knowledge nodes** — reference docs from `04_Knowledge/`

Skills, Evolved, and Project nodes are not shown in the Brain view — it centers on three core evolving elements: Gods, Instincts, and Knowledge. Scope filters (Global / Stack / Project / Cross-stack) narrow the view.

The brain surface is a 1648-point cloud (1400 surface + 220 cerebellum + 28 stem) rendered as a faint, minimalist silhouette. Nodes orbit around the brain surface, connected by edges.

---

## Hot/Warm/Cold Tier System

Skills AND MCPs are tiered by relevance to keep the input budget lean:

| Tier | What | When loaded | Count |
|------|------|-------------|-------|
| **Hot** | Mastered skills (in `mastered-skills/<god>.md`) + always-available MCPs | Always | ~5-10 skills + 1-2 MCPs per god |
| **Warm** | Stack-relevant skills (tags match active stack) + domain-relevant MCPs | Non-trivial tasks | Up to 20 skills + 2-3 MCPs |
| **Cold** | All other skills + MCPs requiring explicit equip | Never (lazy via skill index / explicit dispatch) | ~330 skills + 0-1 MCPs |

The `olympus-dynamic-context` plugin implements skill tiering in the `experimental.chat.messages.transform` hook. MCP tiering is implemented via `mcp-tiers.ts` (single source of truth for per-god MCP tiers) + a tier-aware `permission.ask` hook in `olympus-router`. The `selectMcpsForTask()` function in `mcp-tiers.ts` returns `{ hot, warm, cold }` for a given task classification, and the permission hook allows/denies MCP tool calls based on the tier + explicit equip records.

---

## Skill Index

A sqlite-vec database (`~/OLYMPUS-VAULT/03_Index/skill-vec.db`) indexes all 330 skills using TF-IDF vectors. The `SkillIndex` class provides sub-millisecond cosine search:

```typescript
const index = getSkillIndex();
const hits = index.search("react performance optimization", "athena", 5);
// → [{ skill_id: "react-performance", similarity: 0.82 }, ...]
```

The router's `chat.params` hook calls the skill index when the instinct gate doesn't short-circuit, surfacing the top-5 relevant skills as `olympus_skill_search` hints.

Build the index: `node scripts/build-skill-index.js`

---

## Plugin architecture

8 plugins in `opencode.json`:

| Plugin | Role |
|--------|------|
| `.opencode/plugins` | OLYMPUS hooks plugin (hooks: tool.execute.before/after, session.idle) |
| `.opencode/plugins/superpowers.js` | Superpowers skill bootstrap |
| `.opencode/olympus` | Olympus overlay (dispatch tracker, instinct gate, MCP gate, cost feed) |
| `.opencode/plugins/olympus-router` | MCP allowlist enforcement, instinct-gated dispatch, skill index search |
| `.opencode/plugins/olympus-go-cache` | GO plan prompt cache instrumentation |
| `.opencode/plugins/olympus-skill-registry` | Auto-discovers new skills on disk |
| `.opencode/plugins/opencode-context-cache.mjs` | Sticky context cache (MIT, JackDrogon) |
| `.opencode/plugins/olympus-dynamic-context` | Hot/warm/cold tier loading, task classification |

---

## Vault structure

```
~/OLYMPUS-VAULT/
├── 00_Inbox/              # Incoming archives + uploads
├── 01_Gods/               # Per-god reference notes
├── 02_Projects/           # Project notes (one folder per project)
├── 03_Index/              # Skill index (skill-vec.db, skill-vocab.json, arsenal-resonance.jsonl)
├── 04_Knowledge/          # Reference docs (security, testing, integrations, per-stack)
├── 05_Auto_Learning/      # Instincts + vibrations + patterns
│   ├── instincts/<god>/{seed,empirical,_archive}/
│   ├── instincts/sub-agents/<demigod>/{seed,empirical,_archive}/
│   ├── vibrations/         # Symphony runtime (registry.jsonl, templates.json, metrics.json)
│   ├── patterns/           # Cross-god dispatch chain patterns
│   └── evolved/            # Promoted instincts
├── 06_Activity_Feed/      # live.jsonl (every dispatch + outcome)
├── 07_Reviews/            # Code review snapshots
├── 08_Templates/          # Vault templates
└── 09_Archive/            # Archived instincts (cold storage)
```

---

## Counts

| Component | Count |
|-----------|-------|
| Gods | 10 |
| Demigods | 118 |
| Total agents | 128 |
| Skills | 330 |
| MCPs | 19 |
| Plugins | 10 |
| Commands | 16 |
| Review tools | 3 (design-review, integration-review, deploy-review) |
| Hooks | 21 |
| LLM strategies | 9 built-in (go-max-quality, go-balanced, go-budget, zen-max-quality, zen-balanced, zen-budget [Zen], free-openrouter, free-big-pickle [Free Big Pickle], free-nvidia-build [Free Nvidia Build]) + custom-* |
| LLM providers | 4 (OpenCode GO, OpenCode Zen, OpenRouter free, NVIDIA Build free) — see [MODEL-STRATEGIES.md](MODEL-STRATEGIES.md) |
| Supported external editors | 4 (Zed, VSCode, VSCodium, Cursor) — see [EDITORS.md](EDITORS.md) |
| Terminal Bridge port | 3740 (token-gated, 127.0.0.1 only) |
| Eval golden tasks | 5 (see [BENCHMARKS.md](BENCHMARKS.md)) |
| Telemetry logs | 3 (activity feed, short-circuit log, benchmark log) |
