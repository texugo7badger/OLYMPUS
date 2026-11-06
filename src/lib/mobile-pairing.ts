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
import { DEFAULT_THEME, normalizeThemeState, resolvePalette, THEME_PRESETS } from './theme';
import { tunnelStatus } from './mobile-tunnel';

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
function readThemeForQr(): { name: string; accent: string; bg: string; light: string; dark: string } {
  let state = DEFAULT_THEME;
  let palette = resolvePalette(DEFAULT_THEME);
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(olympusHome(), 'theme.json'), 'utf-8'));
    state = normalizeThemeState(raw);
    palette = (raw && typeof raw.palette === 'object') ? { ...palette, ...raw.palette } : resolvePalette(state);
  } catch { /* default theme */ }
  const name = THEME_PRESETS.find((p) => p.id === state.presetId)?.name || 'OLYMPUS';
  const lum = (hex: string): number => {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return 0;
    const n = parseInt(m[1], 16);
    const c = [n >> 16, (n >> 8) & 255, n & 255].map((v) => {
      const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const shade = (hex: string, factor: number): string => {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return '#0A0E16';
    const n = parseInt(m[1], 16);
    const ch = [n >> 16, (n >> 8) & 255, n & 255].map((v) => Math.max(0, Math.min(255, Math.round(v * factor))));
    return `#${ch.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
  };
  const lightTheme = lum(palette.bg) > 0.55;
  return {
    name,
    accent: palette.gold,
    bg: palette.bg,
    // Scanners need dark modules on a light field. Dark themes keep a paper
    // field with a deep theme-accent bronze; light themes use their own ink.
    light: lightTheme ? palette.bg : '#F4EFE6',
    dark: lightTheme ? palette.text : shade(palette.gold, 0.38),
  };
}

export async function buildPairPayload(opts: { hostHeader: string | null; includeQr?: boolean }) {
  const token = ensureSessionToken();
  const port = resolvePort(opts.hostHeader);
  const addresses = lanAddresses();
  const preferred = addresses[0] || 'localhost';
  // PWA install and phone voice need a secure context. The same HTTPS tunnel
  // serves both surfaces; when it is down, the QR falls back to LAN (a
  // shortcut, not an installable PWA) and the dialog says so.
  const lanUrl = mobileUrlFor(preferred, port, token);
  // PWA install needs a secure context. When the mobile HTTPS tunnel is
  // running, the widget QR points at it; otherwise it falls back to LAN and
  // the dialog says this QR is a shortcut, not an installable PWA.
  const remote = (() => { try { return tunnelStatus(); } catch { return null; } })();
  const secureBase = remote && remote.running && remote.url ? remote.url.replace(/\/$/, '') : null;
  const lanBase = `http://${preferred}:${port}`;
  const url = secureBase ? `${secureBase}/m#t=${encodeURIComponent(token)}` : lanUrl;
  const widgetBase = secureBase || lanBase;
  const widgetUrl = `${widgetBase}/m/widget#t=${encodeURIComponent(token)}`;
  const mode = readNetworkMode();
  const theme = readThemeForQr();
  let qr: string | null = null;
  let widgetQr: string | null = null;
  if (opts.includeQr !== false) {
    try {
      const QR = await import('qrcode');
      const options = {
        errorCorrectionLevel: 'M' as const,
        margin: 1,
        width: 320,
        color: { dark: theme.dark, light: theme.light },
      };
      qr = await QR.toDataURL(url, options);
      widgetQr = await QR.toDataURL(widgetUrl, options);
    } catch { qr = null; widgetQr = null; }
  }
  return {
    mode,
    port,
    addresses,
    token,
    url,
    widgetUrl,
    widgetSecure: Boolean(secureBase),
    urlSecure: Boolean(secureBase),
    qr,
    widgetQr,
    themeName: theme.name,
    qrDark: theme.dark,
    qrLight: theme.light,
    qrAccent: theme.accent,
    lanReady: mode === 'lan' || mode === 'tunnel',
    note:
      mode === 'local'
        ? 'The server is bound to loopback. Switch to LAN mode, then restart OLYMPUS so the phone can reach it.'
        : 'The server is bound to the network. The QR stays valid after restarts; revoke it by rotating the token.',
  };
}
