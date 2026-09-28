/**
 * Project context — manages the active project + project notes in the vault.
 *
 * A "project" in Olympus is a folder on the user's machine that they want
 * Olympus to be aware of. Each project gets a note in
 * `~/OLYMPUS-VAULT/02_Projects/<slug>/project.md` with:
 *   - Frontmatter: slug, name, path, stacks, created, last_active
 *   - Body: notes, links to active instincts, detected markers
 *
 * The active project is persisted in `~/.olympus/active-project.json`
 * so the UI restores it on restart.
 *
 * This convention EXTENDS the existing Olympus pattern from `opencode.json`:
 *   god_delegations.storage = "02_Projects/<project>/_delegations/{...}/"
 *   plan_writer.path        = "02_Projects/<project>/plan.md"
 *
 * So we're not inventing a new convention — we're activating the one
 * that was unused.
 *
 * References:
 *  - OpenCode instincts and vault conventions (https://opencode.ai/docs)
 *  - VSCode Multi-root Workspaces (https://code.visualstudio.com/docs/editing/workspaces/multi-root-workspaces)
 *  - Obsidian tag taxonomy (https://forum.obsidian.md/t/how-to-structure-notes-categories-tags-and-folders/103125)
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { detectStacksWithFs, type StackDetection, type FsAdapter } from './stack-detector';

export interface ProjectNote {
  slug: string;
  name: string;
  path: string;
  stacks: string[];
  created: string;
  last_active: string;
  description?: string;
  vscodium_workspace?: string;
  /** P3 fix — dev-server port for the Live Preview pane. */
  livePreviewPort?: number;
}

export interface ActiveProjectFile {
  slug: string | null;
  ts: string;
}

export const VAULT = process.env.OLYMPUS_VAULT || path.join(os.homedir(), 'OLYMPUS-VAULT');
export const PROJECTS_DIR = path.join(VAULT, '02_Projects');
export const ACTIVE_FILE = path.join(os.homedir(), '.olympus', 'active-project.json');
export const WORKSPACES_DIR = path.join(os.homedir(), '.olympus', 'workspaces');

/** Slugify a project name for use as a folder name. */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

/** Ensure required directories exist. Idempotent. */
function ensureDirs() {
  for (const dir of [PROJECTS_DIR, WORKSPACES_DIR, path.dirname(ACTIVE_FILE)]) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }
}

