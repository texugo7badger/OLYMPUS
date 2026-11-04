#!/usr/bin/env node
/**
 * alignment-preview.test.mjs — v0.0.80.
 *
 * The alignment meter must be explainable (five signals, evidence, a ready
 * threshold), and the fast-preview plumbing must write outside the project and
 * serve the page on a local port. No LLM here: the god's answer is simulated.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'olympus-align-'));
const VAULT = fs.mkdtempSync(path.join(os.tmpdir(), 'olympus-vault-'));
const SLUG = 'demo';
const LANE = path.join(VAULT, '02_Projects', SLUG);
fs.mkdirSync(LANE, { recursive: true });
process.env.OLYMPUS_HOME = HOME;
process.env.OLYMPUS_VAULT = VAULT;

fs.writeFileSync(path.join(LANE, 'project.md'), `---
slug: ${SLUG}
name: Demo
path: ${LANE}
stacks: [Next.js, Postgres]
description: A demo project for the alignment test, for small teams.
---
# Demo
`);
fs.writeFileSync(path.join(LANE, 'design-decisions.jsonl'), JSON.stringify({ id: 'd1', choice: 'dark' }) + '\n');
fs.writeFileSync(path.join(LANE, 'dispatch-plan.json'), JSON.stringify({ version: 1, laneRoot: LANE, hops: [{ id: 'h1', god: 'athena', prompt: 'x', artifacts: [] }] }));

const { computeAlignment } = await import('../src/lib/alignment.ts');
const { parsePreviewAnswer, writePreview, startPreviewServer, stopPreviewServer, previewUrl } = await import('../src/lib/generated-preview.ts');

let failures = 0;
const check = (n, c, d) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${c ? '' : ' — ' + String(d).slice(0, 200)}`); if (!c) failures++; };

const a = computeAlignment(SLUG);
check('A-1: a complete brief scores 100 and is ready', a?.score === 100 && a.ready === true, JSON.stringify(a));
check('A-2: five signals, each with evidence', a?.signals.length === 5 && a.signals.every((s) => s.evidence.length > 0), JSON.stringify(a?.signals));
check('A-3: the audience signal reads the description', a?.signals.find((s) => s.id === 'audience')?.score === 20, 'audience not detected');

fs.writeFileSync(path.join(LANE, 'project.md'), `---\nslug: ${SLUG}\nname: Demo\npath: ${LANE}\n---\n`);
const b = computeAlignment(SLUG);
check('A-4: an empty brief is not ready and names what is missing', b?.ready === false && (b?.missing ?? []).length >= 3, JSON.stringify(b));

const parsed = parsePreviewAnswer('```json\n{"html":"<html><head></head><body>hi</body></html>","css":"body{color:#fff}"}\n```');
check('A-5: the god answer parses through fences', parsed?.html.includes('<body>hi</body>') && parsed?.css.includes('#fff'), JSON.stringify(parsed));
check('A-6: garbage is refused, not guessed', parsePreviewAnswer('no json here') === null, 'garbage parsed');

writePreview(SLUG, parsed.html, parsed.css);
const page = fs.readFileSync(path.join(HOME, 'previews', SLUG, 'index.html'), 'utf-8');
check('A-7: the page is written under the app home, not the project', page.includes('<style>') && page.includes('#fff') && !fs.existsSync(path.join(LANE, 'index.html')), 'wrong location');
check('A-8: the project lane was not modified', !fs.existsSync(path.join(LANE, 'index.html')), 'the lane was written');

const started = await startPreviewServer(SLUG);
check('A-9: the static host starts and reports a port', started.ok === true && typeof started.port === 'number', JSON.stringify(started));
if (started.ok && started.url) {
  const res = await fetch(started.url);
  const body = await res.text();
  check('A-10: the preview serves the generated page', res.ok && body.includes('<body>hi</body>'), `${res.status} ${body.slice(0, 80)}`);
}
check('A-11: the URL is readable from the state', previewUrl(SLUG) === started.url, `${previewUrl(SLUG)} vs ${started.url}`);
stopPreviewServer(SLUG);

for (const dir of [HOME, VAULT]) fs.rmSync(dir, { recursive: true, force: true });
console.log(`\nalignment-preview: ${failures === 0 ? 'PASS' : failures + ' FAIL'}`);
process.exit(failures === 0 ? 0 : 1);
