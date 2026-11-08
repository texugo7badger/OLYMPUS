/**
 * god-inbox.ts — v0.0.86: one god, one durable terminal.
 *
 * THE SPECIMEN: the Parthenon had a per-god chat modal (v0.0.76) that was
 * memory-only — close it and the conversation was gone. A mark-preview edit
 * (`/api/olympus/athena/edit`) spawned a detached `opencode run` with
 * `stdio: 'ignore'`, so the user's mark never appeared in Athena's terminal
 * and her answer was nowhere: the mark "reached" a process, not the god the
 * user was looking at.
 *
 * This module is the shared, hash-free (append-only JSON) inbox every god
 * surface reads and writes:
 *   - the chat route appends the user turn and each god reply;
 *   - the Athena mark route appends the mark, marks it running, then done or
 *     failed with the reply;
 *   - the Parthenon's god chat renders the inbox as the conversation.
 *
 * Shape: `{ "athena": [entry, ...] }` at `~/.olympus/god-inbox.json`, one
 * bounded list per god (last 200 entries). Writes are synchronous
 * read-modify-write so two route handlers in the same process cannot
 * interleave; the file is 0600 because prompts can carry project content.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export type GodInboxRole = 'you' | 'god' | 'system';
export type GodInboxSource = 'chat' | 'mark' | 'dispatch' | 'system' | 'quick-edit';
export type GodInboxStatus = 'pending' | 'running' | 'done' | 'failed';

export interface GodInboxEntry {
  id: string;
  ts: string;
  god: string;
  role: GodInboxRole;
  text: string;
  source: GodInboxSource;
  status?: GodInboxStatus;
  /** The inbox entry this one answers (a god reply → the user/mark entry). */
  replyTo?: string | null;
  meta?: Record<string, unknown> | null;
}

type InboxFile = Record<string, GodInboxEntry[]>;

const MAX_PER_GOD = 200;

export function godInboxPath(): string {
  const home = process.env.OLYMPUS_HOME || path.join(os.homedir(), '.olympus');
  return path.join(home, 'god-inbox.json');
}

function readFile(file: string): InboxFile {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf-8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as InboxFile : {};
  } catch {
    return {};
  }
}

/** Oldest → newest, so a renderer can append without reversing. */
export function readGodInbox(god: string, limit = 60, file = godInboxPath()): GodInboxEntry[] {
  const key = String(god || '').toLowerCase();
  const list = readFile(file)[key];
  if (!Array.isArray(list)) return [];
  const clean = list.filter((e) => e && typeof e.id === 'string' && typeof e.text === 'string');
  const n = Math.max(1, Math.min(MAX_PER_GOD, Number(limit) || 60));
  return clean.slice(-n);
}

export function appendGodInbox(
  god: string,
  entry: Omit<GodInboxEntry, 'id' | 'ts' | 'god'> & { id?: string; ts?: string },
  file = godInboxPath(),
): GodInboxEntry {
  const key = String(god || '').toLowerCase();
  const full: GodInboxEntry = {
    id: entry.id || `inbox-${crypto.randomUUID()}`,
    ts: entry.ts || new Date().toISOString(),
    god: key,
    role: entry.role,
    text: String(entry.text ?? ''),
    source: entry.source,
    status: entry.status,
    replyTo: entry.replyTo ?? null,
    meta: entry.meta ?? null,
  };
  const all = readFile(file);
  const list = Array.isArray(all[key]) ? all[key] : [];
  list.push(full);
  all[key] = list.slice(-MAX_PER_GOD);
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(all, null, 2) + '\n', { mode: 0o600 });
    fs.renameSync(tmp, file);
    try { fs.chmodSync(file, 0o600); } catch { /* best effort */ }
  } catch {
    /* the inbox is helpful, never fatal to the turn */
  }
  return full;
}

/** Patch one entry in place (status, replyTo, text). Returns the entry or null. */
export function updateGodInbox(
  god: string,
  id: string,
  patch: Partial<Pick<GodInboxEntry, 'status' | 'text' | 'replyTo' | 'meta'>>,
  file = godInboxPath(),
): GodInboxEntry | null {
  const key = String(god || '').toLowerCase();
  const all = readFile(file);
  const list = Array.isArray(all[key]) ? all[key] : [];
  const idx = list.findIndex((e) => e.id === id);
  if (idx < 0) return null;
  const next = { ...list[idx], ...patch } as GodInboxEntry;
  list[idx] = next;
  all[key] = list;
  try {
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(all, null, 2) + '\n', { mode: 0o600 });
    fs.renameSync(tmp, file);
    try { fs.chmodSync(file, 0o600); } catch { /* best effort */ }
  } catch {
    /* best effort */
  }
  return next;
}

/** How many marks are still waiting on a god (the Parthenon badge). */
export function pendingGodInboxCount(god: string, file = godInboxPath()): number {
  return readGodInbox(god, MAX_PER_GOD, file)
    .filter((e) => e.source === 'mark' && (e.status === 'pending' || e.status === 'running'))
    .length;
}
