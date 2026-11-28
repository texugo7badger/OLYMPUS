#!/usr/bin/env node
/**
 * brain-bench.mjs — v0.1.7: measure the brain, not a feeling.
 *
 * Compact Brain and the recycler are only useful if the effect is measurable.
 * This script snapshots the state BEFORE and AFTER a compaction/recycle:
 *
 *   - active instincts (seed + empirical), project memory, archived, quick
 *   - context weight (bytes / approx tokens of the active instinct + knowledge)
 *   - knowledge notes and their freshness metadata
 *   - retrieval P@5, MRR@5 and latency via scripts/retrieval-eval.mjs
 *
 * It does NOT call a model. Retrieval is the deterministic quality proxy; a
 * model task suite is a separate, later eval. The JSON is the evidence.
 *
 * Usage:
 *   npm run brain:bench
 *   npm run brain:bench -- --compare reports/brain-bench-latest.json
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VAULT = process.env.OLYMPUS_VAULT || path.join(os.homedir(), 'OLYMPUS-VAULT');
const OUT_DIR = path.join(ROOT, 'reports');
const args = process.argv.slice(2);
const cmpIdx = args.indexOf('--compare');
const comparePath = cmpIdx >= 0 ? path.resolve(args[cmpIdx + 1]) : null;

function walk(dir, out = []) {
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.isFile() && e.name.endsWith('.md')) out.push(p);
  }
  return out;
}
function bytes(files) {
  return files.reduce((sum, f) => {
    try { return sum + fs.statSync(f).size; } catch { return sum; }
  }, 0);
}
function front(file) {
  try {
    const raw = fs.readFileSync(file, 'utf-8');
    const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    const fm = {};
    if (m) for (const line of m[1].split(/\r?\n/)) {
      const kv = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
      if (kv) fm[kv[1]] = kv[2].replace(/^["']|["']$/g, '').trim();
    }
    return fm;
  } catch { return {}; }
}

function snapshot() {
  const instincts = path.join(VAULT, '05_Auto_Learning', 'instincts');
  const project = path.join(VAULT, '05_Auto_Learning', 'project-instincts');
  const knowledge = path.join(VAULT, '04_Knowledge', 'references');
  const seed = [], empirical = [], archive = [], projectFiles = [], quick = [];
  for (const god of fs.existsSync(instincts) ? fs.readdirSync(instincts) : []) {
    const base = path.join(instincts, god);
    if (!fs.statSync(base).isDirectory()) continue;
    seed.push(...walk(path.join(base, 'seed')));
    empirical.push(...walk(path.join(base, 'empirical')));
    archive.push(...walk(path.join(base, '_archive')));
  }
  projectFiles.push(...walk(project));
  for (const f of [...seed, ...empirical]) {
    const fm = front(f);
    if (fm.quick_circuit === 'true') quick.push(f);
  }
  const knowledgeFiles = walk(knowledge);
  const active = [...seed, ...empirical];
  const activeBytes = bytes(active);
  const knowledgeBytes = bytes(knowledgeFiles);
  const activeTokens = Math.round(activeBytes / 4);
  const knowledgeTokens = Math.round(knowledgeBytes / 4);
  return {
    at: new Date().toISOString(),
    vault: VAULT,
    counts: {
      seed: seed.length,
      empirical: empirical.length,
      active: active.length,
      archived: archive.length,
      projectMemory: projectFiles.length,
      quickCircuits: quick.length,
      knowledge: knowledgeFiles.length,
    },
    context: {
      activeBytes,
      activeTokens,
      knowledgeBytes,
      knowledgeTokens,
      totalBytes: activeBytes + knowledgeBytes,
      totalTokens: activeTokens + knowledgeTokens,
    },
    archiveRatio: active.length ? Math.round((archive.length / active.length) * 1000) / 1000 : 0,
  };
}

function retrieval() {
  try {
    const out = execFileSync('npx', ['tsx', 'scripts/retrieval-eval.mjs'], {
      cwd: ROOT, encoding: 'utf-8', timeout: 180_000, stdio: ['ignore', 'pipe', 'pipe'],
    });
    const p = out.match(/P@5\s+FTS\s+([\d.]+%)\s+hybrid\s+([\d.]+%)/i);
    const m = out.match(/MRR@5 FTS\s+([\d.]+)\s+hybrid\s+([\d.]+)/i);
    const lat = out.match(/latency \(median\) FTS\s+(\d+)ms\s+hybrid\s+(\d+)ms/i);
    return {
      ok: true,
      p5: { fts: p?.[1] ?? null, hybrid: p?.[2] ?? null },
      mrr5: { fts: m?.[1] ?? null, hybrid: m?.[2] ?? null },
      medianMs: { fts: lat ? Number(lat[1]) : null, hybrid: lat ? Number(lat[2]) : null },
      rawTail: out.trim().split('\n').slice(-4),
    };
  } catch (e) {
    return { ok: false, error: String(e.message || e).slice(0, 400) };
  }
}

const snap = snapshot();
const ret = retrieval();
const result = { version: '0.1.7', ...snap, retrieval: ret };
fs.mkdirSync(OUT_DIR, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const file = path.join(OUT_DIR, `brain-bench-${stamp}.json`);
fs.writeFileSync(file, JSON.stringify(result, null, 2) + '\n');
fs.writeFileSync(path.join(OUT_DIR, 'brain-bench-latest.json'), JSON.stringify(result, null, 2) + '\n');

const md = [
  '# Brain benchmark',
  '',
  `Generated: ${result.at}`,
  `Vault: ${VAULT}`,
  '',
  '| Metric | Value |',
  '|---|---|',
  `| Seed instincts | ${result.counts.seed} |`,
  `| Empirical (global) | ${result.counts.empirical} |`,
  `| Active (seed + empirical) | ${result.counts.active} |`,
  `| Project memory | ${result.counts.projectMemory} |`,
  `| Archived | ${result.counts.archived} |`,
  `| Quick circuits | ${result.counts.quickCircuits} |`,
  `| Knowledge notes | ${result.counts.knowledge} |`,
  `| Active context | ${result.context.activeBytes} B (~${result.context.activeTokens} tok) |`,
  `| Knowledge context | ${result.context.knowledgeBytes} B (~${result.context.knowledgeTokens} tok) |`,
  `| Archive / active ratio | ${result.archiveRatio} |`,
  `| Retrieval P@5 (FTS / hybrid) | ${ret.ok ? `${ret.p5.fts} / ${ret.p5.hybrid}` : 'unavailable'} |`,
  `| Retrieval MRR@5 (FTS / hybrid) | ${ret.ok ? `${ret.mrr5.fts} / ${ret.mrr5.hybrid}` : 'unavailable'} |`,
  '',
  'The retrieval eval is a 15-query local set, not a universal benchmark. It is the deterministic quality proxy for this change; a model task suite is separate.',
];
fs.writeFileSync(path.join(OUT_DIR, 'brain-bench-latest.md'), md.join('\n') + '\n');

console.log(`brain-bench: ${file}`);
console.log(`active=${result.counts.active} project=${result.counts.projectMemory} archived=${result.counts.archived} quick=${result.counts.quickCircuits} knowledge=${result.counts.knowledge}`);
console.log(`context: active=${result.context.activeTokens} tok, knowledge=${result.context.knowledgeTokens} tok, archive/active=${result.archiveRatio}`);
console.log(ret.ok ? `retrieval: P@5 ${ret.p5.fts} / ${ret.p5.hybrid}, MRR@5 ${ret.mrr5.fts} / ${ret.mrr5.hybrid}` : `retrieval: ${ret.error}`);

if (comparePath && fs.existsSync(comparePath)) {
  const before = JSON.parse(fs.readFileSync(comparePath, 'utf-8'));
  const delta = (a, b) => (typeof a === 'number' && typeof b === 'number' ? `${b - a >= 0 ? '+' : ''}${b - a}` : '—');
  console.log('\ncompare (after - before):');
  for (const k of ['active', 'projectMemory', 'archived', 'quickCircuits', 'knowledge']) {
    console.log(`  ${k}: ${before.counts?.[k]} -> ${result.counts[k]} (${delta(before.counts?.[k], result.counts[k])})`);
  }
  console.log(`  activeTokens: ${before.context?.activeTokens} -> ${result.context.activeTokens} (${delta(before.context?.activeTokens, result.context.activeTokens)})`);
  console.log(`  P@5 hybrid: ${before.retrieval?.p5?.hybrid} -> ${ret.p5?.hybrid}`);
}
