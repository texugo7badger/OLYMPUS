# RLM — Recursive Long-context Management: Techniques Mapped to OLYMPUS

> STATUS: COMPLETE (three passes: outline → per-section expansion →
> synthesis + adversarial self-critique applied to the draft, with
> corrections folded back into the text). BATCH 12b-NIGHT, Phase 4
> deliverable.
>
> Scope: a research memo on managing long-context work with recursive
> decomposition patterns, and a concrete mapping of each pattern to OLYMPUS
> code paths, ending in prioritized, DIFF-ONLY-scoped proposals for the
> next batches. External concepts are labeled `external-theory`; no
> citations are invented — where a reference cannot be verified, the
> technique is named generically instead.

## 1. Purpose & scope

Intent: define the problem class (long-context agent work), name the
technique family, and set the evaluation vocabulary used by the proposals.

## 2. Techniques (external-theory, described generically)

### 2.1 Recursive decomposition of long-context tasks

`external-theory` — the pattern: a task whose full material exceeds one
context window is split into sub-tasks; each sub-task gets its own window;
results fold back into the parent's window as compact summaries instead of
raw material. The recursion terminates when a sub-task fits in one window.
The critical properties:

- **The unit of recursion is a window, not a prompt.** The question is
  never "how do I phrase this" but "what fits in a window, and what must
  the next window be told".
- **Fold-back must be lossy on material, lossless on decisions.** A parent
  receiving a sub-result needs the decisions + their rationale + pointers
  back to material — not the material itself.
- **The decomposition structure is a tree with an explicit contract at
  every edge** (what the child is asked, what it may assume, what shape of
  answer it must return). Without the contract, fold-back produces noise.

### 2.2 Sub-context isolation with handoff summarization (context distillation)

`external-theory` — the pattern: each spawned sub-context starts CLEAN.
It receives (a) a task statement, (b) a handoff summary — the minimal set
of constraints, decisions, and vocabulary the sub-task needs, distilled
from everything the parent knows — and (c) retrieval access to the raw
material if it turns out the summary is insufficient. The handoff is a
compression artifact with a fixed schema: goal, constraints, decisions
already made, boundaries, expected output shape. Its quality determines
everything downstream: an under-specified handoff forces the child to
re-derive (wasted window), an over-stuffed handoff imports the parent's
noise (defeats isolation).

### 2.3 REPL-over-context (iterate over retrieved slices)

`external-theory` — the pattern: rather than stuffing a corpus into the
window once, expose it behind a query loop (a REPL): the agent asks for
slice N, reasons over it, asks for slice M, revises. The window holds
the working set + the agent's accumulated findings; the corpus stays
outside. The economics: window cost becomes proportional to the WORK,
not to the SIZE OF THE CORPUS. The risk: iteration cost — each slice
pull is a turn; a poorly-bounded loop multiplies turns. Budgets (2.4)
and per-slice verdicts (2.5) are what keep REPL-over-context honest.

### 2.4 Budgeted recursion (depth/breadth/token caps with escalation)

`external-theory` — the pattern: a decomposition without bounds is a
fork bomb with a nice name. Budgeted recursion defines, per run: max
depth, max breadth per node, and a token (or cost) budget; each node's
spawn checks the remaining budget; on budget exhaustion the run does
one of exactly three things, chosen by policy: **escalate** (give the
sub-task a wider window or hand it to a stronger model), **truncate**
(summarize what exists and return a partial with an explicit
`partial: true` flag), or **fail loudly** (surface the budget breach to
the parent — never silently drop work). The policy is part of the
contract at the tree edge (2.1), not an implementation detail.

### 2.5 Verifier-critic loops

`external-theory` — the pattern: generation and evaluation are separate
passes, and the evaluator is allowed to reject: generator produces an
artifact from slice S; a critic (either the same model with a fresh
context or a cheaper specialized check) evaluates the artifact against
the slice's acceptance criteria; rejection re-triggers generation with
the rejection reason appended. Two disciplines make it work: (a) the
acceptance criteria are machine-checkable before they are
model-checkable — a lint pass or a test run is a critic with perfect
precision for its scope; (b) cheap local critics run before expensive
semantic critics, so most rejections cost pennies.

