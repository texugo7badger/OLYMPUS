#!/usr/bin/env node
/**
 * archive-demigods.mjs — v0.0.88: the census cut, with a restore path.
 *
 * The published census: 122 demigods declared, 14 ever dispatched, 3 plan
 * references. Keeping only the census's 7 would break the 46 demigods the
 * curated builds actually equip. The honest keep set is the UNION of:
 *   - census keep (dispatched > 0, plan-referenced, god tier),
 *   - every demigod referenced by a curated build,
 *   - every demigod in the active campaign plan.
 * Everything else is archived: the prompt moves to
 * `.opencode/prompts/agents/demigods/_archive/<god>/` and its `agent` entry
 * leaves `opencode.json`. The manifest stores the definition, so `--restore`
 * is one command and byte-faithful.
 *
 * Usage: npx tsx scripts/archive-demigods.mjs [--dry-run|--apply|--restore]
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MODE = process.argv.includes('--apply') ? 'apply' : process.argv.includes('--restore') ? 'restore' : 'dry-run';
const DEMI = path.join(ROOT, '.opencode', 'prompts', 'agents', 'demigods');
const ARCHIVE = path.join(DEMI, '_archive');
const MANIFEST = path.join(ROOT, '.opencode', 'demigods-archive-manifest.json');
const CONFIG = path.join(ROOT, 'opencode.json');
const REGISTRY = path.join(ROOT, 'opencode.demigods.json');
const norm = (x) => String(x).replace(/_/g, '-');

function readJson(file, fallback = null) {
  try { return JSON.parse(fs.readFileSync(file, 'utf-8')); } catch { return fallback; }
}

function syncRegistry(manifest) {
  const reg = readJson(REGISTRY, { demigods: {} });
  reg.demigods = reg.demigods || {};
  for (const a of manifest.archived || []) {
    if (reg.demigods[a.id]) {
      a.registryDef = reg.demigods[a.id];
      delete reg.demigods[a.id];
    }
  }
  const gods = {};
  for (const d of Object.values(reg.demigods)) {
    const g = d?.parent_god;
    if (g) gods[g] = (gods[g] || 0) + 1;
  }
  reg._meta = { ...(reg._meta || {}), total: Object.keys(reg.demigods).length, gods, archived: (manifest.archived || []).length, updatedAt: new Date().toISOString() };
  fs.writeFileSync(REGISTRY, JSON.stringify(reg, null, 2) + '\n');
  fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');
  return Object.keys(reg.demigods).length;
}

function restore() {
  const manifest = readJson(MANIFEST);
  if (!manifest) { console.error('no archive manifest'); process.exit(1); }
  const cfg = readJson(CONFIG, { agent: {} });
  let restored = 0;
  for (const a of manifest.archived || []) {
    const from = path.join(ARCHIVE, a.god, a.file);
    const to = path.join(DEMI, a.god, a.file);
    try {
      fs.mkdirSync(path.dirname(to), { recursive: true });
      if (fs.existsSync(from)) fs.renameSync(from, to);
      if (a.agentDef) cfg.agent[a.id] = a.agentDef;
      if (a.registryDef) {
        const reg = readJson(REGISTRY, { demigods: {} });
        reg.demigods = reg.demigods || {};
        reg.demigods[a.id] = a.registryDef;
        fs.writeFileSync(REGISTRY, JSON.stringify(reg, null, 2) + '\n');
      }
      restored++;
    } catch (e) { console.error('restore failed', a.id, e.message); }
  }
  fs.writeFileSync(CONFIG, JSON.stringify(cfg, null, 2) + '\n');
  try { fs.rmSync(MANIFEST); } catch {}
  try { fs.rmSync(ARCHIVE, { recursive: true, force: true }); } catch {}
  console.log(`restored ${restored} demigod(s) — opencode.json has ${Object.keys(cfg.agent || {}).length} agents`);
}

if (MODE === 'restore') { restore(); process.exit(0); }

// v0.0.88 — SYNC the second registry (opencode.demigods.json) with the
// archive manifest. The first apply left it at 122 while opencode.json was
// 81; the dispatch tool reads THIS map, so an archived id would still be
// dispatchable (and the image-gen gate caught the drift).
if (process.argv.includes('--sync')) {
  const manifest = readJson(MANIFEST);
  if (!manifest) { console.error('no archive manifest'); process.exit(1); }
  const live = syncRegistry(manifest);
  console.log(`synced the registry — ${live} live demigod(s), ${manifest.archived.length} archived`);
  process.exit(0);
}

const { SEED_DESIGN_BUILDS } = await import(path.join(ROOT, 'src/lib/design-builds.ts'));
const buildRefs = new Set((SEED_DESIGN_BUILDS || []).flatMap((b) => b.demigods || []).map(norm));
const census = JSON.parse(execSync('node scripts/agents-census.mjs --json', { cwd: ROOT, encoding: 'utf-8', timeout: 300_000 }));
const keep = new Set((census.keep || []).map((k) => norm(k.id)));
for (const id of buildRefs) keep.add(id);
// The active project's plan, if any (the only current campaign on this box).
try {
  const active = readJson(path.join(process.env.OLYMPUS_HOME || path.join(os.homedir(), '.olympus'), 'active-project.json'), {});
  const slug = String(active?.slug || '');
  const vault = process.env.OLYMPUS_VAULT || path.join(os.homedir(), 'OLYMPUS-VAULT');
  const plan = readJson(path.join(vault, '02_Projects', slug, 'dispatch-plan.json'), { hops: [] });
  for (const h of plan.hops || []) {
    for (const d of [...(h.demigods || []), h.demigod].filter(Boolean)) keep.add(norm(d));
  }
} catch { /* no active plan */ }

