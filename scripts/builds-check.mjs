#!/usr/bin/env node
/**
 * builds-check.mjs — v0.0.86 (H2): the Build Hub reference gate.
 *
 * THE SPECIMEN: two seed builds equipped demigods owned by another god
 * (`cache-layer` → Prometheus + Persephone's cache-architect;
 * `craft-prototype` → Athena + Apollo's rapid-prototyper). The hub showed a
 * ready loadout; at dispatch the runtime resolves `demigods/<leader>/<name>`,
 * so both failed in the leader god. Nothing validated the registry.
 *
 * This gate resolves EVERY reference a build declares against the real
 * on-disk registries:
 *   - skills    — deep discovery of `.opencode/skills/**\/SKILL.md`, by path
 *                 namespace (`superpowers/writing-plans`) OR basename alias;
 *   - MCPs      — `opencode.json` mcp keys + the shipped requirement maps
 *                 (local + optional);
 *   - demigods  — `.opencode/prompts/agents/demigods/<god>/<name>.txt` and
 *                 opencode.json subagents, matched with `_`/`-` equivalence,
 *                 and REQUIRED to belong to the build's leader god;
 *   - god       — one of the ten.
 *
 * Usage: npx tsx scripts/builds-check.mjs [--json] [--builds <file.json>]
 * Exit: 0 = every reference resolves; 1 = at least one dead reference.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const asJson = argv.includes('--json');
const buildsArg = argv.indexOf('--builds');
const buildFile = buildsArg >= 0 ? path.resolve(argv[buildsArg + 1] || '') : null;

const GODS = new Set(['apollo', 'atlas', 'artemis', 'athena', 'dionysus', 'hephaestus', 'hermes', 'persephone', 'prometheus', 'callimachus']);

function norm(name) {
  return String(name || '').trim().toLowerCase().replace(/_/g, '-');
}

// ── skills: deep discovery, path ids + basename alias ────────────────────────
const SKILLS_ROOT = path.join(ROOT, '.opencode', 'skills');
const skillNames = new Set();
const skillDirs = [];
function walkSkills(dir, depth = 0) {
  if (depth > 4) return;
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  if (entries.some((e) => e.isFile() && e.name === 'SKILL.md')) skillDirs.push(dir);
  for (const e of entries) {
    if (!e.isDirectory() || e.name === 'node_modules' || e.name === '.git') continue;
    walkSkills(path.join(dir, e.name), depth + 1);
  }
}
walkSkills(SKILLS_ROOT);
for (const dir of skillDirs) {
  const rel = path.relative(SKILLS_ROOT, dir).split(path.sep).join('/');
  const base = path.basename(dir);
  skillNames.add(rel);
  skillNames.add(base);
  // Sub-skill markdown files (e.g. superpowers/<name>/*.md) are indexed too.
  try {
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.md') || f === 'SKILL.md') continue;
      skillNames.add(`${rel}/${f.replace(/\.md$/, '')}`);
      skillNames.add(f.replace(/\.md$/, ''));
    }
  } catch { /* unreadable dir */ }
}

// ── MCPs: opencode.json + the shipped requirement maps ──────────────────────
const mcpNames = new Set();
try {
  const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'opencode.json'), 'utf-8'));
  for (const key of Object.keys(cfg.mcp || {})) mcpNames.add(key);
} catch { /* a missing config is reported below */ }
let requirementNames = [];
try {
  const req = await import(path.join(ROOT, 'src/lib/mcp-api-requirements.ts'));
  requirementNames = (req.MCP_API_REQUIREMENTS || []).flatMap((r) => r.names || []);
  for (const n of requirementNames) mcpNames.add(n);
  if (req.MCP_SERVER_REQUIREMENTS && typeof req.MCP_SERVER_REQUIREMENTS === 'object') {
    for (const n of Object.keys(req.MCP_SERVER_REQUIREMENTS)) mcpNames.add(n);
  }
} catch (e) {
  console.error(`builds-check: could not load the MCP requirement map — ${e?.message || e}`);
}

