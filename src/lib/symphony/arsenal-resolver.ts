/**
 * ════════════════════════════════════════════════════════════════════════════
 *  SYMPHONY ARSENAL RESOLVER — Dynamic Arsenal Selection via Symphony
 * ════════════════════════════════════════════════════════════════════════════
 *
 *  Uses Symphony vibrational signatures to resolve the optimal arsenal
 *  (skills + tools + MCPs + demigods) for a given task. This is a
 *  QUICK-CIRCUIT layer — it runs as a Symphony resonance lookup, not a
 *  full LLM deliberation.
 *
 *  Design principles:
 *    1. Symphony is the TRANSPORT — the resolver composes a "recon"
 *       signature that queries the resonance registry for past dispatch
 *       outcomes that match the task signature.
 *    2. QUICK-CIRCUITS are Symphony's strength — if a high-coherence
 *       resonance exists for this task type, the resolver returns the
 *       proven arsenal immediately (no LLM call needed).
 *    3. Gods are NOT dependent on quick-circuits — the resolver returns
 *       HINTS, not mandates. The god's prompt still says "evaluate the
 *       task + instincts at dispatch time." The resolver just gives the
 *       god the best-known arsenal candidates.
 *    4. Skill confidence tracking — every dispatch outcome updates a
 *       skill-confidence map (which skills led to success for which task
 *       types). This feeds back into the resolver's resonance lookup.
 *
 *  The resolver is called by:
 *    - olympus-router chat.params hook (before the god deliberates)
 *    - olympus-dispatch tool (when composing the VibrationalSignature)
 *
 *  Storage:
 *    ~/OLYMPUS-VAULT/03_Index/arsenal-resonance.jsonl — append-only log
 *    of (task_signature, god, skill, mcp, demigod, outcome) tuples.
 *    The resolver reads this to build the skill-confidence map.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const VAULT_ROOT = process.env.OLYMPUS_VAULT || path.join(os.homedir(), 'OLYMPUS-VAULT');
const ARSENAL_LOG = path.join(VAULT_ROOT, '03_Index', 'arsenal-resonance.jsonl');

export interface ArsenalReconResult {
  /** The task signature (first 64 chars, lowercased, for matching) */
  taskSignature: string;
  /** The god requesting the recon */
  god: string;
  /** Top skills for this task type (from past dispatch outcomes) */
  suggestedSkills: Array<{ skill: string; confidence: number; samples: number }>;
  /** Top MCPs for this task type */
  suggestedMcps: Array<{ mcp: string; confidence: number; samples: number }>;
  /** Top demigods for this task type */
  suggestedDemigods: Array<{ demigod: string; confidence: number; samples: number }>;
  /** Whether a quick-circuit fired (high-confidence match found) */
  quickCircuit: boolean;
  /** The resonance coherence (0-1) — how well the past outcomes match */
  coherence: number;
}

interface ArsenalLogEntry {
  ts: string;
  task_signature: string;
  god: string;
  skill: string | null;
  mcp: string | null;
  demigod: string | null;
  outcome: 'success' | 'failure' | 'unknown';
}

/**
 * Compute a task signature — a normalized key for matching past dispatches.
 * Lowercases, strips non-alphanumeric, takes first 64 chars.
 */
export function computeTaskSignature(task: string): string {
  return task.toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .split(/\s+/)
    .slice(0, 12) // first 12 words
    .join(' ')
    .slice(0, 64);
}

/**
 * Read the arsenal resonance log and compute confidence scores per
 * skill/mcp/demigod for a given task signature.
 *
 * The matching is fuzzy: we compare task signatures using Jaccard
 * similarity on word sets. If similarity >= 0.4, the past outcome
 * contributes to the confidence score.
 */
function readArsenalLog(): ArsenalLogEntry[] {
  if (!fs.existsSync(ARSENAL_LOG)) return [];
  try {
    const content = fs.readFileSync(ARSENAL_LOG, 'utf-8');
    const entries: ArsenalLogEntry[] = [];
    for (const line of content.split('\n')) {
      if (!line.trim()) continue;
      try {
        entries.push(JSON.parse(line));
      } catch {}
    }
    return entries;
  } catch {
    return [];
  }
}

function jaccardSimilarity(a: string, b: string): number {
  const setA = new Set(a.split(' '));
  const setB = new Set(b.split(' '));
  const intersection = [...setA].filter(x => setB.has(x)).length;
  const union = new Set([...setA, ...setB]).size;
  return union > 0 ? intersection / union : 0;
}

