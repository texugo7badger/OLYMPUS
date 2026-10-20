/**
 * image-providers.ts — W-B IMAGE-GEN (v0.0.6-premio): the provider engine
 * behind the Atelier's generation + editing lanes. FREE + BYOK, exactly as
 * the user asked — the free lane always works (anonymous Pollinations), the
 * premium rungs unlock behind keys (the canonical ~/.olympus/api-configs
 * store set via the API Keys dialog; the legacy ~/.olympus/atelier.json
 * still satisfies, canonical wins).
 *
 *   FREE:      pollinations/flux        — anonymous, no key, $0 (the lane
 *                                          that carried every release).
 *   FAL (FAL_KEY):
 *     draft:   byok/sdxl-turbo          — fal-ai/fast-sdxl, ~$0.0002/img
 *     draft:   byok/flux-schnell        — fal-ai/flux/schnell, ~$0.003/img
 *     final:   byok/nano-banana-edit    — fal-ai/nano-banana/edit, ~$0.02
 *                                         (generation + img2img — the edit
 *                                         rung carries the source image).
 *   GOOGLE (GOOGLE_AI_KEY, legacy google_key):
 *     final:   byok/nano-banana        — gemini-3-pro-image-preview
 *                                         (generateContent, image modality —
 *                                         t2i + img2img via inline parts).
 *
 * The request builders are PURE (testable shapes, no I/O); the response
 * parser handles the three wire shapes (fal JSON images[].url, direct image
 * bytes, Google inlineData base64). The routes glue fetch + the vault.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import fs from 'fs';
import path from 'path';
import os from 'os';

// ─── Keys: canonical store first, legacy fallback (the W-A doctrine) ───────

export interface ImageProviderKeys {
  pollinations?: string;
  fal?: string;
  google?: string;
}

/** Read the image keys: api-configs.json canonical, atelier.json legacy. */
export function readImageProviderKeys(homeDir?: string): ImageProviderKeys {
  const home = homeDir ?? os.homedir();
  let keys: ImageProviderKeys = {};
  try {
    keys = JSON.parse(fs.readFileSync(path.join(home, '.olympus', 'atelier.json'), 'utf-8')) as ImageProviderKeys;
    // normalize the legacy field names onto the engine's
    if ((keys as any).pollinations_key) keys.pollinations = (keys as any).pollinations_key;
    if ((keys as any).google_key) keys.google = (keys as any).google_key;
  } catch { keys = {}; }
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(home, '.olympus', 'api-configs.json'), 'utf-8'));
    const pick = (k: string) => (typeof cfg?.[k] === 'string' && cfg[k].trim() ? cfg[k].trim() : null);
    const pk = pick('POLLINATIONS_KEY');
    const fk = pick('FAL_KEY');
    const gk = pick('GOOGLE_AI_KEY');
    if (pk) keys.pollinations = pk;
    if (fk) keys.fal = fk;
    if (gk) keys.google = gk;
  } catch { /* no canonical store — the legacy shape stands alone */ }
  return keys;
}

// ─── The catalog (the ladder, alive) ────────────────────────────────────────

export interface ImageModelOption {
  id: string;
  label: string;
  tier: 'free' | 'draft' | 'final';
  priceHint: string;
  provider: 'pollinations' | 'fal' | 'google';
  /** The env var that gates the rung (null = free, always available). */
  needsKey: string | null;
  /** Unlocked by the keys in hand. */
  available: boolean;
  /** img2img (the edit lane). */
  supportsEdit: boolean;
}

export const IMAGE_MODELS: Omit<ImageModelOption, 'available'>[] = [
  { id: 'pollinations/flux', label: 'Pollinations FLUX', tier: 'free', priceHint: '$0', provider: 'pollinations', needsKey: null, supportsEdit: false },
  { id: 'byok/sdxl-turbo', label: 'SDXL Turbo', tier: 'draft', priceHint: '~$0.0002/img', provider: 'fal', needsKey: 'FAL_KEY', supportsEdit: false },
  { id: 'byok/flux-schnell', label: 'FLUX schnell', tier: 'draft', priceHint: '~$0.003/img', provider: 'fal', needsKey: 'FAL_KEY', supportsEdit: false },
  { id: 'byok/nano-banana-edit', label: 'Nano Banana (edit)', tier: 'final', priceHint: '~$0.02/img', provider: 'fal', needsKey: 'FAL_KEY', supportsEdit: true },
  { id: 'byok/nano-banana', label: 'Nano Banana (Google)', tier: 'final', priceHint: '~$0.02/img', provider: 'google', needsKey: 'GOOGLE_AI_KEY', supportsEdit: true },
];

/** The catalog + availability for the keys in hand. */
export function availableImageModels(keys: ImageProviderKeys): ImageModelOption[] {
  return IMAGE_MODELS.map((m) => {
    const hasKey = m.provider === 'pollinations' ? true : m.provider === 'fal' ? !!keys.fal : !!keys.google;
    return { ...m, available: m.needsKey === null ? true : hasKey };
  });
}

// ─── The pure request builders (no I/O — the shapes are the contract) ──────

export interface BuiltRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
}

const FALLBACK_FREE = 'pollinations/flux';

