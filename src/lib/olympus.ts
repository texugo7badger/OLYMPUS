/**
 * Olympus data layer — reads the OpenCode config and agent files, then
 * builds the 3D graph data model with per-project brain atlas support.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import fs from 'fs';
import path from 'path';
import os from 'os';
import { isSkillVisible, isKnowledgeVisible, KNOWLEDGE_STACK_MAP } from './skill-stacks';
import { LLM_STRATEGIES } from './model-strategies';

// OLYMPUS_ROOT is the project root (where package.json + opencode.json live).
const _cwd = process.cwd();
const OLYMPUS_ROOT = process.env.OLYMPUS_ROOT || _cwd;
const VAULT = process.env.OLYMPUS_VAULT || path.join(os.homedir(), 'OLYMPUS-VAULT');
const METRICS_DIR = path.join(os.homedir(), '.olympus', 'metrics');

export type NodeType =
  | 'god' | 'skill' | 'instinct' | 'project' | 'knowledge' | 'evolved' | 'subagent';

export interface GraphNode {
  id: string;
  name: string;
  type: NodeType;
  god?: string;
  icon?: string;
  domain?: string;
  model?: string;
  confidence?: number;
  importance?: number;
  val: number;
  color: string;
  description?: string;
  caveman?: string;
  army_size?: number;
  cold_start?: boolean;
  historical_success_rate?: number;
  historical_sample_size?: number;
  scope?: 'global' | 'stack' | 'project';
  stacks?: string[];
  projects?: string[];
  crossStack?: boolean;
  activeProject?: string;
  /** v2: is this the active-project hub node? */
  projectHub?: boolean;
  /** v2: why was this node included/filtered? (for tooltips + debugging) */
  visibilityReason?: string;
}

export interface GraphLink {
  source: string;
  target: string;
  type: 'carries' | 'evolved_from' | 'contradicts' | 'assigned_to' | 'delegates' | 'wiki' | 'owns' | 'works_on';
  color: string;
  particles?: boolean;
  width?: number;
  curvature?: number;
}

export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
  scopeStats?: any;
  activeProjectSlug?: string | null;
  /** v2: per-project atlas stats — how many nodes were filtered. */
  atlasStats?: {
    gods: number;
    skillsVisible: number;
    skillsHidden: number;
    knowledgeVisible: number;
    knowledgeHidden: number;
    instinctsVisible: number;
    instinctsHidden: number;
    projectHub: boolean;
    mode: 'project' | 'browsing';
  };
}

/* Pastel palette (Issue 11). */
export const COLORS = {
  god:           '#D4A574',
  subagent:      '#C4956A',
  skill:         '#6B8FB5',
  instinctHigh:  '#7BAE8E',
  instinctLow:   '#C4A265',
  instinctBad:   '#C4756A',
  project:       '#9B7BAE',
  knowledge:     '#6BAEB5',
  evolved:       '#6BAEB5',
  bg:            '#0A0E16',
  instinctCrossStack: '#C4A265',
  instinctProjectBound: '#9B7BAE',
  instinctStackScoped: '#6BAEB5',
  /** v2: project hub node — brighter purple with glow. */
  projectHub:    '#B89BD1',
  /** v2: knowledge node tint. */
  knowledgeStackScoped: '#6BAEB5',
};

function readJSON(file: string): any {
  try { return JSON.parse(fs.readFileSync(file, 'utf-8')); } catch { return null; }
}

function parseFrontmatter(file: string): Record<string, any> {
  try {
    const raw = fs.readFileSync(file, 'utf-8');
    const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!m) return {};
    const fm: Record<string, any> = {};
    for (const line of m[1].split(/\r?\n/)) {
      const kv = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
      if (!kv) continue;
      const key = kv[1];
      let val: string = kv[2].trim();
      if (val.startsWith('[') && val.endsWith(']')) {
        const inner = val.slice(1, -1);
        fm[key] = inner.split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
      } else if (val === 'true' || val === 'false') {
        fm[key] = val === 'true';
      } else if (/^-?\d+(\.\d+)?$/.test(val)) {
        fm[key] = parseFloat(val);
      } else if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        fm[key] = val.slice(1, -1);
      } else {
        fm[key] = val;
      }
    }
    return fm;
  } catch { return {}; }
}

// God metadata. Models match the go-balanced strategy in model-strategies.ts —
// MIRROR of src/lib/model-strategies.ts.
// Do NOT edit by hand — update the canonical file and run `npm run check-strategy-sync`.
// Enforced by scripts/check-strategy-sync.js in CI.
const GOD_META: Record<string, { icon: string; domain: string; model: string; caveman: string; army: number }> = {
  apollo:      { icon: 'apollo',     domain: 'Planner — Architecture, Spec',       model: 'opencode-go/glm-5.3-flash',   caveman: 'never', army: 8 },
  atlas:       { icon: 'git-fork',   domain: 'Orchestrator — Dispatch, Execution', model: 'opencode-go/hy3',             caveman: 'never', army: 6 },
  hephaestus:  { icon: 'hephaestus', domain: 'Backend / Infrastructure',           model: 'opencode-go/kimi-k2.7-code',  caveman: 'full',  army: 30 },
  athena:      { icon: 'athena',     domain: 'Frontend / UX-UI / Design',          model: 'opencode-go/qwen3.7-plus',    caveman: 'never', army: 7 },
  hermes:      { icon: 'hermes',     domain: 'Integrations / APIs / MCPs',         model: 'opencode-go/kimi-k2.7-code',  caveman: 'full',  army: 2 },
  artemis:     { icon: 'artemis',    domain: 'Security / Auditing',                model: 'opencode-go/glm-5.3-flash',   caveman: 'lite',  army: 3 },
  dionysus:    { icon: 'dionysus',   domain: 'QA / Testing / Edge Cases',          model: 'opencode-go/glm-5.3-flash',   caveman: 'full',  army: 6 },
  persephone:  { icon: 'persephone', domain: 'Database / Persistence',             model: 'opencode-go/qwen3.7-plus',    caveman: 'full',  army: 2 },
  prometheus:  { icon: 'prometheus', domain: 'DevOps / CI-CD / Deploy',            model: 'opencode-go/minimax-m3',      caveman: 'full',  army: 6 },
  callimachus: { icon: 'callimachus', domain: 'Vault curator — Instincts, Compaction', model: 'opencode-go/glm-5.3-flash', caveman: 'full', army: 0 },
};

