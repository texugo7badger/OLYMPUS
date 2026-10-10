# PLANO-MASTER-1 / B5 — the inline planner contract (F4, #119 CURED) + the thinking-knob OBS (verdict with live evidence)

## Part (a) — #119: the contract rides INLINE (RED-first)

**The RED (named):** `PL/#119 (F4): the planner contract rides INLINE — a minimal canonical
plan example in the marker` — FAIL (no example in the prompt; the planner had to OPEN the
source to learn the JSON shape); `PL/#119 (F4): the marker no longer points the planner at
source files` — FAIL verbatim ("the marker still tells the planner to read the schema in
source — the F4 defect verbatim"). The live specimen: Apollo opening the orchestrator source
at 13:43 of the UAT window to learn the contract the prompt should have carried.

**The cure** (`src/app/api/olympus/action/route.ts` — the planner marker): the contract is
INLINE — a minimal canonical 2-hop plan example carried in the prompt itself
(`{"version":1,"laneRoot":…,"hops":[{id/god/prompt/artifacts/verify/budgetTokens/after}]}`,
shown, not described) + the hard rules (version exactly 1; unique ids; one god per hop;
artifacts are real paths relative to the laneRoot; acyclic after-edges; budgetTokens ≤ 16384
with 8192 the sane default; `verify.review: "deterministic"` with `file-exists:<path>`
checks) + the explicit "do NOT open any source to learn it". Bounded: ~280 tokens added to
planning turns only. The `.ts` path references died from the marker (pinned).

**GREEN:** hop-runtime FULL (the 2 new pins + every preserved PL pin — the marker still names
dispatch-plan.json, the doctrine, the composition order); battery 30/30 + tsc 0.

## Part (b) — the thinking-knob OBS: REAL, SERIALIZABLE, MEASURED — wiring proposed, not snuck

The investigation (the #111 methodology — CLI → schema → wire → live probe), on this box,
2026-10-10:

1. **The CLI knob exists**: `opencode run --variant` — "model variant (provider-specific
   reasoning effort, e.g., high, max, minimal)" (opencode 1.18.10).
2. **The config surface exists**: the embedded schema carries
   `ProviderConfig.models.<id>.variants` (a map; open entries).
3. **The wire truth (NVIDIA, glm-5.3, live)**: the endpoint ACCEPTS `reasoning_effort` in
   the body. The measured delta — same prompt, one run each:
   | effort | completion tokens | reasoning chars |
   |---|---|---|
   | (default) | 161 | 643 |
   | minimal | 97 | 313 |
   | low | 28 | **0** (thinking off) |
   | high | 42 | 30 |
   Thinking measurably burns output tokens — the #83 thesis confirmed at the wire
   (comment posted: `issuecomment-6093381482`).
4. **The serialization shape matters (both shapes live-proven)**:
   - WORKS: `variants: {"high": {"reasoning_effort": "high"}, "low": {"reasoning_effort":
     "low"}}` — the direct fields land in the request body; two green runs with
     `--variant high` / `--variant low` (tokens counted).
   - DIES: the nested-`options` shape → the request carries a literal `options` key →
     **`400 — Validation: Unsupported parameter(s): 'options'`** (verbatim, recorded).
   - Also live: an UNDECLARED variant on a lane without variants → server-side
     `AI_APICallError: Bad Request` — the knob is opt-in per model, never a silent no-op.
   - `chat_template_kwargs: {enable_thinking: false}` is ACCEPTED by the endpoint but did
     NOT disable thinking (reasoning_content still present) — the effective wire knob is
     `reasoning_effort`.

**The verdict per the plan's own gate ("wire default per god ONLY IF the knob is real and
serializable"):** the knob passes BOTH gates — but the per-god default is a STRATEGY-level
change (the R4 live config — the frozen pair — + the generator + the 9 mirrors + sync), a
sanctioned apply of its own. B5 does NOT sneak it; it leaves the wiring UNBLOCKED and
PROPOSED at the user's gate (the natural candidate: `low` for the volume lanes — the ~83%
output-token cut on thinking-heavy prompts is real per-hop-ceiling headroom under the
8192/16384 caps).

## GREEN + state

Battery 30/30 + tsc 0 (the full sweep). R4 untouched — every probe ran from a SCRATCH
config in /tmp, never the repo's; frozen pair zero-diff; 0 CJK. #119 filed RED-first and
closed by this merge; #83 carries the cross-link comment.

**Merge trail after this merge: 9 of the 12 cap.** Next at the user's gate: **B6 —
observability + minimal multisession** (the banner, the where/who narration, the createGate
wiring, the Pantheon per-god states, the full multisession proposal doc).