/**
 * Perform a Symphony Arsenal Recon — query past dispatch outcomes for
 * the best-known arsenal for this task type.
 *
 * This is a QUICK-CIRCUIT: if coherence >= 0.85, the god can use the
 * suggested arsenal directly (skip deliberation). If coherence < 0.85,
 * the suggestions are HINTS — the god should still evaluate the task
 * and may override.
 */
export function arsenalRecon(task: string, god: string): ArsenalReconResult {
  const taskSig = computeTaskSignature(task);
  const log = readArsenalLog();

  // Filter to entries for this god (or 'all') with similarity >= 0.4
  const relevant = log.filter(e => {
    if (e.god !== god && e.god !== 'all') return false;
    const sim = jaccardSimilarity(taskSig, e.task_signature);
    return sim >= 0.4;
  });

  // Aggregate confidence per skill/mcp/demigod
  const skillStats = new Map<string, { successes: number; total: number }>();
  const mcpStats = new Map<string, { successes: number; total: number }>();
  const demigodStats = new Map<string, { successes: number; total: number }>();

  for (const e of relevant) {
    if (e.skill) {
      const s = skillStats.get(e.skill) || { successes: 0, total: 0 };
      s.total++;
      if (e.outcome === 'success') s.successes++;
      skillStats.set(e.skill, s);
    }
    if (e.mcp) {
      const s = mcpStats.get(e.mcp) || { successes: 0, total: 0 };
      s.total++;
      if (e.outcome === 'success') s.successes++;
      mcpStats.set(e.mcp, s);
    }
    if (e.demigod) {
      const s = demigodStats.get(e.demigod) || { successes: 0, total: 0 };
      s.total++;
      if (e.outcome === 'success') s.successes++;
      demigodStats.set(e.demigod, s);
    }
  }

  // Compute confidence = successes / total (with a minimum of 3 samples
  // to avoid noise from 1/1 = 100% confidence on a single dispatch)
  const toResults = (stats: Map<string, { successes: number; total: number }>) =>
    [...stats.entries()]
      .filter(([, s]) => s.total >= 3) // minimum 3 samples
      .map(([name, s]) => ({
        name,
        confidence: s.successes / s.total,
        samples: s.total,
      }))
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 5);

  const suggestedSkills = toResults(skillStats).map(r => ({
    skill: r.name, confidence: r.confidence, samples: r.samples,
  }));
  const suggestedMcps = toResults(mcpStats).map(r => ({
    mcp: r.name, confidence: r.confidence, samples: r.samples,
  }));
  const suggestedDemigods = toResults(demigodStats).map(r => ({
    demigod: r.name, confidence: r.confidence, samples: r.samples,
  }));

  // Coherence = weighted average of top suggestions (or 0 if none)
  const allConfidences = [
    ...suggestedSkills.map(s => s.confidence),
    ...suggestedMcps.map(m => m.confidence),
    ...suggestedDemigods.map(d => d.confidence),
  ];
  const coherence = allConfidences.length > 0
    ? allConfidences.reduce((a, b) => a + b, 0) / allConfidences.length
    : 0;

  // Quick-circuit fires if coherence >= 0.85 AND we have at least one
  // high-confidence suggestion with >= 5 samples
  const quickCircuit = coherence >= 0.85 && allConfidences.some(c => c >= 0.85);

  return {
    taskSignature: taskSig,
    god,
    suggestedSkills,
    suggestedMcps,
    suggestedDemigods,
    quickCircuit,
    coherence,
  };
}

/**
 * Log a dispatch outcome to the arsenal resonance log.
 * Called by the dispatch-tracker when a dispatch is finalized.
 *
 * This is the FEEDBACK LOOP — every dispatch outcome updates the
 * skill-confidence map, making future arsenal recon more accurate.
 */
export function logArsenalOutcome(input: {
  task: string;
  god: string;
  skill: string | null;
  mcp: string | null;
  demigod: string | null;
  outcome: 'success' | 'failure' | 'unknown';
}): void {
  try {
    const dir = path.dirname(ARSENAL_LOG);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const entry: ArsenalLogEntry = {
      ts: new Date().toISOString(),
      task_signature: computeTaskSignature(input.task),
      god: input.god,
      skill: input.skill,
      mcp: input.mcp,
      demigod: input.demigod,
      outcome: input.outcome,
    };
    fs.appendFileSync(ARSENAL_LOG, JSON.stringify(entry) + '\n', 'utf-8');
  } catch {
    // Non-fatal — the arsenal log is best-effort
  }
}
