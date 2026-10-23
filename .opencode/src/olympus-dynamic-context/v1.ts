/**
 * olympus-dynamic-context — Dynamic Input Token Routing plugin.
 *
 * This plugin hooks the `experimental.chat.messages.transform` event and
 * rewrites the system prompt to include only stack-relevant skills,
 * god-allowlisted MCPs, scope-matched instincts, and stack-relevant
 * reference docs.
 *
 * The classification is passed via the `OLYMPUS_TASK_CLASSIFICATION` env
 * var (set by `/api/olympus/action` and `/api/olympus/intake` before the
 * `opencode run` spawn). When the env var is absent (e.g. legacy callers),
 * the plugin is a no-op — the full context loads as before.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import type { Plugin, Hooks } from "@opencode-ai/plugin";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";

// Inline the TaskClassification parser to avoid a TS config dependency on
// src/lib/task-classifier.ts at plugin compile time.
interface TaskClassification {
  domain: string;
  complexity: 'trivial' | 'simple' | 'moderate' | 'complex' | 'architectural';
  stack: string[];
  files: string[];
  needsPlanning: boolean;
  needsArchive: boolean;
  estimatedTokens: number;
  routeTo: string;
  reason: string;
}

function parseClassification(s: string | undefined | null): TaskClassification | null {
  if (!s) return null;
  try {
    const o = JSON.parse(s);
    if (typeof o !== 'object' || o === null) return null;
    if (typeof o.domain !== 'string' || typeof o.complexity !== 'string') return null;
    if (!Array.isArray(o.stack)) return null;
    return o as TaskClassification;
  } catch {
    return null;
  }
}

// GOD_MCP_ALLOWLIST is imported from the canonical tiered map (single
// source of truth, shared with olympus-router/index.ts, which uses it
// for tier-aware permission.ask enforcement).
import { selectMcpsForTask, GOD_MCP_TIERS } from "../olympus-router/src/mcp-tiers.js";

const TOKEN_BUDGET: Record<TaskClassification['complexity'], number> = {
  trivial: 5_000,
  simple: 30_000,
  moderate: 80_000,
  complex: 150_000,
  architectural: 150_000,
};

function approxTokens(s: string): number {
  return Math.ceil(s.length / 4);
}

function readSkillTags(root: string, skill: string): string[] {
  const p = join(root, '.opencode', 'skills', skill, 'SKILL.md');
  if (!existsSync(p)) return [];
  try {
    const content = readFileSync(p, 'utf-8');
    const m = content.match(/^---\n([\s\S]*?)\n---/);
    if (!m) return [];
    const fm = m[1];
    const tagsMatch = fm.match(/^tags:\s*\[([^\]]*)\]/m);
    if (!tagsMatch) return [];
    return tagsMatch[1].split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
  } catch {
    return [];
  }
}

// HOT/WARM/COLD TIER SYSTEM.
// Skills are tiered by mastery level:
//   HOT  = mastered skills (listed in .opencode/vault-brain/mastered-skills/<god>.md)
//          → ALWAYS loaded into the god's system prompt (small set, ~5-10 per god)
//   WARM = stack-relevant skills (tags match active stack) that aren't mastered yet
//          → loaded on-demand when complexity > trivial (medium set, ~20-50)
//   COLD = all other skills (not mastered, not stack-relevant)
//          → NOT loaded (lazy-loaded only if the god explicitly queries the skill index)
//
// This keeps the hot tier always available (fast), the warm tier loaded for
// non-trivial tasks (balanced), and the cold tier off the input budget entirely.
const GOD_NAMES = ['apollo','artemis','athena','dionysus','hephaestus','hermes','persephone','prometheus','callimachus'];

function loadHotTierSkills(root: string, god: string): string[] {
  const profilePath = join(root, '.opencode', 'vault-brain', 'mastered-skills', `${god}.md`);
  if (!existsSync(profilePath)) return [];
  try {
    const content = readFileSync(profilePath, 'utf-8');
    const skills: string[] = [];
    let capturing = false;
    for (const line of content.split('\n')) {
      if (line.startsWith('## Available Skills')) { capturing = true; continue; }
      if (line.startsWith('## ')) { capturing = false; continue; }
      if (!capturing) continue;
      const m = line.match(/^-\s+`([^`]+)`/);
      if (m) {
        const subMatch = line.match(/\(([^)]+)\s+sub-skill\)/);
        if (subMatch) skills.push(subMatch[1]);
        else skills.push(m[1]);
      }
    }
    return [...new Set(skills)];
  } catch {
    return [];
  }
}

function filterSkillsByStack(
  root: string,
  skills: string[],
  activeStacks: string[],
): string[] {
  if (activeStacks.length === 0) return skills;
  return skills.filter(skill => {
    const tags = readSkillTags(root, skill);
    if (tags.length === 0) return true;
    return tags.some(t => activeStacks.includes(t));
  });
}

function listReferenceDocs(vaultRoot: string, activeStacks: string[]): string[] {
  const refsRoot = join(vaultRoot, '04_Knowledge', 'references');
  if (!existsSync(refsRoot)) return [];
  const out: string[] = [];
  const dirsToScan = new Set<string>(['security', 'testing', 'integrations']);
  for (const s of activeStacks) dirsToScan.add(s);
  for (const d of dirsToScan) {
    const dir = join(refsRoot, d);
    if (!existsSync(dir)) continue;
    try {
      const files = readdirSync(dir) as string[];
      for (const f of files) {
        if (f.endsWith('.md')) out.push(join(dir, f));
      }
    } catch { /* skip */ }
  }
  return out;
}

