/**
 * preview-isolation.ts — v0.0.93, RETIRED in v0.0.99.
 *
 * The 127.0.0.2 alias isolated the iframe into its own renderer but lost the
 * app's SESSION: cookies and localStorage are scoped to the host, so an app
 * logged in on 127.0.0.1:3038 arrived at 127.0.0.2:3038 logged out — a static
 * mirror. Electron now uses a <webview> at the REAL origin (its own process
 * AND the shared session); browsers use an iframe on the real origin.
 *
 * `inElectron` stays (the surface chooses the runtime). The two alias helpers
 * remain for the v0.0.92 regression suite and for any old pinned URL that is
 * repointed on hydration.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
const CACHE = new Map<number, { at: number; url: string | null }>();
const TTL_MS = 5_000;

/** The isolated loopback origin for a preview port, or null when unreachable. */
export async function isolatedPreviewUrl(port: number | null | undefined, timeoutMs = 2500): Promise<string | null> {
  if (!port || !Number.isFinite(Number(port))) return null;
  const p = Number(port);
  const hit = CACHE.get(p);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.url;
  let url: string | null = null;
  try {
    const res = await fetch(`http://127.0.0.2:${p}/`, {
      method: 'GET',
      redirect: 'manual',
      signal: AbortSignal.timeout(Math.max(250, timeoutMs)),
    });
    // Any HTTP response proves the loopback alias reaches the dev server.
    // A project bound to 127.0.0.1 only throws (ECONNREFUSED) and gets the
    // direct-URL fallback instead of a broken iframe.
    if (res.status > 0) url = `http://127.0.0.2:${p}`;
  } catch {
    url = null;
  }
  CACHE.set(p, { at: Date.now(), url });
  return url;
}

/**
 * v0.0.99 — the runtime detector stays: Electron renders a <webview> (own
 * process + shared session), browsers render a same-origin iframe.
 */
export function inElectron(): boolean {
  try { return typeof navigator !== 'undefined' && /Electron/i.test(navigator.userAgent); } catch { return false; }
}

/** Client-safe: rewrite a loopback preview URL to the isolated alias. */
export function iframePreviewUrl(raw: string): string {
  try {
    const u = new URL(raw);
    const host = u.hostname.toLowerCase();
    if (host === '127.0.0.1' || host === 'localhost' || host === '::1' || host === '[::1]') {
      u.hostname = '127.0.0.2';
      return u.toString();
    }
  } catch { /* not a URL: leave it untouched */ }
  return raw;
}