const GOD_SKILLS: Record<string, string[]> = {
  apollo: ['planner', 'architect', 'parallel-execution-optimizer', 'autonomous-loops'],
  hephaestus: ['backend-patterns', 'python-patterns', 'rust-patterns', 'api-design'],
  athena: ['frontend-patterns', 'react-performance', 'liquid-glass-design', 'impeccable'],
  hermes: ['mcp-server-patterns', 'websearch', 'webfetch', 'fal-ai-media'],
  artemis: ['security-review', 'security-scan'],
  dionysus: ['tdd-guide', 'e2e-testing', 'eval-harness'],
  persephone: ['database-migrations', 'postgres-patterns', 'clickhouse-io'],
  prometheus: ['deployment-patterns', 'docker-patterns', 'bun-runtime'],
};

/**
 * Load MASTERED skills for a god from the vault-brain profile.
 * Reads .opencode/vault-brain/mastered-skills/<god>.md and extracts skill
 * names from the "## Available Skills" section. Only skills listed here
 * are shown in the brain + vault summary.
 *
 * Falls back to GOD_SKILLS if the profile doesn't exist.
 */
function loadMasteredSkills(god: string): string[] {
  try {
    const profilePath = path.join(OLYMPUS_ROOT, '.opencode', 'vault-brain', 'mastered-skills', `${god}.md`);
    if (!fs.existsSync(profilePath)) {
      return GOD_SKILLS[god] ?? [];
    }
    const content = fs.readFileSync(profilePath, 'utf-8');
    // Extract skill names from the "Available Skills" section.
    // Each line looks like:
    //   - `superpowers` (dispatching-parallel-agents sub-skill) — superpowers repo
    //   - `continuous-learning-v2` — Olympus native
    //
    // Count UNIQUE top-level skill names (the first backtick-quoted
    // token). So "superpowers" with 4 sub-skills counts as 1 skill, not 4.
    // This makes the mastered count consistent with the per-god breakdown.
    const skills: string[] = [];
    let capturing = false;
    for (const line of content.split('\n')) {
      if (line.startsWith('## Available Skills')) {
        capturing = true;
        continue;
      }
      if (line.startsWith('## ')) {
        capturing = false;
        continue;
      }
      if (!capturing) continue;
      // Match: - `skill-name` — the first backtick-quoted token is the
      // top-level skill name (e.g., "superpowers", "continuous-learning-v2").
      // Sub-skills in parentheses are NOT counted separately.
      const m = line.match(/^-\s+`([^`]+)`/);
      if (m) {
        skills.push(m[1]);
      }
    }
    // Dedupe — so "superpowers" appearing 4 times (with different sub-skills)
    // counts as 1 mastered skill, not 4.
    return [...new Set(skills)];
  } catch {
    return GOD_SKILLS[god] ?? [];
  }
}

export interface ActiveProjectContext {
  slug: string;
  name: string;
  path: string;
  stacks: string[];
}

/**
 * Walk all instinct .md files under 05_Auto_Learning/instincts/<god>/,
 * including tiered subdirectories (`seed/`, `empirical/`, `_archive/`).
 *
 * The node id is `instinct:<god>:<tier>/<basename>` (e.g.
 * `instinct:apollo:seed/use-openspec-for-planning`). The `<tier>/` prefix
 * disambiguates duplicate filenames across tiers.
 */
function loadAllInstincts(): any[] {
  const out: any[] = [];
  const instinctsDir = path.join(VAULT, '05_Auto_Learning', 'instincts');
  if (!fs.existsSync(instinctsDir)) return out;

  let godDirs: fs.Dirent[] = [];
  try { godDirs = fs.readdirSync(instinctsDir, { withFileTypes: true }); } catch { return out; }

  // Instinct files live in tiered subdirectories.
  const TIER_DIRS = ['seed', 'empirical', '_archive'];

  for (const godEntry of godDirs) {
    if (!godEntry.isDirectory()) continue;
    const godName = godEntry.name;
    const godDir = path.join(instinctsDir, godName);

    // Collect .md files from all three tier subdirectories.
    const collected: { tier: string; file: string; full: string }[] = [];
    for (const tier of TIER_DIRS) {
      const tierPath = path.join(godDir, tier);
      if (!fs.existsSync(tierPath)) continue;
      let tierFiles: string[] = [];
      try { tierFiles = fs.readdirSync(tierPath).filter(f => f.endsWith('.md')); } catch { continue; }
      for (const file of tierFiles) {
        collected.push({ tier, file, full: path.join(tierPath, file) });
      }
    }

    // Backward compat: if no tier subdirs were found, fall back to scanning
    // .md files directly under the god directory (the old v1 layout).
    if (collected.length === 0) {
      let directFiles: string[] = [];
      try { directFiles = fs.readdirSync(godDir).filter(f => f.endsWith('.md')); } catch { continue; }
      for (const file of directFiles) {
        collected.push({ tier: '', file, full: path.join(godDir, file) });
      }
    }

    for (const { tier, file, full } of collected) {
      const fm = parseFrontmatter(full);
      if (typeof fm.confidence !== 'number') continue;

      const baseName = file.replace(/\.md$/, '');
      // Include the tier in the id (as a path-style prefix on the basename)
      // so seed/foo.md and empirical/foo.md don't collide. When tier is ''
      // (old layout), the id collapses to the original `instinct:<god>:<name>`.
      const id = tier
        ? `instinct:${godName}:${tier}/${baseName}`
        : `instinct:${godName}:${baseName}`;
      const scope = (typeof fm.scope === 'string' && ['global', 'stack', 'project'].includes(fm.scope))
        ? fm.scope as 'global' | 'stack' | 'project'
        : 'global';
      const stacks = Array.isArray(fm.stacks) ? fm.stacks : [];
      const projects = Array.isArray(fm.projects)
        ? fm.projects
        : (typeof fm.project === 'string' ? [fm.project] : []);

      out.push({
        id,
        god: godName,
        confidence: fm.confidence,
        scope,
        stacks,
        projects,
        last_used: typeof fm.last_used === 'string' ? fm.last_used : undefined,
        samples: typeof fm.samples === 'number' ? fm.samples : undefined,
        path: full,
        name: baseName.replace(/-/g, ' '),
        tier,
      });
    }
  }
  return out;
}

/**
 * Apply the scope filter (v1 rules, unchanged).
 */
function applyScopeFilter(instincts: any[], activeProject: ActiveProjectContext | null) {
  const CROSS_STACK_THRESHOLD = 0.85;
  const DECAY_90D = 0.1;
  const DECAY_180D = 0.2;
  const now = Date.now();

  const filtered: any[] = [];
  const stats = {
    total: instincts.length,
    visible: 0,
    hidden: 0,
    crossStack: 0,
    byScope: { global: { total: 0, visible: 0 }, stack: { total: 0, visible: 0 }, project: { total: 0, visible: 0 } },
    byRule: {} as Record<number, { total: number; visible: number }>,
  };

  for (const inst of instincts) {
    const scope = inst.scope ?? 'global';
    stats.byScope[scope].total++;

    let effectiveConfidence = inst.confidence;
    if (inst.last_used) {
      const last = new Date(inst.last_used).getTime();
      if (!isNaN(last)) {
        const daysSince = (now - last) / (1000 * 60 * 60 * 24);
        if (daysSince > 180) effectiveConfidence = Math.max(0, effectiveConfidence - DECAY_180D);
        else if (daysSince > 90) effectiveConfidence = Math.max(0, effectiveConfidence - DECAY_90D);
      }
    }

    let visible = false;
    let crossStack = false;
    let rule = 0;

    if (!activeProject) {
      if (scope === 'project') { visible = false; rule = 6; }
      else if (scope === 'global' && inst.stacks.length === 0) { visible = true; rule = 1; }
      else { visible = true; crossStack = true; rule = 6; }
    } else {
      const stackIntersect = inst.stacks.some((s: string) => activeProject.stacks.includes(s));
      if (scope === 'project') {
        visible = inst.projects.includes(activeProject.slug); rule = 4;
      } else if (scope === 'stack') {
        visible = stackIntersect; rule = 3;
      } else {
        if (inst.stacks.length === 0) { visible = true; rule = 1; }
        else if (stackIntersect) { visible = true; rule = 2; }
        else if (effectiveConfidence >= CROSS_STACK_THRESHOLD) { visible = true; crossStack = true; rule = 2; }
        else { visible = false; rule = 2; }
      }
    }

    if (!stats.byRule[rule]) stats.byRule[rule] = { total: 0, visible: 0 };
    stats.byRule[rule].total++;
    if (visible) {
      filtered.push({ ...inst, effectiveConfidence, crossStack });
      stats.visible++;
      stats.byScope[scope].visible++;
      stats.byRule[rule].visible++;
      if (crossStack) stats.crossStack++;
    } else { stats.hidden++; }
  }

  return { filtered, stats };
}

/**
 * v2 NEW — Load knowledge nodes from 04_Knowledge/references/.
 *
 * Walks the references directory, reads each .md file's frontmatter for
 * a title, and creates a knowledge node. Visibility is determined by
 * isKnowledgeVisible() (stack filter).
 *
 * Returns the raw list (no filtering yet — filtering happens in buildGraph).
 */
function loadAllKnowledge(): { id: string; name: string; path: string; category: string; stack?: string }[] {
  const out: { id: string; name: string; path: string; category: string; stack?: string }[] = [];
  const refsDir = path.join(VAULT, '04_Knowledge', 'references');
  if (!fs.existsSync(refsDir)) return out;

  let categories: fs.Dirent[] = [];
  try { categories = fs.readdirSync(refsDir, { withFileTypes: true }); } catch { return out; }

  for (const cat of categories) {
    if (!cat.isDirectory()) continue;
    const catDir = path.join(refsDir, cat.name);
    let files: string[] = [];
    try { files = fs.readdirSync(catDir).filter(f => f.endsWith('.md')); } catch { continue; }

    for (const file of files) {
      const relPath = `${cat.name}/${file}`;
      const full = path.join(catDir, file);
      const fm = parseFrontmatter(full);
      const name = (fm.title || file.replace(/\.md$/, '').replace(/-/g, ' ')) as string;
      const stacks = KNOWLEDGE_STACK_MAP[relPath];
      out.push({
        id: `knowledge:${cat.name}/${file.replace(/\.md$/, '')}`,
        name,
        path: relPath,
        category: cat.name,
        stack: stacks && stacks.length > 0 ? stacks[0] : undefined,
      });
    }
  }
  return out;
}

/**
 * v2 — Build the 3D graph with PER-PROJECT BRAIN ATLAS.
 *
 * When activeProject is provided:
 *   - Adds a project HUB node (purple, frontal lobe, val=32)
 *   - Hides skills whose stacks don't match (via isSkillVisible)
 *   - Loads + filters knowledge nodes by stack (via isKnowledgeVisible)
 *   - Filters instincts by scope (v1 rules)
 *   - The project hub has delegation edges to all 8 gods
 *
 * When activeProject is null (browsing mode):
 *   - No project hub
 *   - All skills visible
 *   - All knowledge visible
 *   - Instincts filtered by browsing rules (project-bound hidden)
 */
export function buildGraph(activeProject?: ActiveProjectContext | null): GraphData {
  const nodes: GraphNode[] = [];
  const links: GraphLink[] = [];
  const activeStacks = activeProject?.stacks ?? [];
  const atlasStats = {
    gods: 0,
    skillsVisible: 0,
    skillsHidden: 0,
    knowledgeVisible: 0,
    knowledgeHidden: 0,
    instinctsVisible: 0,
    instinctsHidden: 0,
    projectHub: false,
    mode: (activeProject ? 'project' : 'browsing') as 'project' | 'browsing',
  };

  // ── v2: Project hub node (only when a project is active) ───────────
  if (activeProject) {
    nodes.push({
      id: `project:${activeProject.slug}`,
      name: activeProject.name,
      type: 'project',
      val: 32,
      color: COLORS.projectHub,
      description:
        `Project hub — ${activeProject.name} (${activeProject.slug}). ` +
        `Path: ${activeProject.path}. ` +
        `Stacks: [${activeProject.stacks.join(', ')}]. ` +
        `This node is the center of the project's brain atlas. ` +
        `All visible gods, skills, knowledge, and instincts are scoped to this project.`,
      projectHub: true,
      activeProject: activeProject.slug,
      stacks: activeProject.stacks,
      visibilityReason: 'active project hub',
    });
    atlasStats.projectHub = true;
  }

  // ── 10 god nodes ───────────────────────────────────────────────────
  for (const [id, meta] of Object.entries(GOD_META)) {
    const display = id.charAt(0).toUpperCase() + id.slice(1);
    nodes.push({
      id: `god:${id}`,
      name: display,
      type: 'god',
      god: id,
      icon: meta.icon,
      domain: meta.domain,
      model: meta.model,
      caveman: meta.caveman,
      army_size: meta.army,
      val: 28,
      color: COLORS.god,
      cold_start: true,
      historical_success_rate: 0,
      historical_sample_size: 0,
      description: `${display} — ${meta.domain}. Model class: ${meta.model}. Caveman: ${meta.caveman}. Army: ${meta.army} sub-agents.`,
      activeProject: activeProject?.slug,
      visibilityReason: 'orchestrator (always visible)',
    });
    atlasStats.gods++;

    // v2: project hub delegates to each god (purple particle edges)
    if (activeProject) {
      links.push({
        source: `project:${activeProject.slug}`,
        target: `god:${id}`,
        type: 'delegates',
        color: 'rgba(184, 155, 209, 0.5)', // purple @ 50%
        particles: true,
        width: 2,
        curvature: 0.2,
      });
    }
  }

  // Apollo delegates to the specialist gods + Callimachus (gold particle edges).
  // Apollo does NOT delegate routine work to Callimachus (he runs in the
  // background on session.idle), but the edge is rendered to show the
  // orchestrator's awareness of the vault curator.
  for (const id of Object.keys(GOD_META)) {
    if (id === 'apollo') continue;
    links.push({
      source: 'god:apollo',
      target: `god:${id}`,
      type: 'delegates',
      color: 'rgba(212, 165, 116, 0.4)',
      particles: true,
      width: 2,
      curvature: 0.15,
    });
  }

  // ── MASTERED skills only (not every skill in the install) ──
  // Each god's mastered skills are loaded from their vault-brain profile
  // (.opencode/vault-brain/mastered-skills/<god>.md).
  for (const god of Object.keys(GOD_META)) {
    const skills = loadMasteredSkills(god);
    for (const skill of skills) {
      const sid = `skill:${skill}`;

      // v2: stack filter
      const visibility = isSkillVisible(skill, activeStacks);
      if (!visibility.visible) {
        atlasStats.skillsHidden++;
        continue;
      }
      atlasStats.skillsVisible++;

      if (!nodes.find(n => n.id === sid)) {
        nodes.push({
          id: sid,
          name: skill,
          type: 'skill',
          god,
          importance: 8,
          val: 10,
          color: COLORS.skill,
          description:
            `Skill ${skill} — carried by ${god}. Source: ECC / Caveman / Impeccable (reused, not authored). ` +
            `Visibility: ${visibility.reason}.`,
          activeProject: activeProject?.slug,
          stacks: visibility.stacks,
          visibilityReason: visibility.reason,
        });
      }
      links.push({
        source: `god:${god}`,
        target: sid,
        type: 'carries',
        color: 'rgba(255,255,255,0.15)',
        width: 1,
        curvature: 0.2,
      });
    }
  }

  // ── v2: Knowledge nodes (stack-filtered when project active) ───────
  const allKnowledge = loadAllKnowledge();
  for (const k of allKnowledge) {
    const visibility = isKnowledgeVisible(k.path, activeStacks);
    if (!visibility.visible) {
      atlasStats.knowledgeHidden++;
      continue;
    }
    atlasStats.knowledgeVisible++;

    nodes.push({
      id: k.id,
      name: k.name,
      type: 'knowledge',
      val: 8,
      color: k.stack ? COLORS.knowledgeStackScoped : COLORS.knowledge,
      description:
        `Knowledge — ${k.name} (${k.category}). ` +
        `Path: 04_Knowledge/references/${k.path}. ` +
        `Visibility: ${visibility.reason}.`,
      activeProject: activeProject?.slug,
      stacks: visibility.stacks,
      visibilityReason: visibility.reason,
    });

    // Link knowledge → most relevant god (by category)
    const categoryToGod: Record<string, string> = {
      backend: 'hephaestus',
      frontend: 'athena',
      devops: 'prometheus',
      security: 'artemis',
      testing: 'dionysus',
      integrations: 'hermes',
    };
    const targetGod = categoryToGod[k.category];
    if (targetGod) {
      links.push({
        source: `god:${targetGod}`,
        target: k.id,
        type: 'wiki',
        color: 'rgba(107, 174, 181, 0.3)',
        width: 1,
        curvature: 0.3,
      });
    }
  }

  // ── Instincts (v1 scope filter, unchanged) ─────────────────────────
  const allInstincts = loadAllInstincts();
  const { filtered, stats } = applyScopeFilter(allInstincts, activeProject ?? null);
  atlasStats.instinctsVisible = stats.visible;
  atlasStats.instinctsHidden = stats.hidden;

  for (const inst of filtered) {
    let color = COLORS.instinctHigh;
    if (inst.crossStack) color = COLORS.instinctCrossStack;
    else if (inst.scope === 'project') color = COLORS.instinctProjectBound;
    else if (inst.scope === 'stack') color = COLORS.instinctStackScoped;
    else if (inst.effectiveConfidence < 0.7) color = COLORS.instinctLow;
    else if (inst.effectiveConfidence < 0.4) color = COLORS.instinctBad;

    const val = Math.max(4, Math.min(14, 4 + inst.effectiveConfidence * 10));

    nodes.push({
      id: inst.id,
      name: inst.name,
      type: 'instinct',
      god: inst.god,
      confidence: inst.effectiveConfidence,
      scope: inst.scope,
      stacks: inst.stacks,
      projects: inst.projects,
      crossStack: inst.crossStack,
      val,
      color,
      description:
        `Instinct "${inst.name}" — owned by ${inst.god}. ` +
        `Scope: ${inst.scope}. ` +
        `Stacks: [${inst.stacks.join(', ')}]. ` +
        `Confidence: ${inst.effectiveConfidence.toFixed(2)}${inst.crossStack ? ' (cross-stack promoted)' : ''}. ` +
        (activeProject ? `Active project: ${activeProject.slug}.` : 'Browsing mode.'),
      activeProject: activeProject?.slug,
    });

    links.push({
      source: `god:${inst.god}`,
      target: inst.id,
      type: 'carries',
      color: inst.crossStack ? 'rgba(196, 162, 101, 0.3)' : 'rgba(123, 174, 142, 0.3)',
      width: 1,
      curvature: 0.25,
    });
  }

  return {
    nodes,
    links,
    scopeStats: stats,
    activeProjectSlug: activeProject?.slug ?? null,
    atlasStats,
  };
}

