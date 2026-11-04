#!/usr/bin/env node
/**
 * references-refresh.mjs — v0.0.76: new references, within the daily budget.
 *
 * The catalog was generated once from the public sitemaps. This refreshes it:
 * it reads the OriginKit sitemap (public, no key), diffs the component slugs
 * against the catalog and appends up to `--limit` new rows (default 30 — the
 * same daily budget the Originkit MCP exposes). The fetch lane still uses the
 * MCP/API key when an agent actually pulls the source; this script only
 * discovers the reference, never copies code.
 *
 * Usage:
 *   node scripts/references-refresh.mjs            # dry-run, prints the diff
 *   node scripts/references-refresh.mjs --write    # appends the new rows
 *   node scripts/references-refresh.mjs --limit 10
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CATALOG = path.join(ROOT, 'src/lib/ui-references-expanded.ts');
const SITEMAP = process.env.ORIGINKIT_SITEMAP || 'https://www.originkit.dev/sitemap.xml';
const args = process.argv.slice(2);
const arg = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const LIMIT = Math.max(1, Number(arg('limit', '30')) || 30);
const WRITE = args.includes('--write');

const slugify = (s) => String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const titleize = (s) => String(s).replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

let xml = '';
try {
  const res = await fetch(SITEMAP, { headers: { 'user-agent': 'OLYMPUS-references-refresh' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  xml = await res.text();
} catch (e) {
  console.error(`references-refresh: sitemap unavailable (${e.message}) — nothing changed.`);
  process.exit(1);
}

const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
const slugs = locs
  .map((u) => u.match(/\/components\/([^/?#]+)\/?$/)?.[1])
  .filter(Boolean)
  .map(slugify);

const current = fs.readFileSync(CATALOG, 'utf-8');
const existing = new Set([...current.matchAll(/^\s*\["([^"]+)"/gm)].map((m) => m[1]));
const fresh = [...new Set(slugs)].filter((s) => s && !existing.has(s)).slice(0, LIMIT);

console.log(`references-refresh: ${slugs.length} sitemap slugs · ${existing.size} in the catalog · ${fresh.length} new (limit ${LIMIT})`);
for (const s of fresh) console.log(`  + ${s} — ${titleize(s)}`);

if (!WRITE || fresh.length === 0) {
  if (!WRITE) console.log('\ndry-run — pass --write to append.');
  process.exit(0);
}

const rows = fresh.map((id) => {
  const name = titleize(id);
  const what = `A ${name} study — the reference is the arrival, not the ornament.`;
  return `  ["${id}", "${name}", "originkit", "Uncategorized", "${what.replace(/"/g, '\\"')}", "https://www.originkit.dev/components/${id}", true, "originkit MCP: fetch ${id} (free API key)"],`;
}).join('\n');

const marker = 'export const ORIGINKIT_REFERENCE_ROWS: ExpandedReferenceRow[] = [';
const idx = current.indexOf(marker);
if (idx < 0) {
  console.error('references-refresh: catalog marker not found — nothing changed.');
  process.exit(1);
}
const insertAt = idx + marker.length;
const next = current.slice(0, insertAt) + '\n' + rows + current.slice(insertAt);
fs.writeFileSync(CATALOG, next);
console.log(`\nappended ${fresh.length} row(s) to src/lib/ui-references-expanded.ts — run tsc + the battery.`);
