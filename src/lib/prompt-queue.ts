/**
 * prompt-queue.ts — v0.0.64: the shared prompt queue, one file per project.
 *
 * The creative screen (phone or desktop) can ENQUEUE a request without
 * dispatching it; the user sends it to Apollo when ready. The queue is a user
 * file (`~/.olympus/prompt-queue.json`), never campaign state — a queue item
 * that was never sent is not a lost hop.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export type PromptPriority = 'high' | 'normal' | 'low';

export interface PromptReference {
  name: string;
  library?: string;
  category?: string;
  demoUrl?: string;
  what?: string;
  fetchLane?: string;
}

export interface PromptQueueItem {
  id: string;
  project: string;
  text: string;
  createdAt: string;
  status: 'queued' | 'sending' | 'sent';
  sentAt?: string;
  /** v0.0.81 — where the prompt was composed. Markview is a first-class lane. */
  source?: 'terminal' | 'creative' | 'phone' | 'markview';
  /** The god whose creative session produced it (creative items only). */
  god?: string;
  /** v0.0.82 — high items are drained first and auto-sent when the terminal is idle. */
  priority?: PromptPriority;
  /** v0.0.82 — the reference that seeded the prompt (markview). */
  reference?: PromptReference;
}

const HOME = process.env.OLYMPUS_HOME || path.join(os.homedir(), '.olympus');
const FILE = path.join(HOME, 'prompt-queue.json');

function read(): PromptQueueItem[] {
  try {
    const raw = JSON.parse(fs.readFileSync(FILE, 'utf-8'));
    return Array.isArray(raw?.items) ? raw.items.filter((i: any) => i && typeof i.text === 'string') : [];
  } catch { return []; }
}

function write(items: PromptQueueItem[]): void {
  try {
    fs.mkdirSync(HOME, { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify({ version: 1, items }, null, 2) + '\n', { mode: 0o600 });
  } catch { /* a queue write failure never blocks the request */ }
}

const PRIORITY_RANK: Record<PromptPriority, number> = { high: 0, normal: 1, low: 2 };

export function listQueue(project?: string): PromptQueueItem[] {
  const all = read();
  return (project ? all.filter((i) => i.project === project) : all).sort((a, b) => {
    const pa = PRIORITY_RANK[a.priority ?? 'normal'] ?? 1;
    const pb = PRIORITY_RANK[b.priority ?? 'normal'] ?? 1;
    return pa - pb || a.createdAt.localeCompare(b.createdAt);
  });
}

function cleanReference(r: any): PromptReference | undefined {
  if (!r || typeof r !== 'object') return undefined;
  const name = String(r.name || '').trim().slice(0, 120);
  if (!name) return undefined;
  const out: PromptReference = { name };
  if (typeof r.library === 'string' && r.library.trim()) out.library = r.library.trim().slice(0, 80);
  if (typeof r.category === 'string' && r.category.trim()) out.category = r.category.trim().slice(0, 80);
  if (typeof r.demoUrl === 'string' && /^https?:\/\//.test(r.demoUrl)) out.demoUrl = r.demoUrl.slice(0, 500);
  if (typeof r.what === 'string' && r.what.trim()) out.what = r.what.trim().slice(0, 500);
  if (typeof r.fetchLane === 'string' && r.fetchLane.trim()) out.fetchLane = r.fetchLane.trim().slice(0, 300);
  return out;
}

export function enqueuePrompt(project: string, text: string, now = Date.now(), meta: { source?: 'terminal' | 'creative' | 'phone' | 'markview'; god?: string; priority?: PromptPriority; reference?: PromptReference } = {}): PromptQueueItem | null {
  const clean = String(text || '').trim().slice(0, 4000);
  if (!clean) return null;
  // v0.0.77 — THE DEDUPE. Before a god's suggestion is queued, the queue is
  // checked for the same project + normalized text: an error already waiting
  // for a fix is not enqueued twice (the user's "check if it is already in
  // the queue" rule).
  const norm = (v: string) => v.toLowerCase().replace(/\s+/g, ' ').trim();
  const projectKey = String(project || '').trim() || 'unknown';
  const duplicate = read().some((i) => i.status === 'queued' && i.project === projectKey && norm(i.text) === norm(clean));
  if (duplicate) return null;
  const item: PromptQueueItem = {
    id: `pq-${now.toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    project: String(project || '').trim() || 'unknown',
    text: clean,
    createdAt: new Date(now).toISOString(),
    status: 'queued',
    ...(meta.source ? { source: meta.source } : {}),
    ...(meta.god ? { god: meta.god } : {}),
    ...(meta.priority ? { priority: meta.priority } : {}),
    ...(cleanReference(meta.reference) ? { reference: cleanReference(meta.reference) } : {}),
  };
  write([...read(), item]);
  return item;
}

export function markQueueItem(id: string, status: 'queued' | 'sending' | 'sent', now = Date.now()): PromptQueueItem | null {
  const all = read();
  const idx = all.findIndex((i) => i.id === id);
  if (idx < 0) return null;
  all[idx] = {
    ...all[idx],
    status,
    ...(status === 'sent' ? { sentAt: new Date(now).toISOString() } : {}),
  };
  write(all);
  return all[idx];
}

export function removeQueueItem(id: string): boolean {
  const all = read();
  const next = all.filter((i) => i.id !== id);
  if (next.length === all.length) return false;
  write(next);
  return true;
}