/**
 * Brain health KPIs. Includes scope + atlas breakdown.
 */
export function brainHealth() {
  const graph = buildGraph();
  const instinctsDir = path.join(VAULT, '05_Auto_Learning', 'instincts');
  let instinctCount = 0;
  let avgConfidence = 0;
  let scopeBreakdown = { global: 0, stack: 0, project: 0 };
  // Per-god seed-instinct counts. Used to compute `mastered_skills`
  // as the SUM of per-god "Mastered" tier counts so the Vault Summary's
  // total matches the CompactInstinctTable per-god breakdown.
  const perGodSeedCount: Record<string, number> = {};
  try {
    if (fs.existsSync(instinctsDir)) {
      const godDirs = fs.readdirSync(instinctsDir, { withFileTypes: true }).filter(d => d.isDirectory());
      const confs: number[] = [];
      // Instinct files live in tiered subdirectories
      // (`seed/`, `empirical/`, `_archive/`), not at the god-root.
      const TIER_DIRS = ['seed', 'empirical', '_archive'];
      for (const godDir of godDirs) {
        const godName = godDir.name;
        let seedForThisGod = 0;
        for (const tier of TIER_DIRS) {
          const tierPath = path.join(instinctsDir, godName, tier);
          if (!fs.existsSync(tierPath)) continue;
          let tierFiles: string[] = [];
          try {
            tierFiles = fs.readdirSync(tierPath).filter(f => f.endsWith('.md'));
          } catch { continue; }
          for (const f of tierFiles) {
            instinctCount++;
            if (tier === 'seed') seedForThisGod++;
            const fm = parseFrontmatter(path.join(tierPath, f));
            if (fm.confidence) confs.push(parseFloat(fm.confidence) || 0);
            const scope = (typeof fm.scope === 'string' && ['global', 'stack', 'project'].includes(fm.scope))
              ? fm.scope as 'global' | 'stack' | 'project'
              : 'global';
            scopeBreakdown[scope]++;
          }
        }
        perGodSeedCount[godName] = seedForThisGod;
      }
      if (confs.length) avgConfidence = confs.reduce((s, c) => s + c, 0) / confs.length;
    }
  } catch {}

  // Skill counts: every SKILL.md under .opencode/skills/ counts as one
  // installed skill. The installer ships 64 ECC/ported skills; superpowers,
  // caveman, impeccable, and olympus-core are installed separately by the
  // installer into the same directory.
  //
  // Uses an explicit META_SKILL_NAMES filter instead of a brittle `-1`
  // hack. `using-superpowers` is the only meta-skill currently shipped,
  // but the filter is open-ended so future meta-skills can be added
  // without touching this code.
  const skillsRoot = path.join(OLYMPUS_ROOT, '.opencode', 'skills');
  // Count top-level skill directories (the canonical skill count).
  // Each directory under .opencode/skills/ is one skill. We count
  // directories (not recursive SKILL.md files) so sub-skills don't
  // inflate the count.
  const totalSkills = countSkillsRecursive(skillsRoot);

  // Agent counts: opencode.json is the single source of truth. 10 Olympus
  // gods (Apollo + 8 specialists + Callimachus + Atlas) + demigods (ECC + OLYMPUS-Extensions).
  const agents = countAgentsFromConfig();
  const evolved = countDir(path.join(VAULT, '05_Auto_Learning', 'evolved'));

  const projectsDir = path.join(VAULT, '02_Projects');
  let projectCount = 0;
  let activeProjectSlug: string | null = null;
  try {
    if (fs.existsSync(projectsDir)) {
      const entries = fs.readdirSync(projectsDir, { withFileTypes: true });
      for (const e of entries) {
        if (e.isDirectory() && fs.existsSync(path.join(projectsDir, e.name, 'project.md'))) {
          projectCount++;
        }
      }
    }
    const activeFile = path.join(os.homedir(), '.olympus', 'active-project.json');
    if (fs.existsSync(activeFile)) {
      const data = JSON.parse(fs.readFileSync(activeFile, 'utf-8'));
      activeProjectSlug = data.slug ?? null;
    }
  } catch {}

  const knowledgeCount = countKnowledgeFiles();

  // Canonical Olympus totals. Read from config files (not hardcoded)
  // so they stay accurate as the install evolves.
  const totalGods = countGods();
  const totalMcps = countMcps();
  const totalPlugins = countPlugins();
  const totalCommands = countCommands();
  const totalSubagents = Math.max(0, agents - totalGods);

  // `mastered_skills` uses the same source as the brain3d graph's skill
  // node count — the UNION of mastered skill names across all 10 gods.
  // `per_god_mastered_skills` keeps the per-god count (not deduplicated)
  // so the CompactInstinctTable shows how many skills each god declares.
  const perGodMasteredSkillCount: Record<string, number> = {};
  const uniqueMasteredSkills = new Set<string>();
  for (const god of Object.keys(GOD_META)) {
    const skills = loadMasteredSkills(god);
    perGodMasteredSkillCount[god] = skills.length;
    for (const s of skills) uniqueMasteredSkills.add(s);
  }
  const masteredSkillsTotal = uniqueMasteredSkills.size;

  return {
    total_instincts: instinctCount,
    avg_confidence: Math.round(avgConfidence * 100) / 100,
    orphans: 0,
    contradictions: 0,
    pending_evolutions: evolved,
    last_compaction: null as string | null,
    next_prune: 'weekly',
    total_skills: totalSkills,
    // `mastered_skills` + `per_god_mastered_skills` come from
    // `loadMasteredSkills(god)`, matching the brain3d graph.
    mastered_skills: masteredSkillsTotal,
    per_god_mastered_skills: perGodMasteredSkillCount,
    ecc_skills: totalSkills, // alias for backward-compat with the dashboard UI
    caveman_skills: 0, // caveman is installed separately; not counted here
    total_agents: agents,
    gods: totalGods,
    subagents: totalSubagents,
    scope_breakdown: scopeBreakdown,
    total_projects: projectCount,
    active_project: activeProjectSlug,
    total_knowledge: knowledgeCount,
    // Live canonical totals for the Vault Summary header.
    total_mcps: totalMcps,
    total_plugins: totalPlugins,
    total_commands: totalCommands,
  };
}

