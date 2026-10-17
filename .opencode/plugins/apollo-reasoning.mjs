/**
 * apollo-reasoning.mjs — THE PLANNER PATIENCE FIX (#PILEUP/2026-10-16).
 *
 * THE SPECIMEN: glm-5.3 (a 753B REASONER) served Apollo's planning turn
 * with FULL reasoning at peak — the DB: input=1305, reasoning=16384 (CAP),
 * output=0, 20.6 minutes. The reasoning tokens + output tokens SHARE the
 * #76 mouth (16384); the model thought itself to death and the plan was
 * never emitted. The replay with reasoning_effort=low (NVIDIA-probe
 * verified): the EXACT killer prompt went 20+min/cap/output=0 → 171s with
 * the full 7,333-char dispatch-plan emitted (reasoning collapsed from
 * 67,438 chars to 89).
 *
 * WHY A PLUGIN: opencode 1.18.10 accepts agent reasoning_effort in config
 * (the schema validates it, debug agent shows it) but the openai-compatible
 * runtime DROPS it — the intercepted request carries only model/max_tokens/
 * tool_choice/stream. The chat.params hook is the one injection point that
 * reaches the wire (the same mechanism the vendored context-cache plugin
 * uses).
 *
 * SCOPE: ONLY Apollo on the nvidia-glm lane — the planner's giant one-shot
 * turn is the measured specimen. The other gods keep full reasoning (their
 * turns are small walker hops; the walker retries and parks per-hop).
 */
function plugin(_input, _options) {
  return {
    "chat.params": async (hookInput, output) => {
      try {
        const providerID = String(hookInput?.model?.providerID ?? hookInput?.provider ?? "");
        const agent = String(hookInput?.agent ?? "");
        if (providerID !== "nvidia-glm" || agent !== "apollo") return;
        // The measured fix: LOW reasoning for the planning turn.
        output.reasoning_effort = "low";
        // Belt-and-braces shapes for provider-options passthrough — the
        // one the runtime honors rides; the extras are ignored by the
        // OpenAI-compatible body builder (unknown fields are dropped).
        output.options = output.options ?? {};
        output.options.reasoning_effort = "low";
        output.options.reasoningEffort = "low";
      } catch (err) {
        console.error("[apollo-reasoning] chat.params error:", err);
      }
    },
  };
}

export default plugin;
