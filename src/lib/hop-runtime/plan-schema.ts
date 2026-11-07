/**
 * plan-schema.ts — #109 the hop runtime (FLUENCY-1, Batch C): the
 * dispatch-plan.json contract.
 *
 * The doctrine: models are lanes; the cable carries context. SESSIONS ARE
 * LANES; THE DISK CARRIES THE CAMPAIGN. When the task classifier says
 * needsPlanning (architectural/complex), Apollo's output is THE PLAN —
 * this schema — never monolithic code. The spine (walker.ts) walks it.
 *
 * Schema-validated BEFORE the walker runs (the L4 discipline): a garbage
 * plan dies loudly at plan time, never mid-flight at 80% through.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

/** The #76 bar — every hop's output budget. The config caps already
 *  enforce it at the model lane; the schema enforces it at plan time. */
export const MAX_HOP_BUDGET_TOKENS = 16_384;

export type HopReview = 'deterministic' | 'llm';

export interface PlanHop {
  /** Unique, non-empty hop id (the resume + telemetry key). */
  id: string;
  /**
   * v0.0.31 (R31-08): `llm` (default) dispatches to a god; `script` runs a
   * deterministic shell command with ZERO LLM tokens and uses the exit code
   * as the gate.
   */
  kind?: 'llm' | 'script';
  /** The god that executes this hop. Script hops default to 'system'. */
  god: string;
  /** The spec SLICE for this hop — never the full campaign context. */
  prompt: string;
  /** Script hops only: the command (run with bash -lc in the lane root). */
  command?: string;
  /** Script hops only: wall-clock ceiling (default 10 min, max 30 min). */
  timeoutMs?: number;
  /** The artifacts this hop contracts to write (relative to laneRoot). */
  artifacts: string[];
  /** Optional skill invoked by this hop (for UI visibility, #225). */
  skill?: string;
  /** Optional MCP used by this hop (for UI visibility, #225). */
  mcp?: string;
  /** Optional demigod dispatched by this hop (for UI visibility, #225). */
  demigod?: string;
  /** v0.0.86 (#343) — the Build Hub loadout this hop equips. The walker
   *  injects the build prompt and writes the outcome back to the resonance
   *  log, so a build is an execution contract, not a UI recommendation. */
  buildId?: string;
  /**
   * v0.0.32 (Epic P) — the BUILD. A hop may equip up to 3 skills and 3 MCPs,
   * and lead up to 5 demigods IN PARALLEL (one god, several specialists per
   * mini-task). The singular fields above stay for older plans/UI.
   */
  skills?: string[];
  mcps?: string[];
  demigods?: string[];
  /** Optional DAG edges: hop ids that must complete first. Absent/empty = root. */
  after?: string[];
  /** The verify policy. Deterministic-first (0 tokens); 'llm' is the opt-in
   *  reviewer on a different pool — default OFF, not wired tonight. */
  verify?: { review?: HopReview; checks?: string[] };
  /** Output budget. Defaults to MAX_HOP_BUDGET_TOKENS; never above it. */
  budgetTokens?: number;
}

export interface DispatchPlan {
  version: 1;
  /** The project lane root — where artifacts + state + telemetry land. */
  laneRoot: string;
  /** Optional resume hint: the hop to continue from. */
  resumePoint?: string;
  hops: PlanHop[];
}

export type PlanValidation =
  | { ok: true; plan: DispatchPlan; warnings?: string[] }
  | { ok: false; errors: string[] };

const ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Validate + normalize a dispatch plan. Every violation is named — the
 * plan author sees exactly what to fix, never a mystery mid-walk failure.
 */
