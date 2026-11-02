/**
 * project-brief.ts — v0.0.41 (R41-01): the project's living brief.
 *
 * The profile card knew bytes and files; it did not know what the project is
 * DOING. This module joins the project's own documents, its dispatch plan and
 * the walk's durable state into one bounded brief: status, progress, the next
 * hops, the docs that matter, the memory files the walk keeps, and the brain
 * scope the gods actually have for this lane.
 *
 * Read-only, bounded and cached (20s per lane): a profile open never walks a
 * tree.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import fs from 'node:fs';
import path from 'node:path';
import { getVaultRoot } from './vault-root';

export type BriefStatus = 'running' | 'parked' | 'done' | 'idle';

export interface BriefHop {
  id: string;
  god: string;
  status: 'completed' | 'parked' | 'pending';
}

export interface ProjectBrief {
  status: BriefStatus;
  campaignId: string | null;
  completed: number;
  total: number;
  parked: number;
  /** The first pending hops — the project's next parts. */
  next: BriefHop[];
  /** The parked hop and its named cause, when there is one. */
  parkedHop: { hopId: string; reason: string; error?: string | null } | null;
  /** Top-level documents that describe the project. */
  docs: Array<{ name: string; title: string }>;
  /** The walk's durable memory files that are present. */
  memory: string[];
  /** What the gods can draw on for this lane. */
  scope: { instincts: number; knowledge: number; skills: number };
  updatedAt: string | null;
}

const CACHE_TTL_MS = 20_000;
const cache = new Map<string, { at: number; brief: ProjectBrief }>();

function readJson(file: string): any {
  try { return JSON.parse(fs.readFileSync(file, 'utf-8')); } catch { return null; }
}

function readTitle(file: string): string {
  try {
    const text = fs.readFileSync(file, 'utf-8').slice(0, 2200);
    const heading = /^#\s+(.+)$/m.exec(text)?.[1]?.trim();
    if (heading) return heading.slice(0, 90);
    const first = text.split('\n').map((l) => l.replace(/^[#>*\-\s]+/, '').trim()).find((l) => l.length > 2);
    return (first || path.basename(file)).slice(0, 90);
  } catch {
    return path.basename(file);
  }
}

function countFiles(dir: string, exts: string[], cap = 4000): number {
  let n = 0;
  const queue: Array<{ dir: string; depth: number }> = [{ dir, depth: 0 }];
  while (queue.length > 0 && n < cap) {
    const { dir: current, depth } = queue.shift()!;
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(current, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      if (n >= cap) break;
      if (entry.name.startsWith('.')) continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (depth < 4) queue.push({ dir: full, depth: depth + 1 });
      } else if (exts.some((e) => entry.name.endsWith(e))) {
        n += 1;
      }
    }
  }
  return n;
}

function countSkillDirs(repoRoot: string): number {
  try {
    return fs.readdirSync(path.join(repoRoot, '.opencode', 'skills'), { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith('_') && !e.name.startsWith('.')).length;
  } catch {
    return 0;
  }
}

function docsOf(root: string): Array<{ name: string; title: string }> {
  const docs: Array<{ name: string; title: string }> = [];
  const known = ['README.md', 'AGENTS.md', 'AIME.md', 'project.md', 'BRAND.md', 'DESIGN.md', 'ROADMAP.md', 'WORK-CARD.md'];
  const seen = new Set<string>();
  for (const name of known) {
    if (fs.existsSync(path.join(root, name))) {
      docs.push({ name, title: readTitle(path.join(root, name)) });
      seen.add(name.toLowerCase());
    }
  }
  try {
    const entries = fs.readdirSync(root, { withFileTypes: true })
      .filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.md') && !seen.has(e.name.toLowerCase()))
      .slice(0, 6);
    for (const entry of entries) docs.push({ name: entry.name, title: readTitle(path.join(root, entry.name)) });
  } catch { /* no docs */ }
  return docs.slice(0, 8);
}

/**
 * Build (or reuse) the brief. A missing directory is an honest empty brief,
 * never a fabricated "idle".
 */
export function buildProjectBrief(root: string | undefined): ProjectBrief {
  const empty: ProjectBrief = {
    status: 'idle', campaignId: null, completed: 0, total: 0, parked: 0,
    next: [], parkedHop: null, docs: [], memory: [], scope: { instincts: 0, knowledge: 0, skills: 0 }, updatedAt: null,
  };
  if (!root || !fs.existsSync(root)) return empty;
  const cached = cache.get(root);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.brief;

  const plan = readJson(path.join(root, 'dispatch-plan.json'));
  const hops = Array.isArray(plan?.hops) ? plan.hops : [];
  const state = readJson(path.join(root, '.olympus-hop-state.json'));
  const completedIds = new Set<string>(Array.isArray(state?.completed) ? state.completed.map(String) : []);
  const quarantined = new Set<string>(Array.isArray(state?.quarantined) ? state.quarantined.map(String) : []);
  const inFlight = Array.isArray(state?.inFlight) ? state.inFlight : [];
  const parked = state?.parked ? {
    hopId: String(state.parked.hopId || '?'),
    reason: String(state.parked.reason || 'unknown'),
    error: state.parked.error ? String(state.parked.error).slice(0, 240) : null,
  } : null;

  const rows = hops.map((h: any) => {
    const id = String(h?.id ?? '?');
    return {
      id,
      god: String(h?.god ?? 'god'),
      status: completedIds.has(id) ? 'completed' as const : (parked?.hopId === id || quarantined.has(id)) ? 'parked' as const : 'pending' as const,
    };
  });
  const completed = rows.filter((r) => r.status === 'completed').length;
  const parkedCount = rows.filter((r) => r.status === 'parked').length;
  const next = rows.filter((r) => r.status === 'pending').slice(0, 4);
  const status: BriefStatus = inFlight.length > 0
    ? 'running'
    : parked
      ? 'parked'
      : rows.length > 0 && completed >= rows.length
        ? 'done'
        : 'idle';

  const vault = getVaultRoot();
  const scope = {
    instincts: countFiles(path.join(vault, '05_Auto_Learning', 'instincts'), ['.json', '.md']),
    knowledge: countFiles(path.join(vault, '04_Knowledge', 'references'), ['.md']),
    skills: countSkillDirs(process.cwd()),
  };
  const memory = ['project.md', '_handoff.md', '.olympus-context.json', 'opencode.json']
    .filter((name) => fs.existsSync(path.join(root, name)));

  const brief: ProjectBrief = {
    status,
    campaignId: state?.campaignId ? String(state.campaignId) : null,
    completed,
    total: rows.length,
    parked: parkedCount,
    next,
    parkedHop: parked,
    docs: docsOf(root),
    memory,
    scope,
    updatedAt: state?.updatedAt ? String(state.updatedAt) : null,
  };
  cache.set(root, { at: Date.now(), brief });
  return brief;
}

/** Test seam. */
export function resetBriefCache(): void {
  cache.clear();
}