/**
 * Count Olympus gods from opencode.json's agent block.
 *
 * A "god" is one of the 9 canonical Olympus gods (apollo, artemis, athena,
 * dionysus, hephaestus, hermes, persephone, prometheus, callimachus).
 * All other agents are demigods (unprefixed, e.g., 'build-resolver',
 * 'verifier-code', 'sast-scanner').
 */
function countGods(): number {
  const GOD_NAMES = ['apollo', 'artemis', 'athena', 'dionysus', 'hephaestus',
                      'hermes', 'persephone', 'prometheus', 'callimachus'];
  try {
    const cfgPath = path.join(OLYMPUS_ROOT, 'opencode.json');
    if (!fs.existsSync(cfgPath)) return 9;
    const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
    const agents = cfg?.agent;
    if (!agents || typeof agents !== 'object') return 9;
    return Object.keys(agents).filter(name => GOD_NAMES.includes(name)).length;
  } catch {
    return 9;
  }
}

/**
 * Count MCP servers from .mcp.json.
 */
function countMcps(): number {
  try {
    const mcpPath = path.join(OLYMPUS_ROOT, '.mcp.json');
    if (!fs.existsSync(mcpPath)) return 0;
    const cfg = JSON.parse(fs.readFileSync(mcpPath, 'utf-8'));
    const servers = cfg?.mcpServers;
    if (!servers || typeof servers !== 'object') return 0;
    return Object.keys(servers).length;
  } catch {
    return 0;
  }
}

