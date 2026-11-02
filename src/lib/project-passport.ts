/**
 * project-passport.ts — v0.0.48 (R48-01): the project can travel.
 *
 * A passport is the portable identity of a project — name, stacks, summary,
 * live brief, docs and design memory — WITHOUT the code tree and WITHOUT
 * absolute home paths. Another OLYMPUS can import it as a starting lane and
 * inherit the intent + saved preferences.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import fs from 'node:fs';
import path from 'node:path';
import { getVaultRoot } from './vault-root';
import { createProject, getProject } from './project-context';
import { detectProjectStacks, projectSummary, readProjectPackage, folderName } from './project-summary';
import { buildProjectBrief } from './project-brief';
import { listDesignMemory, saveDesignMemory } from './design-memory';

export interface ProjectPassport {
  kind: 'olympus-project-passport';
  version: 1;
  exportedAt: string;
  project: {
    slug: string;
    name: string;
    stacks: string[];
    description: string;
    brief: { status: string; completed: number; total: number; parked: number };
    docs: Array<{ name: string; title: string }>;
  };
  designMemory: Array<{ id: string; name: string; library: string; category: string; demoUrl: string; note: string }>;
}

/** Build a passport from the live project. Read-only. */
export function exportProjectPassport(slug: string): ProjectPassport {
  const note = getProject(slug);
  if (!note) throw new Error(`project not found: ${slug}`);
  const root = note.path;
  const pkg = readProjectPackage(root);
  const stacks = Array.from(new Set([...(note.stacks || []), ...detectProjectStacks(root, pkg)]));
  const brief = buildProjectBrief(root);
  const description = projectSummary({ slug: note.slug, pkg, root, stacks, files: brief.total, port: note.livePreviewPort });
  return {
    kind: 'olympus-project-passport',
    version: 1,
    exportedAt: new Date().toISOString(),
    project: {
      // The folder name, lowercase — never a display alias.
      slug: folderName(note.slug),
      name: folderName(note.slug),
      stacks,
      description,
      brief: { status: brief.status, completed: brief.completed, total: brief.total, parked: brief.parked },
      docs: brief.docs.map((d) => ({ name: d.name, title: d.title })),
    },
    designMemory: listDesignMemory(note.slug).map((m) => ({
      id: m.id, name: m.name, library: m.library, category: m.category, demoUrl: m.demoUrl, note: m.note,
    })),
  };
}

/** Validate a passport before touching the vault. Pure. */
export function validatePassport(input: unknown): { ok: true; passport: ProjectPassport } | { ok: false; error: string } {
  const p = input as Partial<ProjectPassport> | null;
  if (!p || p.kind !== 'olympus-project-passport' || p.version !== 1) {
    return { ok: false, error: 'not an OLYMPUS project passport (kind/version)' };
  }
  const slug = folderName(String(p.project?.slug || ''));
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(slug)) return { ok: false, error: 'passport slug is invalid' };
  return {
    ok: true,
    passport: {
      kind: 'olympus-project-passport',
      version: 1,
      exportedAt: String(p.exportedAt || new Date().toISOString()),
      project: {
        slug,
        name: slug,
        stacks: Array.isArray(p.project?.stacks) ? p.project.stacks.map(String).slice(0, 24) : [],
        description: String(p.project?.description || '').slice(0, 400),
        brief: p.project?.brief ?? { status: 'idle', completed: 0, total: 0, parked: 0 },
        docs: Array.isArray(p.project?.docs) ? p.project.docs.slice(0, 8).map((d) => ({ name: String(d.name), title: String(d.title) })) : [],
      },
      designMemory: Array.isArray(p.designMemory)
        ? p.designMemory.slice(0, 200).filter((m) => m && m.id && m.name).map((m) => ({
            id: String(m.id), name: String(m.name), library: String(m.library || ''), category: String(m.category || ''),
            demoUrl: String(m.demoUrl || ''), note: String(m.note || ''),
          }))
        : [],
    },
  };
}

/**
 * Import as a NEW lane at 02_Projects/<slug>. Refuses to overwrite an
 * existing project; the design memory is copied to the new slug.
 */
export function importProjectPassport(input: unknown): { ok: true; slug: string; created: boolean } | { ok: false; error: string } {
  const verdict = validatePassport(input);
  if (!verdict.ok) return verdict;
  const passport = verdict.passport;
  const slug = passport.project.slug;
  if (getProject(slug)) return { ok: false, error: `project "${slug}" already exists — import under a different name or open the existing one` };
  const lane = path.join(getVaultRoot(), '02_Projects', slug);
  try {
    fs.mkdirSync(lane, { recursive: true });
    createProject({
      name: slug,
      path: lane,
      stacks: passport.project.stacks,
      description: passport.project.description,
    });
    for (const m of passport.designMemory) {
      saveDesignMemory({ ...m, projectSlug: slug });
    }
    return { ok: true, slug, created: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
}