/** Permissive YAML-ish frontmatter parser (matches olympus.ts style). */
export function parseFrontmatter(file: string): Record<string, any> {
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

/** List all known projects, sorted by last_active desc. */
export function listProjects(): ProjectNote[] {
  ensureDirs();
  const out: ProjectNote[] = [];
  try {
    for (const entry of fs.readdirSync(PROJECTS_DIR, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const notePath = path.join(PROJECTS_DIR, entry.name, 'project.md');
      if (!fs.existsSync(notePath)) continue;
      const fm = parseFrontmatter(notePath);
      out.push({
        slug: fm.slug || entry.name,
        name: fm.name || entry.name,
        path: fm.path || '',
        stacks: Array.isArray(fm.stacks) ? fm.stacks : [],
        created: fm.created || new Date().toISOString(),
        last_active: fm.last_active || new Date().toISOString(),
        description: fm.description,
        vscodium_workspace: fm.vscodium_workspace,
        livePreviewPort: typeof fm.livePreviewPort === 'number' ? fm.livePreviewPort : (typeof fm.live_preview_port === 'number' ? fm.live_preview_port : undefined),
      });
    }
  } catch {}
  return out.sort((a, b) => b.last_active.localeCompare(a.last_active));
}

/** Get one project by slug. Returns null if not found. */
export function getProject(slug: string): ProjectNote | null {
  const notePath = path.join(PROJECTS_DIR, slug, 'project.md');
  if (!fs.existsSync(notePath)) return null;
  const fm = parseFrontmatter(notePath);
  return {
    slug: fm.slug || slug,
    name: fm.name || slug,
    path: fm.path || '',
    stacks: Array.isArray(fm.stacks) ? fm.stacks : [],
    created: fm.created || new Date().toISOString(),
    last_active: fm.last_active || new Date().toISOString(),
    description: fm.description,
    vscodium_workspace: fm.vscodium_workspace,
    livePreviewPort: typeof fm.livePreviewPort === 'number' ? fm.livePreviewPort : (typeof fm.live_preview_port === 'number' ? fm.live_preview_port : undefined),
  };
}

export interface CreateProjectInput {
  name: string;
  path: string;
  stacks?: string[];
  frameworks?: string[];
  description?: string;
}

export interface CreateProjectResult {
  project: ProjectNote;
  detection: StackDetection;
  vscodiumWorkspace: string;
}

/**
 * Create a new project note + workspace file + delegation folders.
 * Throws if the project already exists or the path is invalid.
 */
export function createProject(input: CreateProjectInput): CreateProjectResult {
  ensureDirs();
  const slug = slugify(input.name);
  if (!slug) throw new Error('Project name must produce a non-empty slug');

  const projectDir = path.join(PROJECTS_DIR, slug);
  if (fs.existsSync(projectDir)) {
    throw new Error(`Project "${slug}" already exists. Use updateProject() or pick a different name.`);
  }
  if (!fs.existsSync(input.path) || !fs.statSync(input.path).isDirectory()) {
    throw new Error(`Project path does not exist or is not a directory: ${input.path}`);
  }

  fs.mkdirSync(projectDir, { recursive: true });

  // Run stack detection synchronously (we're already on the server)
  const fsAdapter: FsAdapter = {
    existsSync: (p) => fs.existsSync(p),
    readFileSync: (p) => fs.readFileSync(p, 'utf-8'),
    statSync: (p) => fs.statSync(p),
  };
  const detection = detectStacksWithFs(input.path, fsAdapter);

  const stacks = input.stacks && input.stacks.length > 0 ? input.stacks : detection.stacks;
  const now = new Date().toISOString();

  // Generate VSCodium workspace file (multi-root compatible)
  const workspacePath = path.join(WORKSPACES_DIR, `${slug}.code-workspace`);
  const workspaceContent = {
    folders: [{ path: input.path }],
    settings: {
      'olympus.projectSlug': slug,
      'olympus.projectName': input.name,
      'olympus.projectStacks': stacks,
      'olympus.vaultPath': VAULT,
    },
  };
  fs.writeFileSync(workspacePath, JSON.stringify(workspaceContent, null, 2), 'utf-8');

  // P3 FIX: allocate a free dev-server port for the Live Preview pane.
  // Deterministic per-slug so the port is stable across restarts. Persisted
  // in the project note frontmatter as `livePreviewPort`.
  const livePreviewPort = allocateFreePort(3001, slug);

  const project: ProjectNote = {
    slug,
    name: input.name,
    path: input.path,
    stacks,
    created: now,
    last_active: now,
    description: input.description,
    vscodium_workspace: workspacePath,
    livePreviewPort,
  };

  // Write project note (frontmatter + body)
  const foundMarkers = detection.markers.filter(m => m.found);
  const noteContent = `---
type: project
slug: ${slug}
name: ${input.name}
path: ${input.path}
stacks: [${stacks.join(', ')}]
created: ${now}
last_active: ${now}
vscodium_workspace: ${workspacePath}
livePreviewPort: ${livePreviewPort}
description: ${(input.description || '').replace(/\n/g, ' ')}
---

# ${input.name}

> Olympus project note. Auto-generated by the Project Switcher.
> Edit freely — frontmatter is parsed, body is yours.

## Stack
${stacks.length > 0 ? stacks.map(s => `- \`${s}\``).join('\n') : '- (none detected — set manually in frontmatter)'}

## Detected Markers
${foundMarkers.length > 0 ? foundMarkers.map(m => `- \`${m.file}\` → \`${m.stack}\``).join('\n') : '- (none)'}

## Active Instincts
> Instincts with \`scope: project\` and \`projects: [${slug}]\` will be filtered
> into the brain atlas when this project is active.
>
> Tag an existing instinct in Obsidian with \`projects: [${slug}]\` in its
> frontmatter to scope it to this project. Callimachus will surface it on
> the next heartbeat.

## Delegations
> Apollo dispatches delegations to \`_delegations/inbox/\` here.
> See \`opencode.json#god_delegations.storage\`.

## Notes
- Created: ${now}
- Path: \`${input.path}\`
- VSCodium workspace: \`${workspacePath}\`
`;
  fs.writeFileSync(path.join(projectDir, 'project.md'), noteContent, 'utf-8');

  // Touch _delegations inbox folders (the god_delegations.storage convention)
  for (const sub of ['inbox', 'processing', 'done', 'escalated']) {
    fs.mkdirSync(path.join(projectDir, '_delegations', sub), { recursive: true });
  }

  // P3 FIX: write per-project brain-scoping context file. Apollo reads this
  // when generating prompts to know which instincts/knowledge to surface for
  // this specific project. The brain is global + evolutive; this file just
  // polishes which slice of the brain is most relevant.
  const contextFile = path.join(projectDir, '.olympus-context.json');
  const brainScopeRules = {
    instinctsMinConfidence: 0.6,
    knowledgeCategories: deriveKnowledgeCategories(stacks),
    activeGods: deriveActiveGods(stacks),
  };
  const contextJson = {
    slug,
    name: input.name,
    path: input.path,
    stacks,
    livePreviewPort,
    vscodiumWorkspace: workspacePath,
    createdAt: now,
    brainScopeRules,
  };
  try {
    fs.writeFileSync(contextFile, JSON.stringify(contextJson, null, 2), 'utf-8');
  } catch {
    // Non-fatal — the project is still created; Apollo falls back to defaults.
  }

  return { project, detection, vscodiumWorkspace: workspacePath };
}