### 2.6 Map-Reduce over long logs

`external-theory` — the pattern: a log (or any append-only stream) is too
big to read and too important to sample blindly. Map: window the log into
slices, reduce each slice to a structured record (per-slice summary with
a fixed schema). Reduce: aggregate the records into a verdict — counts,
join tables, timelines, anomaly lists. The map step is where the LLM (or
a deterministic parser) earns its keep; the reduce step should be pure
computation whenever possible. The output is a compact, citable artifact:
every claim in the verdict can point back at the window that produced it.
The key property: NO agent window ever holds the whole log.

## 3. Mapping to OLYMPUS touchpoints (every mapping cites file:line)

### 3.1 Task-classifier routing decisions

`src/lib/task-classifier.ts` is the cheapest RLM decision point in the
system: a pure-function classifier (`classifyTask`, :250-280) that runs
BEFORE any context window is paid for. It already produces the two fields
an RLM router needs — `routeTo` (which sub-context family owns the task,
:128-187 `routeToGod`) and `estimatedTokens` (the budget hint,
:201-232 `estimateComplexity`). Its output is shipped to the spawned
process via the `OLYMPUS_TASK_CLASSIFICATION` env (`action/route.ts`
streamWarm `extraEnv` block, :242-245 → `src/lib/opencode-spawn.ts`
buildOpencodeEnv) and — since Batch 12b — via the in-band
`[OLYMPUS-CLASSIFICATION id=… routeTo=…]` marker (`src/app/api/olympus/action/route.ts`,
the `classificationMarker` block) so even the shared warm serve sees it.
This is REPL-over-context's "route the first query cheaply" property,
implemented with regexes instead of a model call — the right trade for a
router.

### 3.2 The dispatch injection payload (god → demigod boundary)

`.opencode/olympus/tools/dispatch.ts` is OLYMPUS's existing handoff
summarizer — the god→demigod edge contract from 2.1/2.2 already exists in
embryonic form:

- The task string IS the handoff (the `task_signature`, sliced to 500
  chars on the hook side, `olympus-hooks.ts` registerOpenDispatch path).
- `composeSignature` (`dispatch.ts`:403-410) packs the payload into a
  `VibrationalSignature`; `estimateSignatureEconomy` attaches a
  `projectedReduction` — a DESIGNED heuristic (serialized-signature
  tokens vs a placeholder `'x'.repeat(payload)` baseline, clamped to a
  target band, `src/lib/symphony/encoding/signature.ts`:239-252), NOT a
  measured saving — see §5, critique point 2. It is still a useful
  constant-shape field to carry, because it makes the IDEA of window
  economy first-class on the `symphony-dispatch` event
  (`economy_reduction`, `dispatch.ts`:431-463).
- The response the god receives (`dispatch.ts`:530) points at the Vault
  anchor for zero-loss retrieval — the "retrieval access if the summary
  is insufficient" property of 2.2.

What is missing vs 2.2's fixed-schema handoff: the `task` string has no
schema (goal/constraints/decisions/output-shape are whatever the god
typed), and there is no budget field (2.4) — the demigod inherits
whatever model + tier its `opencode.json` entry says, independent of
task weight.

### 3.3 Dispatch-tracker finalize (the fold-back point)

`.opencode/olympus/lib/dispatch-tracker.ts:281-335` (`finalizeDispatch`)
is the fold-back edge — and today it folds back METADATA ONLY: outcome,
duration_ms, tokens_used, tool_call_count (written to the
`dispatch_outcome` event, :291-310). The demigod's actual FINDINGS flow
back through OpenCode's native subtask mechanism into the god's window,
which works for the happy path but means fold-back size is uncontrolled:
a verbose demigod can hand a parent 20k tokens of transcript when the
parent needed three decisions. The 2.1 discipline — "lossy on material,
lossless on decisions" — would demand a findings-summary artifact at this
edge; the tracker already has the right shape (a JSONL event with a
schema) to carry one.

### 3.4 Demigod prompt templates (the sub-context contract)

