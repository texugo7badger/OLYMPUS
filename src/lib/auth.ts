/**
 * Olympus Auth Middleware — bearer-token authentication for mutating API
 * routes when running in `lan` or `tunnel` network mode. In `local` mode no
 * token is required, but the Origin/IP checks below still apply.
 *
 * IMPORTANT (issue #29): nothing actually pins the HTTP bind to 127.0.0.1.
 * The Next server is started as `next dev -p 3737` / `next start -p 3737`
 * with no `--hostname` flag (see electron/main.ts and package.json), so
 * Next's default applies and the server binds 0.0.0.0. `local` mode's
 * protection therefore rests on the Origin/IP checks plus the token in
 * lan/tunnel mode — not on loopback-only reachability. Routes that skip
 * requireAuth/requireReadAuth (as the fs/* family did before #29) have no
 * CSRF defense at all.
 *
 * Token lifecycle: generated at ~/.olympus/session-token, checked against
 * Authorization: Bearer <token> or X-Olympus-Token header.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import os from 'os';

const OLYMPUS_HOME = path.join(os.homedir(), '.olympus');
const TOKEN_FILE = path.join(OLYMPUS_HOME, 'session-token');
const MODE_FILE = path.join(OLYMPUS_HOME, 'network-mode');
const ALLOWED_LOCAL_ORIGINS = [
  'http://localhost',
  'http://127.0.0.1',
  'http://0:0:0:0:0:0:0:1',  // IPv6 localhost
  'http://[::1]',
  // Allow link-local addresses (169.254.x.x is the Windows "Network" URL
  // Next.js prints, e.g. http://169.254.254.251:3737). Also allow any
  // 127.x.x.x (loopback range, not just 127.0.0.1).
  'http://169.254.',
  'http://127.',
  'http://[::1]:',
  'http://[fe80:',  // IPv6 link-local
];

/**
 * Read the current network mode. Defaults to 'local' if not configured.
 *   'local'   → 127.0.0.1 bind, no auth required
 *   'lan'     → 0.0.0.0 bind, bearer token required
 *   'tunnel'  → 127.0.0.1 bind + Tailscale/SSH, bearer token required (defense in depth)
 */
export function getNetworkMode(): string {
  try {
    return fs.readFileSync(MODE_FILE, 'utf-8').trim() || 'local';
  } catch {
    return 'local';
  }
}

/**
 * Read the current session token. Returns null if no token file exists.
 */
export function getSessionToken(): string | null {
  try {
    return fs.readFileSync(TOKEN_FILE, 'utf-8').trim() || null;
  } catch {
    return null;
  }
}

/**
 * Check if the request's Origin header is a localhost origin.
 * Used to allow same-machine browser requests without a bearer token
 * (CSRF protection relies on Origin checking, not just IP).
 *
 * Also allows requests with NO Origin header. Same-machine browser
 * fetch() sometimes omits the Origin header for same-origin requests
 * (e.g. POST to /api/... from a page on localhost:3737). Since we're
 * in 'local' mode (127.0.0.1 bind only), a missing Origin is safe.
 */
export function isLocalOrigin(req: NextRequest): boolean {
  const origin = req.headers.get('origin') || req.headers.get('referer') || '';
  // No Origin header = same-machine same-origin request. Allow it in
  // local mode (the browser omits Origin for same-origin POSTs).
  if (!origin) return true;
  return ALLOWED_LOCAL_ORIGINS.some((allowed) => origin.startsWith(allowed));
}

/**
 * Check if the request's IP is a localhost IP.
 * In Next.js, the IP is available via the `x-forwarded-for` header (when behind
 * a proxy) or `x-real-ip`. If neither is set, we assume localhost (dev server).
 */
export function isLocalIp(req: NextRequest): boolean {
  const xff = req.headers.get('x-forwarded-for') || '';
  const xri = req.headers.get('x-real-ip') || '';
  const ip = (xri || xff.split(',')[0] || '').trim();
  if (!ip) return true;  // no IP info = same machine (Next dev server)
  return ip === '127.0.0.1' || ip === '::1' || ip === 'localhost' || ip.startsWith('127.');
}

/**
 * Check auth for a mutating request.
 *
 * Returns null if auth passes, or a NextResponse (401/403) if it fails.
 *
 * Auth logic:
 *   1. If network mode is 'local' AND origin is localhost → allow (no token needed)
 *   2. If network mode is 'lan' or 'tunnel' → require bearer token
 *   3. Token checked against ~/.olympus/session-token
 *   4. If no token file exists but mode is lan/tunnel → refuse (misconfigured)
 */
export function requireAuth(req: NextRequest): NextResponse | null {
  const mode = getNetworkMode();

  // Local mode + localhost origin → allow without token
  if (mode === 'local' && isLocalOrigin(req)) {
    return null;
  }
  // Local mode + non-localhost origin → suspicious (DNS rebinding?)
  if (mode === 'local' && !isLocalOrigin(req)) {
    return NextResponse.json(
      { error: 'Forbidden: non-localhost origin in local mode' },
      { status: 403 },
    );
  }

  // lan/tunnel mode → require bearer token
  const expectedToken = getSessionToken();
  if (!expectedToken) {
    return NextResponse.json(
      { error: 'Server misconfigured: no session token for lan/tunnel mode. Write a token to ~/.olympus/session-token and set ~/.olympus/network-mode to "lan" or "tunnel".' },
      { status: 500 },
    );
  }

  const authHeader = req.headers.get('authorization') || '';
  const xOlympusToken = req.headers.get('x-olympus-token') || '';
  const providedToken =
    authHeader.startsWith('Bearer ') ? authHeader.slice(7) : xOlympusToken;

  if (!providedToken || providedToken !== expectedToken) {
    return NextResponse.json(
      { error: 'Unauthorized: invalid or missing bearer token' },
      { status: 401 },
    );
  }

  return null;  // auth passed
}

/**
 * Check auth for a read-only (GET) request.
 *
 * Same logic as requireAuth, but allows GET requests from any localhost origin
 * without a token (read access is less sensitive than write access).
 */
export function requireReadAuth(req: NextRequest): NextResponse | null {
  const mode = getNetworkMode();

  // Local mode → allow all GET from localhost
  if (mode === 'local' && (isLocalOrigin(req) || isLocalIp(req))) {
    return null;
  }
  // Local mode + non-localhost → refuse
  if (mode === 'local') {
    return NextResponse.json(
      { error: 'Forbidden: non-localhost request in local mode' },
      { status: 403 },
    );
  }

  // lan/tunnel mode → require token even for GET
  return requireAuth(req);
}
