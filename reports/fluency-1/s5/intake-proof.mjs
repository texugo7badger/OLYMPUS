#!/usr/bin/env node
/**
 * intake-proof.mjs — the #110 intake autonomy proof, standalone (0 LLM tokens).
 * The NVIDIA key was globally throttled (429) at smoke time — the intake is
 * deterministic, so it proves itself without any pool. Evidence: stdout.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OLYMPUS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const HOME = process.env.HOME;
const SLUG = 'fluency-smoke';
const LANE = path.join(HOME, 'OLYMPUS-VAULT', '02_Projects', SLUG);
const PROMPT = 'Build a "Fluency Smoke" landing page for a bakery with an interactive menu';
const log = (t, v) => console.log(`\n=== ${t} ===\n` + JSON.stringify(v, null, 2));

const { resolveAndRegisterIntent, classifyFirstPrompt } = await import(OLYMPUS + '/src/lib/project-intent.ts');
const { listProjects, getActiveProjectSlug } = await import(OLYMPUS + '/src/lib/project-context.ts');

fs.rmSync(LANE, { recursive: true, force: true });
const before = listProjects().map((p) => p.slug);
log('BEFORE', { projects: before, laneExists: fs.existsSync(LANE), active: getActiveProjectSlug() });

const intent1 = await resolveAndRegisterIntent(PROMPT, ['html', 'css', 'javascript']);
log('INTENT-1 (no folder selected -> new)', intent1);

const notePath = path.join(LANE, 'project.md');
const exists = fs.existsSync(notePath);
const note = exists ? fs.readFileSync(notePath, 'utf-8') : '';
const fm = note.split('---')[1] || '';
log('PROJECT NOTE', { notePath, exists, frontmatter: fm.trim().split('\n').slice(0, 9).join('\n') });
log('ACTIVE PROJECT', getActiveProjectSlug());

const intent2 = classifyFirstPrompt('Add a contact section to the Fluency Smoke page', listProjects());
const afterCreate = listProjects().map((p) => p.slug);
log('INTENT-2 (second prompt -> existing, no duplicate)', { intent2, afterCreate, createdDelta: afterCreate.length - before.length });

const created = intent1.kind === 'new' && intent1.slug === SLUG && exists && /name: .*Fluency Smoke/.test(fm) && /description: .*Fluency Smoke/.test(note) && /stacks:/.test(fm);
const routed = intent2.kind === 'existing' && intent2.slug === SLUG && afterCreate.length === before.length + 1;
console.log(`\nCREATED: ${created ? 'OK' : 'FAIL'}  |  ROUTED-EXISTING: ${routed ? 'OK' : 'FAIL'}`);
process.exit(created && routed ? 0 : 2);
