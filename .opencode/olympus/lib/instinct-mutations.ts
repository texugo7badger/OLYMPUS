/**
 * Instinct Mutations — v3.0 VaultBrain
 *
 * Atomic, byte-preserving mutations on empirical instinct frontmatter.
 * Used by:
 *   - olympus-hooks.ts: tool.execute.after hook applies the failure penalty
 *     in real time when a short-circuited dispatch fails.
 *   - shortcircuit.ts: increments samples + last_used when a god reports a
 *     short-circuit hit.
 *   - Callimachus RECALIBRATE stage (via the API): bulk-updates confidence
 *     based on the success rate computed from live.jsonl.
 *
 * Design constraints:
 *   - NEVER touch seed instincts (immutable === true OR source === "seed").
 *   - ALWAYS preserve the file body. Only the frontmatter block is mutated.
 *   - ALWAYS clamp confidence to [0.0, 0.95] for empirical instincts.
 *   - Best-effort: if a write fails (concurrent Callimachus edit, permissions),
 *     return false rather than throwing. The hook must never break the tool
 *     call it is observing.
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const VAULT_ROOT = process.env.OLYMPUS_VAULT || path.join(os.homedir(), "OLYMPUS-VAULT");

export interface InstinctFrontmatter {
  god?: string;
  confidence: number;
  scope?: "global" | "stack" | "project";
  stacks?: string[];
  projects?: string[];
  last_used?: string;
  samples?: number;
  successes?: number;
  failures?: number;
  source?: "seed" | "empirical";
  immutable?: boolean;
  trigger?: string;
  action?: string;
  skill?: string;
  mcp?: string;
  demigod?: string;
  id?: string;
}

export const INSTINCT_CONSTANTS: {
  EMPIRICAL_CAP: number;
  FLOOR: number;
  FAILURE_PENALTY: number;
  SUCCESS_BONUS: number;
  DECAY_90D: number;
  DECAY_180D: number;
  DECAY_90D_DAYS: number;
  DECAY_180D_DAYS: number;
  PRUNE_THRESHOLD: number;
} = {
  EMPIRICAL_CAP: 0.95,
  FLOOR: 0.0,
  FAILURE_PENALTY: 0.3,
  SUCCESS_BONUS: 0.05, // small upward nudge per success, applied inside RECALIBRATE not per-call
  DECAY_90D: 0.1,
  DECAY_180D: 0.2,
  DECAY_90D_DAYS: 90,
  DECAY_180D_DAYS: 180,
  PRUNE_THRESHOLD: 0.3,
};

/**
 * Locate an empirical instinct file by ID + god.
 * Searches empirical/ only (seed is immutable, _archive is recoverable but
 * not active). Returns null if not found.
 */
export function findInstinctFile(
  instinctId: string,
  godId: string,
): string | null {
  const godDir = path.join(VAULT_ROOT, "05_Auto_Learning", "instincts", godId, "empirical");
  if (!fs.existsSync(godDir)) return null;
  try {
    const files = fs.readdirSync(godDir).filter(f => f.endsWith(".md"));
    for (const file of files) {
      const basename = path.basename(file, ".md");
      if (basename === instinctId) {
        return path.join(godDir, file);
      }
    }
  } catch {
    // ignore
  }
  return null;
}

/**
 * Parse frontmatter from a markdown file. Permissive YAML-ish parser
 * (matches the pattern in instinct-scope.ts and instinct-query.ts).
 */
