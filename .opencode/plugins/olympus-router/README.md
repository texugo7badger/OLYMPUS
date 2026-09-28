# olympus-router

> Phase 4 complete. The consolidated Olympus router plugin.

## Hooks used

| Hook | Phase | Purpose |
|---|---|---|
| chat.params | 1+4 | Cache key + retention + cache_control + instinct-gate annotation |
| chat.headers | 1 | Sticky-session headers |
| permission.ask | 2+4 | Per-god MCP allowlist enforcement (strict in Phase 4) |
| experimental.chat.system.transform | 2 | Prompt Defense Baseline injection |
| tool.execute.before | 2+4 | Sub-agent instinct scope validation (strict in Phase 4) |

## Install

```jsonc
{ "plugin": ["./plugins/olympus-router"] }
```

You do NOT need to also list olympus-go-cache or opencode-context-cache —
olympus-router imports and invokes them.

## Env vars

- OLYMPUS_DEBUG=1 — enable verbose logging to stderr.

## License

MIT — see CREDITS.md.
