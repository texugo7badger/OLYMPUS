/**
 * user-activity.ts — v0.0.83: the user lane wins while the human is here.
 *
 * A chat turn, a mark, a voice idea or a prompt queued from the phone writes a
 * short lease. The hop walker checks it before launching a NEW hop and waits
 * (the in-flight hop finishes) so a background campaign does not compete with
 * the user's turn for the same provider/model bucket.
 *
 * The lease is bounded: it expires even if the client dies, so a campaign can
 * never be blocked forever. A user interaction extends it.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const HOME = process.env.OLYMPUS_HOME || path.join(os.homedir(), '.olympus');
const FILE = path.join(HOME, 'user-activity.json');

export function markUserActivity(ms = 60_000, now = Date.now()): void {
  const ttl = Math.min(Math.max(5_000, ms), 5 * 60_000);
  try {
    fs.mkdirSync(HOME, { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify({ until: now + ttl, at: new Date(now).toISOString() }, null, 2) + '\n', { mode: 0o600 });
  } catch { /* a lease write failure must never block a turn */ }
}

/**
 * v0.0.84 edit — a resume command is the user handing the lane BACK to the
 * walker. Without this, the 90s action-route lease would hold every NEW hop
 * right after the resume, which looks exactly like a stalled walk.
 */
export function clearUserActivity(now = Date.now()): void {
  try {
    fs.mkdirSync(HOME, { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify({ until: now - 1, at: new Date(now).toISOString() }, null, 2) + '\n', { mode: 0o600 });
  } catch { /* a lease write failure must never block a resume */ }
}

export function userActivityUntil(): number {
  try {
    const raw = JSON.parse(fs.readFileSync(FILE, 'utf-8'));
    const until = Number(raw?.until);
    return Number.isFinite(until) ? until : 0;
  } catch { return 0; }
}

export function userIsActive(now = Date.now()): boolean {
  return userActivityUntil() > now;
}
