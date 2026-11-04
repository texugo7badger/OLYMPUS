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

export interface PromptQueueItem {
  id: string;
  project: string;
  text: string;
  createdAt: string;
  status: 'queued' | 'sent';
  sentAt?: string;
  /** v0.0.71 — where the prompt was composed: the terminal or the creative. */
  source?: 'terminal' | 'creative';
  /** The god whose creative session produced it (creative items only). */
  god?: string;
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

export function listQueue(project?: string): PromptQueueItem[] {
  const all = read();
  return (project ? all.filter((i) => i.project === project) : all).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function enqueuePrompt(project: string, text: string, now = Date.now(), meta: { source?: 'terminal' | 'creative'; god?: string } = {}): PromptQueueItem | null {
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
  };
  write([...read(), item]);
  return item;
}

export function markQueueItem(id: string, status: 'sent', now = Date.now()): PromptQueueItem | null {
  const all = read();
  const idx = all.findIndex((i) => i.id === id);
  if (idx < 0) return null;
  all[idx] = { ...all[idx], status, sentAt: new Date(now).toISOString() };
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
