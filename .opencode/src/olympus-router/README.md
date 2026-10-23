# olympus-router

> The consolidated OLYMPUS router plugin — **v2 entry** (`index.ts`) over the
> untouched v1 hook map (`v1.ts`).

## How v2 loads it

OpenCode v2 loads the plugin **directory** by its `index.js` and requires the
module to export `{ id, setup }`. The compiled entry assigns
`module.exports = plugin` (probe-verified against 2.0.32 — a CJS
`exports.default` fails the schema).

Build: `npm run plugins:compile` (writes `.opencode/plugin-dist/olympus-router/`).

## v2 domain wiring

| v1 hook (v1.ts) | v2 domain |
|---|---|
| `experimental.chat.system.transform` | `session.hook("context")` |
| `chat.params` | `session.hook("context")` (mutates `ctx.options`) |
| `permission.ask` | `permission.hook("evaluate")` |
| `tool.execute.before` | `tool.hook("execute.before")` |

The cache hooks (`chat.params` cache key / `chat.headers`) are **not wired on
v2** — opencode v2 caches natively at the provider layer (#189). The v1 lane
(1.18.10) still gets them through `v1.ts` + `go-cache.ts`.

## Install

```jsonc
{ "plugin": ["./.opencode/plugin-dist/olympus-router"] }
```

## Env vars

- `OLYMPUS_DEBUG=1` — enable verbose logging to stderr.

## License

AGPL-3.0-or-later (original OLYMPUS code).
