# OLYMPUS Security

> Standalone Electron desktop app, AGPL-3.0-or-later. 128 agents, Symphony protocol, token-gated IPC bridges.

## Attack surface

OLYMPUS is a standalone Electron desktop app. It does not expose any network ports to the outside world by default. The only network traffic is:

- Outbound HTTPS to the OpenCode GO API / OpenCode Zen (LLM inference)
- Outbound HTTPS to MCP servers (GitHub, Figma, Grafana, etc.)
- Outbound HTTPS to free-tier providers (OpenRouter, Groq, NVIDIA Build) when using a `free-*` strategy
- Local SSE stream (`/api/olympus/activity`) for the UI activity feed
- Local WebSocket bridge (port 3738) for real-time UI updates
- Local Terminal Bridge (port 3740) for IDE extension PTY sharing

No inbound connections are accepted. All network-exposed services bind to `127.0.0.1` only.

---

## Port map (all localhost-only)

| Port | Service | Protocol | Exposure |
|------|---------|----------|----------|
| 3737 | Next.js server (UI + API) | HTTP | 127.0.0.1 only |
| 3738 | WebSocket bridge (UI activity) | WS | 127.0.0.1 only |
| 3740 | Terminal Bridge (IDE extensions) | WS | 127.0.0.1, token-gated |

---

## Terminal Bridge (port 3740)

The Terminal Bridge exposes in-app PTY sessions to external IDE extensions (VSCode, VSCodium, Cursor, Zed) so the user can attach to the same live terminal from inside their editor.

### Security properties

- **Binds to 127.0.0.1 only** — never exposed to the network.
- **Token-gated** — clients must present `?token=<token>` in the WebSocket handshake. Without the token, the handshake is rejected with HTTP 401.
- **Token generation** — 32 bytes of `crypto.randomBytes`, base64url-encoded. Generated fresh at every app startup.
- **Token storage** — written to `~/.olympus/terminal-bridge-token` with `0o600` permissions (owner read/write only). The directory `~/.olympus/` is created with `0o700`.
- **Token rotation** — the token rotates on every OLYMPUS restart. IDE extensions that cache the token must re-read the file when their connection drops (they poll every 2 seconds when disconnected).
- **Binary frame handling** — binary WebSocket frames are treated as raw PTY input. Only clients that have completed the token handshake can send frames.
- **No command injection** — the bridge spawns PTYs via `node-pty`, not via shell command strings. Input is forwarded as raw bytes to the PTY's stdin.

### Protocol

See [EDITORS.md](EDITORS.md) for the full Terminal Bridge protocol reference.

---

## WebSocket Bridge (port 3738)

The WebSocket bridge on port 3738 carries real-time UI updates (activity feed, dispatch status, cost telemetry) between the Next.js server and the Electron renderer. It binds to `127.0.0.1` only and carries no secrets — all API key material stays in the Electron main process.

---

## Editor Bridge

The Editor Bridge launches external editors (Zed, VSCode, VSCodium, Cursor) as child processes on the user's machine. It:

- **Makes no network calls** — `child_process.spawn()` with the editor binary path.
- **Validates binary paths** — only launches editors from known install locations or user-configured custom paths.
- **Does not inject environment variables** into the spawned editor process beyond what OLYMPUS itself received.
- **Persists preferences** to `~/.olympus/editor-config.json` (local file, no secrets).

See [EDITORS.md](EDITORS.md) for the full Editor Bridge reference.

---

## Symphony — no new attack surface

Symphony is the always-on communication protocol between Gods and Demigods. It runs as pure local code:

- No network calls (signatures are composed, broadcast, and decoded in-process)
- No external dependencies (pure TypeScript, no crypto libraries beyond Node's built-in `crypto`)
- No user-supplied input flows into signature composition (the god composes the signature from its own deliberation)

The Vault's Resonance Registry stores signatures + harmonics + consensus in `~/OLYMPUS-VAULT/05_Auto_Learning/vibrations/registry.jsonl`. The registry is append-only and checksum-anchored — a signature whose anchor doesn't verify is refused.

---

## MCP gating

MCPs are gated at three layers:

### 1. Enable/disable toggle (`mcp-state.json`)

The MCP Configuration panel writes enable/disable state to `~/.olympus/mcp-state.json`. The `mcp-gate.ts` module reads this file on every MCP tool call. Disabled MCPs are blocked at runtime.

### 2. API key requirement

MCPs requiring API keys are blocked unless the key is configured. The gate checks (in order):
1. `~/.olympus/api-configs.json` (UI-managed)
2. `~/.olympus/.env` and the project `.env` (KEY=value lines)
3. `process.env` (set by the launcher)

MCPs NOT in the requirements map (e.g., filesystem, memory, git) require no API key and pass through (subject to the toggle).

### 3. God MCP allowlist + tier check

Each god has a hardcoded MCP allowlist in `olympus-router/index.ts`. The `permission.ask` hook denies any MCP tool call where the server isn't in the active god's allowlist. Additionally, the `mcp-tiers.ts` module classifies MCPs as hot/warm/cold per god — cold MCPs require explicit equip before use. This prevents a god from accessing MCPs outside its domain.

---

## Prompt defense

The `olympus-router` plugin injects a **Prompt Defense Baseline** into every system prompt via the `experimental.chat.system.transform` hook. The baseline is a 6-bullet preamble sourced from `.opencode/skills/prompt-defense-baseline/SKILL.md`.

---

## Vault isolation

Callimachus (the vault curator) is the only agent allowed to write to `~/OLYMPUS-VAULT/`. The `permission.ask` hook blocks Callimachus from writing outside the vault root. Other gods and demigods cannot write to the vault directly — they dispatch to Callimachus's demigods (`instinct-curator`, `brain-backup`, `brain-restore`, `docs-verifier`) for vault operations.

The vault root can be overridden via the `OLYMPUS_VAULT` environment variable. The hook always resolves to the canonical vault root before checking.

---

## File lock guard

The `file-lock-guard.cjs` hook (`.opencode/hooks/`) prevents concurrent vault writes from racing. Every vault write acquires a lockfile; if the lock is held, the write queues until released.

---

## API key storage

API keys stored in `~/.olympus/.env` are **encrypted at rest** using AES-256-GCM.

### Encryption

- **Algorithm:** AES-256-GCM with a 12-byte IV and 16-byte authentication tag.
- **Key derivation:** `SHA256(machine-id + hostname + pepper)` — machine-bound, cannot be decrypted on a different machine.
- **Storage format:** `KEY=enc:<base64url(iv + authTag + ciphertext)>`
- **Plaintext pass-through:** Values without the `enc:` prefix are read as-is (backward compatible).

### Key locations (checked in order)

1. **OpenCode `auth.json`** (`~/.local/share/opencode/auth.json`, legacy `~/.config/opencode/auth.json`) — **all LLM provider keys** (GO plan OAuth + free-tier Groq/OpenRouter) are authorized inside OpenCode via `olympus opencode` → Settings → Providers. OLYMPUS never injects these keys; it reads them from OpenCode's own auth file. Legacy keys may also live in `~/.olympus/.env` / `~/.olympus/llm-providers.json` (checked next).

2. **`~/.olympus/.env`** (legacy) — encrypted at rest. Only used for free-tier keys set up via the CLI fallback (`node scripts/install/setup-keys.mjs`). New installs configure keys inside OpenCode instead. Keys never need manual editing.

3. **`~/.olympus/api-configs.json`** — UI-managed via Settings → API Keys. Plaintext JSON, `chmod 600`, never logged, never sent over the network except to the upstream MCP provider as a Bearer token. Stores keys for: GitHub (`GITHUB_PERSONAL_ACCESS_TOKEN`), Grafana (`GRAFANA_URL`, `GRAFANA_API_KEY`), Figma (`FIGMA_API_KEY`).

4. **`~/.olympus/llm-providers.json`** — stores the active LLM strategy ID. Created and managed by the installer or Settings UI. `chmod 600`. No API keys stored here.

5. **`process.env`** — set by the launcher (e.g., for headless / CI use).

### Security properties

- Keys are **never exposed to the renderer process** — the Electron main process reads them and passes them as env vars only to the specific spawned process that needs each key.
- The `.env` file is created with `chmod 600` (owner read/write only).
- The encryption is machine-bound — copying `~/.olympus/.env` to another machine won't allow decryption.
- Keys entered via the installer or UI are encrypted before being written to disk.

---

## Crash telemetry

OLYMPUS records uncaught exceptions and unhandled promise rejections from the Electron main process to `~/.olympus/crash-log.jsonl`. This log is:

- **Local-only** — never sent over the network.
- **Stripped of secrets** — the crash logger redacts env var values and file paths containing `.olympus/` or `OLYMPUS-VAULT` before writing.
- **Rotation-limited** — capped at 100 entries; oldest entries are discarded.
- **Opt-out** — the `crashTelemetry` API is available via the preload bridge but recording is a development diagnostic, not a user-facing feature.

---

## Free-tier strategy security

When using a free strategy (`free-openrouter`, `free-big-pickle`, `free-nvidia-build`), OLYMPUS makes outbound HTTPS calls to:

- **OpenRouter** (`https://openrouter.ai/api/v1/chat/completions`) — with your OpenRouter key as a Bearer token.
- **NVIDIA Build** (`https://integrate.api.nvidia.com/v1/...`) — with your NVIDIA key (`nvapi-...`) as a Bearer token.

These are third-party API providers. Your prompts and code context are sent to their servers. Review their privacy policies before use. The free-tier keys are obtained with no credit card and have no billing risk, but the privacy tradeoff is the same as any cloud LLM API.

Keys for these providers are authorized inside OpenCode (`olympus opencode` → Settings → add OpenRouter/NVIDIA as providers) and stored in OpenCode's own `auth.json` (`~/.local/share/opencode/auth.json`). Legacy keys in `~/.olympus/.env` (AES-256-GCM, machine-bound) are still honored. OLYMPUS never injects LLM keys — no manual file editing needed. Free models are picked from the live provider lists (`scripts/refresh-free-models.js`) — the refresh only fetches public model metadata, never keys. See [MODEL-STRATEGIES.md](MODEL-STRATEGIES.md) for the full strategy reference.

---

## OpenCode Zen ("Zen") security

The Zen strategies (`zen-max-quality`, `zen-balanced`, `zen-budget`) use OpenCode's own curated gateway (`https://opencode.ai/zen/`). Your prompts and code context are sent to Zen (hosted in the US). Zen's providers follow a **zero-retention policy** and do not use your data for training — with three exceptions that matter for the proprietary lineup:

- **OpenAI and Anthropic models** (GPT-5.4, Claude Sonnet 5, etc. — the `zen-max-quality` / `zen-balanced` coding + reasoning roles) **retain requests for 30 days** per their data policies.
- The **free-on-Zen trial models** (Big Pickle, DeepSeek V4 Flash Free, MiMo-V2.5 Free, Laguna S 2.1 Free, Ling-3.0-flash Free, North Mini Code Free, Nemotron 3 Ultra Free) may retain/use data during their free period. Do not submit personal or confidential data to the free trial models.
- NVIDIA-served free endpoints log session data for security purposes.

Gemini, Kimi, MiniMax, Qwen-Max/Plus and the open-weight models (GLM, DeepSeek) are zero-retention. If 30-day retention is unacceptable, use a GO strategy (open-weight models) or a free-tier strategy instead of the OpenAI/Anthropic ZEN roles.

The Zen key is stored in OpenCode's own `auth.json` under the `opencode` provider (env override `OPENCODE_API_KEY`) — configured via `olympus opencode` → `/connect` → OpenCode Zen. OLYMPUS never injects the key. There are no request caps; charges are per request with auto-reload + optional monthly limits, so set a monthly limit if you want cost control.

---

## Reporting a vulnerability

**Do NOT open a public GitHub issue for security bugs.** Instead, email the maintainer at **texugo7badger@gmail.com** with:

- A description of the vulnerability.
- Steps to reproduce (or a proof-of-concept).
- Affected version (`cat VERSION` in the project root).
- Suggested fix (if any).

You should receive an acknowledgement within 72 hours. We coordinate disclosure on a mutually agreed timeline and credit reporters in the release notes (unless you prefer to remain anonymous).

### Scope

In scope:
- RCE, path traversal, or privilege escalation in the Electron main process.
- Bypass of MCP gating, god allowlists, or vault isolation.
- Leakage of API keys to the renderer process or to third parties.
- Symphony signature forgery / registry tampering.
- Terminal Bridge token bypass or replay attacks.
- WebSocket bridge (port 3738/3740) unauthorized access.

Out of scope:
- Vulnerabilities in upstream dependencies (report to the upstream project).
- Issues in vendored skills/MCPs that don't affect OLYMPUS itself.
- Social engineering, phishing, physical attacks.

---

## License

OLYMPUS is [AGPL-3.0-or-later](LICENSE). This security policy is part of the project documentation and may be reused under the same terms.
