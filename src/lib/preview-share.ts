/**
 * preview-share.ts — v0.0.79: a scoped, expiring, read-only link to a preview.
 *
 * The live preview listens on a local port. Sharing it with a phone or a
 * client cannot mean "expose the OLYMPUS session": the link must be a
 * capability that opens ONE preview, expires, and can be revoked.
 *
 * - the token is random (32 bytes), never the session token;
 * - only its SHA-256 is stored (`~/.olympus/preview-shares.json`, 0600);
 * - the record names the project, the port and the expiry;
 * - resolution is constant-time-ish by hashing the presented token and
 *   matching the stored hash;
 * - revoke is a timestamp, never a delete (the audit stays).
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

export interface PreviewShare {
  id: string;
  tokenHash: string;
  project: string;
  port: number;
  url: string;
  createdAt: string;
  expiresAt: string;
  revokedAt?: string;
  views: number;
  lastViewedAt?: string;
}

function home(): string {
  return process.env.OLYMPUS_HOME || path.join(os.homedir(), '.olympus');
}

export function sharesPath(): string {
  return path.join(home(), 'preview-shares.json');
}

function readAll(): PreviewShare[] {
  try {
    const raw = JSON.parse(fs.readFileSync(sharesPath(), 'utf-8'));
    return Array.isArray(raw) ? raw : [];
  } catch { return []; }
}

function writeAll(rows: PreviewShare[]): void {
  try {
    fs.mkdirSync(path.dirname(sharesPath()), { recursive: true });
    fs.writeFileSync(sharesPath(), JSON.stringify(rows, null, 2) + '\n', { mode: 0o600 });
  } catch { /* the share is best-effort; the preview never breaks on it */ }
}

const hash = (token: string): string => crypto.createHash('sha256').update(token).digest('hex');

/** Create a share. Default TTL 24h; max 30 days. */
export function createShare(opts: {
  project: string;
  port: number;
  url: string;
  ttlHours?: number;
  now?: number;
}): { share: PreviewShare; token: string } {
  const now = opts.now ?? Date.now();
  const ttl = Math.min(Math.max(1, opts.ttlHours ?? 24), 24 * 30);
  const token = crypto.randomBytes(32).toString('hex');
  const share: PreviewShare = {
    id: `shr_${now.toString(36)}${crypto.randomBytes(3).toString('hex')}`,
    tokenHash: hash(token),
    project: opts.project,
    port: opts.port,
    url: opts.url,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + ttl * 3600_000).toISOString(),
    views: 0,
  };
  writeAll([...readAll(), share]);
  return { share, token };
}

/** Resolve a presented token: not revoked, not expired. */
export function resolveShare(token: string, now = Date.now()): PreviewShare | null {
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const h = hash(token);
  const row = readAll().find((s) => s.tokenHash === h);
  if (!row) return null;
  if (row.revokedAt) return null;
  if (Date.parse(row.expiresAt) <= now) return null;
  return row;
}

/** Count a view without blocking the response (best effort). */
export function noteView(id: string, now = Date.now()): void {
  const rows = readAll();
  const row = rows.find((s) => s.id === id);
  if (!row) return;
  row.views += 1;
  row.lastViewedAt = new Date(now).toISOString();
  writeAll(rows);
}

export function revokeShare(id: string, now = Date.now()): boolean {
  const rows = readAll();
  const row = rows.find((s) => s.id === id);
  if (!row || row.revokedAt) return false;
  row.revokedAt = new Date(now).toISOString();
  writeAll(rows);
  return true;
}

/** Metadata only — never the hash, never the token. */
export function listShares(project?: string): Array<Omit<PreviewShare, 'tokenHash'>> {
  return readAll()
    .filter((s) => !project || s.project === project)
    .map(({ tokenHash: _h, ...rest }) => rest)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * Rewrite root-relative URLs in the preview HTML so every asset and link
 * stays inside the share prefix. The recipient can navigate the preview
 * without ever reaching the OLYMPUS session.
 */
export function rewriteHtml(html: string, prefix: string): string {
  const base = prefix.endsWith('/') ? prefix.slice(0, -1) : prefix;
  return html
    .replace(/(\s(?:href|src|action)=["'])\/(?!\/)/g, `$1${base}/`)
    .replace(/(url\(\s*["']?)\/(?!\/)/g, `$1${base}/`);
}
