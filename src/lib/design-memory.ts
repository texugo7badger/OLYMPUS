/**
 * design-memory.ts — v0.0.43 (R43-04): named preferences that survive.
 *
 * The reference catalog was read-only inspiration: the user could use or
 * queue a component, but nothing remembered WHICH references they chose and
 * why. Design memory is a small per-project list of saved references with a
 * note (the "named preference"). It lives at ~/.olympus/design-memory.json,
 * is capped, deduped and written atomically.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface DesignMemoryEntry {
  id: string;
  name: string;
  library: string;
  category: string;
  demoUrl: string;
  /** The user's reason / the reference's own promise. */
  note: string;
  projectSlug: string;
  savedAt: string;
}

const MAX_ENTRIES = 200;
const FILE = path.join(process.env.OLYMPUS_HOME || path.join(os.homedir(), '.olympus'), 'design-memory.json');

function readAll(): DesignMemoryEntry[] {
  try {
    const parsed = JSON.parse(fs.readFileSync(FILE, 'utf-8'));
    return Array.isArray(parsed) ? parsed.filter((e) => e && typeof e.id === 'string' && typeof e.name === 'string') : [];
  } catch {
    return [];
  }
}

function writeAll(entries: DesignMemoryEntry[]): void {
  const dir = path.dirname(FILE);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(entries.slice(-MAX_ENTRIES), null, 2) + '\n', 'utf-8');
  fs.renameSync(tmp, FILE);
}

export function listDesignMemory(projectSlug?: string | null): DesignMemoryEntry[] {
  const all = readAll();
  const filtered = projectSlug ? all.filter((e) => e.projectSlug === projectSlug) : all;
  return filtered.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

export function saveDesignMemory(input: {
  id: string;
  name: string;
  library?: string;
  category?: string;
  demoUrl?: string;
  note?: string;
  projectSlug?: string;
}): DesignMemoryEntry {
  const id = String(input.id || '').slice(0, 160);
  if (!id) throw new Error('id is required');
  const entry: DesignMemoryEntry = {
    id,
    name: String(input.name || id).slice(0, 160),
    library: String(input.library || '').slice(0, 60),
    category: String(input.category || '').slice(0, 60),
    demoUrl: String(input.demoUrl || '').slice(0, 500),
    note: String(input.note || '').slice(0, 600),
    projectSlug: String(input.projectSlug || '').slice(0, 120),
    savedAt: new Date().toISOString(),
  };
  const all = readAll().filter((e) => !(e.id === id && e.projectSlug === entry.projectSlug));
  all.push(entry);
  writeAll(all);
  return entry;
}

export function removeDesignMemory(id: string, projectSlug?: string | null): boolean {
  const all = readAll();
  const next = all.filter((e) => !(e.id === id && (!projectSlug || e.projectSlug === projectSlug)));
  if (next.length === all.length) return false;
  writeAll(next);
  return true;
}
