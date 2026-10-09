# MADRUGA-SMOKE-1 — the 429 forensics (Batch B; needs no live build)

Verdict headline: **(a) distinguishable — but only per-provider, and only in the BODY, never in
the headers.** OpenRouter's 429 body machine-marks the class; NVIDIA's bare 429 marks nothing.
The Retry-After header was **never observed from any provider tonight** — so "respect
Retry-After" is filed as an instrumentation recommendation, not speculative code (the brief's
own rule). Filed as **#111** (link + label evidence in the CLOSE-OUT).

Evidence windows: FLUENCY-1's blocked window (01:32–01:47Z, per its CLOSE-OUT) + tonight's
s0 header-capture probes (04:55–04:57Z) + tonight's live `--print-logs` diagnostic on the
429-ing glm-5.3 lane (05:44:12Z → time-boxed kill at 480s).

## Q1 — Burst vs quota: does ANY provider signal distinguish them?

**NVIDIA (integrate.api.nvidia.com) — NO.** The 429 response, verbatim from tonight's probe
(`s0/e8-probe-t045506Z.txt`):

```
HTTP/2 429 
date: Fri, 09 Oct 2026 04:55:06 GMT
content-type: application/problem+json
content-length: 42
vary: Origin

{"status":429,"title":"Too Many Requests"}
=== HTTP_CODE:429 TIME_TOTAL:0.635070s ===
```

Bare RFC7807 (`status` + `title`, 42 bytes). **No `Retry-After`, no `X-RateLimit-*`, no
quota/reset field — nothing** distinguishes a minute-scale burst from a window-scale quota.
The same shape as FLUENCY-1's four 429s (that night captured without headers; tonight's header
capture closes the question: the signal is absent at the header level too, not merely unlogged).

**OpenRouter — YES, in the body.** Tonight's probe of the FLUENCY-1 specimen lane
(`google/gemma-4-31b-it:free`, 429 at 04:57:08Z):

```json
{"error":{"message":"Provider returned error","code":429,"metadata":{
  "raw":"google/gemma-4-31b-it:free is temporarily rate-limited upstream. ...",
  "provider_name":"Google AI Studio","is_byok":false,"provider_error_code":"429",
  "limit_source":"upstream_provider_shared_pool",
  "remedy_hint":"Retry shortly, add your own provider key ..., or route to another provider ..."}}}
```

`limit_source: upstream_provider_shared_pool` names the class EXACTLY (pool contention, not
the caller's quota) and `remedy_hint` even names the remedy. Still **no `Retry-After` header**
(headers captured verbatim in the same file: cloudflare/cf-ray/set-cookie only).

**Adjacent drift finding (disclosed, the #78 shape):** `openai/gpt-oss-20b:free` and
`inclusionai/ling-3.0-flash:free` answered **404 "This model is unavailable for free"** tonight
— both are in the shipped R4 `openrouter` block and the generator table (they PASSED the
budget-guard's floor check, which reads the config, not the live pool). Two of the five
free-openrouter lanes left the free pool; the drift detector (#78) is the filing that owns
the class. Not tonight's smoke path (free-nvidia-build), recorded honestly.

**Q1 verdict: (a) distinguishable — partially.** OpenRouter: parse `limit_source` /
`provider_error_code` from the body (evidence: observed tonight). NVIDIA: nothing to parse —
the window length is unknowable from the response; the honest card says so (the #108 census
already names the alternative lanes). Filed: **#111**.

## Q2 — Retry stacking: does opencode's internal cadence stack on our #107 crescendo?

The FLUENCY-1 diagnostic's cadence capture did not survive the night (tmp hygiene — disclosed);
regenerated tonight, live, against the 429-ing glm-5.3 lane (one-shot `opencode run --model
nvidia-glm/z-ai/glm-5.3 --format json --print-logs "say hi in three words"`, time-boxed 480s,
`reports/smoke-1/s2/` diag log excerpt below — full log `/tmp/opencode/smoke-1/diag-lane/`):

```
05:44:16.7 stream open (apollo, z-ai/glm-5.3)
05:44:17.4 stream error — AI_APICallError: Too Many Requests   (attempt 1)
05:44:19.9 stream error   (+2.5s)
05:44:24.3 stream error   (+4.4s)
05:44:32.8 stream error   (+8.5s)
05:44:49.3 stream error   (+16.5s)
05:45:21.8 stream error   (+32.5s)
05:46:26.2 stream error   (+64.5s)
05:48:34.7 stream error   (+128.5s)
[480s time-box kills the process at 05:52:12 — still inside the doubling cadence]
```

The internal cadence is a **clean 2^n doubling (~2s → 128s and doubling), ≥8 attempts captured
across 4m17s, never returning an error to the caller**. Reconciled against our #107 crescendo:
**they do not double-wait — the inner loop SHADOWS the outer.** While the spawned `opencode run`
process retries internally, it never exits, so the walker's `classifyRetry` never sees a
classifiable failure and our crescendo never fires; the only tripwire is the per-hop ceiling
(the R3 knob as of tonight's riders; 15 min default), whose SIGKILL surfaces to the walker as
`exit null` — classless — hence the FLUENCY-1 run-1 row (`parked-dispatch-failed`,
retriesAbsorbed 0, 900s wall). The crescendo's real domain is BETWEEN-process fast-fails
(immediate 503s/quota denials), which DO occur; the ceiling's domain is the silent-hang class.
Both are working as designed — the gap is purely classificatory, filed in #111 (a ceiling-kill
on a 429-classed lane should count toward the crescendo as the provider-overload class and
re-dispatch within budget before parking, instead of parking classless on the first hang).

## Q3 — The honest verdict

**(a)** — distinguishable, per provider, body-only, filed as **#111** with this evidence.
No Retry-After header was observed from any provider tonight, so "respect Retry-After" rides
the filing as an instrumentation note, not speculative code (the brief's own constraint).
The two 404'd OpenRouter `:free` slugs are logged here as drift evidence feeding **#78**
(stays open, its own scope).

Verbatim probe headers: `reports/smoke-1/s0/e8-probe-t045506Z.txt`
Verbatim diagnostic cadence: `/tmp/opencode/smoke-1/diag-lane/run.err` (tmp, the table above is
the durable extract)