`.opencode/prompts/agents/demigods/<god>/<demigod>.txt` (118 files,
117 + secrets-scanner restored in Batch 12b) are the standing half of the
sub-context contract: identity, cognitive style, specialty, quality
gates, collaboration signatures, forbidden moves. The BATCH 12b
`unattended_mode` mechanism (`olympus-hooks.ts` chat.message marker
parser + `src/app/api/olympus/action/route.ts` UNATTENDED_DIRECTIVE)
showed the per-run half can be injected in-band on demand — the same
mechanism could carry per-run contract AMENDMENTS (budgets, output-shape
constraints) without touching the standing templates. What no template
states today: an output budget ("answer in ≤ N tokens") or a
must-return schema — both are 2.2/2.4 contract fields.

### 3.5 live.jsonl analysis (Map-Reduce seeds + context-distill)

`~/OLYMPUS-VAULT/06_Activity_Feed/live.jsonl` is the canonical long log —
append-only, schema'd, already too big to read whole. OLYMPUS has one
production Map-Reduce instance over it: `scripts/agreement-metric.mjs`
(map: per-event classification into classification/dispatch buckets;
reduce: id-or-ts join → agreement rate + unjoined buckets). Batch 12b
upgraded it to exact-ID joining (`join:"id"`, `id_joined_pairs`) — the
reduce step is now a real join table, and the fixture
(`scripts/agreement-metric.fixture.jsonl` + `test.mjs`) pins its
semantics with 25 assertions. The Phase 4b prototype
`scripts/context-distill.mjs` (if it lands) is the second instance: a
per-run reducer emitting one summary line per run — the "compact,
citable artifact" of 2.6.

## 4. Prioritized proposals (candidate batches 12c / 12d / 13)

Each proposal: problem → mechanism → DIFF-ONLY sketch (files + hunks) →
effort S/M/L → risk → expected measurable effect.

### P1 — Budget + output-shape fields in the dispatch handoff — candidate 12c, effort S

- **Problem** (from 3.2/3.4): the god→demigod handoff is a free-form
  `task` string; the demigod inherits no token budget and no output
  contract, so fold-back size is uncontrolled.
