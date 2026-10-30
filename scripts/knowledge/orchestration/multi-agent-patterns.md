---
title: Multi-Agent Orchestration Patterns
category: orchestration
stacks: []
god: atlas
last_updated: 2026-10-30
sources:
  - https://www.anthropic.com/engineering/building-effective-agents
  - https://microsoft.github.io/autogen/stable/
  - https://langchain-ai.github.io/langgraph/
---

# Multi-Agent Orchestration

## When to use
Whenever more than one agent (or one agent plus tools) must cooperate on a
task that is too large for a single context, or when independent subtasks can
run in parallel.

## The patterns that earn their keep
- **Orchestrator–worker**: one planner decomposes, workers execute isolated
  slices, the orchestrator verifies and synthesizes. The default.
- **Fan-out / fan-in**: launch independent workers, join on artifacts, never
  on vibes. Cap concurrency; a burst is not throughput.
- **Blackboard**: workers publish artifacts to a shared store; the next wave
  reads the disk, not the previous context. Sessions are lanes; the disk
  carries the campaign.
- **Handoff**: transfer a task with an explicit contract (inputs, artifact
  paths, acceptance checks). A handoff without a contract is a forward.
- **Supervisor with veto**: a reviewer agent can reject an artifact; the
  worker retries with the rejection reason. Independence beats consensus.

## Non-negotiables
- Every worker gets a SMALL, self-contained brief plus the artifact paths.
- Every worker writes a real artifact; "I did it" is not an artifact.
- Verification is deterministic first (file exists, build, lint), LLM review
  second, human review for irreversible actions.
- One campaign per lane. Concurrent walkers on the same lane corrupt state.
- Bound concurrency per provider/model lane; overload looks like a hang.
- Log who did what, with which skill/MCP, tokens, and duration.

## Checklist
- [ ] The DAG is explicit; each node has one owner and one artifact set.
- [ ] Concurrency caps are per lane and global.
- [ ] A parked unit preserves state and can resume without rerunning completed
      work.
- [ ] The final synthesis names the chain and what was verified.
- [ ] Failures are named (class + provider words), never "exit 1".

## Anti-patterns
- Five workers on the same file with no merge step.
- Passing the entire campaign context to every worker (context bloat).
- Retrying a dead lane (quota/auth/no-route) inside the same budget.
- Treating a heartbeat as completion.

## Sources
- Anthropic, Building Effective Agents: https://www.anthropic.com/engineering/building-effective-agents
- AutoGen docs: https://microsoft.github.io/autogen/stable/
- LangGraph docs: https://langchain-ai.github.io/langgraph/