export function buildGenerationRequest(
  modelId: string,
  opts: { prompt: string; width?: number; height?: number; seed?: number; keys: ImageProviderKeys },
): BuiltRequest {
  const m = IMAGE_MODELS.find((x) => x.id === modelId) ?? IMAGE_MODELS.find((x) => x.id === FALLBACK_FREE)!;
  const prompt = String(opts.prompt || '').trim();
  const w = Math.min(Math.max(Number(opts.width) || 768, 256), 1536);
  const h = Math.min(Math.max(Number(opts.height) || 768, 256), 1536);
  const seedQ = typeof opts.seed === 'number' && Number.isFinite(opts.seed) ? `&seed=${Math.floor(opts.seed)}` : '';

  if (m.provider === 'pollinations') {
    // The free lane — anonymous, no key. (POLLINATIONS_KEY powers the
    // EMBEDDINGS lane, not generation — the free tier IS the free tier.)
    return {
      method: 'GET',
      url: `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${w}&height=${h}&nologo=true${seedQ}`,
      headers: {},
    };
  }
  if (m.provider === 'fal') {
    const endpoint = m.id === 'byok/sdxl-turbo' ? 'https://fal.run/fal-ai/fast-sdxl' : 'https://fal.run/fal-ai/flux/schnell';
    return {
      method: 'POST',
      url: endpoint,
      headers: { Authorization: `Key ${opts.keys.fal}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, image_size: { width: w, height: h }, ...(typeof opts.seed === 'number' && Number.isFinite(opts.seed) ? { seed: Math.floor(opts.seed) } : {}) }),
    };
  }
  // Google — Nano Banana via generateContent (the image modality).
  return {
    method: 'POST',
    url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent',
    headers: { 'x-goog-api-key': String(opts.keys.google ?? ''), 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
  };
}

export function buildEditRequest(
  modelId: string,
  opts: { prompt: string; imageDataUri: string; keys: ImageProviderKeys },
): BuiltRequest {
  const prompt = String(opts.prompt || '').trim();
  if (modelId === 'byok/nano-banana-edit') {
    return {
      method: 'POST',
      url: 'https://fal.run/fal-ai/nano-banana/edit',
      headers: { Authorization: `Key ${opts.keys.fal}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, image_url: opts.imageDataUri }),
    };
  }
  // Google Nano Banana edit — the source image rides as an inline part.
  const [meta, data] = String(opts.imageDataUri).split(',');
  const mimeMatch = meta.match(/^data:([^;]+)/);
  const mime = mimeMatch ? mimeMatch[1] : 'image/png';
  return {
    method: 'POST',
    url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent',
    headers: { 'x-goog-api-key': String(opts.keys.google ?? ''), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [
          { inline_data: { mime_type: mime, data: data ?? '' } },
          { text: prompt },
        ],
      }],
    }),
  };
}

// ─── The response parser (the three wire shapes) ────────────────────────────

export type ParsedProviderResponse =
  | { kind: 'image-bytes'; buf: Buffer; mime: string }
  | { kind: 'image-url'; url: string };

export function parseProviderResponse(contentType: string, raw: Buffer): ParsedProviderResponse {
  const ct = String(contentType || '').toLowerCase();
  if (ct.startsWith('image/')) {
    return { kind: 'image-bytes', buf: raw, mime: ct.split(';')[0] };
  }
  // JSON shapes: fal {images:[{url}]} | Google {candidates:[{content:{parts:[{inlineData}]}}]}
  let json: any = null;
  try { json = JSON.parse(raw.toString('utf-8')); } catch { return { kind: 'image-bytes', buf: raw, mime: 'image/png' }; }
  const falUrl = json?.images?.[0]?.url;
  if (typeof falUrl === 'string' && falUrl) return { kind: 'image-url', url: falUrl };
  const inline = json?.candidates?.[0]?.content?.parts?.find((p: any) => p?.inlineData?.data || p?.inline_data?.data);
  const b64 = inline?.inlineData?.data ?? inline?.inline_data?.data;
  const mime = inline?.inlineData?.mimeType ?? inline?.inline_data?.mime_type ?? 'image/png';
  if (typeof b64 === 'string' && b64) {
    return { kind: 'image-bytes', buf: Buffer.from(b64, 'base64'), mime };
  }
  // Google predict shapes (imagen): {predictions:[{bytesBase64Encoded}]}
  const imagenB64 = json?.predictions?.[0]?.bytesBase64Encoded;
  if (typeof imagenB64 === 'string' && imagenB64) {
    return { kind: 'image-bytes', buf: Buffer.from(imagenB64, 'base64'), mime: 'image/png' };
  }
  throw new Error(`unrecognized provider response shape (content-type ${contentType || 'none'})`);
}

/** Resolve bytes for a parsed response (fetching the image-url shape). */
export async function resolveImageBytes(
  parsed: ParsedProviderResponse,
  fetchImpl: typeof fetch = fetch,
): Promise<{ buf: Buffer; mime: string }> {
  if (parsed.kind === 'image-bytes') return { buf: parsed.buf, mime: parsed.mime };
  const r = await fetchImpl(parsed.url, { signal: AbortSignal.timeout(120_000) });
  if (!r.ok) throw new Error(`the provider's image fetch failed: HTTP ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  const mime = r.headers.get('content-type')?.startsWith('image/') ? r.headers.get('content-type')!.split(';')[0] : 'image/png';
  return { buf, mime };
}
