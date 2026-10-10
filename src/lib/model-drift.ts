/**
 * model-drift.ts — #78 (HIGIENIA-2 H4): the model-catalogue drift detector.
 *
 * The D19 incident class: a dead model id (`nvidia/z-ai/glm-5.2`) broke a
 * live apply silently — the id lived on in pins/overrides while the anchor
 * had rotated. This detector is the deterministic tripwire: given the LIVE
 * config object and the live catalogue snapshot, flag every assigned model
 * id that (a) carries a RETIRED anchor (the house's bans, case-insensitive
 * — glm-5.2 is the D19 specimen) or (b) is a free-lane assignment absent
 * from the refreshed free catalogue. Pure + case-insensitive throughout;
 * the doctor and the apply consult it and fail loudly — drift never
 * whispers again.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

/** The house's retired-anchor bans, lowercase (the D19 specimen + any future rotation). */
export const RETIRED_MODEL_IDS: readonly string[] = ['glm-5.2'];

export interface DriftFinding {
  lane: string;
  modelId: string;
  kind: 'retired' | 'not-in-catalogue';
  detail: string;
}

/** The free-models snapshot shape ({ data: [{ id }...] } or [ids] — both tolerated). */
function catalogueIds(catalogue: unknown): Set<string> {
  const ids = new Set<string>();
  const arr = Array.isArray(catalogue)
    ? catalogue
    : Array.isArray((catalogue as { data?: unknown[] })?.data)
      ? (catalogue as { data: unknown[] }).data
      : [];
  for (const entry of arr) {
    const id = typeof entry === 'string' ? entry : String((entry as { id?: unknown })?.id ?? '');
    if (id) ids.add(id.toLowerCase());
  }
  return ids;
}

/**
 * Detect drift in a config object (the `agent` + `small_model`/
 * `terminalModel` assignments + the provider model tables).
 * `catalogue` = the live free-models snapshot (any shape); pass null to
 * skip the not-in-catalogue class (the retired class always runs).
 * Case-insensitive on every comparison (the D19 lesson: a case-shifted
 * id slips a case-sensitive grep).
 */
export function detectModelDrift(config: unknown, catalogue: unknown): DriftFinding[] {
  const findings: DriftFinding[] = [];
  const cfg = (config ?? {}) as {
    agent?: Record<string, { model?: string }>;
    small_model?: string;
    terminalModel?: string;
    provider?: Record<string, { models?: Record<string, unknown> }>;
  };
  const retired = new Set(RETIRED_MODEL_IDS.map((r) => r.toLowerCase()));
  const cat = catalogue ? catalogueIds(catalogue) : null;

  const checkId = (lane: string, modelId: unknown) => {
    if (typeof modelId !== 'string' || !modelId.trim()) return;
    const lower = modelId.toLowerCase();
    // The retired class: any lane, always.
    for (const r of retired) {
      if (lower.includes(r)) {
        findings.push({
          lane, modelId, kind: 'retired',
          detail: `retired anchor '${r}' present (the D19 rotation class) — rotate the assignment`,
        });
        return;
      }
    }
    // The not-in-catalogue class: the FREE lanes (the nvidia family splits,
    // openrouter, groq — the custom ids) validated against the refreshed
    // catalogue snapshot.
    if (cat && cat.size > 0 && /^(nvidia(-[a-z0-9]+)?|openrouter|groq)\//.test(lower) && !cat.has(lower)) {
      findings.push({
        lane, modelId, kind: 'not-in-catalogue',
        detail: 'absent from the live catalogue snapshot — dead or drifted (re-run the refresh)',
      });
    }
  };

  for (const [god, a] of Object.entries(cfg.agent ?? {})) checkId(`agent.${god}`, a?.model);
  checkId('small_model', cfg.small_model);
  checkId('terminalModel', cfg.terminalModel);
  for (const [pid, block] of Object.entries(cfg.provider ?? {})) {
    for (const mid of Object.keys(block?.models ?? {})) checkId(`provider.${pid}.${mid}`, `${pid}/${mid}`);
  }
  return findings;
}