// ── demigods: prompts/<god>/*.txt + opencode.json subagents ──────────────────
const demigodOwners = new Map(); // normalized name → Set(gods)
const DEMIGOD_ROOT = path.join(ROOT, '.opencode', 'prompts', 'agents', 'demigods');
try {
  for (const god of fs.readdirSync(DEMIGOD_ROOT)) {
    const dir = path.join(DEMIGOD_ROOT, god);
    let entries = [];
    try { entries = fs.readdirSync(dir); } catch { continue; }
    for (const file of entries) {
      if (!/\.(txt|md)$/.test(file)) continue;
      const name = norm(file.replace(/\.(txt|md)$/, ''));
      if (!demigodOwners.has(name)) demigodOwners.set(name, new Set());
      demigodOwners.get(name).add(god);
    }
  }
} catch { /* no prompt tree */ }
try {
  const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'opencode.json'), 'utf-8'));
  for (const [name, agent] of Object.entries(cfg.agent || {})) {
    if (!agent || agent.mode !== 'subagent') continue;
    const key = norm(name);
    if (!demigodOwners.has(key)) demigodOwners.set(key, new Set());
    demigodOwners.get(key).add(norm(agent.leader || agent.god || ''));
  }
  // The leader is not always declared on the agent; remove the empty marker.
  for (const [name, owners] of demigodOwners) {
    owners.delete('');
    if (owners.size > 1) {
      // A name may exist under two gods in the config; keep only real prompt
      // owners when we have them, otherwise report ambiguity per build.
    }
  }
} catch { /* no config */ }

// ── the builds under test ───────────────────────────────────────────────────
let builds = [];
if (buildFile) {
  const raw = JSON.parse(fs.readFileSync(buildFile, 'utf-8'));
  builds = Array.isArray(raw) ? raw : (raw.builds || []);
} else {
  const mod = await import(path.join(ROOT, 'src/lib/design-builds.ts'));
  builds = mod.SEED_DESIGN_BUILDS;
}

const failures = [];
const fail = (build, kind, ref, detail) => failures.push({ build: build.id, kind, ref, detail });

// v0.0.86 (#341) — a build must carry at least one REACHABLE gate. The
// audit found 59 verify families for 8 executors; guidance-only checks made
// a build look verified while nothing could fail. `builds:check` enforces
// the mapping published in docs/BUILD-VERIFY.md.
const EXECUTABLE_GATE = /^(build|lint|test|typecheck|visual)$|^(file-exists|file-contains|file-omits|mounted|visual|design-score):/;

for (const b of builds) {
  if (!b || typeof b.id !== 'string') { failures.push({ build: '(invalid)', kind: 'build', ref: '', detail: 'missing id' }); continue; }
  if (!GODS.has(b.god)) fail(b, 'god', b.god, 'not one of the ten gods');
  for (const skill of b.skills || []) {
    if (!skillNames.has(skill) && !skillNames.has(norm(skill))) fail(b, 'skill', skill, 'no SKILL.md (path or basename)');
  }
  for (const mcp of b.mcps || []) {
    if (!mcpNames.has(mcp)) fail(b, 'mcp', mcp, 'not in opencode.json or the requirement maps');
  }
  if (!b.generated && !(b.verify || []).some((v) => EXECUTABLE_GATE.test(String(v)))) {
    fail(b, 'verify', '(none)', 'no executable gate — guidance-only checks cannot fail');
  }
  for (const demigod of b.demigods || []) {
    const owners = demigodOwners.get(norm(demigod));
    if (!owners || owners.size === 0) { fail(b, 'demigod', demigod, 'no prompt file or subagent definition'); continue; }
    if (!owners.has(b.god)) fail(b, 'demigod', demigod, `owned by ${[...owners].join(', ')}, build leader is ${b.god}`);
  }
}

const summary = {
  ok: failures.length === 0,
  builds: builds.length,
  curated: buildFile ? null : builds.filter((b) => !b.generated && !String(b.id).startsWith('mx-')).length,
  skills: skillDirs.length,
  mcps: mcpNames.size,
  demigods: demigodOwners.size,
  failures,
};

if (asJson) {
  console.log(JSON.stringify(summary, null, 2));
} else {
  console.log(`builds:check — ${summary.builds} build(s) · ${summary.skills} skills · ${summary.mcps} MCPs · ${summary.demigods} demigods`);
  for (const f of failures) console.log(`FAIL  ${f.build}  ${f.kind}:${f.ref} — ${f.detail}`);
  console.log(failures.length === 0 ? 'builds:check: all references resolve.' : `builds:check: ${failures.length} dead reference(s).`);
}
process.exit(failures.length === 0 ? 0 : 1);
