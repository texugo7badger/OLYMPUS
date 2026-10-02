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
 * a proxy) or `x-real-ip`.
 *
 * Issue #34: this used to `return true` when neither header was present,
 * reasoning "no IP info = same machine (dev server)". That is wrong: Next
 * binds every interface (issue #33), so a direct LAN connection also arrives
 * with no proxy headers — the absence of a header proves nothing about the
 * peer. Treating unknown as local made this check a no-op that silently
 * OR-ed "allow" into every local-mode GET gate, so the Origin check became
 * decorative.
 *
 * Unknown is now NOT local. A genuine same-machine request with no proxy
 * headers is still allowed, because `isLocalOrigin` covers that case (the
 * browser omits Origin on same-origin requests) — this function only narrows
 * what counts as a resolved localhost address, it never widens access.
 */
export function isLocalIp(req: NextRequest): boolean {
  const xff = req.headers.get('x-forwarded-for') || '';
  const xri = req.headers.get('x-real-ip') || '';
  const ip = (xri || xff.split(',')[0] || '').trim();
  // No proxy headers => peer address unresolved. Not evidence of locality.
  if (!ip) return false;
  return ip === '127.0.0.1' || ip === '::1' || ip === 'localhost' || ip.startsWith('127.');
}

/**
 * Check the `Host` header against loopback names (issue #34).
 *
 * Origin and IP checks cannot see a DNS-rebinding attack: the victim's browser
 * has been convinced that `evil.com` IS `127.0.0.1`, so the request arrives as
 * same-origin (no Origin header) from a resolved loopback peer — every other
 * check passes. What the attacker cannot forge is that the browser must still
 * address us by the hostname it thinks it is talking to, so the `Host` header
 * carries the rebinding domain. Requiring a loopback Host closes that hole for
 * both reads and writes, and is independent of issue #33's bind.
 */
export function isLocalHost(req: NextRequest): boolean {
  const host = (req.headers.get('host') || '').trim().toLowerCase();
  if (!host) return false;
  // Strip the port, keeping bracketed IPv6 literals intact, then drop the
  // brackets so "::1" and "[::1]" compare equal.
  const raw = host.startsWith('[')
    ? host.slice(0, host.indexOf(']') + 1)
    : host.split(':')[0];
  const name = raw.startsWith('[') && raw.endsWith(']') ? raw.slice(1, -1) : raw;
  if (!name) return false;
  if (name === 'localhost' || name.endsWith('.localhost')) return true;
  if (name === '::1') return true;
  // Link-local, matching ALLOWED_LOCAL_ORIGINS: Next prints the Windows
  // "Network URL" (169.254.x.x) and IPv6 fe80:: is the Tailscale-style
  // address, so those must keep working in local mode.
  if (/^169\.254\.\d{1,3}\.\d{1,3}$/.test(name)) return true;
  if (/^fe80:/.test(name)) return true;
  return /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(name);
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

  // Local mode → localhost Host only, then localhost origin (issue #34).
  if (mode === 'local') {
    if (!isLocalHost(req)) {
      return NextResponse.json(
        { error: 'Forbidden: non-loopback Host header in local mode' },
        { status: 403 },
      );
    }
    if (isLocalOrigin(req)) return null;
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

  // Local mode → allow all GET from localhost (issue #34).
  if (mode === 'local') {
    // Host first: a rebound domain arrives same-origin with no Origin header
    // and no proxy headers, so it would otherwise sail through both checks.
    if (isLocalHost(req) && (isLocalOrigin(req) || isLocalIp(req))) {
      return null;
    }
    return NextResponse.json(
      { error: 'Forbidden: non-localhost request in local mode' },
      { status: 403 },
    );
  }

  // lan/tunnel mode → require token even for GET
  return requireAuth(req);
}