function buildDynamicPreamble(
  classification: TaskClassification,
  root: string,
  vaultRoot: string,
): string {
  const lines: string[] = [];
  lines.push('');
  lines.push('## Dynamic Context (olympus-dynamic-context plugin)');
  lines.push('');
  lines.push(`Task classification: ${classification.reason}`);
  lines.push(`Token budget: ~${classification.estimatedTokens.toLocaleString()} tokens (complexity=${classification.complexity})`);
  lines.push(`Routed god: ${classification.routeTo}`);
  lines.push('');

  // HOT/WARM/COLD TIER SYSTEM.
  // HOT tier: mastered skills (always loaded — small set, high value)
  const hotSkills = loadHotTierSkills(root, classification.routeTo);
  if (hotSkills.length > 0) {
    lines.push(`## Hot Tier — Mastered Skills (${hotSkills.length}, always loaded)`);
    for (const s of hotSkills) {
      lines.push(`  - ${s}`);
    }
    lines.push('');
  }

  // WARM tier: stack-relevant skills (loaded for non-trivial tasks)
  // COLD tier: everything else (NOT loaded — lazy via skill index search)
  if (classification.complexity !== 'trivial') {
    const skillsRoot = join(root, '.opencode', 'skills');
    const allSkillDirs: string[] = [];
    try {
      for (const e of readdirSync(skillsRoot, { withFileTypes: true })) {
        if (e.isDirectory()) allSkillDirs.push(e.name);
      }
    } catch {}
    // WARM = stack-matched skills NOT in the hot tier
    const warmSkills = filterSkillsByStack(root, allSkillDirs, classification.stack)
      .filter(s => !hotSkills.includes(s));
    if (warmSkills.length > 0) {
      lines.push(`## Warm Tier — Stack-Relevant Skills (${warmSkills.length}, on-demand)`);
      for (const s of warmSkills.slice(0, 20)) {
        lines.push(`  - ${s}`);
      }
      if (warmSkills.length > 20) {
        lines.push(`  - ... and ${warmSkills.length - 20} more (query the skill index for specific needs)`);
      }
      lines.push('');
    }
    lines.push(`## Cold Tier — ${allSkillDirs.length - hotSkills.length - warmSkills.length} skills NOT loaded (lazy via skill index)`);
    lines.push('');
  } else {
    lines.push(`## Warm/Cold tiers skipped (trivial task — hot tier only)`);
    lines.push('');
  }

  // Hot/Warm/Cold tier rendering for MCPs.
  // Mirrors the existing skill-tier rendering above. The god sees three
  // MCP blocks in its system prompt:
  //   - Hot Tools — always available (pre-injected, no equip cost)
  //   - Warm Tools — stack/domain-relevant, loaded for non-trivial tasks
  //   - Cold Tools — listed by name with an "equip only with written
  //     justification in your dispatch trace" instruction. The god can
  //     equip a Cold MCP by including `mcp: "<server>"` in its next
  //     olympus-dispatch call; the dispatch tracker records the equip in
  //     ~/.olympus/equipped-mcps.json, and the permission.ask hook in
  //     olympus-router/index.ts reads that file to allow the equip.
  //
  // This aggressively guards the input token budget: a god never sees ALL
  // its MCPs in the prompt — only Hot + relevant Warm + relevant Cold
  // (by name only, no description). The god can still equip any Cold MCP
  // it needs, but it has to reason about it first.
  const tiers = selectMcpsForTask(classification.routeTo, classification);
  if (tiers.hot.length > 0) {
    lines.push(`## Hot Tools — Always Available (${tiers.hot.length})`);
    for (const s of tiers.hot) {
      lines.push(`  - ${s}`);
    }
    lines.push('');
  }
  if (tiers.warm.length > 0) {
    lines.push(`## Warm Tools — Stack/Domain-Relevant (${tiers.warm.length}, on-demand)`);
    for (const s of tiers.warm) {
      lines.push(`  - ${s}`);
    }
    lines.push('');
  }
  if (tiers.cold.length > 0) {
    lines.push(`## Cold Tools — Require Explicit Reasoning (${tiers.cold.length})`);
    lines.push(`  Equip only by including \`mcp: "<server>"\` in your next \`olympus-dispatch\` call.`);
    lines.push(`  Cold tools burn tokens and should only be equipped when Hot + Warm cannot solve the task.`);
    for (const s of tiers.cold) {
      lines.push(`  - ${s}`);
    }
    lines.push('');
  }
  // If the god has NO MCPs at any tier (e.g. Callimachus), say so explicitly
  // so the god doesn't waste deliberation wondering whether it should equip
  // an MCP.
  if (tiers.hot.length === 0 && tiers.warm.length === 0 && tiers.cold.length === 0) {
    lines.push(`## Tools (MCPs)`);
    lines.push(`  None — this god has an empty MCP allowlist at every tier.`);
    lines.push('');
  }
  lines.push('');

  const refs = listReferenceDocs(vaultRoot, classification.stack);
  if (refs.length > 0) {
    lines.push(`Reference docs loaded (${refs.length}):`);
    for (const r of refs.slice(0, 10)) {
      lines.push(`  - ${r}`);
    }
    if (refs.length > 10) {
      lines.push(`  - ... and ${refs.length - 10} more`);
    }
  }
  lines.push('');

  if (classification.needsPlanning) {
    lines.push('This task needs planning. Use the spec-interview path: ask clarifying questions before dispatching.');
  } else if (classification.complexity === 'trivial') {
    lines.push('This is a trivial prompt. Answer in one short sentence. Do NOT deliberate. Do NOT call any tools.');
  }
  lines.push('');

  return lines.join('\n');
}

