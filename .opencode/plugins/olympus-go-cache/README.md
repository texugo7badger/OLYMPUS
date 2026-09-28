# olympus-go-cache

> Prompt cache instrumentation plugin for OpenCode CLI v1.18.3.
> Phase 1 of the Olympus Arsenal Patch.

## What it does

Hooks OpenCode v1.18.3's `chat.params` and `chat.headers` hooks and sets
a project-stable SHA256 `promptCacheKey`, 24h retention, and cache_control
breakpoints. GLM models are skipped (Z.AI gateway rejects cache_control).

## Expected savings

- OpenAI-completions models (DeepSeek, MiMo, Kimi): 50% reduction
- Anthropic-messages models (MiniMax, Qwen, Claude): up to 90% reduction
- GLM models: skipped (implicit Z.AI caching only)

## Install

```jsonc
{ "plugin": ["./plugins/olympus-go-cache"] }
```

## License

MIT — see CREDITS.md.