/**
 * Count plugins from opencode.json's `plugin` array.
 * Each entry is a string (plugin path or npm package name).
 */
function countPlugins(): number {
  try {
    const cfgPath = path.join(OLYMPUS_ROOT, 'opencode.json');
    if (!fs.existsSync(cfgPath)) return 0;
    const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
    const plugins = cfg?.plugin;
    if (!Array.isArray(plugins)) return 0;
    return plugins.length;
  } catch {
    return 0;
  }
}

/**
 * Count slash-commands under .opencode/commands/.
 * Walks all subdirectories and counts .md files (each is a command).
 */
function countCommands(): number {
  const commandsRoot = path.join(OLYMPUS_ROOT, '.opencode', 'commands');
  let count = 0;
  function walk(dir: string) {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const e of entries) {
        if (e.isDirectory()) {
          walk(path.join(dir, e.name));
        } else if (e.name.endsWith('.md')) {
          count++;
        }
      }
    } catch {}
  }
  walk(commandsRoot);
  return count;
}

/**
 * Count agents available to OLYMPUS. Returns the TOTAL count of agents
 * (gods + demigods), including demigod .txt files on disk that may not yet
 * be registered in opencode.json. This ensures the status bar reflects
 * what the user actually has available, not just what's registered.
 *
 * Gods are identified by the GOD_NAMES set. Demigods are unprefixed .txt
 * files under .opencode/prompts/agents/demigods/<god>/. We count all gods
 * in opencode.json plus all demigod .txt files on disk.
 */
