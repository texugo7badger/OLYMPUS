/**
 * media-vault.ts — #149 MEDIA-VAULT-1 (v0.0.5 ATELIER): the image layer of
 * the Vault. Any image from ANY AI (or the user's own) drops in; Argos (the
 * VLM cascade) describes + tags it; the entry becomes a vault memory with
 * frontmatter; sqlite-vec (the wrap — #150) will power "style of my
 * previous assets" retrieval. The layout:
 *
 *   ~/OLYMPUS-VAULT/10_Media_Vault/
 *     images/<ISO>-<slug>.<ext>       the binary
 *     entries/<same-basename>.md     the frontmatter entry
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import fs from 'fs';
import path from 'path';
import os from 'os';
import { getVaultRoot } from './vault-root';
import { VISION_CASCADE, ARGUS_DESCRIBE_PROMPT } from './visual-strategy';

export const MEDIA_VAULT_DIR = path.join(getVaultRoot(), '10_Media_Vault');
const IMAGES_DIR = path.join(MEDIA_VAULT_DIR, 'images');
const ENTRIES_DIR = path.join(MEDIA_VAULT_DIR, 'entries');

export interface MediaAsset {
  id: string;
  filename: string;
  imagePath: string;
  entryPath: string;
  mime: string;
  size: number;
  createdAt: string;
  description?: string;
  tags?: string[];
  dominantColors?: string[];
  suggestedUse?: string;
  source?: string;
}

function ensureDirs(): void {
  fs.mkdirSync(IMAGES_DIR, { recursive: true });
  fs.mkdirSync(ENTRIES_DIR, { recursive: true });
}

/** The OpenRouter key (the same storage opencode's /connect writes). */
function openRouterKey(): string | null {
  try {
    const authPath = path.join(os.homedir(), '.local/share/opencode/auth.json');
    const auth = JSON.parse(fs.readFileSync(authPath, 'utf-8'));
    const or = auth?.openrouter;
    const key = typeof or === 'string' ? or : or?.key;
    return typeof key === 'string' && key ? key : null;
  } catch {
    return null;
  }
}

/** Save a dropped image + its (pending) entry. Returns the asset. */
export function saveAsset(buf: Buffer, mime: string, source = 'upload'): MediaAsset {
  ensureDirs();
  const iso = new Date().toISOString().replace(/[:.]/g, '-');
  const ext = (EXT_BY_MIME[mime] || 'png');
  const filename = `${iso}.${ext}`;
  const imagePath = path.join(IMAGES_DIR, filename);
  fs.writeFileSync(imagePath, buf);
  const asset: MediaAsset = {
    id: filename.replace(/\.[^.]+$/, ''),
    filename,
    imagePath,
    entryPath: path.join(ENTRIES_DIR, `${filename.replace(/\.[^.]+$/, '')}.md`),
    mime,
    size: buf.length,
    createdAt: new Date().toISOString(),
    source,
  };
  writeEntry(asset, 'pending description');
  return asset;
}

function writeEntry(asset: MediaAsset, statusNote: string): void {
  ensureDirs();
  const fm = [
    '---',
    `id: ${asset.id}`,
    `created: ${asset.createdAt}`,
    `mime: ${asset.mime}`,
    `size: ${asset.size}`,
    `source: ${asset.source ?? 'upload'}`,
    `status: ${statusNote}`,
    ...(asset.description ? [`description: "${asset.description.replace(/"/g, "'")}"`] : []),
    ...(asset.tags?.length ? [`tags: [${asset.tags.map((t) => t.toLowerCase()).join(', ')}]`] : []),
    ...(asset.dominantColors?.length ? [`dominant_colors: [${asset.dominantColors.join(', ')}]`] : []),
    ...(asset.suggestedUse ? [`suggested_use: "${asset.suggestedUse.replace(/"/g, "'")}"`] : []),
    '---',
    '',
    `![${asset.id}](${path.relative(ENTRIES_DIR, asset.imagePath)})`,
    '',
    asset.description ?? '(pending Argos description)',
    '',
  ].join('\n');
  fs.writeFileSync(asset.entryPath, fm);
}

