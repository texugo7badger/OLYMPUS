/**
 * build-compiler.ts — v0.1.4: the dynamic edge of a curated build system.
 *
 * The Build Hub is deliberately curated: a seed build is a validated loadout,
 * not a generated guess. The cost of that safety was a closed composition
 * model — a new stack could declare skills on a hop but never receive a
 * build prompt, a tier, or a path into the catalog.
 *
 * The compiler compiles a DERIVED build for a hop that matches no curated
 * build:
 *   - every skill resolves against `.opencode/skills`;
 *   - every MCP resolves against `opencode.json`;
 *   - every demigod belongs to the hop's leading god;
 *   - limits 3 skills / 3 MCPs / 5 demigods, and at least one executable gate.
 *
 * A derived build is `source: 'derived'`, `tier: 'cold'`, never written to
 * `design-builds.json`. It is recorded in `derived-builds.jsonl` for audit.
 * Promotion is a separate, evidence-gated, human action: the signature must
 * have 5+ verified samples and >= 0.80 coherence in the Resonance Index.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { computeTaskSignature } from './symphony/resonance-signature';
import { queryResonance } from './symphony/resonance-index';
import { validateArsenal } from './arsenal-registry';
import { normalizeUserBuild, type BuildCategory, type DesignBuild } from './design-builds';

export interface DerivedHop {
  id: string;
  god: string;
  prompt?: string;
  artifacts?: string[];
  skills?: string[];
  skill?: string;
  mcps?: string[];
  mcp?: string;
  demigods?: string[];
  demigod?: string;
  verify?: { checks?: string[] };
}

const EXECUTABLE_GATE = /^(build|lint|test|typecheck|visual)$|^(file-exists|file-contains|file-omits|mounted|visual|design-score):/;

const GOD_CATEGORY: Record<string, BuildCategory> = {
  apollo: 'planning', atlas: 'planning', artemis: 'security', athena: 'design',
  dionysus: 'qa', hephaestus: 'code', hermes: 'integration', persephone: 'data',
  prometheus: 'infra', callimachus: 'curation',
};

const HOME = () => process.env.OLYMPUS_HOME || path.join(os.homedir(), '.olympus');
const DERIVED_LOG = () => path.join(HOME(), 'derived-builds.jsonl');
const USER_BUILDS = () => path.join(HOME(), 'design-builds.json');

function list(value: string | string[] | undefined): string[] {
  if (Array.isArray(value)) return value.filter(Boolean).map(String);
  return value ? [String(value)] : [];
}

function executableChecks(hop: DerivedHop): string[] {
  const declared = Array.isArray(hop.verify?.checks) ? hop.verify.checks.map(String) : [];
  const checks = declared.filter((c) => EXECUTABLE_GATE.test(c));
  if (checks.length > 0) return checks.slice(0, 8);
  const artifact = (hop.artifacts || []).find(Boolean);
  if (artifact) return [`file-exists:${artifact}`];
  return ['build'];
}

/**
 * Compile a derived loadout. Returns null when the hop declares nothing the
 * registry can resolve — an empty loadout is not a build.
 */
export function compileDerivedBuild(hop: DerivedHop): DesignBuild | null {
  const god = String(hop.god || '').trim().toLowerCase();
  if (!god) return null;
  const validation = validateArsenal(god, {
    skills: [...list(hop.skills), ...list(hop.skill)],
    mcps: [...list(hop.mcps), ...list(hop.mcp)],
    demigods: [...list(hop.demigods), ...list(hop.demigod)],
  });
  const equipped = validation.skills.length + validation.mcps.length + validation.demigods.length;
  if (equipped === 0) return null;

  const signature = computeTaskSignature(String(hop.prompt || hop.id)) || String(hop.id);
  const label = god.charAt(0).toUpperCase() + god.slice(1);
  return {
    id: `derived-${hop.id}`,
    name: `${label} derived · ${hop.id}`,
    category: GOD_CATEGORY[god] || 'custom',
    signature,
    god,
    demigods: validation.demigods,
    skills: validation.skills,
    mcps: validation.mcps,
    verify: executableChecks(hop),
    tier: 'cold',
    source: 'derived',
    note: 'Derived from the hop\'s declared arsenal (validated). No evidence yet — promote only after verified outcomes.',
    derivedFrom: {
      hopId: String(hop.id),
      ts: new Date().toISOString(),
      rejected: validation.errors,
    },
  };
}

