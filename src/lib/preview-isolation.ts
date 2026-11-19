/**
 * preview-isolation.ts — v0.0.93: the preview iframe gets its own renderer.
 *
 * WHY: the live preview is served from 127.0.0.1:<port>, the same site as the
 * OLYMPUS shell (127.0.0.1:3737). With Electron's site isolation, a same-site
 * iframe shares the parent's renderer and main thread; a heavy project preview
 * then drags the whole shell to ~30 FPS. Serving the iframe from 127.0.0.2 is
 * the same loopback server through a different SITE, so Chromium places it in
 * an OOPIF (its own renderer). Measured on the AIME lane: parent 54→60 and
 * iframe 52→60 FPS.
 *
 * The probe is server-side and cached: a project that binds only 127.0.0.1 is
 * detected honestly and the client falls back to the direct URL.
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
 * v0.0.94 — the isolated origin is an ELECTRON optimization. In Firefox/Chrome
 * the user's AIME session lives on 127.0.0.1; moving the iframe to 127.0.0.2
 * would log the preview out. The browser gets the direct origin; Electron gets
 * the OOPIF origin.
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