/** The VLM cascade call — first GREEN model wins, rate-limits fall through. */
export async function describeAsset(asset: MediaAsset): Promise<MediaAsset> {
  const key = openRouterKey();
  if (!key) throw new Error('No OpenRouter key — connect it via /connect (free tier works).');
  const b64 = fs.readFileSync(asset.imagePath).toString('base64');
  const dataUrl = `data:${asset.mime};base64,${b64}`;
  let lastErr = 'no model in the cascade answered';
  for (const model of VISION_CASCADE) {
    try {
      const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: model.id,
          messages: [{
            role: 'user',
            content: [
              { type: 'text', text: ARGUS_DESCRIBE_PROMPT },
              { type: 'image_url', image_url: { url: dataUrl } },
            ],
          }],
        }),
        signal: AbortSignal.timeout(60_000),
      });
      if (!r.ok) { lastErr = `${model.id}: HTTP ${r.status}`; continue; }
      const d: any = await r.json().catch(() => null);
      const content = String(d?.choices?.[0]?.message?.content ?? '');
      if (!content) { lastErr = `${model.id}: empty reply`; continue; }
      // Parse the JSON block (tolerant: models sometimes wrap in fences).
      const m = content.match(/\{[\s\S]*\}/);
      if (!m) { lastErr = `${model.id}: no JSON block`; continue; }
      const parsed = JSON.parse(m[0]);
      asset.description = String(parsed.description ?? '').slice(0, 600);
      asset.tags = Array.isArray(parsed.tags) ? parsed.tags.map(String).slice(0, 12) : [];
      asset.dominantColors = Array.isArray(parsed.dominant_colors) ? parsed.dominant_colors.map(String).slice(0, 4) : [];
      asset.suggestedUse = String(parsed.suggested_use ?? '').slice(0, 200);
      writeEntry(asset, 'described');
      // #150: the vector index (a no-op without the BYOK key — the keyword
      // fallback keeps the search honest).
      try { const vec = await import('./media-vault-vec'); await vec.indexAsset(asset); } catch {}
      return asset;
    } catch (e: any) {
      lastErr = `${model.id}: ${e?.message || e}`;
    }
  }
  throw new Error(`The vision cascade exhausted: ${lastErr}`);
}

/** List the vault's assets (entries parsed). */
export function listAssets(limit = 200): MediaAsset[] {
  ensureDirs();
  const out: MediaAsset[] = [];
  try {
    const files = fs.readdirSync(ENTRIES_DIR).filter((f) => f.endsWith('.md')).sort().reverse().slice(0, limit);
    for (const f of files) {
      try {
        const raw = fs.readFileSync(path.join(ENTRIES_DIR, f), 'utf-8');
        const asset = parseEntry(raw, f.replace(/\.md$/, ''));
        if (asset) out.push(asset);
      } catch { /* skip broken entries */ }
    }
  } catch { /* no entries yet */ }
  return out;
}

function parseEntry(raw: string, id: string): MediaAsset | null {
  const fm: Record<string, string> = {};
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return null;
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (kv) fm[kv[1]] = kv[2].trim();
  }
  const list = (v?: string) => (v ? v.replace(/^\[|\]$/g, '').split(',').map((x) => x.trim()).filter(Boolean) : undefined);
  return {
    id,
    filename: `${id}.${EXT_BY_MIME[fm.mime] ?? 'png'}`,
    imagePath: path.join(IMAGES_DIR, `${id}.${EXT_BY_MIME[fm.mime] ?? 'png'}`),
    entryPath: path.join(ENTRIES_DIR, `${id}.md`),
    mime: fm.mime ?? 'image/png',
    size: Number(fm.size) || 0,
    createdAt: fm.created ?? '',
    description: fm.description?.replace(/^"|"$/g, ''),
    tags: list(fm.tags),
    dominantColors: list(fm.dominant_colors),
    suggestedUse: fm.suggested_use?.replace(/^"|"$/g, ''),
    source: fm.source,
  };
}

/**
 * #150 SQLITE-VEC-1 (the wrap): semantic search. The vec0 virtual table
 * lives behind this function — callers never touch sqlite-vec raw. Until
 * the binary pins land, an honest keyword pass keeps the API shape (the
 * fallback never pretends to be semantic).
 */
export function searchAssets(query: string, limit = 24): MediaAsset[] {
  return searchKeyword(query, limit);
}

/** #150's honest keyword pass — the fallback when no embedding key exists. */
export function searchKeyword(query: string, limit = 24): MediaAsset[] {
  const terms = query.toLowerCase().split(/\s+/).filter((t) => t.length >= 3);
  if (!terms.length) return [];
  const all = listAssets(1000);
  const scored = all
    .map((a) => {
      const hay = `${a.description ?? ''} ${(a.tags ?? []).join(' ')} ${a.suggestedUse ?? ''}`.toLowerCase();
      let score = 0;
      for (const t of terms) if (hay.includes(t)) score++;
      return { a, score };
    })
    .filter((x) => x.score > 0)
    .sort((x, y) => y.score - x.score)
    .slice(0, limit);
  return scored.map((x) => x.a);
}

const EXT_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/bmp': 'bmp',
  'image/svg+xml': 'svg',
};
