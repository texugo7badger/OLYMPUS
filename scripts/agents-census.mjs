#!/usr/bin/env node
/**
 * agents-census.mjs — v0.0.74: who actually dispatches.
 *
 * The v3 analysis measured the surface (+3,958 lines, 132 agents) and asked
 * for pruning. Pruning blind is how a campaign breaks: a demigod with zero
 * dispatches may still be named by a plan. This census answers three
 * questions with files, never with intuition:
 *
 *   1. DECLARED — every demigod prompt on disk;
 *   2. DISPATCHED — every agent seen in the resonance log (and the gate log);
 *   3. REFERENCED — every demigod named by a project's dispatch-plan.json.
 *
 * A demigod is a KEEP when it dispatched, is referenced by a plan, or is a
 * god (the 10 are structural). Everything else is an ARCHIVE CANDIDATE — a
 * proposal, never an action. `--json` for the machine, `--write` to write
 * `reports/agents-census.json`.
 *
 * Usage: node scripts/agents-census.mjs [--json] [--write]
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOME = process.env.OLYMPUS_HOME || path.join(os.homedir(), '.olympus');
const VAULT = process.env.OLYMPUS_VAULT || path.join(os.homedir(), 'OLYMPUS-VAULT');
const norm = (id) => String(id || '').trim().replace(/_/g, '-').toLowerCase();
const GODS = new Set(['apollo', 'atlas', 'artemis', 'athena', 'dionysus', 'hephaestus', 'hermes', 'persephone', 'prometheus', 'callimachus']);
const args = process.argv.slice(2);
const json = args.includes('--json');
const write = args.includes('--write');

const readJsonl = (file) => {
  try {
    return fs.readFileSync(file, 'utf-8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  } catch { return []; }
};
const walk = (dir, out = []) => {
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.md') || e.name.endsWith('.txt')) out.push(p);
  }
  return out;
};

// 1. Declared demigods (one directory per god under .opencode/prompts/agents/demigods).
const demigodRoot = path.join(ROOT, '.opencode', 'prompts', 'agents', 'demigods');
const declared = new Map(); // id -> god
for (const god of fs.existsSync(demigodRoot) ? fs.readdirSync(demigodRoot) : []) {
  if (god === '_archive') continue; // v0.0.88 — archived demigods are not declared
  const dir = path.join(demigodRoot, god);
  if (!fs.statSync(dir).isDirectory()) continue;
  for (const file of walk(dir)) {
    const id = norm(path.basename(file).replace(/\.(md|txt)$/i, '').replace(/-prompt$/, ''));
    if (id && !declared.has(id)) declared.set(id, god);
  }
}

// 2. Dispatched: the resonance log (the product's own feedback loop) + gate log.
const resonance = readJsonl(path.join(VAULT, '03_Index', 'arsenal-resonance.jsonl'));
const dispatches = new Map();
const bump = (id, n = 1) => { const k = norm(id); if (k) dispatches.set(k, (dispatches.get(k) || 0) + n); };
for (const row of resonance) {
  for (const key of ['demigod', 'demigodId', 'agent', 'godId', 'god']) {
    const v = row?.[key];
    if (typeof v === 'string' && v) bump(v);
  }
}
const gate = readJsonl(path.join(VAULT, '05_Auto_Learning', 'shortcircuit-log.jsonl'));
for (const row of gate) {
  for (const key of ['god', 'demigod', 'agent']) {
    const v = row?.[key];
    if (typeof v === 'string' && v) bump(v);
  }
}

// 3. Referenced by any project plan.
const referenced = new Set();
const projects = path.join(VAULT, '02_Projects');
for (const slug of fs.existsSync(projects) ? fs.readdirSync(projects) : []) {
  try {
    const plan = JSON.parse(fs.readFileSync(path.join(projects, slug, 'dispatch-plan.json'), 'utf-8'));
    for (const hop of plan?.hops ?? []) {
      if (typeof hop?.demigod === 'string') referenced.add(norm(hop.demigod));
      if (typeof hop?.god === 'string') referenced.add(norm(hop.god));
    }
  } catch { /* no plan */ }
}

const declaredIds = [...declared.keys()];
const keep = [];
const candidates = [];
for (const id of declaredIds) {
  const isGod = GODS.has(id);
  const count = dispatches.get(id) || 0;
  if (isGod || count > 0 || referenced.has(id)) keep.push({ id, god: declared.get(id), dispatches: count, referenced: referenced.has(id), god_tier: isGod });
  else candidates.push({ id, god: declared.get(id), dispatches: 0 });
}

const report = {
  generatedAt: new Date().toISOString(),
  declared: declaredIds.length,
  dispatched: [...dispatches.keys()].filter((id) => (dispatches.get(id) || 0) > 0).length,
  referenced: referenced.size,
  keep: keep.sort((a, b) => b.dispatches - a.dispatches),
  archiveCandidates: candidates.sort((a, b) => a.id.localeCompare(b.id)),
  resonanceRows: resonance.length,
  gateRows: gate.length,
};

if (write) {
  const out = path.join(ROOT, 'reports');
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'agents-census.json'), JSON.stringify(report, null, 2) + '\n');
}

if (json) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`\nOLYMPUS agents census — ${new Date().toISOString().slice(0, 10)}`);
  console.log(`declared ${report.declared} · dispatched ${report.dispatched} · referenced by a plan ${report.referenced}`);
  console.log(`evidence: ${resonance.length} resonance rows · ${gate.length} gate rows\n`);
  console.log('KEEP (dispatched or referenced):');
  for (const k of report.keep.slice(0, 40)) console.log(`  ${k.id.padEnd(28)} ${String(k.dispatches).padStart(4)} dispatch(es)${k.referenced ? ' · referenced' : ''}${k.god_tier ? ' · god' : ''}`);
  console.log(`\nARCHIVE CANDIDATES (0 dispatches, 0 references): ${candidates.length}`);
  for (const c of candidates.slice(0, 60)) console.log(`  ${c.id.padEnd(28)} (${c.god})`);
  if (candidates.length > 60) console.log(`  … ${candidates.length - 60} more (use --json)`);
  console.log('\nThis is a PROPOSAL. Archiving is a decision, never a blind cut: a demigod named by a future plan is not dead.\n');
}
