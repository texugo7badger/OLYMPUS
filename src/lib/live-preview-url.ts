/**
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 *
 * #202 — Live Preview URL normalization. The editable URL bar must accept an
 * http(s) origin/path, refuse everything else honestly (no silent fallback),
 * and compare against the probed origin in normalized form.
 */

export type PreviewUrlResult =
  | { ok: true; url: string }
  | { ok: false; error: string };

export function normalizePreviewUrl(raw: string): PreviewUrlResult {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) {
    return { ok: false, error: 'Enter a URL (http:// or https://).' };
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, error: `Not a valid URL: ${trimmed}` };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, error: 'Only http:// and https:// previews are allowed.' };
  }
  return { ok: true, url: parsed.toString() };
}
