---
title: MCP Server Integration
category: integrations
stacks: []
god: hermes
last_updated: 2026-10-30
sources:
  - https://modelcontextprotocol.io/specification/2025-06-18
  - https://opencode.ai/docs/mcp-servers/
  - https://opencode.ai/docs/config/
---

# MCP Server Integration

## When to use
Adding a tool/data source to an agent, wiring an MCP into OpenCode/OLYMPUS, or
debugging "the MCP is enabled but the tool never appears".

## The OpenCode config shape (v2)
- Local: `{ "type": "local", "command": ["npx","-y","pkg","arg"], "environment": {...}, "enabled": true, "timeout": 30000 }`
- Remote: `{ "type": "remote", "url": "https://.../mcp", "headers": { "Authorization": "Bearer {env:KEY}" }, "oauth": false, "enabled": true }`
- **`command` is ONE array**. `args` is not a field; an entry with `args` runs
  `command[0]` alone and fails.
- **`environment`**, not `env`.
- **`timeout` is a NUMBER (ms)**, not an object. An object makes OpenCode drop
  the entry.
- Placeholders are `{env:VAR}` (OpenCode dialect). `${VAR}` is literal.
- `type` is REQUIRED. An untyped entry is silently ignored — the #1 "enabled
  but invisible" bug.

## Non-negotiables
- Probe with a real JSON-RPC handshake (`initialize` + `tools/list`); a
  process that starts is not a server that works.
- Report the failure class: missing binary, missing key, missing service,
  auth-required, timeout, protocol error.
- Locked ≠ dead. A server missing its API key is `needs-auth`, not `dead`.
- Keep the enabled tool count under the provider's cap (OpenCode/OLYMPUS
  curated set: 44 tools). Heavy servers are opt-in.
- One source of truth for the catalog; normalize before writing the runtime
  config. Never let a UI toggle write a legacy shape.
- A remote server gets a POST/Streamable-HTTP probe, not a HEAD request.

## Checklist
- [ ] `type` present; `command` is one array; `environment` used.
- [ ] `{env:...}` placeholders, numeric timeout.
- [ ] Key/service/binary requirements declared.
- [ ] Handshake probe green; tool count recorded.
- [ ] Disabled servers are explicit (not half-enabled).
- [ ] The runtime config is canonical after a UI toggle.

## Anti-patterns
- `{"command":"npx","args":["-y","pkg"]}` — invisible to OpenCode.
- `env`/`timeout:{startup:...}` — silently dropped.
- Enabling every MCP and blowing the 128-tool/provider limit.
- Treating a 401 as "dead" and disabling a server that only needs a key.
- Duplicating the same server in two registries and double-counting it.

## Sources
- MCP spec 2025-06-18: https://modelcontextprotocol.io/specification/2025-06-18
- OpenCode MCP docs: https://opencode.ai/docs/mcp-servers/
- OpenCode config: https://opencode.ai/docs/config/