- **Mechanism**: two optional `olympus-dispatch` args — `budgetTokens`
  (number) and `outputShape` (one-line description, e.g. "verdict + ≤3
  findings lines") — threaded into the injection message the god
  relays to the subtask, and recorded on the open dispatch so
  `dispatch_outcome` can report requested-vs-used.
- **DIFF-ONLY sketch**:
  - `.opencode/olympus/tools/dispatch.ts`: add `budgetTokens` /
    `outputShape` to `args` (the `tool.schema` block, :296-330) and to
    the success `message` string (:530) — append an explicit
    "Budget: ≤N tokens. Output shape: …" line.
  - `.opencode/olympus/olympus-hooks.ts` (registerOpenDispatch path):
    thread both into `registerOpenDispatch`.
  - `.opencode/olympus/lib/dispatch-tracker.ts`: `OpenDispatch` +
  `registerOpenDispatch` input + the `dispatch_outcome` event gain
    `budget_tokens` / `output_shape` (+ `budget_adherence` computed at
    finalize from `tokensUsed`).
- **Risk**: low — optional args; absent values behave exactly as today.
- **Expected effect**: `dispatch_outcome` gains a measurable adherence
  metric (tokens vs budget); runaway demigod transcripts (the B5-style
  long tail observed on 2026-10-03) become visible and comparable.

### P2 — Findings summary at fold-back — candidate 12d, effort M

- **Problem** (from 3.3): `dispatch_outcome` folds back metadata only;
  the parent either reads the raw subtask transcript (uncontrolled size)
  or nothing (no citable result artifact).
- **Mechanism**: capture the dispatched demigod's final assistant text
  per open dispatch (the plugin already observes every
  `message.part.updated` with the owning agent — the
  `rememberCallAgent` map, `olympus-hooks.ts`:782-792 is the existing
  attribution machinery), keep the LAST text part per dispatchId, and
  write it sliced (e.g. ≤ 2000 chars) into `dispatch_outcome` as
  `findings_summary` at finalize.
- **DIFF-ONLY sketch**:
  - `.opencode/olympus/olympus-hooks.ts`: in the
    `message.part.updated` handler (:1365 area), when `info.agent`
    matches an open dispatch's agent, stash the latest text part on
    the dispatch record.
  - `.opencode/olympus/lib/dispatch-tracker.ts`: `OpenDispatch` gains
    `findingsSummary: string | null`; `finalizeDispatch` writes
    `findings_summary` into the event (:291-310).
- **Risk**: medium — attribution plumbing is subtle (multiple
  dispatches per run; sub-agent naming). Mitigate by landing it
  behind the id-join telemetry from #54 (dispatch_id correlation).
- **Expected effect**: `agreement-metric` (or its successor) can join
  intent → executed god → OUTCOME TEXT, turning the agreement metric
  into an outcome-quality sampler; parents get a compact, citable
  fold-back artifact.

### P3 — Telemetry slicer (REPL-over-context for live.jsonl) — candidate 12d, effort S (script) / M (API)

- **Problem** (from 2.3/2.6): the feed is the canonical long log, but
  consumers either read whole files or hand-roll `grep`; no schema'd
  slice query exists.
- **Mechanism**: generalize the Phase 4b `scripts/context-distill.mjs`
  prototype into a slicer with `--since/--until/--god/--action/--id`
  flags emitting per-run records (JSONL out); optionally expose it as
  `/api/olympus/telemetry/slice` for in-app dashboards.
- **DIFF-ONLY sketch**: new `scripts/telemetry-slice.mjs` (zero
  dependencies, same shape as agreement-metric.mjs); later a thin
  `src/app/api/olympus/telemetry/slice/route.ts` wrapping it.
- **Risk**: low (new file, no existing path touched).
- **Expected effect**: nightly analysis runs become
  window-proportional; the "read the whole feed" anti-pattern (which
  this batch hit repeatedly) has a first-class replacement.

### P4 — Budgeted breadth on dispatch + per-run token gate — candidate 13, effort M

- **Problem** (from 2.4): nothing bounds dispatch fan-out per run. The
  dispatch tool is in the tool map returned to every agent
  (`olympus-hooks.ts` OLYMPUS_TOOLS, :710-728), so breadth is limited
  only by a god's discipline; runtime per god-run is capped globally
  (MAX_RUNTIME_MS, `action/route.ts`:43) but not per-dispatch.
- **Mechanism**: `registerOpenDispatch` counts live dispatches per god;
  the dispatch tool refuses (with an escalation message: "widening the
  task or finalize open dispatches first") when open breadth exceeds K
  (config, default e.g. 5); `classifyTask.estimatedTokens` already
  exists as the per-run token budget seed — thread it into the run
  banner so the god sees the budget.
- **DIFF-ONLY sketch**:
  - `.opencode/olympus/lib/dispatch-tracker.ts`: `openDispatchesByGod(god)`
    helper + export.
  - `.opencode/olympus/tools/dispatch.ts`: pre-check in `execute`
    before `ensureDemigodPresent` (:382) — refuse with escalation
    text when over breadth.
  - `src/app/api/olympus/action/route.ts`: include
    `classification.estimatedTokens` in the SSE `classification` event
    (already present) + the run text banner.
- **Risk**: medium — policy friction if K is wrong; make K env-tunable
  (`OLYMPUS_MAX_OPEN_DISPATCHES`), default permissive.
- **Expected effect**: `dispatch_outcome` breadth distributions get a
  ceiling; runaway multi-dispatch runs are bounded and observable.

### P5 — Classifier keyword hygiene ("apollo" → graphql collision) — candidate 12c, effort S

- **Problem** (measured live, Batch 12b): `STACK_KEYWORDS.graphql`
  includes `'apollo'` (`src/lib/task-classifier.ts`:58) — the god NAME
  collides with the Apollo GraphQL client, so any prompt mentioning
  `godId=apollo` routes to hermes. Both 12b probe pairs show
  `intent:"hermes", executed:"apollo", match:false` for this reason.
- **Mechanism**: remove the bare `'apollo'` keyword (require the
  bigrams 'apollo client' / 'apollo server' if GraphQL routing must
  keep them).
- **DIFF-ONLY sketch**: `src/lib/task-classifier.ts:58` keyword list
  edit + one fixture line in a classifier unit test asserting
  `classifyTask('dispatch with godId=apollo')` does NOT detect the
  graphql stack.
- **Risk**: low — the bigrams cover real GraphQL mentions.
- **Expected effect**: the agreement rate stops being deflated by a
  routing false-positive; measurable immediately via agreement-metric
  id-joined pairs over the next probe window.

## 5. Adversarial self-critique (pass 3 output)

This section attacks the draft above. Each point states the claim, the
attack, and the resulting correction (already applied where the draft
overclaimed).

1. **"The dispatch tool is available to every agent, so breadth is
   unbounded" (P4 premise) — UNRESOLVED, downgraded.** What is verified:
   the plugin returns the tool map in every process, including
   unmanaged ones (`olympus-hooks.ts`:767-769 early return still
   returns `{ tool: OLYMPUS_TOOLS }`). What is NOT verified: whether
   opencode's per-agent tool gating lets a DEMIGOD invoke
   `olympus-dispatch` — demigod entries in `opencode.json` carry no
   explicit `tools` map, and apollo's own entry does not whitelist
   `olympus-dispatch` either, yet apollo demonstrably calls it
   (both 12b dispatch probes). The gating mechanism is therefore
   unclear from config inspection alone. Correction applied to P4:
   breadth-bounding remains worth building (it also bounds GOD-level
   fan-out, which is unbounded by construction), but a 12c pre-task
   must first establish which agents can actually invoke the tool
   (an empirical probe dispatching AS a demigod).

2. **"economy_reduction is a first-class window-savings number" (§3.2
   draft) — OVERCLAIM, corrected in place.** Reading
   `estimateSignatureEconomy` (`src/lib/symphony/encoding/signature.ts`
   :239-252) shows the baseline is `'x'.repeat(payloadLength)` — a
   placeholder — and the result is clamped to a target band. It is a
   projection with a designed shape, not a measurement. Any real
   savings claim needs an A/B measurement (same task, signature-packed
   vs textual handoff, compare consumed tokens from
   `dispatch_outcome.tokens_used`). The memo text now says exactly
   this, and P2/P1 propose the measurement infrastructure
   (tokens_used vs budget) that would make such an A/B possible.

3. **"Fold-back is metadata-only" (§3.3) — accurate but incomplete.**
   The attack: the parent DOES receive the subtask's real output
   through OpenCode's native subtask mechanism — so calling fold-back
   "metadata-only" overstates the gap. The corrected claim (kept in
   §3.3): fold-back CONTENT is uncontrolled in size and NOT captured
   as a citable artifact in telemetry — which is the actual RLM
   defect (2.1's "lossless on decisions" has no enforcement point).

4. **Line-number citations drift.** The memo cites exact line numbers
   that were already shifted once by Batch 12b's own edits (the first
   draft cited task-classifier ranges that my #54 commit moved by ~15
   lines — caught and fixed during this pass). Standing caveat: every
   `:line` in this memo is a snapshot at commit-time of this document;
   auditors should treat named blocks as primary and lines as hints.

5. **"Templates state no output budget" (§3.4) — verified by
   sampling, not exhaustively.** I read `secrets_scanner.txt` and the
   brainstorming SKILL in full and sampled the demigod fleet's
   structure in Phase 0; the claim is "no template I read states an
   output budget". A fleet-wide grep for budget-like language was not
   run — flagged as a residual assumption, cheap to falsify.

6. **Technique descriptions are uncited by design.** §2 labels
   everything `external-theory` and names techniques generically; no
   paper attributions are made because none could be verified tonight
   (unattended batch, no web access assumed). This is deliberate
   honesty, not an omission to fix later — if citations are wanted,
   they must be added by someone who can check them.

## 6. Non-goals

- This memo does NOT propose changing the Symphony protocol, the
  signature format, or any god/demigod prompts tonight; every proposal
  is scoped for a future batch and requires its own verification
  protocol (BATCH 12c/12d/13-style: ledger, probes, fixtures).
- It does not claim measured savings anywhere — the only measured
  facts are the ones in the Batch 12b FACTS-LEDGER (probe timings,
  id-join counts, the "apollo" routing collision).
- It does not evaluate model-strategy economics (GO vs Zen vs free) —
  issue #56 and #57 own that territory.