function countAgentsFromConfig(): number {
  try {
    const cfgPath = path.join(OLYMPUS_ROOT, 'opencode.json');
    if (!fs.existsSync(cfgPath)) return 0;
    const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
    const agents = cfg?.agent;
    if (!agents || typeof agents !== 'object') return 0;

    const GOD_NAMES_SET = new Set([
      'apollo', 'artemis', 'athena', 'dionysus', 'hephaestus',
      'hermes', 'persephone', 'prometheus', 'callimachus',
    ]);

    // Count gods from opencode.json (identified by GOD_NAMES set)
    const godCount = Object.keys(agents).filter(name => GOD_NAMES_SET.has(name)).length;

    // Count demigod .txt files on disk (the canonical fleet)
    let demigodCount = 0;
    const demigodsDir = path.join(OLYMPUS_ROOT, '.opencode', 'prompts', 'agents', 'demigods');
    try {
      if (fs.existsSync(demigodsDir)) {
        for (const god of fs.readdirSync(demigodsDir)) {
          const godDir = path.join(demigodsDir, god);
          if (fs.statSync(godDir).isDirectory()) {
            demigodCount += fs.readdirSync(godDir).filter(f => f.endsWith('.txt')).length;
          }
        }
      }
    } catch {}

    // If demigod files found on disk, use godCount + demigodCount.
    // Otherwise fall back to registered count (for fresh installs without prompts).
    if (demigodCount > 0) {
      return godCount + demigodCount;
    }
    // Fallback: count all registered agents with descriptions
    return Object.entries(agents).filter(([, def]: [string, any]) =>
      def && typeof def === 'object' && typeof def.description === 'string' && def.description.length > 0
    ).length;
  } catch {
    return 0;
  }
}

/** v2 NEW — Count knowledge .md files under 04_Knowledge/references/. */
function countKnowledgeFiles(): number {
  const refsDir = path.join(VAULT, '04_Knowledge', 'references');
  if (!fs.existsSync(refsDir)) return 0;
  let count = 0;
  function walk(dir: string) {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const e of entries) {
        if (e.isDirectory()) walk(path.join(dir, e.name));
        else if (e.name.endsWith('.md')) count++;
      }
    } catch {}
  }
  walk(refsDir);
  return count;
}

function countDir(dir: string): number {
  try { return fs.readdirSync(dir).filter(e => fs.statSync(path.join(dir, e)).isDirectory()).length; } catch { return 0; }
}

/** Count skill directories recursively — skills can be nested (e.g. <category>/<skill>/). */
function countSkillsRecursive(dir: string): number {
  try {
    if (!fs.existsSync(dir)) return 0;
    let count = 0;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      if (e.isDirectory()) {
        // A skill directory is one that contains a .md file (the skill definition).
        // Check if this dir has any .md files directly inside it.
        const subEntries = fs.readdirSync(path.join(dir, e.name), { withFileTypes: true });
        const hasMd = subEntries.some(se => se.isFile() && se.name.endsWith('.md'));
        if (hasMd) {
          count++; // This is a skill directory.
        } else {
          // No .md files directly — recurse into it (it's a category folder).
          count += countSkillsRecursive(path.join(dir, e.name));
        }
      }
    }
    return count;
  } catch { return 0; }
}

/**
 * Count top-level skill directories under .opencode/skills/.
 * Each immediate subdirectory is one skill. This is the canonical
 * skill count surfaced in the status bar and Vault Summary.
 */
function countTopLevelSkillDirs(dir: string): number {
  try {
    if (!fs.existsSync(dir)) return 0;
    return fs.readdirSync(dir, { withFileTypes: true })
      .filter(e => e.isDirectory())
      .length;
  } catch { return 0; }
}

/**
 * Meta-skills are skills that teach HOW to use the system itself, not how
 * to do real work. They're installed as SKILL.md files in .opencode/skills/
 * but shouldn't be counted as part of the "real" skill arsenal.
 *
 * Replaces a brittle `-1` hack in brainHealth(). Open-ended list so future
 * meta-skills can be added without touching countSkillsRecursive.
 */
const META_SKILL_NAMES = ['using-superpowers'];
function countMetaSkills(skillsRoot: string): number {
  try {
    if (!fs.existsSync(skillsRoot)) return 0;
    let count = 0;
    for (const name of META_SKILL_NAMES) {
      const skillDir = path.join(skillsRoot, name);
      if (fs.existsSync(skillDir) && fs.existsSync(path.join(skillDir, 'SKILL.md'))) {
        count++;
      } else {
        // Also check the superpowers/ subdirectory (using-superpowers ships
        // under skills/superpowers/using-superpowers/SKILL.md).
        const nested = path.join(skillsRoot, 'superpowers', name);
        if (fs.existsSync(nested) && fs.existsSync(path.join(nested, 'SKILL.md'))) {
          count++;
        }
      }
    }
    return count;
  } catch { return 0; }
}
function countFiles(dir: string, ext: string): number {
  try { return fs.readdirSync(dir).filter(f => f.endsWith(ext)).length; } catch { return 0; }
}

