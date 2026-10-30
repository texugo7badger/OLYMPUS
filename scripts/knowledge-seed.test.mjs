#!/usr/bin/env node
/**
 * knowledge-seed.test.mjs — THE GOD KNOWLEDGE BASE (v0.0.24).
 *
 * The vault had 26 references across 6 categories; planning, orchestration,
 * design, QA, data, vault and release were missing. This suite pins the
 * versioned templates + the safe seeder.
 *
 *   K1  the template set covers every missing domain
 *   K2  every template has frontmatter, a god and at least one source
 *   K3  the seeder is create-if-missing (dry-run writes nothing)
 *   K4  --force backs up before overwriting
 *   K5  the atlas maps the new categories to the right gods
 *
 * Run: npx tsx scripts/knowledge-seed.test.mjs (exit 0 = pass)
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0, failures = 0;
function expect(name, cond, detail) {
  if (cond) { passed++; console.log(`PASS  ${name}`); }
  else { failures++; console.log(`FAIL  ${name}${detail ? ' — ' + String(detail).slice(0, 300) : ''}`); }
}
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf-8');

// K1 — the domain coverage.
{
  const required = [
    'planning/architecture-decisions.md',
    'planning/task-decomposition.md',
    'orchestration/multi-agent-patterns.md',
    'design/accessibility.md',
    'design/design-systems.md',
    'design/performance.md',
    'qa/test-strategy.md',
    'qa/evidence-and-release-gates.md',
    'data/schema-design.md',
    'data/query-performance.md',
    'vault/knowledge-ops.md',
    'release/release-engineering.md',
    'security/threat-modeling.md',
    'integrations/mcp.md',
  ];
  for (const rel of required) {
    expect(`K1 template ${rel}`, fs.existsSync(path.join(ROOT, 'scripts/knowledge', rel)));
  }
}

// K2 — the content contract.
{
  const dir = path.join(ROOT, 'scripts/knowledge');
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : (e.name.endsWith('.md') ? [path.join(d, e.name)] : []));
  const files = walk(dir);
  expect('K2 at least 14 templates', files.length >= 14, String(files.length));
  for (const f of files) {
    const raw = fs.readFileSync(f, 'utf-8');
    const rel = path.relative(dir, f);
    expect(`K2 ${rel} has frontmatter`, /^---\r?\n[\s\S]*?\r?\n---/.test(raw));
    expect(`K2 ${rel} names a god`, /^god:\s*\w+/m.test(raw));
    expect(`K2 ${rel} carries sources`, /^sources:/m.test(raw) && /https?:\/\//.test(raw));
    expect(`K2 ${rel} says when to use`, /## When to use/.test(raw));
  }
}

// K3/K4 — the seeder.
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'olympus-knowledge-'));
  const vault = path.join(tmp, 'vault');
  fs.mkdirSync(path.join(vault, '04_Knowledge', 'references'), { recursive: true });
  const env = { ...process.env, OLYMPUS_VAULT: vault, HOME: tmp };

  const dry = execFileSync('node', [path.join(ROOT, 'scripts/seed-knowledge-base.mjs'), '--dry-run'], { encoding: 'utf-8', env });
  const afterDry = fs.readdirSync(path.join(vault, '04_Knowledge', 'references'));
  expect('K3 dry run writes nothing', afterDry.length === 0, afterDry.join(','));
  expect('K3 dry run reports creates', /13 create|14 create/.test(dry), dry.slice(-200));

  execFileSync('node', [path.join(ROOT, 'scripts/seed-knowledge-base.mjs')], { encoding: 'utf-8', env });
  const afterApply = fs.readdirSync(path.join(vault, '04_Knowledge', 'references'));
  expect('K3 apply creates the category dirs', afterApply.includes('design') && afterApply.includes('planning') && afterApply.includes('data'), afterApply.join(','));

  // K4 — force backs up.
  const target = path.join(vault, '04_Knowledge', 'references', 'design', 'accessibility.md');
  fs.writeFileSync(target, 'user edit\n');
  execFileSync('node', [path.join(ROOT, 'scripts/seed-knowledge-base.mjs'), '--force'], { encoding: 'utf-8', env });
  const backups = fs.existsSync(path.join(tmp, '.olympus', 'backups', 'knowledge'))
    ? fs.readdirSync(path.join(tmp, '.olympus', 'backups', 'knowledge'))
    : [];
  expect('K4 --force backs up the old note', backups.some((b) => b.includes('accessibility')), backups.join(','));
  expect('K4 --force restored the template', /WCAG 2\.2/.test(fs.readFileSync(target, 'utf-8')));
  fs.rmSync(tmp, { recursive: true, force: true });
}

// K5 — the atlas mapping.
{
  const src = read('src/lib/olympus.ts');
  for (const [cat, god] of [['planning', 'apollo'], ['orchestration', 'atlas'], ['design', 'athena'], ['qa', 'dionysus'], ['data', 'persephone'], ['vault', 'callimachus'], ['release', 'prometheus']]) {
    expect(`K5 ${cat} → ${god}`, new RegExp(`${cat}:\\s*'${god}'`).test(src));
  }
}

// K6 — runtime hints.
{
  const src = read('src/lib/knowledge-hints.ts');
  expect('K6 knowledge-hints selects by god/stacks/text', /selectKnowledgeForTask/.test(src) && /CATEGORY_GOD/.test(src));
  expect('K6 the block is bounded', /700/.test(src));
  const route = read('src/app/api/olympus/action/route.ts');
  expect('K6 the action route injects the knowledge block', /composeKnowledgeBlock/.test(route) && /knowledgeBlock/.test(route));
  const { selectKnowledgeForTask } = await import('../src/lib/knowledge-hints.ts');
  const a11y = selectKnowledgeForTask({ god: 'athena', stacks: ['react'], text: 'build an accessible landing page' });
  expect('K6 an a11y task selects the accessibility reference', a11y[0]?.relPath === 'design/accessibility.md', JSON.stringify(a11y.slice(0, 2)));
  const data = selectKnowledgeForTask({ god: 'persephone', stacks: ['postgres'], text: 'design a schema and optimize a slow query' });
  expect('K6 a data task selects schema/query references', data.some((x) => /schema-design|query-performance/.test(x.relPath)), JSON.stringify(data));
}

console.log(`\nknowledge-seed: ${passed} passed, ${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
