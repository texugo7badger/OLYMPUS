# MCP in OLYMPUS

OLYMPUS ships **28 MCP servers** in two files:

| File | Role |
|---|---|
| `.mcp.json` | the human catalog (descriptions + service/app requirements) |
| `opencode.json → mcp` | **the runtime truth** OpenCode reads at spawn |

The MCP Configuration panel reads the merged, **deduped** registry. It is the
same 28 rows you see in `opencode.json` — never the old 50-row double count.

## The canonical shape (OpenCode v2)

```json
{
  "mcp": {
    "example-local": {
      "type": "local",
      "command": ["npx", "-y", "some-mcp@latest", "."],
      "environment": { "TOKEN": "{env:TOKEN}" },
      "enabled": true,
      "timeout": 30000
    },
    "example-remote": {
      "type": "remote",
      "url": "https://mcp.example.com/mcp",
      "headers": { "Authorization": "Bearer {env:EXAMPLE_KEY}" },
      "oauth": false,
      "enabled": false
    }
  }
}
```

Rules that are not optional:

- **`type` is required.** An untyped entry is silently ignored by OpenCode.
- **`command` is ONE array.** `args` is not a field; an entry with `args` runs
  `command[0]` alone (usually `npx` with no package) and times out.
- **`environment`**, not `env`.
- **`timeout` is a number (ms)**, not an object. An object makes OpenCode drop
  the entry.
- Placeholders use **`{env:VAR}`**. `${VAR}` is literal to OpenCode.
- `enabled: false` is an explicit opt-out; it is not the same as removing the
  entry.

## The curated default (6 servers · 44 tools)

| Server | Tools | Why |
|---|---|---|
| `filesystem` | 14 | project file access (cwd = the project home) |
| `memory` | 9 | knowledge-graph memory (`05_Auto_Learning/kg-memory.json`) |
| `git` | 12 | repository operations |
| `context7` | 2 | live library docs (compressed via mcp-compressor) |
| `sequential-thinking` | 1 | structured reasoning |
| `olympus-craft` | 6 | Craft Apps control |

The 128-tool provider limit is real. Heavy servers (`rea` 207, `grafana` 79,
`comfyui` 41, `godot`, `blender`, browser automation) stay **opt-in**.

Every other shipped server is **off** with an honest requirement:

- **key**: `fal`, `originkit`, `github`, `figma`, `grafana`, `brave-search`
- **service**: `comfyui`, `kubernetes`, `docker`, `postgres`, `grafana`
- **app**: `godot`, `blender`, `rea`
- **binary**: `mcp-gateway`
- **optional/heavy**: `chrome-devtools`, `playwright`, `serena`, `tamp`,
  `nakkas`, `shadcn`, `opendesign`, `pollinations`

## Commands

```bash
npm run mcp:sync            # dry-run: what the canonicalizer would change
npm run mcp:sync -- --apply # write opencode.json (backup first, idempotent)
npm run mcp:audit           # JSON-RPC initialize + tools/list on every server
opencode mcp list           # what OpenCode itself sees
```

The panel auto-runs the canonicalizer on mount. After the first migration it
is a no-op (it writes only when the stable JSON differs).

## Toggling

The toggle writes the canonical entry to `opencode.json` **and**
`~/.olympus/mcp-state.json` (the per-tool-call gate). OpenCode reads the
config at spawn: a running session keeps its current tool list, so start a
new session (or Reset) after a toggle.

A server that is enabled but missing its key is **locked**, not dead. The
panel distinguishes `needs-auth` from `dead` so a missing key never looks like
a broken server.

## Adding a server

1. Add it to `.mcp.json` in the canonical shape.
2. `npm run mcp:sync -- --apply`.
3. `npm run mcp:audit -- --only your-server`.
4. Confirm `opencode mcp list` shows it connected.
5. If it needs a key, add it to `src/lib/mcp-api-requirements.ts` so the panel
   can lock it honestly.
