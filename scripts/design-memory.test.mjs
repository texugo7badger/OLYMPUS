#!/usr/bin/env node
/**
 * design-memory.test.mjs — v0.0.43 (R43-04).
 *
 * Named preferences must survive and stay scoped: save, list per project,
 * dedupe, remove. The reference detail must expose copy-prompt, save and
 * critique; the catalog must filter to memory.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OLYMPUS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'olympus-memory-'));
process.env.OLYMPUS_HOME = HOME;

let failures = 0;
function expect(name, cond, detail) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : ' — ' + String(detail).slice(0, 220)}`);
  if (!cond) failures++;
}

const mod = await import(OLYMPUS + '/src/lib/design-memory.ts');

const first = mod.saveDesignMemory({ id: 'black-hole', name: 'Black Hole', library: 'originkit', category: 'interactive', note: 'gravitational hero', projectSlug: 'aime' });
expect('M1: save returns the entry with a timestamp', first.id === 'black-hole' && !!first.savedAt, JSON.stringify(first));
mod.saveDesignMemory({ id: 'fluid', name: 'Fluid Trail', library: 'skiper', note: 'cursor ribbon', projectSlug: 'aime' });
mod.saveDesignMemory({ id: 'grid', name: 'Kinetic Grid', library: 'skiper', note: 'ripple', projectSlug: 'other' });

const aime = mod.listDesignMemory('aime');
expect('M2: the list is project-scoped', aime.length === 2 && aime.every((e) => e.projectSlug === 'aime'), JSON.stringify(aime));
expect('M3: the newest entry sorts first', aime[0].id === 'fluid', JSON.stringify(aime.map((e) => e.id)));
mod.saveDesignMemory({ id: 'black-hole', name: 'Black Hole', library: 'originkit', note: 'updated reason', projectSlug: 'aime' });
const deduped = mod.listDesignMemory('aime');
expect('M4: saving the same id+project replaces (no duplicate)', deduped.length === 2 && deduped.find((e) => e.id === 'black-hole')?.note === 'updated reason', JSON.stringify(deduped));
expect('M5: remove is project-scoped', mod.removeDesignMemory('grid', 'aime') === false && mod.removeDesignMemory('black-hole', 'aime') === true, 'remove crossed the project boundary');
expect('M6: the store is a real JSON file under OLYMPUS_HOME',
  fs.existsSync(path.join(HOME, 'design-memory.json')), 'no file written');

const panel = fs.readFileSync(OLYMPUS + '/src/components/olympus/craft-apps-panel.tsx', 'utf-8');
expect('M7: the reference detail saves, copies the prompt and critiques',
  /saveReference\(/.test(panel) && /copyReferencePrompt\(/.test(panel) && /critiqueReference\(/.test(panel),
  'the reference actions are missing');
expect('M8: the catalog filters to design memory',
  /memoryOnly/.test(panel) && /memoryIds\.has/.test(panel),
  'no memory filter');
expect('M9: the critique queues a real Athena task (no silent no-op)',
  /Critique the \$\{r\.name\} reference/.test(panel) && /artcraft\/queue/.test(panel),
  'the critique does not reach the queue');
const i18n = fs.readFileSync(OLYMPUS + '/src/lib/i18n.ts', 'utf-8');
expect('M10: critique is localized (en + pt-BR)',
  (i18n.match(/'references\.critique'/g) || []).length >= 2 && /'criticar'/.test(i18n),
  'the critique button is English-only');

console.log(failures === 0 ? '\ndesign-memory: all green.' : `\ndesign-memory: ${failures} failed.`);
process.exit(failures === 0 ? 0 : 1);
