# PREVIEW-2 Batch B — #111 first look: is there an internal-retry knob? (evidence before code)

**Verdict: NO. opencode 1.18.10 (the pinned runtime) exposes NO user-facing control over the
internal LLM-call retry loop — not on the CLI, not in the env read-set, not in the config schema
(the schema is `additionalProperties: false`, so an unknown `retry` key would be REJECTED, never
silently honored). Per the brief's own rule: the finding is recorded here + on #111, and NO code
is written tonight.**

## The evidence trail (all verbatim artifacts committed in this folder)

1. **The CLI surface** — `opencode run --help` full capture (`opencode-run-help.txt`):
   36 lines of flags; the only observability knobs are `--print-logs` / `--log-level`. No
   retry/attempt/backoff flag exists.
2. **The env read-set** — every `OPENCODE_*` identifier in the compiled binary
   (`binary-env-vars.txt`, 82 unique): the only timeout-class entry is
   `OPENCODE_EXPERIMENTAL_BASH_DEFAULT_TIMEOUT_MS` — the BASH tool's timeout, unrelated to the
   LLM call path. No retry/backoff/attempts env is ever read.
3. **The config schema** — fetched live from `https://opencode.ai/config.json` (the same struct
   is compiled into the binary): `Config.additionalProperties: false`; the full property list has
   NO `retry` / `maxRetries` / `attempts` / `backoff` field at any level. What exists instead:
   - Provider-level TIMEOUTS: `provider.<id>.options.timeout` / `headerTimeout` (default 300000)
     / `chunkTimeout` (default 300000) — these bound a single hanging request; they do NOT
     control the retry loop. (`chunkTimeout: false` would even DISABLE the abort — worse.)
   - Model-level `options` is an `any` passthrough to the provider factory — the factory's
     consumed keys (`apiKey`, `baseURL`, `headers`, `fetch`, `useCompletionUrls`, timeouts)
     contain no retry consumption (binary sweep: the only `maxRetries` symbols belong to the
     AWS-SDK credential layer and a generic GitHub-actions HttpClient — maxRetries=1/`allowRetries`
     — neither is in the LLM call path).
4. **The internal loop itself** — the retry machinery is real and evented (`RetryPart` message
   part; `session.retry.scheduled` events carrying `{attempt, at, error}`), driven by the
   session processor — and its cadence was captured live in SMOKE-1 (2s→128s doubling, ≥8
   attempts / 4m17s inside ONE process; `reports/smoke-1/s2/diag-429-cadence.log`). It simply has
   no knob.

## What this closes + what stays open (recorded on #111 as the comment)

- CLOSED by this look: "does a knob exist?" — NO (three independent surfaces exhausted).
- STAYS OPEN on #111 (recommended minimal changes, code NOT written tonight per the brief):
  1. The walker's ceiling-kill classification: a `OLYMPUS_HOP_TIMEOUT_MS` kill on a
     provider-erroring lane should count toward the crescendo as the overload class and
     re-dispatch within budget before parking classless (`exit null`) — the layered design then
     actually composes.
  2. The shadowing note on the card/telemetry: when a hop dies at the ceiling with zero
     surfaced error class, the patience ledger should NAME the inner loop's existence ("the
     provider call retried internally until the ceiling — outer crescendo never engaged").
  3. The upstream lane: a retry-control feature request for opencode itself (the session
     retry loop's budget/cap), trackable and linkable.