/**
 * P3 helper — allocate a dev-server port for the Live Preview pane.
 *
 * We pick a deterministic port based on a slug hash in range [3001, 3099].
 * This avoids the need for async port probing (createProject is synchronous)
 * and gives stable ports across restarts (the Live Preview iframe can cache
 * the URL). The user can override via frontmatter if a port conflicts.
 */
function allocateFreePort(start: number, slug?: string): number {
  if (!slug) return start;
  // Simple deterministic hash (djb2) → [0, 99].
  let h = 5381;
  for (let i = 0; i < slug.length; i++) {
    h = ((h << 5) + h + slug.charCodeAt(i)) | 0;
  }
  const offset = Math.abs(h) % 100;
  return start + offset;
}

/** P3 helper — derive knowledge categories from project stacks. */
function deriveKnowledgeCategories(stacks: string[]): string[] {
  const cats = new Set<string>();
  for (const s of stacks) {
    const lower = s.toLowerCase();
    if (['react', 'next', 'vue', 'svelte', 'tailwind', 'css', 'html'].includes(lower)) cats.add('frontend');
    if (['node', 'bun', 'python', 'rust', 'go', 'java'].includes(lower)) cats.add('backend');
    if (['postgres', 'mongodb', 'redis', 'sql'].includes(lower)) cats.add('database');
    if (['docker', 'kubernetes', 'aws', 'gcp', 'azure', 'vercel'].includes(lower)) cats.add('devops');
    if (['graphql', 'rest'].includes(lower)) cats.add('integrations');
  }
  return cats.size > 0 ? Array.from(cats) : ['frontend', 'backend'];
}

/** P3 helper — derive which gods are most active for the project's stacks. */
function deriveActiveGods(stacks: string[]): string[] {
  // Always include Apollo (master planner) + Hephaestus (code).
  const gods = new Set<string>(['apollo', 'hephaestus']);
  for (const s of stacks) {
    const lower = s.toLowerCase();
    if (['react', 'next', 'vue', 'svelte', 'tailwind', 'css', 'html'].includes(lower)) gods.add('athena');
    if (['graphql', 'rest', 'webhook'].includes(lower)) gods.add('hermes');
    if (['postgres', 'mongodb', 'redis', 'sql'].includes(lower)) gods.add('persephone');
    if (['docker', 'kubernetes', 'aws', 'gcp', 'azure', 'vercel'].includes(lower)) gods.add('prometheus');
    if (['jest', 'vitest', 'cypress', 'playwright'].includes(lower)) gods.add('dionysus');
  }
  return Array.from(gods);
}

