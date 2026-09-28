---
description: Manually dispatch to a specialist god. Use when you know which god should handle the task (bypasses Apollo's classification).
subtask: true
---

# OLYMPUS Dispatch — Manual God Dispatch

Manually dispatch a task to a specialist god. Bypasses Apollo's classification.

## Usage

```
/olympus-dispatch <god> <task>
```

## Available Gods

- `olympus-artemis` — Security / Auditing
- `olympus-athena` — Frontend / Design (Impeccable)
- `olympus-dionysus` — QA / Testing
- `olympus-hephaestus` — Backend / Infrastructure
- `olympus-hermes` — Integrations / APIs / MCPs
- `olympus-persephone` — Database / Persistence
- `olympus-prometheus` — DevOps / CI-CD / Deploy

## Behavior

The specified god will:
1. Query its instincts (`olympus-instinct-query` tool)
2. Short-circuit if confidence >= 0.85, or deliberate normally
3. Dispatch to the appropriate demigod with skill + MCP
4. Log the dispatch to the activity feed

$ARGUMENTS