const plugin: Plugin = async (_input, _options) => {
  const hooks: Hooks = {
    "experimental.chat.messages.transform": async (hookInput: any, output: any) => {
      try {
        const raw = process.env.OLYMPUS_TASK_CLASSIFICATION;
        const classification = parseClassification(raw);
        if (!classification) {
          return;
        }

        // Resolve paths using process.cwd() — works in both dev and prod.
        // (import.meta.url is not available in CommonJS output, which is what
        // the .opencode/tsconfig.json compiles to.)
        const root = process.cwd();
        const vaultRoot = process.env.OLYMPUS_VAULT ||
          homedir() + '/OLYMPUS-VAULT';

        const preamble = buildDynamicPreamble(classification, root, vaultRoot);

        // Append the preamble to the system messages.
        // The output shape varies by OpenCode version — use `any` and
        // handle both array-of-strings and array-of-objects.
        if (output && typeof output === 'object') {
          const sys = (output as any).system;
          if (Array.isArray(sys)) {
            if (sys.length > 0) {
              const last = sys.length - 1;
              if (typeof sys[last] === 'string') {
                sys[last] = sys[last] + '\n' + preamble;
              } else if (sys[last] && typeof sys[last] === 'object') {
                sys[last].content = (sys[last].content || '') + '\n' + preamble;
              } else {
                sys.push(preamble);
              }
            } else {
              sys.push(preamble);
            }
          }
        }

        // Token budget check (debug only).
        if (process.env.OLYMPUS_DEBUG === '1') {
          const sysStr = Array.isArray(output?.system)
            ? output.system.map((s: any) => typeof s === 'string' ? s : (s?.content || '')).join('\n')
            : '';
          const msgStr = typeof hookInput?.message === 'string'
            ? hookInput.message
            : (hookInput?.message?.text || '');
          const totalTokens = approxTokens(sysStr + msgStr);
          if (totalTokens > TOKEN_BUDGET[classification.complexity]) {
            console.error(
              `[olympus-dynamic-context] WARNING: prompt is ${totalTokens} tokens, ` +
              `over budget of ${TOKEN_BUDGET[classification.complexity]} for complexity=${classification.complexity}`
            );
          }
        }
      } catch (err: any) {
        console.error('[olympus-dynamic-context] messages.transform error:', err.message);
      }
    },
  };

  if (process.env.OLYMPUS_DEBUG === '1') {
    console.error('[olympus-dynamic-context] loaded');
  }

  return hooks;
};

export default plugin;
