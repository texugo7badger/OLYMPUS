/**
 * mobile-presence.ts — v0.0.99: the companion's heartbeat.
 *
 * The pairing card used to say nothing about whether the phone was still on
 * the session. The phone POSTs a beacon every 30s (while visible); the
 * desktop reads the last seen stamp. Only a fingerprint of the token is
 * stored — never the token itself — so a rotation is visible without
 * persisting a credential.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface MobilePresence {
  lastSeen: string | null;
  userAgent: string | null;
  page: string | null;
  fingerprint: string | null;
}

function home(): string {
  return process.env.OLYMPUS_HOME || path.join(os.homedir(), '.olympus');
}

function file(): string {
  return path.join(home(), 'mobile-presence.json');
}

export function tokenFingerprint(token: string | null | undefined): string | null {
  const value = String(token || '').trim();
  if (!value) return null;
  return crypto.createHash('sha256').update(value).digest('hex').slice(0, 12);
}

export function readPresence(): MobilePresence {
  try {
    const raw = JSON.parse(fs.readFileSync(file(), 'utf-8'));
    return {
      lastSeen: typeof raw?.lastSeen === 'string' ? raw.lastSeen : null,
      userAgent: typeof raw?.userAgent === 'string' ? raw.userAgent : null,
      page: typeof raw?.page === 'string' ? raw.page : null,
      fingerprint: typeof raw?.fingerprint === 'string' ? raw.fingerprint : null,
    };
  } catch {
    return { lastSeen: null, userAgent: null, page: null, fingerprint: null };
  }
}

export function touchPresence(opts: { token?: string | null; userAgent?: string | null; page?: string | null }): MobilePresence {
  const next: MobilePresence = {
    lastSeen: new Date().toISOString(),
    userAgent: opts.userAgent ? String(opts.userAgent).slice(0, 200) : null,
    page: opts.page ? String(opts.page).slice(0, 40) : null,
    fingerprint: tokenFingerprint(opts.token),
  };
  try {
    fs.mkdirSync(home(), { recursive: true });
    fs.writeFileSync(file(), JSON.stringify(next, null, 2) + '\n', { mode: 0o600 });
  } catch { /* presence is best-effort */ }
  return next;
}

/** Connected = a beacon inside the window (the phone polls every 30s). */
export function presenceFresh(withinMs = 90_000): boolean {
  const { lastSeen } = readPresence();
  if (!lastSeen) return false;
  const at = Date.parse(lastSeen);
  return Number.isFinite(at) && Date.now() - at < withinMs;
}
