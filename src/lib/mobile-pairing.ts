/**
 * Mobile pairing — the desktop half of the companion.
 *
 * The companion is the SAME app at `/m`, served by the same Next server.
 * Pairing never invents a second secret: the mobile page logs in with the
 * SAME bearer token the LAN/tunnel API already trusts
 * (`~/.olympus/session-token`), and the QR carries it in the URL FRAGMENT
 * (never in the query, so it is not sent to the server in the request line).
 *
 * Security:
 *   - The token is generated with 32 random bytes, once, and reused.
 *   - The pair payload is served only through `requireAuth` (loopback in
 *     local mode; bearer token in lan/tunnel mode).
 *   - Switching to LAN mode is an explicit user action; the desktop says a
 *     restart is required because the bind changes in electron/main.ts.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

export type NetworkMode = 'local' | 'lan' | 'tunnel';

export function olympusHome(): string {
  return process.env.OLYMPUS_HOME || path.join(os.homedir(), '.olympus');
}

export function tokenPath(): string {
  return path.join(olympusHome(), 'session-token');
}

export function modePath(): string {
  return path.join(olympusHome(), 'network-mode');
}

export function readNetworkMode(): NetworkMode {
  try {
    const raw = fs.readFileSync(modePath(), 'utf-8').trim();
    if (raw === 'lan' || raw === 'tunnel') return raw;
  } catch { /* default below */ }
  return 'local';
}

export function writeNetworkMode(mode: NetworkMode): void {
  fs.mkdirSync(olympusHome(), { recursive: true });
  fs.writeFileSync(modePath(), `${mode}\n`, { mode: 0o600 });
}

/** Read the existing token or create one. Never logs the value. */
export function ensureSessionToken(): string {
  try {
    const current = fs.readFileSync(tokenPath(), 'utf-8').trim();
    if (current.length >= 24) return current;
  } catch { /* create below */ }
  const token = crypto.randomBytes(32).toString('base64url');
  fs.mkdirSync(olympusHome(), { recursive: true });
  fs.writeFileSync(tokenPath(), `${token}\n`, { mode: 0o600 });
  return token;
}

/** Every non-internal IPv4 address, the ones a phone on the same Wi-Fi can reach. */
export function lanAddresses(): string[] {
  const out: string[] = [];
  for (const rows of Object.values(os.networkInterfaces())) {
    for (const row of rows ?? []) {
      if (row.family !== 'IPv4' || row.internal) continue;
      if (!row.address || row.address.startsWith('169.254.')) continue;
      out.push(row.address);
    }
  }
  return Array.from(new Set(out));
}

export function resolvePort(hostHeader: string | null, fallback = 3737): number {
  const fromHost = String(hostHeader || '').match(/:(\d{2,5})$/)?.[1];
  const n = Number.parseInt(fromHost || process.env.PORT || '', 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function mobileUrlFor(host: string, port: number, token: string): string {
  // The fragment is client-side only; the server never sees the token.
  return `http://${host}:${port}/m#t=${encodeURIComponent(token)}`;
}

/**
 * Build the pairing payload. The URL always names a LAN address (a phone
 * cannot reach 127.0.0.1 on the desktop), and the token rides the fragment.
 */
export async function buildPairPayload(opts: { hostHeader: string | null; includeQr?: boolean }) {
  const token = ensureSessionToken();
  const port = resolvePort(opts.hostHeader);
  const addresses = lanAddresses();
  const preferred = addresses[0] || 'localhost';
  const url = mobileUrlFor(preferred, port, token);
  const mode = readNetworkMode();
  let qr: string | null = null;
  if (opts.includeQr !== false) {
    try {
      const QR = await import('qrcode');
      qr = await QR.toDataURL(url, {
        errorCorrectionLevel: 'M',
        margin: 1,
        width: 320,
        color: { dark: '#0b0b0f', light: '#f5efe6' },
      });
    } catch { qr = null; }
  }
  return {
    mode,
    port,
    addresses,
    token,
    url,
    qr,
    lanReady: mode === 'lan' || mode === 'tunnel',
    note:
      mode === 'local'
        ? 'The server is bound to loopback. Switch to LAN mode, then restart OLYMPUS so the phone can reach it.'
        : 'The server is bound to the network. The QR stays valid after restarts; revoke it by rotating the token.',
  };
}
