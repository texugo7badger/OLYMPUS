/**
 * learning/active-context.ts — v0.1.3: project/stack truth for scoped retrieval.
 *
 * The active project is persisted as a slug in ~/.olympus/active-project.json;
 * its stacks live in the project note. Both server modules and the compiled
 * overlay plugin can read this without importing a Next-only module.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getVaultRoot } from '../vault-root';

export interface ActiveContext {
  slug: string | null;
  stacks: string[];
}

function parseStacks(raw: string): string[] {
  const m = raw.match(/^stacks:\s*\[([^\]]*)\]/m);
  if (!m) return [];
  return m[1]
    .split(',')
    .map((s) => s.trim().replace(/^["']|["']$/g, ''))
    .filter(Boolean);
}

export function getActiveContext(): ActiveContext {
  const envSlug = String(process.env.OLYMPUS_ACTIVE_PROJECT || '').trim();
  const envStacks = String(process.env.OLYMPUS_ACTIVE_STACK || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const home = process.env.OLYMPUS_HOME || path.join(os.homedir(), '.olympus');
  let slug = envSlug || null;
  if (!slug) {
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(home, 'active-project.json'), 'utf-8'));
      if (typeof raw?.slug === 'string' && raw.slug) slug = raw.slug;
    } catch { /* no active project */ }
  }
  if (!slug) return { slug: null, stacks: envStacks };

  let stacks = envStacks;
  if (stacks.length === 0) {
    try {
      const note = fs.readFileSync(path.join(getVaultRoot(), '02_Projects', slug, 'project.md'), 'utf-8');
      stacks = parseStacks(note);
    } catch { /* the project note may not exist yet */ }
  }
  return { slug, stacks };
}

/** The shape expected by src/lib/instinct-scope.ts. */
export function activeProjectForScope(ctx: ActiveContext = getActiveContext()) {
  if (!ctx.slug) return null;
  return { slug: ctx.slug, name: ctx.slug, path: '', stacks: ctx.stacks };
}