export function validateDispatchPlan(raw: unknown): PlanValidation {
  const errors: string[] = [];
  if (!isObj(raw)) return { ok: false, errors: ['plan: not a JSON object'] };

  if (raw.version !== 1) errors.push(`plan.version: expected 1, got ${JSON.stringify(raw.version)}`);
  if (typeof raw.laneRoot !== 'string' || !raw.laneRoot.trim()) {
    errors.push('plan.laneRoot: required non-empty string (the project lane root)');
  }
  if (!Array.isArray(raw.hops) || raw.hops.length === 0) {
    errors.push('plan.hops: required non-empty array of hops');
    return { ok: false, errors };
  }

  const ids = new Set<string>();
  const hops: PlanHop[] = [];
  for (let i = 0; i < raw.hops.length; i++) {
    const h = raw.hops[i];
    const where = `plan.hops[${i}]`;
    if (!isObj(h)) { errors.push(`${where}: not an object`); continue; }
    const id = typeof h.id === 'string' ? h.id : '';
    if (!id || !ID_RE.test(id)) errors.push(`${where}.id: required, matching ${ID_RE.source}`);
    else if (ids.has(id)) errors.push(`${where}.id: duplicate hop id '${id}'`);
    else ids.add(id);
    const kind: 'llm' | 'script' = h.kind === 'script' ? 'script' : 'llm';
    if (h.kind !== undefined && h.kind !== 'llm' && h.kind !== 'script') {
      errors.push(`${where}.kind: 'llm' | 'script' (got ${JSON.stringify(h.kind)})`);
    }
    let scriptTimeout = 10 * 60_000;
    if (kind === 'script') {
      if (typeof h.command !== 'string' || !h.command.trim()) {
        errors.push(`${where}.command: required non-empty string for a script hop`);
      } else if (h.command.length > 8_000) {
        errors.push(`${where}.command: ${h.command.length} chars exceeds 8000 — keep the script small and put the work in a repo script`);
      }
      if (h.timeoutMs !== undefined) {
        if (typeof h.timeoutMs !== 'number' || !Number.isInteger(h.timeoutMs) || h.timeoutMs < 1_000 || h.timeoutMs > 30 * 60_000) {
          errors.push(`${where}.timeoutMs: integer 1000..1800000`);
        } else scriptTimeout = h.timeoutMs;
      }
      // god/prompt are optional for scripts; the defaults keep telemetry/UI honest.
      if (h.god !== undefined && (typeof h.god !== 'string' || !h.god.trim())) {
        errors.push(`${where}.god: when present, a non-empty string`);
      }
      if (h.prompt !== undefined && (typeof h.prompt !== 'string' || !h.prompt.trim())) {
        errors.push(`${where}.prompt: when present, a non-empty string`);
      }
    } else {
      if (typeof h.god !== 'string' || !h.god.trim()) errors.push(`${where}.god: required non-empty string`);
      if (typeof h.prompt !== 'string' || !h.prompt.trim()) errors.push(`${where}.prompt: required non-empty string (the spec slice)`);
    }
    if (!Array.isArray(h.artifacts) || h.artifacts.some((a) => typeof a !== 'string')) {
      errors.push(`${where}.artifacts: required array of relative path strings`);
    }
    let budget: number = MAX_HOP_BUDGET_TOKENS;
    if (h.budgetTokens !== undefined) {
      const b = h.budgetTokens;
      if (typeof b !== 'number' || !Number.isInteger(b) || b <= 0) {
        errors.push(`${where}.budgetTokens: must be a positive integer`);
      } else if (b > MAX_HOP_BUDGET_TOKENS) {
        errors.push(`${where}.budgetTokens: ${b} exceeds the #76 bar (${MAX_HOP_BUDGET_TOKENS}) — split the hop`);
      } else budget = b;
    }
    let review: HopReview = 'deterministic';
    let checks: string[] = [];
    if (h.verify !== undefined) {
      if (!isObj(h.verify)) {
        errors.push(`${where}.verify: must be an object`);
      } else {
        if (h.verify.review !== undefined && h.verify.review !== 'deterministic' && h.verify.review !== 'llm') {
          errors.push(`${where}.verify.review: 'deterministic' | 'llm' (got ${JSON.stringify(h.verify.review)})`);
        } else if (h.verify.review !== undefined) review = h.verify.review;
        if (h.verify.checks !== undefined) {
          if (!Array.isArray(h.verify.checks) || h.verify.checks.some((c) => typeof c !== 'string')) {
            errors.push(`${where}.verify.checks: must be an array of check strings ('file-exists:<rel>' | 'file-contains:<rel>::<text>' | 'file-omits:<rel>::<text>' | 'build' | 'lint')`);
          } else checks = [...h.verify.checks];
        }
      }
    }
    let after: string[] | undefined;
    if (h.after !== undefined) {
      if (!Array.isArray(h.after) || h.after.some((a) => typeof a !== 'string')) {
        errors.push(`${where}.after: must be an array of hop ids`);
      } else after = [...h.after];
    }
    const list = (value: unknown, cap: number): string[] =>
      Array.isArray(value)
        ? [...new Set(value.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).map((x) => x.trim()))].slice(0, cap)
        : [];
    const skills = [...new Set([...(list(h.skills, 3)), ...(typeof h.skill === 'string' && h.skill.trim() ? [h.skill.trim()] : [])])].slice(0, 3);
    const mcps = [...new Set([...(list(h.mcps, 3)), ...(typeof h.mcp === 'string' && h.mcp.trim() ? [h.mcp.trim()] : [])])].slice(0, 3);
    const demigods = [...new Set([...(list(h.demigods, 5)), ...(typeof h.demigod === 'string' && h.demigod.trim() ? [h.demigod.trim()] : [])])].slice(0, 5);
    hops.push({
      id, kind,
      god: kind === 'script'
        ? (typeof h.god === 'string' && h.god.trim() ? h.god : 'system')
        : (h.god as string),
      prompt: kind === 'script'
        ? (typeof h.prompt === 'string' && h.prompt.trim() ? h.prompt : `Run the deterministic script: ${String(h.command).slice(0, 200)}`)
        : (h.prompt as string),
      ...(kind === 'script' ? { command: String(h.command), timeoutMs: scriptTimeout } : {}),
      artifacts: Array.isArray(h.artifacts) ? [...(h.artifacts as string[])] : [],
      skill: typeof h.skill === 'string' ? h.skill : undefined,
      mcp: typeof h.mcp === 'string' ? h.mcp : undefined,
      demigod: typeof h.demigod === 'string' ? h.demigod : undefined,
      ...(typeof h.buildId === 'string' && h.buildId.trim()
        ? { buildId: h.buildId.trim() }
        : typeof h.build === 'string' && h.build.trim() ? { buildId: h.build.trim() } : {}),
      ...(skills.length ? { skills } : {}),
      ...(mcps.length ? { mcps } : {}),
      ...(demigods.length ? { demigods } : {}),
      after, verify: { review, checks }, budgetTokens: budget,
    });
  }

  // Cross-hop references: `after` must name real hops; no cycles.
  if (errors.length === 0) {
    for (const hop of hops) {
      for (const dep of hop.after ?? []) {
        if (!ids.has(dep)) errors.push(`plan.hops['${hop.id}'].after: references missing hop '${dep}'`);
      }
    }
    // Kahn cycle check.
    const indeg = new Map<string, number>();
    for (const hop of hops) indeg.set(hop.id, (hop.after ?? []).length);
    const queue = hops.filter((h) => (indeg.get(h.id) ?? 0) === 0).map((h) => h.id);
    let seen = 0;
    while (queue.length) {
      const cur = queue.shift()!;
      seen++;
      for (const hop of hops) {
        if ((hop.after ?? []).includes(cur)) {
          const d = (indeg.get(hop.id) ?? 0) - 1;
          indeg.set(hop.id, d);
          if (d === 0) queue.push(hop.id);
        }
      }
    }
    if (seen !== hops.length) errors.push('plan.hops: cycle in the `after` edges — the DAG must be acyclic');
    if (raw.resumePoint !== undefined && typeof raw.resumePoint === 'string' && !ids.has(raw.resumePoint)) {
      errors.push(`plan.resumePoint: references missing hop '${raw.resumePoint}'`);
    }
  }

  if (errors.length > 0) return { ok: false, errors };

  // v0.0.66 — #306: A SOURCE HOP WITHOUT A GATE IS A CLAIM, NOT A PROOF.
  // The plan is still accepted (a hard rejection would strand an in-flight
  // campaign), but every gap is named so the walk log and the plan panel can
  // show "ungated" instead of a silent green.
  const warnings: string[] = [];
  for (const hop of hops) {
    const src = (hop.artifacts ?? []).some((a) => /\.(tsx?|jsx?|css|scss)$/i.test(String(a)));
    const checks = (hop.verify?.checks ?? []).join(' ');
    const gated = /(^|\s)(build|lint)(\s|$)|mounted:|visual|design-score:/.test(checks);
    if (src && !gated) warnings.push(`hop '${hop.id}' writes source but declares no build/lint/mounted/visual gate`);
  }

  return {
    ok: true,
    warnings,
    plan: {
      version: 1,
      laneRoot: raw.laneRoot as string,
      resumePoint: typeof raw.resumePoint === 'string' ? raw.resumePoint : undefined,
      hops,
    },
  };
}