/** Update a project note's frontmatter. Preserves the body. */
export function updateProject(slug: string, patch: Partial<ProjectNote>): ProjectNote {
  const projectDir = path.join(PROJECTS_DIR, slug);
  const notePath = path.join(projectDir, 'project.md');
  if (!fs.existsSync(notePath)) throw new Error(`Project "${slug}" not found`);

  const fm = parseFrontmatter(notePath);
  const updated: ProjectNote = {
    slug,
    name: patch.name ?? fm.name ?? slug,
    path: patch.path ?? fm.path ?? '',
    stacks: patch.stacks ?? (Array.isArray(fm.stacks) ? fm.stacks : []),
    created: fm.created || new Date().toISOString(),
    last_active: new Date().toISOString(),
    description: patch.description ?? fm.description,
    vscodium_workspace: patch.vscodium_workspace ?? fm.vscodium_workspace,
    livePreviewPort: patch.livePreviewPort ?? (typeof fm.livePreviewPort === 'number' ? fm.livePreviewPort : (typeof fm.live_preview_port === 'number' ? fm.live_preview_port : undefined)),
  };

  // Preserve body
  let body = '';
  try {
    const raw = fs.readFileSync(notePath, 'utf-8');
    const m = raw.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n([\s\S]*)$/);
    if (m) body = m[1];
  } catch {}

  const newFrontmatter = `---
type: project
slug: ${updated.slug}
name: ${updated.name}
path: ${updated.path}
stacks: [${updated.stacks.join(', ')}]
created: ${updated.created}
last_active: ${updated.last_active}
vscodium_workspace: ${updated.vscodium_workspace || ''}
${updated.livePreviewPort ? `livePreviewPort: ${updated.livePreviewPort}\n` : ''}description: ${(updated.description || '').replace(/\n/g, ' ')}
---

`;
  fs.writeFileSync(notePath, newFrontmatter + body, 'utf-8');
  return updated;
}

/**
 * Delete a project by moving it to 09_Archive/projects/<slug>-<ts>/.
 * Never permanently deletes — always recoverable from the archive.
 */
export function deleteProject(slug: string): void {
  const projectDir = path.join(PROJECTS_DIR, slug);
  if (!fs.existsSync(projectDir)) return;

  const archiveDir = path.join(VAULT, '09_Archive', 'projects', `${slug}-${Date.now()}`);
  fs.mkdirSync(path.dirname(archiveDir), { recursive: true });
  fs.renameSync(projectDir, archiveDir);

  // If this was the active project, clear it
  const active = getActiveProjectSlug();
  if (active === slug) setActiveProject(null);
}

/** Read the active project slug from the persisted state file. */
export function getActiveProjectSlug(): string | null {
  try {
    if (!fs.existsSync(ACTIVE_FILE)) return null;
    const data: ActiveProjectFile = JSON.parse(fs.readFileSync(ACTIVE_FILE, 'utf-8'));
    return data.slug;
  } catch { return null; }
}

/** Get the full active project note (or null if none / not found). */
export function getActiveProject(): ProjectNote | null {
  const slug = getActiveProjectSlug();
  if (!slug) return null;
  return getProject(slug);
}

/** Set the active project (or clear it with null). */
export function setActiveProject(slug: string | null): void {
  ensureDirs();
  const data: ActiveProjectFile = { slug, ts: new Date().toISOString() };
  fs.writeFileSync(ACTIVE_FILE, JSON.stringify(data, null, 2), 'utf-8');
  if (slug) {
    // Bump last_active on the project note
    try { updateProject(slug, {}); } catch {}
  }
}

/**
 * Convenience: get the active project + its stacks as an ActiveProject
 * (the shape consumed by instinct-scope.filterInstinct).
 */
export function getActiveProjectContext(): import('./instinct-scope').ActiveProject | null {
  const p = getActiveProject();
  if (!p) return null;
  return {
    slug: p.slug,
    name: p.name,
    path: p.path,
    stacks: p.stacks,
  };
}
