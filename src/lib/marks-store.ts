/**
 * marks-store.ts — v0.0.92: marks survive the window, the reload and the app.
 *
 * The large preview window used to keep the mark queue in localStorage only:
 * close the window, change machine, or open the phone and the batch was gone.
 * This store keeps one JSON file per project under ~/.olympus/marks, written
 * atomically, so the queue can be copied to Apollo (or Athena) later.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { PreviewMark } from './marks-format';

export type { PreviewMark };

const MAX_MARKS = 100;
const MAX_INSTRUCTION = 2000;
const MAX_PAGE = 1000;

function marksDir(): string {
  const home = process.env.OLYMPUS_HOME || path.join(os.homedir(), '.olympus');
  return path.join(home, 'marks');
}

function safeSlug(slug: string): string {
  const clean = String(slug || '').trim().replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
  return clean || '_global';
}

function marksPath(slug: string): string {
  return path.join(marksDir(), `${safeSlug(slug)}.json`);
}

function cleanMark(input: any, slug: string): PreviewMark | null {
  const x = Number(input?.x);
  const y = Number(input?.y);
  const instruction = String(input?.instruction ?? '').trim().slice(0, MAX_INSTRUCTION);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !instruction) return null;
  const vw = Number(input?.viewport?.width);
  const vh = Number(input?.viewport?.height);
  return {
    id: typeof input?.id === 'string' && input.id.trim() ? input.id.trim().slice(0, 120) : `mark-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    x: Math.round(x),
    y: Math.round(y),
    page: String(input?.page ?? '/').trim().slice(0, MAX_PAGE) || '/',
    instruction,
    viewport: Number.isFinite(vw) && Number.isFinite(vh)
      ? { width: Math.max(0, Math.round(vw)), height: Math.max(0, Math.round(vh)) }
      : undefined,
    url: input?.url ? String(input.url).slice(0, MAX_PAGE) : undefined,
    createdAt: typeof input?.createdAt === 'string' ? input.createdAt : new Date().toISOString(),
  };
}

export function readMarks(slug: string): PreviewMark[] {
  try {
    const raw = JSON.parse(fs.readFileSync(marksPath(slug), 'utf-8'));
    if (!Array.isArray(raw)) return [];
    return raw.map((m) => cleanMark(m, slug)).filter((m): m is PreviewMark => Boolean(m)).slice(-MAX_MARKS);
  } catch {
    return [];
  }
}

export function writeMarks(slug: string, marks: any[]): PreviewMark[] {
  const clean = (Array.isArray(marks) ? marks : [])
    .map((m) => cleanMark(m, slug))
    .filter((m): m is PreviewMark => Boolean(m))
    .slice(-MAX_MARKS);
  const file = marksPath(slug);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(clean, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(tmp, file);
  try { fs.chmodSync(file, 0o600); } catch { /* best effort */ }
  return clean;
}

export function addMark(slug: string, mark: any): PreviewMark[] {
  const next = cleanMark(mark, slug);
  if (!next) return readMarks(slug);
  return writeMarks(slug, [...readMarks(slug), next]);
}

export function removeMark(slug: string, id: string): PreviewMark[] {
  return writeMarks(slug, readMarks(slug).filter((m) => m.id !== id));
}

export function clearMarks(slug: string): PreviewMark[] {
  return writeMarks(slug, []);
}