const cfg = readJson(CONFIG, { agent: {} });
const declared = [];
for (const god of fs.readdirSync(DEMI)) {
  if (god === '_archive') continue;
  const dir = path.join(DEMI, god);
  if (!fs.statSync(dir).isDirectory()) continue;
  for (const file of fs.readdirSync(dir)) {
    if (!/\.(txt|md)$/.test(file)) continue;
    declared.push({ id: norm(file.replace(/\.(txt|md)$/, '')), god, file });
  }
}
const seen = new Set();
const archived = [];
const kept = [];
for (const d of declared) {
  if (seen.has(d.id)) continue;
  seen.add(d.id);
  if (keep.has(d.id)) kept.push(d);
  else archived.push({ ...d, agentDef: cfg.agent?.[d.id] ?? null });
}

console.log(`agents:archive — mode=${MODE}`);
console.log(`declared ${declared.length} · keep ${kept.length} (${buildRefs.size} build refs, ${census.keep?.length ?? 0} census keep, plan refs) · archive ${archived.length}`);
console.log('archived:', archived.map((a) => `${a.id}(${a.god})`).join(', ').slice(0, 2000));

if (MODE === 'dry-run') {
  console.log('dry-run: no file changed. Re-run with --apply.');
  process.exit(0);
}

if (MODE === 'apply') {
  const manifest = { version: 1, archivedAt: new Date().toISOString(), kept: kept.map((k) => k.id), archived };
  for (const a of archived) {
    const from = path.join(DEMI, a.god, a.file);
    const to = path.join(ARCHIVE, a.god, a.file);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.renameSync(from, to);
    if (cfg.agent && cfg.agent[a.id]) delete cfg.agent[a.id];
  }
  fs.writeFileSync(CONFIG, JSON.stringify(cfg, null, 2) + '\n');
  fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');
  const live = syncRegistry(manifest);
  console.log(`applied — ${archived.length} archived, ${kept.length} kept, ${live} live demigods, ${Object.keys(cfg.agent || {}).length} agents in opencode.json`);
}
