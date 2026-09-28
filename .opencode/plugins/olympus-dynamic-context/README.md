# olympus-dynamic-context

Dynamic input token routing plugin for OLYMPUS v0.0.1.

## Purpose

Reduces input token costs by loading only the skills, MCPs, instincts, and
reference docs that are relevant to the current task — instead of loading
the full 70-skill + 28-MCP + 9-god manifest into every prompt.

Implements dynamic input-token routing — the god's system prompt is built per-step from the active god's hot/warm/cold skill + MCP tiers + active stacks, keeping the input budget lean.

## How it works

1. The user submits a prompt via the Apollo chat pane.
2. `/api/olympus/action` (or `/api/olympus/intake`) runs `src/lib/task-classifier.ts`
   on the prompt — a pure heuristic pass that emits a `TaskClassification` JSON.
3. The classification is passed as the `OLYMPUS_TASK_CLASSIFICATION` env var
   to the spawned `opencode run --agent olympus-apollo` process.
4. This plugin hooks `experimental.chat.messages.transform` and reads the
   env var. It appends a "Dynamic Context" preamble to the system prompt
   that tells the god:
   - What classification was made (domain, complexity, stacks, files).
   - Which MCPs are available (god's `GOD_MCP_ALLOWLIST`).
   - Which reference docs are attached (stack-relevant).
5. The token budget per complexity bucket:
   - `trivial` → ≤ 5K
   - `simple` → ≤ 30K
   - `moderate` → ≤ 80K
   - `complex` → ≤ 150K
   - `architectural` → ≤ 150K

## The classifier never makes an LLM call

The classifier in `src/lib/task-classifier.ts` is pure heuristics + stack
detection. It runs in microseconds and adds ~0 input tokens to the spawned
process. This is the critical design constraint: if the classifier made an
LLM call, the input-cost savings would be wiped out.

## When the env var is missing

If `OLYMPUS_TASK_CLASSIFICATION` is absent (e.g. a legacy caller invokes
`opencode run` directly), the plugin is a no-op. The full context loads
as before — backward compatibility is preserved.

## License

AGPL-3.0-or-later (original OLYMPUS code).
