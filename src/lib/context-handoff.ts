/**
 * context-handoff.ts — v0.0.84: a clean context window that still knows the work.
 *
 * When the context window approaches 100%, a plain "new session" is safe for
 * the model but cruel to the user: the next turn has to re-explain everything.
 * Re-injecting the whole transcript is worse — measured 53% → 82% on the first
 * message, which defeats the reset.
 *
 * The handoff is the middle path, and it is deliberately a FILE, not context:
 *   - the client captures a COMPACT brief (last meaningful messages, truncated);
 *   - the reset-session route writes it under ~/.olympus/handoffs/ (0600);
 *   - the fresh session receives ONE short prompt with the absolute path and
 *     reads the brief on demand. The file costs zero context until read, and
 *     Apollo can cite it instead of hallucinating the history.
 *
 * Bounded by construction: MAX_HANDOFF_CHARS. A handoff that carries the old
 * conversation in full is not a handoff.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const MAX_HANDOFF_CHARS = 16_000;

const HOME = process.env.OLYMPUS_HOME || path.join(os.homedir(), '.olympus');
const DIR = path.join(HOME, 'handoffs');

export interface HandoffRecord {
  path: string;
  chars: number;
  createdAt: string;
  conversationId?: string;
}

/** Trim to the contract size, keeping the end (the most recent state). */
export function capHandoff(text: string, max = MAX_HANDOFF_CHARS): string {
  const clean = String(text ?? '').replace(/\u0000/g, '').trim();
  if (clean.length <= max) return clean;
  const head = clean.slice(0, Math.floor(max * 0.25));
  const tail = clean.slice(-Math.floor(max * 0.75));
  return `${head}\n\n[... middle truncated by OLYMPUS: ${clean.length - max} chars ...]\n\n${tail}`;
}

export function writeHandoff(text: string, conversationId?: string, now = new Date()): HandoffRecord {
  const body = capHandoff(text);
  if (!body) throw new Error('empty handoff');
  fs.mkdirSync(DIR, { recursive: true, mode: 0o700 });
  const stamp = now.toISOString().replace(/[:.]/g, '-');
  const safeConv = String(conversationId ?? 'session').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40) || 'session';
  const file = path.join(DIR, `${stamp}-${safeConv}.md`);
  const header = [
    '# OLYMPUS handoff',
    '',
    `- created: ${now.toISOString()}`,
    `- conversation: ${conversationId ?? 'unknown'}`,
    '- contract: a compact continuation brief, not the full transcript.',
    '',
    '## Continue',
    '',
  ].join('\n');
  const payload = header + body + '\n';
  fs.writeFileSync(file, payload, { mode: 0o600 });
  return { path: file, chars: payload.length, createdAt: now.toISOString(), conversationId };
}

export function handoffDir(): string {
  return DIR;
}