/**
 * Per-god LLM cost tracking. (Unchanged from v1.)
 */
export interface GodCost {
  god: string;
  icon: string;
  model: string;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  spend: number;
  cap5h: number | null;
  pctOfCap: number | null;
  avgLatencyMs: number;
  successRate: number;
  sparkline: number[];
}

// Canonical 10-god list. Mirrors src/lib/olympus-store.ts.
const GOD_ICON_KEYS = GOD_IDS_LIST();
function GOD_IDS_LIST(): string[] {
  return ['apollo','atlas','hephaestus','athena','hermes','artemis','dionysus','persephone','prometheus','callimachus'];
}

// Per-god model IDs — DYNAMIC: reads the current strategy from
// ~/.olympus/llm-providers.json and uses LLM_STRATEGIES to resolve
// the correct model per god. Falls back to go-balanced if no config.
function getGodModelClasses(): Record<string, string> {
  // Default to go-balanced
  let strategy: string = 'go-balanced';

  // Read the strategy from llm-providers.json
  try {
    const file = path.join(os.homedir(), '.olympus', 'llm-providers.json');
    if (fs.existsSync(file)) {
      const cfg = JSON.parse(fs.readFileSync(file, 'utf-8'));
      if (cfg.strategy) strategy = cfg.strategy;
    }
  } catch {}

  // Read per-god overrides from llm-providers.json
  let overrides: Record<string, { class?: string; provider_model?: string }> = {};
  try {
    const file = path.join(os.homedir(), '.olympus', 'llm-providers.json');
    if (fs.existsSync(file)) {
      const cfg = JSON.parse(fs.readFileSync(file, 'utf-8'));
      overrides = cfg.per_god_overrides || {};
    }
  } catch {}

  // Get the strategy's god models
  const { LLM_STRATEGIES } = require('./model-strategies');
  const strategyConfig = (LLM_STRATEGIES as any)[strategy];
  const baseModels: Record<string, string> = strategyConfig?.gods || {
    apollo:      'opencode-go/glm-5.3-flash',
    atlas:       'opencode-go/hy3',
    hephaestus:  'opencode-go/kimi-k2.7-code',
    athena:      'opencode-go/qwen3.7-plus',
    hermes:      'opencode-go/kimi-k2.7-code',
    artemis:     'opencode-go/glm-5.3-flash',
    dionysus:    'opencode-go/glm-5.3-flash',
    persephone:  'opencode-go/qwen3.7-plus',
    prometheus:  'opencode-go/minimax-m3',
    callimachus: 'opencode-go/glm-5.3-flash',
  };

  // Apply per-god overrides (from the Settings dialog)
  for (const [god, override] of Object.entries(overrides)) {
    if (override?.class) {
      baseModels[god] = override.class;
    }
  }

  // Everything stays within the GO plan. Callimachus uses DeepSeek V4 Flash
  // (from BUILTIN_STRATEGIES) — no override.

  return baseModels;
}

function emptyGodCosts(): GodCost[] {
  // Use dynamic model classes instead of hardcoded.
  const godModels = getGodModelClasses();
  return GOD_ICON_KEYS.map(god => ({
    god, icon: god, model: godModels[god] || 'opencode-go/glm-5.2',
    requests: 0, inputTokens: 0, outputTokens: 0, cachedTokens: 0,
    spend: 0, cap5h: null, pctOfCap: null, avgLatencyMs: 0, successRate: 0, sparkline: [],
  }));
}

function readRealCosts(): GodCost[] {
  const costFile = path.join(METRICS_DIR, 'cost.jsonl');
  const costs = emptyGodCosts();
  const byGod: Record<string, { requests: number; input: number; output: number; cached: number; spend: number; latencies: number[]; successes: number }> = {};
  const tickBuckets: Record<string, number[]> = {};

  try {
    if (!fs.existsSync(costFile)) return costs;
    const raw = fs.readFileSync(costFile, 'utf-8');
    if (!raw.trim()) return costs;
    const fiveHrsAgo = Date.now() - 5 * 60 * 60 * 1000;
    for (const line of raw.split('\n')) {
      if (!line.trim()) continue;
      try {
        const ev = JSON.parse(line);
        const ts = new Date(ev.ts).getTime();
        if (ts < fiveHrsAgo) continue;
        const god = ev.god;
        if (!byGod[god]) byGod[god] = { requests: 0, input: 0, output: 0, cached: 0, spend: 0, latencies: [], successes: 0 };
        byGod[god].requests++;
        byGod[god].input += ev.input_tokens || 0;
        byGod[god].output += ev.output_tokens || 0;
        byGod[god].cached += ev.cached_tokens || 0;
        byGod[god].spend += ev.spend_usd || 0;
        if (ev.latency_ms) byGod[god].latencies.push(ev.latency_ms);
        if (ev.success) byGod[god].successes++;
        if (!tickBuckets[god]) tickBuckets[god] = new Array(12).fill(0);
        const bucketIdx = Math.min(11, Math.floor((ts - fiveHrsAgo) / (5 * 60 * 60 * 1000 / 12)));
        tickBuckets[god][bucketIdx] += ev.spend_usd || 0;
      } catch {}
    }
  } catch { return costs; }

  for (const c of costs) {
    const r = byGod[c.god];
    if (!r) continue;
    c.requests = r.requests;
    c.inputTokens = r.input;
    c.outputTokens = r.output;
    c.cachedTokens = r.cached;
    c.spend = Math.round(r.spend * 100) / 100;
    c.avgLatencyMs = r.latencies.length ? Math.round(r.latencies.reduce((s, l) => s + l, 0) / r.latencies.length) : 0;
    c.successRate = r.requests ? Math.round((r.successes / r.requests) * 100) / 100 : 0;
    c.sparkline = tickBuckets[c.god] || [];
  }
  return costs;
}

export interface ProviderInfo {
  name: string;
  type: string;
  limits: string | Record<string, string>;
  cost_per_1m_tokens: { input: number; output: number };
  isFree: boolean;
  displayName: string;
  capsDisplay: string;
}