export function parseFrontmatter(raw: string): {
  frontmatter: Record<string, any>;
  fmText: string;
  body: string;
  hasFm: boolean;
} {
  const m = raw.match(/^(---\r?\n)([\s\S]*?)(\r?\n---)(\r?\n[\s\S]*)$/);
  if (!m) {
    return { frontmatter: {}, fmText: "", body: raw, hasFm: false };
  }
  const fmText = `${m[1]}${m[2]}${m[3]}`;
  const body = m[4];
  const fm: Record<string, any> = {};
  for (const line of m[2].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!kv) continue;
    const key = kv[1];
    const val = kv[2].trim();
    if (val.startsWith("[") && val.endsWith("]")) {
      const inner = val.slice(1, -1);
      fm[key] = inner
        .split(",")
        .map(s => s.trim().replace(/^["']|["']$/g, ""))
        .filter(Boolean);
    } else if (val === "true" || val === "false") {
      fm[key] = val === "true";
    } else if (/^-?\d+(\.\d+)?$/.test(val)) {
      fm[key] = parseFloat(val);
    } else if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      fm[key] = val.slice(1, -1);
    } else {
      fm[key] = val;
    }
  }
  return { frontmatter: fm, fmText, body, hasFm: true };
}

/**
 * Serialize a frontmatter map back to YAML-ish text. Preserves key order
 * by writing known keys first, then any extras. Arrays become `[a, b]`.
 */
export function serializeFrontmatter(fm: Record<string, any>): string {
  const knownOrder = [
    "god", "id", "confidence", "scope", "stacks", "projects",
    "last_used", "samples", "successes", "failures",
    "source", "immutable", "trigger", "action", "skill", "mcp", "demigod",
  ];
  const seen = new Set<string>();
  const lines: string[] = ["---"];
  for (const key of knownOrder) {
    if (!(key in fm)) continue;
    seen.add(key);
    lines.push(`${key}: ${formatValue(fm[key])}`);
  }
  for (const [key, value] of Object.entries(fm)) {
    if (seen.has(key)) continue;
    if (typeof key !== "string" || key.startsWith("_")) continue;
    lines.push(`${key}: ${formatValue(value)}`);
  }
  lines.push("---");
  return lines.join("\n");
}

function formatValue(v: any): string {
  if (Array.isArray(v)) {
    return `[${v.join(", ")}]`;
  }
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") return String(v);
  if (typeof v === "string") {
    // Quote strings containing special chars
    if (/[:\[\]#"'{}\n]/.test(v) || v.trim() !== v) {
      return `"${v.replace(/"/g, '\\"')}"`;
    }
    return v;
  }
  return String(v);
}

/**
 * Is this instinct immutable? (seed or immutable: true)
 */
export function isImmutable(fm: Record<string, any>): boolean {
  return fm.source === "seed" || fm.immutable === true;
}

/**
 * Apply the failure penalty to an instinct. Decrements confidence by
 * `penalty` (default 0.3), increments `failures` and `samples`, updates
 * `last_used`. Clamps confidence to [0.0, 0.95].
 *
 * Returns true if the file was updated, false if:
 *   - The instinct was not found.
 *   - The instinct is immutable (seed).
 *   - The write failed (concurrent edit, permissions).
 */
export function penalizeInstinct(
  instinctId: string,
  godId: string,
  penalty: number = INSTINCT_CONSTANTS.FAILURE_PENALTY,
): boolean {
  const filePath = findInstinctFile(instinctId, godId);
  if (!filePath) return false;

  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const { frontmatter: fm, body, hasFm } = parseFrontmatter(raw);
    if (!hasFm) return false;
    if (isImmutable(fm)) return false; // Never penalize seed instincts

    const newConfidence = Math.max(
      INSTINCT_CONSTANTS.FLOOR,
      Math.min(INSTINCT_CONSTANTS.EMPIRICAL_CAP, (fm.confidence ?? 0) - penalty),
    );
    const newFailures = (fm.failures ?? 0) + 1;
    const newSamples = (fm.samples ?? 0) + 1;
    const now = new Date().toISOString();

    const updated = {
      ...fm,
      confidence: Math.round(newConfidence * 1000) / 1000,
      failures: newFailures,
      samples: newSamples,
      last_used: now,
    };

    const newContent = serializeFrontmatter(updated) + body;
    fs.writeFileSync(filePath, newContent, "utf-8");
    return true;
  } catch {
    return false;
  }
}

/**
 * Reward an instinct after a successful dispatch. Increments `successes`
 * and `samples`, updates `last_used`. Does NOT raise confidence directly —
 * confidence is raised by Callimachus's RECALIBRATE stage using the
 * Bayesian-ish formula. This function only records the outcome so
 * RECALIBRATE has accurate counts.
 *
 * Returns true on success, false on failure (not found / immutable / IO).
 */
export function rewardInstinct(
  instinctId: string,
  godId: string,
): boolean {
  const filePath = findInstinctFile(instinctId, godId);
  if (!filePath) return false;

  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const { frontmatter: fm, body, hasFm } = parseFrontmatter(raw);
    if (!hasFm) return false;
    if (isImmutable(fm)) return false;

    const newSuccesses = (fm.successes ?? 0) + 1;
    const newSamples = (fm.samples ?? 0) + 1;
    const now = new Date().toISOString();

    const updated = {
      ...fm,
      successes: newSuccesses,
      samples: newSamples,
      last_used: now,
    };

    const newContent = serializeFrontmatter(updated) + body;
    fs.writeFileSync(filePath, newContent, "utf-8");
    return true;
  } catch {
    return false;
  }
}

