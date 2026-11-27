#!/usr/bin/env node
/**
 * instinct-audit.mjs — v0.1.4: the AIME instinct audit (read-only).
 *
 * The vault has 200+ empirical instincts. The audit names what the evidence
 * supports, what is project memory wearing a global coat, what duplicates
 * another trigger, and what is a fixture — WITHOUT touching a file. The
 * quarantine tool consumes the JSON; `--apply` there is a separate decision.
 *
 * Usage:
 *   npm run instincts:audit
 *   npm run instincts:audit -- --vault ~/OLYMPUS-VAULT
 *
 * Output: reports/instinct-audit-v014.{json,md} (gitignored).
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

const args = process.argv.slice(2);
const vaultArg = args.indexOf('--vault');
const VAULT = vaultArg >= 0 ? path.resolve(args[vaultArg + 1]) : (process.env.OLYMPUS_VAULT || path.join(os.homedir(), 'OLYMPUS-VAULT'));
const ROOT = path.join(VAULT, '05_Auto_Learning', 'instincts');
const OUT_DIR = process.env.OLYMPUS_REPORT_DIR || path.join(process.cwd(), 'reports');
const STALE_DAYS = 90;

function field(text, key) {
  const m = new RegExp(`^${key}:\\s*(.*)$`, 'm').exec(text);
  return m ? m[1].trim().replace(/^["']|["']$/g, '') : '';
}
function list(value) {
  return String(value || '').replace(/^\[|\]$/g, '').split(',').map((s) => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
}
function confidence(successes, failures) {
  const n = successes + failures;
  if (n <= 0) return 0;
  return Math.round(Math.max(0, Math.min(0.95, (successes / n) * Math.sqrt(n) / (1 + Math.sqrt(n)))) * 1000) / 1000;
}
function tokens(text) {
  return new Set(String(text || '').toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 2));
}
function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / new Set([...a, ...b]).size;
}
function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

const rows = [];
for (const god of fs.existsSync(ROOT) ? fs.readdirSync(ROOT) : []) {
  if (god.startsWith('_')) continue;
  const dir = path.join(ROOT, god, 'empirical');
  if (!fs.existsSync(dir)) continue;
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.md'))) {
    const abs = path.join(dir, file);
    const text = fs.readFileSync(abs, 'utf-8');
    const legacy = Number(field(text, 'confidence') || 0);
    const successes = Number(field(text, 'successes') || field(text, 'samples') || 0);
    const failures = Number(field(text, 'failures') || 0);
    const samples = successes + failures;
    const projects = list(field(text, 'projects'));
    const stacks = list(field(text, 'stacks'));
    const scope = ['global', 'stack', 'project'].includes(field(text, 'scope')) ? field(text, 'scope') : 'global';
    const trigger = field(text, 'trigger');
    const action = field(text, 'action');
    const lastUsed = field(text, 'last_used');
    const ageDays = lastUsed ? Math.floor((Date.now() - Date.parse(lastUsed)) / 86_400_000) : null;
    const aimeOnly = projects.length > 0 && projects.every((p) => p.toLowerCase() === 'aime');
    const fixture = /fixture|deterministic script|synthetic|test only/i.test(`${trigger} ${action}`);
    const unprovenGlobal = scope === 'global' && samples < 3;
    const aimeGlobal = aimeOnly && scope === 'global';
    const stale = ageDays != null && ageDays > STALE_DAYS;
    rows.push({
      god, file, path: abs, scope, projects, stacks, trigger, action,
      legacy_confidence: legacy,
      confidence: confidence(successes, failures) || legacy,
      samples, successes, failures,
      quick_circuit: field(text, 'quick_circuit') === 'true',
      last_used: lastUsed || null,
      age_days: ageDays,
      flags: { aimeOnly, fixture, unprovenGlobal, aimeGlobal, stale },
      sha256: sha256(abs),
    });
  }
}

// Duplicates: same god, trigger Jaccard >= 0.8. Keep the higher-sample row.
const duplicates = new Set();
for (let i = 0; i < rows.length; i++) {
  for (let j = i + 1; j < rows.length; j++) {
    if (rows[i].god !== rows[j].god) continue;
    if (jaccard(tokens(rows[i].trigger), tokens(rows[j].trigger)) < 0.8) continue;
    const keep = rows[i].samples >= rows[j].samples ? i : j;
    const drop = keep === i ? j : i;
    rows[drop].flags.duplicateOf = rows[keep].file;
    duplicates.add(drop);
  }
}

for (const row of rows) {
  if (row.flags.fixture) row.recommended = 'quarantine';
  else if (row.flags.duplicateOf) row.recommended = 'quarantine';
  else if (row.flags.stale) row.recommended = 'quarantine';
  else if (row.flags.aimeGlobal) row.recommended = 'rescope-project';
  else row.recommended = 'keep';
}

const summary = {
  generatedAt: new Date().toISOString(),
  vault: VAULT,
  scanned: rows.length,
  byGod: Object.fromEntries([...new Set(rows.map((r) => r.god))].map((g) => [g, rows.filter((r) => r.god === g).length])),
  aimeOnly: rows.filter((r) => r.flags.aimeOnly).length,
  global: rows.filter((r) => r.scope === 'global').length,
  project: rows.filter((r) => r.scope === 'project').length,
  stack: rows.filter((r) => r.scope === 'stack').length,
  fixtures: rows.filter((r) => r.flags.fixture).length,
  duplicates: [...duplicates].length,
  stale: rows.filter((r) => r.flags.stale).length,
  aimeGlobal: rows.filter((r) => r.flags.aimeGlobal).length,
  recommendedQuarantine: rows.filter((r) => r.recommended === 'quarantine').length,
  recommendedRescope: rows.filter((r) => r.recommended === 'rescope-project').length,
  quickCircuits: rows.filter((r) => r.quick_circuit).length,
};

fs.mkdirSync(OUT_DIR, { recursive: true });
const jsonPath = path.join(OUT_DIR, 'instinct-audit-v014.json');
const mdPath = path.join(OUT_DIR, 'instinct-audit-v014.md');
fs.writeFileSync(jsonPath, JSON.stringify({ summary, rows }, null, 2) + '\n');
const md = [
  '# Instinct audit — v0.1.4',
  '',
  `Generated: ${summary.generatedAt}`,
  `Vault: ${VAULT}`,
  '',
  '## Census',
  '',
  `- scanned: **${summary.scanned}** empirical instincts`,
  `- scope: global ${summary.global} · project ${summary.project} · stack ${summary.stack}`,
  `- AIME-only: **${summary.aimeOnly}** (project memory)`,
  `- global but AIME-only: **${summary.aimeGlobal}** (should be project-scoped)`,
  `- fixtures: **${summary.fixtures}** · duplicates: **${summary.duplicates}** · stale (>${STALE_DAYS}d): **${summary.stale}**`,
  `- quick circuits marked: **${summary.quickCircuits}**`,
  '',
  `Recommendation: quarantine **${summary.recommendedQuarantine}**, rescope **${summary.recommendedRescope}**, keep the rest.`,
  '',
  '## Rows recommended for quarantine',
  '',
  '| god | file | samples | confidence | reason |',
  '|---|---|---:|---:|---|',
  ...rows.filter((r) => r.recommended === 'quarantine').slice(0, 100).map((r) =>
    `| ${r.god} | ${r.file} | ${r.samples} | ${r.confidence} | ${r.flags.fixture ? 'fixture' : r.flags.duplicateOf ? `duplicate of ${r.flags.duplicateOf}` : 'stale'} |`),
  '',
  '## Rows to rescope to project',
  '',
  '| god | file | trigger | projects |',
  '|---|---|---|---|',
  ...rows.filter((r) => r.recommended === 'rescope-project').slice(0, 100).map((r) =>
    `| ${r.god} | ${r.file} | ${r.trigger.slice(0, 80)} | ${r.projects.join(', ')} |`),
  '',
  'Nothing was moved. `npm run instincts:quarantine` is a dry-run; `--apply` moves files to `_archive` with a manifest and `npm run instincts:restore` brings them back byte-for-byte.',
].join('\n');
fs.writeFileSync(mdPath, md + '\n');

console.log(JSON.stringify({ ...summary, jsonPath, mdPath }, null, 2));