export function getProviderInfo(): ProviderInfo {
  const file = path.join(os.homedir(), '.olympus', 'llm-providers.json');
  let cfg: any = null;
  try {
    if (fs.existsSync(file)) cfg = JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch {}
  if (!cfg) {
    try {
      const providersFile = path.join(OLYMPUS_ROOT, '.opencode', 'llm-providers.json');
      if (fs.existsSync(providersFile)) cfg = JSON.parse(fs.readFileSync(providersFile, 'utf-8'));
    } catch {}
  }

  // The ACTIVE STRATEGY drives what the Cost screen shows. OLYMPUS no longer
  // routes everything through the GO plan:
  //   - free-*/custom-* strategies → FREE (no spend, no caps — tokens only)
  //   - zen-* strategies → OpenCode ZEN (pay-as-you-go, no request caps)
  //   - go-* strategies → the GO plan (flat $12/5h · $30/week · $60/month caps)
  const strategy = (cfg?.strategy as string) || 'go-balanced';
  const stratCfg = LLM_STRATEGIES[strategy as keyof typeof LLM_STRATEGIES];
  const isFree = strategy.startsWith('free-') || strategy.startsWith('custom-');

  if (isFree) {
    const label = stratCfg?.label || strategy;
    return {
      name: strategy, type: 'free',
      limits: 'free',
      cost_per_1m_tokens: { input: 0, output: 0 },
      isFree: true,
      displayName: `Provider: ${label} — free tier`,
      capsDisplay: 'free · no caps · live-refreshed models',
    };
  }

  if (stratCfg?.plan === 'ZEN') {
    return {
      name: strategy, type: 'opencode',
      limits: 'pay-as-you-go',
      cost_per_1m_tokens: { input: 0, output: 0 },
      isFree: false,
      displayName: 'Provider: OpenCode ZEN (pay-as-you-go)',
      capsDisplay: 'pay-as-you-go · no request caps',
    };
  }

  // GO plan — the only capped tier ($12/5h · $30/week · $60/month).
  const name = cfg?.default || 'opencode-go';
  const prov = cfg?.providers?.[name] || {};
  const limits = prov.limits || 'unknown';
  return {
    name, type: prov.type || 'opencode', limits,
    cost_per_1m_tokens: prov.cost_per_1m_tokens || { input: 0.14, output: 0.28 },
    isFree: false,
    displayName: 'Provider: opencode-go (GO plan)',
    capsDisplay: '$12/5h · $30/week · $60/month caps',
  };
}

export function godCosts(): GodCost[] { return readRealCosts(); }

export function costSummary() {
  const costs = godCosts();
  const prov = getProviderInfo();
  const totalSpend = costs.reduce((s, c) => s + c.spend, 0);
  const totalReqs = costs.reduce((s, c) => s + c.requests, 0);
  const totalInput = costs.reduce((s, c) => s + c.inputTokens, 0);
  const totalOutput = costs.reduce((s, c) => s + c.outputTokens, 0);
  const activeCosts = costs.filter(c => c.requests > 0);
  const avgLatency = activeCosts.length ? Math.round(activeCosts.reduce((s, c) => s + c.avgLatencyMs, 0) / activeCosts.length) : 0;
  const avgSuccess = activeCosts.length ? Math.round((activeCosts.reduce((s, c) => s + c.successRate, 0) / activeCosts.length) * 100) / 100 : 0;
  // Only the GO plan carries a 5h spend cap. ZEN is pay-as-you-go (no caps)
  // and the free strategies cost nothing — their dashboards show token
  // usage instead of spend.
  const cap5hTotal = prov.name === 'opencode-go' ? 12 : null;
  const pctOfCap = cap5hTotal != null ? Math.round((totalSpend / cap5hTotal) * 100) : null;
  return {
    totalSpend: Math.round(totalSpend * 100) / 100,
    totalReqs, totalInput, totalOutput, avgLatency, avgSuccess,
    cap5h: cap5hTotal, pctOfCap, activeGods: activeCosts.length, costs, provider: prov,
  };
}

/**
 * List Olympus gods and demigods declared in opencode.json.
 *
 * The config uses `agent: Record<name, { model, description, mode, ... }>`.
 * The 9 canonical gods (apollo, artemis, athena, dionysus, hephaestus,
 * hermes, persephone, prometheus, callimachus) are gods. All other agents
 * are demigods (unprefixed). The `mode` field distinguishes Apollo (the
 * only `mode: "primary"`) from the rest.
 */
export function listAgents() {
  const GOD_NAMES = ['apollo', 'artemis', 'athena', 'dionysus', 'hephaestus',
                      'hermes', 'persephone', 'prometheus', 'callimachus'];
  const gods: any[] = [];
  const subagents: any[] = [];
  try {
    const cfgPath = path.join(OLYMPUS_ROOT, 'opencode.json');
    if (!fs.existsSync(cfgPath)) return { gods, subagents };
    const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
    const agents = cfg?.agent;
    if (!agents || typeof agents !== 'object') return { gods, subagents };

    for (const [name, def] of Object.entries(agents) as [string, any][]) {
      const isGod = GOD_NAMES.includes(name);
      const entry = {
        name,
        model: (def?.model || '').replace(/^["']|["']$/g, ''),
        tools: Array.isArray(def?.tools) ? def.tools.join(',') : (def?.tools || ''),
        role: def?.mode === 'primary' ? 'god' : 'demigod',
        god: isGod ? name : null,
        caveman: null,
        description: (def?.description || '').slice(0, 120),
      };
      if (isGod) gods.push(entry);
      else subagents.push(entry);
    }
  } catch {}
  return { gods, subagents };
}

export function listVaultFiles(): { path: string; name: string; type: 'file' | 'dir' }[] {
  const out: { path: string; name: string; type: 'file' | 'dir' }[] = [];
  if (!fs.existsSync(VAULT)) return out;
  function walk(dir: string, prefix: string) {
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.name.startsWith('.')) continue;
      const rel = prefix ? `${prefix}/${e.name}` : e.name;
      if (e.isDirectory()) {
        out.push({ path: rel, name: e.name, type: 'dir' });
        // Recurse into all directories so the VaultTree can show the full hierarchy.
        walk(path.join(dir, e.name), rel);
      } else if (e.name.endsWith('.md')) {
        out.push({ path: rel, name: e.name, type: 'file' });
      }
    }
  }
  walk(VAULT, '');
  return out;
}

export function readVaultFile(rel: string): string {
  const full = path.resolve(VAULT, rel);
  if (!full.startsWith(path.resolve(VAULT))) throw new Error('path traversal');
  return fs.readFileSync(full, 'utf-8');
}

export function writeVaultFile(rel: string, content: string): void {
  const full = path.resolve(VAULT, rel);
  if (!full.startsWith(path.resolve(VAULT))) throw new Error('path traversal');
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf-8');
}

export const OLYMPUS_INFO = {
  root: OLYMPUS_ROOT,
  vault: VAULT,
  metricsDir: METRICS_DIR,
  version: '0.0.1',
  ports: { ui: 3737, ttyd: 7681, code_server: 8080 },
};

export { GOD_META };