/**
 * Recalibrate an instinct's confidence from its success/failure counts.
 * Called by Callimachus's RECALIBRATE stage.
 *
 * Formula:
 *   success_rate = successes / max(1, successes + failures)
 *   shrinkage   = sqrt(samples) / (1 + sqrt(samples))
 *   confidence  = clamp(0.0, 0.95, success_rate * shrinkage - time_decay)
 *
 * The shrinkage factor prevents one-shot lucky dispatches from gaining
 * high confidence: with samples=1, shrinkage = 1/2 = 0.5, so even a 100%
 * success rate yields confidence 0.5. With samples=100, shrinkage ≈ 0.91,
 * so a 90% success rate yields confidence ≈ 0.82.
 *
 * Returns the new confidence, or null if the instinct was not found /
 * immutable / unreadable.
 */
export function recalibrateInstinct(
  instinctId: string,
  godId: string,
  now: Date = new Date(),
): { confidence: number; samples: number; successes: number; failures: number; updated: boolean } | null {
  const filePath = findInstinctFile(instinctId, godId);
  if (!filePath) return null;

  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const { frontmatter: fm, body, hasFm } = parseFrontmatter(raw);
    if (!hasFm) return null;
    if (isImmutable(fm)) return null;

    const successes = fm.successes ?? 0;
    const failures = fm.failures ?? 0;
    const samples = successes + failures;
    const totalSamples = samples > 0 ? samples : (fm.samples ?? 0);

    let successRate = 0;
    if (totalSamples > 0) {
      successRate = successes / totalSamples;
    }

    const sqrtSamples = Math.sqrt(totalSamples);
    const shrinkage = sqrtSamples / (1 + sqrtSamples);
    let newConfidence = successRate * shrinkage;

    // Apply time decay
    if (typeof fm.last_used === "string") {
      const last = new Date(fm.last_used);
      if (!isNaN(last.getTime())) {
        const daysSince = (now.getTime() - last.getTime()) / (1000 * 60 * 60 * 24);
        if (daysSince > INSTINCT_CONSTANTS.DECAY_180D_DAYS) {
          newConfidence -= INSTINCT_CONSTANTS.DECAY_180D;
        } else if (daysSince > INSTINCT_CONSTANTS.DECAY_90D_DAYS) {
          newConfidence -= INSTINCT_CONSTANTS.DECAY_90D;
        }
      }
    }

    newConfidence = Math.max(
      INSTINCT_CONSTANTS.FLOOR,
      Math.min(INSTINCT_CONSTANTS.EMPIRICAL_CAP, newConfidence),
    );
    newConfidence = Math.round(newConfidence * 1000) / 1000;

    const updated = {
      ...fm,
      confidence: newConfidence,
      samples: totalSamples,
      successes,
      failures,
    };

    const newContent = serializeFrontmatter(updated) + body;
    fs.writeFileSync(filePath, newContent, "utf-8");

    return {
      confidence: newConfidence,
      samples: totalSamples,
      successes,
      failures,
      updated: true,
    };
  } catch {
    return null;
  }
}

/**
 * Read all empirical instincts for a god. Returns frontmatter + path.
 * Used by the brain-stats API to compute per-god metrics.
 */
export function loadEmpiricalInstincts(godId: string): InstinctFrontmatter[] {
  const out: InstinctFrontmatter[] = [];
  const godDir = path.join(VAULT_ROOT, "05_Auto_Learning", "instincts", godId, "empirical");
  if (!fs.existsSync(godDir)) return out;
  try {
    for (const file of fs.readdirSync(godDir)) {
      if (!file.endsWith(".md")) continue;
      const filePath = path.join(godDir, file);
      try {
        const raw = fs.readFileSync(filePath, "utf-8");
        const { frontmatter: fm } = parseFrontmatter(raw);
        out.push({
          id: path.basename(file, ".md"),
          ...fm,
        } as InstinctFrontmatter);
      } catch {
        // skip unreadable
      }
    }
  } catch {
    // ignore
  }
  return out;
}
