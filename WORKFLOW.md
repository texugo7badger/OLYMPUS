# OLYMPUS Workflow

> OLYMPUS v0.0.2 — how a task flows through the 10 gods, 118 demigods, Symphony, and the VaultBrain. See [AGENTS.md](AGENTS.md) for the full agent roster and [TOKEN-ECONOMY.md](TOKEN-ECONOMY.md) for the cost flow.

## Task lifecycle

Every user request follows this path:

```
User input
    │
    ▼
Task classifier (heuristic, < 1ms)
    │  detects: domain, complexity, stack, needsPlanning
    │  outputs: TaskClassification JSON
    │
    ▼
/api/olympus/action (spawns `opencode run --agent apollo`)
    │  sets OLYMPUS_TASK_CLASSIFICATION env var
    │
    ▼
olympus-dynamic-context plugin
    │  rewrites system prompt:
    │    - Hot tier (mastered skills, always loaded)
    │    - Warm tier (stack-relevant, capped at 20)
    │    - Cold tier (not loaded — lazy via skill index)
    │    - God's MCP allowlist
    │    - Stack-relevant reference docs
    │    - Token budget by complexity
    │
    ▼
olympus-router chat.params hook
    │  1. Instinct gate — query god's instincts
    │     confidence ≥ 0.85? → SHORT-CIRCUIT (skip deliberation)
    │  2. Skill index search (if no short-circuit)
    │     top-5 relevant skills surfaced as hints
    │  3. Arsenal recon (Symphony quick-circuit)
    │     coherence ≥ 0.85? → quick-circuit fires
    │
    ▼
Apollo deliberates (or short-circuits)
    │  decomposes task into DAG of sub-problems
    │  defines acceptance criteria per node
    │  hands execution DAG to Atlas
    │
    ▼
Apollo hands DAG to Atlas via Symphony
    │  olympus-dispatch({ godId: 'atlas', task: 'exec DAG', dag, acceptanceCriteria })
    │  → composes VibrationalSignature
    │  → logs to live.jsonl + arsenal-resonance.jsonl
    │  → registers open dispatch with dispatch-tracker
    │
    ▼
Atlas orchestrates execution waves
    │  dispatches independent sub-tasks concurrently
    │  serializes only where dependencies force it
    │  tracks progress, detects failures
    │  reports back to Apollo after each wave
    │
    ▼
Specialist gods dispatch to demigods (parallel waves)
    │  each demigod's MCP calls gated by:
    │    - permission.ask hook (god MCP allowlist + tier check via mcp-tiers.ts)
    │    - mcp-gate.ts (mcp-state.json toggle + API key check)
    │  each demigod uses the same hot/warm/cold tier system
    │  human-in-the-loop review tools:
    │    - olympus-design-review (Athena: design-system candidates)
    │    - olympus-integration-review (Hermes: integration approach candidates)
    │    - olympus-deploy-review (Prometheus: deployment strategy candidates)
    │
    ▼
tool.execute.after hook captures everything
    │  attributes tool calls to open dispatch
    │  logs tokens, duration, outcome to live.jsonl + cost.jsonl
    │
    ▼
Dispatch finalization (when active agent changes)
    │  finalizeDispatch() logs outcome
    │  logs to arsenal-resonance.jsonl (feedback loop)
    │  if short-circuited: reward/penalize instinct confidence
    │
    ▼
Callimachus heartbeat (on session.idle)
    │  7-stage brain maintenance:
    │    observe → distill → inject → prune → compact → evolve → stocktake
    │  promotes high-confidence empirical instincts to seed
    │  detects cross-god patterns → creates quick-circuits
```

---

## Complexity routing

The task classifier routes based on complexity:

| Complexity | Token budget | Path |
|------------|-------------|------|
| **trivial** | 5K | Fast-path: Apollo answers in ≤ 30 tokens. No dispatch. |
| **simple** | 30K | Apollo handles directly or dispatches one demigod. |
| **moderate** | 80K | Apollo dispatches to one specialist god. |
| **complex** | 150K | Apollo dispatches to multiple gods in parallel waves. |
| **architectural** | 150K | Apollo runs spec interview first, then dispatches. |

---

## Short-circuit flow

When an instinct matches with confidence ≥ 0.85:

1. The god calls `olympus-dispatch` with `shortCircuit: true, instinctId: <id>`.
2. The dispatch tool composes the VibrationalSignature and dispatches directly.
3. The `olympus-shortcircuit` tool logs the short-circuit to the activity feed.
4. The instinct's `samples` count is incremented.
5. When the dispatch finalizes:
   - **Success** → `successes++`, confidence rewarded
   - **Failure** → `failures++`, confidence penalized by 0.3

1-in-10 short-circuits are **verification samples** — forced to re-deliberate. If re-deliberation picks a different approach AND it succeeds, the instinct's confidence is penalized (keeps patterns fresh).

---

## Symphony dispatch flow

```
God calls olympus-dispatch
    │
    ▼
Compose VibrationalSignature
    │  protocol: "symphony/1.0"
    │  composer: godId
    │  intentVector: { intentType, semanticTokens, dimensions }
    │  constraintMatrix: { hard, soft, scope }
    │  successCriteria: [{ predicate, type }]
    │  targetOrchestra: [demigod]
    │  broadcastMode: "single" | "parallel"
    │
    ▼
Broadcast to demigod(s)
    │  Conductor calls dispatchFn for each target
    │  dispatchFn wraps signature → invokes demigod
    │
    ▼
Demigod executes, returns HarmonicPattern
    │  outcomes: [{ predicateKind, target, status, evidence }]
    │  artifacts: [{ kind, location, summary }]
    │  tokensConsumed, durationMs, confidence
    │
    ▼
Conductor fuses harmonics (if parallel broadcast)
    │  consensus: { fusedOutcomes, fusedAt, coherence }
    │
    ▼
Choir decodes for the user
    │  produces polished user-facing response
    │  fallback: if coherence < baseline, use textual reconstruction
    │
    ▼
Vault Brain captures everything
    │  registry.jsonl — signature + harmonic + consensus
    │  templates.json — learned shorthand (promoted by tuner)
    │  metrics.json — aggregate counters
```

---

## Background maintenance

Callimachus runs on `session.idle` (when the user hasn't typed for a configurable interval). The 7-stage loop:

1. **Observe** — scan activity feed for new dispatch outcomes
2. **Distill** — extract patterns from successful dispatch chains
3. **Inject** — promote high-confidence empirical instincts to seed
4. **Prune** — archive stale instincts (low confidence, old `last_used`)
5. **Compact** — merge duplicate instincts
6. **Evolve** — update mastered-skills profiles if new skills emerged
7. **Stocktake** — write brain health metrics

The heartbeat is lockfile-protected (only one instance runs at a time). Use the **Compact Brain** button in the status bar for on-demand deep cleanup.
