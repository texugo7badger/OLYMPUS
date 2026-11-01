#!/usr/bin/env node
/**
 * bench-preflight.mjs — GO/NO-GO before a manual AIME bench.
 *
 * Checks the real surfaces a manual run depends on:
 *   - OLYMPUS version + the app health endpoint (3737, if running)
 *   - the active project lane + dispatch-plan.json validity
 *   - hop-state progress (completed / parked / inFlight / lost)
 *   - the lane's SQLite counts (works/users/library/relations)
 *   - the managed dev server (project livePreviewPort, default 3038)
 *   - the catalog-sync script's port (the 3000/3038 specimen)
 *   - the database backup directory
 *
 * Usage:
 *   node scripts/bench-preflight.mjs
 *   node scripts/bench-preflight.mjs --json
 *   node scripts/bench-preflight.mjs --slug aime
 *
 * Exit 0 = GO (no red); 1 = NO-GO.
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const HOME = os.homedir();
const VAULT = process.env.OLYMPUS_VAULT || path.join(HOME, 'OLYMPUS-VAULT');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const JSON_OUT = process.argv.includes('--json');
const SLUG_ARG = (() => {
  const i = process.argv.indexOf('--slug');
  return i >= 0 ? process.argv[i + 1] : null;
})();

const checks = [];
function add(level, name, detail) {
  checks.push({ level, name, detail: detail == null ? '' : String(detail) });
}
const red = (n, d) => add('RED', n, d);
const amber = (n, d) => add('AMBER', n, d);
const green = (n, d) => add('GREEN', n, d);

function readJson(file, fallback = null) {
  try { return JSON.parse(fs.readFileSync(file, 'utf-8')); } catch { return fallback; }
}
function read(file) {
  try { return fs.readFileSync(file, 'utf-8'); } catch { return ''; }
}
async function http(url, timeoutMs = 2500) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(t);
    return { ok: res.ok, status: res.status, text: await res.text().catch(() => '') };
  } catch (e) {
    return { ok: false, status: 0, error: e?.message || String(e) };
  }
}

// ── 1. Version / app ────────────────────────────────────────────────────────
const pkg = readJson(path.join(ROOT, 'package.json'), {});
const versionFile = read(path.join(ROOT, 'VERSION')).trim();
if (pkg.version && versionFile && pkg.version === versionFile) {
  green('OLYMPUS version', `package ${pkg.version} == VERSION ${versionFile}`);
} else {
  red('OLYMPUS version', `package ${pkg.version ?? '?'} != VERSION ${versionFile || '?'}`);
}

const health = await http('http://127.0.0.1:3737/api/olympus/health');
if (health.ok) green('OLYMPUS app :3737', `HTTP ${health.status}`);
else amber('OLYMPUS app :3737', 'not running — start the v0.0.30 AppImage (or npm run dev) before the bench');

// ── 2. Active project lane ──────────────────────────────────────────────────
const active = readJson(path.join(HOME, '.olympus', 'active-project.json'), {});
const slug = SLUG_ARG || active?.slug || null;
if (!slug) {
  red('active project', 'no ~/.olympus/active-project.json slug and no --slug');
}
const laneCandidates = slug ? [
  path.join(VAULT, '02_Projects', slug),
  path.join(HOME, '.local', 'share', 'olympus', 'workspace', slug),
] : [];
const lane = laneCandidates.find((p) => fs.existsSync(path.join(p, 'dispatch-plan.json'))) || laneCandidates[0] || null;
if (lane && fs.existsSync(lane)) green('project lane', lane);
else red('project lane', lane ? `${lane} does not exist` : 'not resolved');

// ── 3. Plan + state ─────────────────────────────────────────────────────────
const planPath = lane ? path.join(lane, 'dispatch-plan.json') : '';
const plan = planPath ? readJson(planPath, null) : null;
let hopCount = 0;
if (!plan || !Array.isArray(plan.hops) || plan.hops.length === 0) {
  red('dispatch-plan.json', planPath ? `missing/unparseable at ${planPath}` : 'no lane');
} else {
  hopCount = plan.hops.length;
  const ids = new Set(plan.hops.map((h) => String(h.id)));
  const dup = plan.hops.length !== ids.size;
  const badAfter = plan.hops.flatMap((h) => (h.after ?? []).filter((d) => !ids.has(String(d))).map((d) => `${h.id}->${d}`));
  const checksOk = plan.hops.every((h) => Array.isArray(h.artifacts) && h.artifacts.length > 0);
  if (dup) red('plan ids', 'duplicate hop ids');
  if (badAfter.length) red('plan dependencies', badAfter.slice(0, 5).join(', '));
  if (!checksOk) amber('plan artifacts', 'some hops declare no artifacts');
  if (!dup && badAfter.length === 0) green('dispatch-plan.json', `${hopCount} hops, acyclic refs, artifacts declared`);
}

const statePath = lane ? path.join(lane, '.olympus-hop-state.json') : '';
const state = statePath ? readJson(statePath, null) : null;
const completed = new Set(Array.isArray(state?.completed) ? state.completed.map(String) : []);
const inFlight = Array.isArray(state?.inFlight) ? state.inFlight : [];
const lockPath = lane ? path.join(lane, '.olympus-walk.lock') : '';
const lock = lockPath ? readJson(lockPath, null) : null;
let lockAlive = false;
if (lock && lock.pid) {
  try { process.kill(Number(lock.pid), 0); lockAlive = true; } catch { lockAlive = false; }
}
if (state) {
  green('hop-state', `${completed.size}/${hopCount || '?'} completed · ${inFlight.length} inFlight · parked=${state.parked?.hopId ?? 'none'} · campaign=${state.campaignId ?? '?'}`);
} else {
  amber('hop-state', 'missing — a fresh campaign will create it');
}
if (inFlight.length > 0 && !lockAlive) {
  amber('stale inFlight', `${inFlight.length} record(s) from a dead walk — v0.0.30 marks them LOST and prunes on resume`);
} else if (inFlight.length > 0 && lockAlive) {
  green('live walk', `pid ${lock.pid} holds the walk lock`);
}
if (plan && state) {
  const pending = plan.hops.filter((h) => !completed.has(String(h.id))).map((h) => String(h.id));
  green('next hops', pending.slice(0, 6).join(' -> ') + (pending.length > 6 ? ' …' : ''));
}

// ── 4. Database counts ──────────────────────────────────────────────────────
const dbPath = lane ? path.join(lane, 'prisma', 'dev.db') : '';
if (dbPath && fs.existsSync(dbPath)) {
  try {
    const Database = (await import('better-sqlite3')).default;
    const db = new Database(dbPath, { readonly: true });
    const count = (t) => { try { return db.prepare(`select count(*) n from "${t}"`).get().n; } catch { return null; } };
    const works = count('works'), users = count('users'), library = count('library_entries'), relations = count('work_relations');
    db.close();
    const detail = `works=${works ?? '?'} users=${users ?? '?'} library=${library ?? '?'} relations=${relations ?? '?'}`;
    if (works === 0) red('AIME database', `${detail} — run npm run db:seed (and the d5 restore) before the bench`);
    else if (works < 120) amber('AIME database', `${detail} — seed restored; the d5 hop must reach 120+ works`);
    else green('AIME database', detail);
  } catch (e) {
    amber('AIME database', `unreadable: ${e?.message || e}`);
  }
} else {
  amber('AIME database', dbPath ? `${dbPath} absent` : 'no lane');
}

// ── 5. Dev server + catalog script port ─────────────────────────────────────
const projectMd = lane ? read(path.join(lane, 'project.md')) : '';
const portMatch = projectMd.match(/livePreviewPort\s*:\s*(\d+)/);
const previewPort = portMatch ? Number(portMatch[1]) : 3038;
const dev = await http(`http://127.0.0.1:${previewPort}/`);
if (dev.ok || dev.status > 0) green(`AIME dev server :${previewPort}`, `HTTP ${dev.status}`);
else amber(`AIME dev server :${previewPort}`, `not running — use the OLYMPUS preview manager Start (never a second manual server)`);

const catalogScript = lane ? read(path.join(lane, 'scripts', 'catalog-sync.sh')) : '';
if (!catalogScript) {
  amber('catalog-sync.sh', 'not found in the lane');
} else if (catalogScript.includes('3038') || catalogScript.includes('OLYMPUS_PREVIEW_URL')) {
  green('catalog-sync.sh port', `defaults to :${previewPort} (the manager host)`);
} else if (catalogScript.includes('localhost:3000')) {
  red('catalog-sync.sh port', 'defaults to :3000 while the manager hosts :3038 — the d5 restore will get connection-refused');
} else {
  amber('catalog-sync.sh port', 'port not recognized — inspect before the restore');
}

// ── 6. Backups ──────────────────────────────────────────────────────────────
const backupDir = lane ? path.join(lane, '.olympus-backups') : '';
if (backupDir && fs.existsSync(backupDir)) {
  const entries = fs.readdirSync(backupDir).filter((n) => !n.startsWith('.'));
  if (entries.length > 0) green('DB backups', `${entries.length} snapshot(s) in .olympus-backups/ (latest ${entries.sort().slice(-1)[0]})`);
  else amber('DB backups', '.olympus-backups/ exists but is empty');
} else {
  amber('DB backups', 'none yet — v0.0.30 creates one before the first destructive hop');
}

// ── 7. MCP default (read-only, no spawn) ────────────────────────────────────
const rootCfg = readJson(path.join(ROOT, 'opencode.json'), {});
const mcp = rootCfg?.mcp && typeof rootCfg.mcp === 'object' ? rootCfg.mcp : {};
const enabled = Object.entries(mcp).filter(([, v]) => v?.enabled === true).map(([k]) => k);
if (enabled.length > 0) {
  amber('MCP default', `${enabled.length} enabled: ${enabled.join(', ')} — run npm run mcp:audit for liveness; a campaign manifest filters the lane`);
} else {
  amber('MCP default', 'no enabled MCP in the root config');
}

// ── Report ──────────────────────────────────────────────────────────────────
const reds = checks.filter((c) => c.level === 'RED');
const ambers = checks.filter((c) => c.level === 'AMBER');
const verdict = reds.length > 0 ? 'NO-GO' : ambers.length > 0 ? 'GO (with warnings)' : 'GO';

if (JSON_OUT) {
  console.log(JSON.stringify({ verdict, slug, lane, checks }, null, 2));
} else {
  console.log(`\nOLYMPUS bench preflight — ${slug || 'no project'} — ${verdict}\n`);
  for (const c of checks) {
    const glyph = c.level === 'GREEN' ? '✓' : c.level === 'AMBER' ? '!' : '✗';
    console.log(`  ${glyph} ${c.level.padEnd(5)} ${c.name}: ${c.detail}`);
  }
  console.log('');
  if (reds.length) console.log(`NO-GO: ${reds.length} red check(s). Fix them before the manual bench.`);
  else if (ambers.length) console.log(`GO with ${ambers.length} warning(s) — read them before starting.`);
  else console.log('GO — every checked surface is ready.');
}

process.exit(reds.length > 0 ? 1 : 0);