/** Append the derived build once per (hop, signature, loadout) for audit. */
export function recordDerivedBuild(build: DesignBuild): void {
  if (!build || build.source !== 'derived') return;
  try {
    fs.mkdirSync(path.dirname(DERIVED_LOG()), { recursive: true });
    const key = `${build.id}|${build.signature}|${build.skills.join(',')}|${build.mcps.join(',')}|${build.demigods.join(',')}`;
    let last: string[] = [];
    try { last = fs.readFileSync(DERIVED_LOG(), 'utf-8').split('\n').filter(Boolean).slice(-200); } catch { /* first */ }
    for (const line of last) {
      try {
        const row = JSON.parse(line);
        const rowKey = `${row.id}|${row.signature}|${(row.skills || []).join(',')}|${(row.mcps || []).join(',')}|${(row.demigods || []).join(',')}`;
        if (rowKey === key) return;
      } catch { /* skip a torn line */ }
    }
    fs.appendFileSync(DERIVED_LOG(), JSON.stringify({
      ts: new Date().toISOString(),
      ...build,
    }) + '\n', 'utf-8');
  } catch { /* derived provenance is best-effort; never blocks a hop */ }
}

/** The Build Hub's derived shelf: latest row per id. */
export function listDerivedBuilds(limit = 50): DesignBuild[] {
  let lines: string[] = [];
  try { lines = fs.readFileSync(DERIVED_LOG(), 'utf-8').split('\n').filter(Boolean).slice(-500); } catch { return []; }
  const byId = new Map<string, DesignBuild>();
  for (const line of lines) {
    try {
      const row = JSON.parse(line) as DesignBuild & { ts?: string };
      if (row?.source !== 'derived' || !row.id) continue;
      byId.set(row.id, row);
    } catch { /* skip */ }
  }
  return [...byId.values()].slice(-Math.max(1, Math.min(200, limit))).reverse();
}

export interface PromotionResult {
  ok: boolean;
  build?: DesignBuild;
  reason?: string;
  evidence?: { samples: number; coherence: number; signature: string } | null;
}

/**
 * Promote a derived build into the user catalog. This is the ONLY door from
 * derived to durable: 5+ samples, >= 0.80 coherence, and a human call.
 */
export function promoteDerivedBuild(id: string): PromotionResult {
  const derived = listDerivedBuilds(200).find((b) => b.id === id);
  if (!derived) return { ok: false, reason: `derived build not found: ${id}` };

  const match = queryResonance({ task: derived.signature, god: derived.god });
  if (!match) {
    return { ok: false, reason: 'no resonance evidence for this signature yet', evidence: null };
  }
  if (match.samples < 5 || match.coherence < 0.8) {
    return {
      ok: false,
      reason: `evidence is below the promotion floor (samples ${match.samples}/5, coherence ${match.coherence}/0.80)`,
      evidence: { samples: match.samples, coherence: match.coherence, signature: match.signature },
    };
  }

  const user = normalizeUserBuild({
    ...derived,
    id: undefined,
    name: derived.name.replace(/ derived · /, ' · '),
    source: 'user',
    tier: derived.tier,
    note: `${derived.note || ''} Promoted from ${derived.id} after ${match.samples} samples at ${(match.coherence * 100).toFixed(0)}% coherence.`.trim(),
  });
  if (!user) return { ok: false, reason: 'the derived build could not be normalized' };

  try {
    fs.mkdirSync(path.dirname(USER_BUILDS()), { recursive: true });
    let current: DesignBuild[] = [];
    try {
      const raw = JSON.parse(fs.readFileSync(USER_BUILDS(), 'utf-8'));
      current = Array.isArray(raw) ? raw : Array.isArray(raw?.builds) ? raw.builds : [];
    } catch { /* first user build */ }
    const next = current.filter((b) => b.id !== user.id && b.name !== user.name).concat(user);
    fs.writeFileSync(USER_BUILDS(), JSON.stringify({ builds: next }, null, 2) + '\n', { mode: 0o600 });
    return { ok: true, build: user, evidence: { samples: match.samples, coherence: match.coherence, signature: match.signature } };
  } catch (err: any) {
    return { ok: false, reason: `write failed: ${err?.message || err}` };
  }
}
