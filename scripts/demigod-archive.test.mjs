#!/usr/bin/env node
/**
 * demigod-archive.test.mjs — v0.0.88: the census cut is reversible and safe.
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let failures = 0;
const expect = (name, cond, detail) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : ' — ' + String(detail).slice(0, 260)}`);
  if (!cond) failures++;
};
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf-8');
const manifestPath = path.join(ROOT, '.opencode', 'demigods-archive-manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
const cfg = JSON.parse(read('opencode.json'));
const { SEED_DESIGN_BUILDS } = await import(ROOT + '/src/lib/design-builds.ts');
const buildRefs = new Set(SEED_DESIGN_BUILDS.flatMap((b) => b.demigods || []));
const live = new Set(Object.keys(cfg.agent || {}));
const archived = new Set(manifest.archived.map((a) => a.id));

expect('D-1: the manifest accounts for all 122 declared demigods', manifest.kept.length + manifest.archived.length === 122, { kept: manifest.kept.length, archived: manifest.archived.length });
expect('D-2: 61 kept / 61 archived (the honest build-aware cut)', manifest.kept.length === 61 && manifest.archived.length === 61, { kept: manifest.kept.length, archived: manifest.archived.length });
expect('D-3: no archived demigod remains an opencode.json agent', manifest.archived.every((a) => !live.has(a.id) && !Object.keys(cfg.agent || {}).includes(a.id)), manifest.archived.filter((a) => live.has(a.id)).slice(0, 5));
expect('D-4: every build demigod is still live', [...buildRefs].every((id) => live.has(id)), [...buildRefs].filter((id) => !live.has(id)).slice(0, 8));
expect('D-5: the archived prompt files live under _archive', manifest.archived.every((a) => fs.existsSync(path.join(ROOT, '.opencode/prompts/agents/demigods/_archive', a.god, a.file))), 'missing archived file');
expect('D-6: restore keeps the agent definition for every archived id', manifest.archived.every((a) => a.agentDef && typeof a.agentDef === 'object'), 'missing agentDef');
expect('D-7: the restore path exists and is documented', /--restore/.test(read('scripts/archive-demigods.mjs')) && /restore/i.test(read('AGENTS.md')), 'no restore');
expect('D-8: the public docs say 61 demigods / 71 agents', /61 demigods/.test(read('AGENTS.md')) && /71 agents/.test(read('AGENTS.md')), 'stale fleet count');

console.log(failures === 0 ? '\ndemigod-archive: all green.' : `\ndemigod-archive: ${failures} failure(s).`);
process.exit(failures === 0 ? 0 : 1);
