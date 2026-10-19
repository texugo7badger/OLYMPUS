#!/usr/bin/env node
/**
 * atelier-keyfront.test.mjs — W-A RAG-CERT A2: the embedding key gets a
 * front door + the vault gets a re-index action.
 * Run: npx tsx scripts/atelier-keyfront.test.mjs   (exit 0 = pass)
 *
 * The live defect (the 2026-10-19 RAG audit): the semantic lane's key
 * (~/.olympus/atelier.json pollinations_key) is HAND-EDIT-ONLY — no settings
 * surface writes it, no route, nothing in the app mentions it; assets
 * described before a key exists are never embedded (reindexVault has zero
 * callers). The cure: the key lands in the CANONICAL store
 * (~/.olympus/api-configs.json, via the API Keys dialog's new Atelier
 * section), readAtelierKeys merges canonical-over-legacy, and a
 * POST /api/olympus/atelier/reindex route + panel button expose the
 * maintenance action.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OLYMPUS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let failures = 0;
function expect(name, cond, detail) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : ' — ' + String(detail).slice(0, 220)}`);
  if (!cond) failures++;
}

async function main() {
  // ── A2.1: readAtelierKeys — the canonical store first ────────────────────
  const vec = await import(OLYMPUS + '/src/lib/media-vault-vec.ts');
  const readsParam = vec.readAtelierKeys.length >= 1;
  if (readsParam) {
    const homeA = fs.mkdtempSync(path.join(os.tmpdir(), 'olympus-kf-'));
    fs.mkdirSync(path.join(homeA, '.olympus'), { recursive: true });
    fs.writeFileSync(path.join(homeA, '.olympus', 'api-configs.json'),
      JSON.stringify({ POLLINATIONS_KEY: 'pk-canonical-1' }));
    const rA = vec.readAtelierKeys(homeA);
    expect('A2: the canonical api-configs POLLINATIONS_KEY is read (the dialog-written store)',
      rA.pollinations_key === 'pk-canonical-1', `got ${JSON.stringify(rA)}`);

    const homeB = fs.mkdtempSync(path.join(os.tmpdir(), 'olympus-kf-'));
    fs.mkdirSync(path.join(homeB, '.olympus'), { recursive: true });
    fs.writeFileSync(path.join(homeB, '.olympus', 'atelier.json'),
      JSON.stringify({ pollinations_key: 'pk-legacy-9' }));
    const rB = vec.readAtelierKeys(homeB);
    expect('A2: the legacy atelier.json still satisfies (backward compat)',
      rB.pollinations_key === 'pk-legacy-9', `got ${JSON.stringify(rB)}`);

    const homeC = fs.mkdtempSync(path.join(os.tmpdir(), 'olympus-kf-'));
    fs.mkdirSync(path.join(homeC, '.olympus'), { recursive: true });
    fs.writeFileSync(path.join(homeC, '.olympus', 'api-configs.json'),
      JSON.stringify({ POLLINATIONS_KEY: 'pk-canonical-2' }));
    fs.writeFileSync(path.join(homeC, '.olympus', 'atelier.json'),
      JSON.stringify({ pollinations_key: 'pk-legacy-stale' }));
    const rC = vec.readAtelierKeys(homeC);
    expect('A2: canonical WINS over the legacy file (one truth)',
      rC.pollinations_key === 'pk-canonical-2', `got ${JSON.stringify(rC)}`);

    expect('A2: the honest empty keys when neither store has the key',
      Object.keys(vec.readAtelierKeys(fs.mkdtempSync(path.join(os.tmpdir(), 'olympus-kf-')))).length === 0,
      'the empty vault shape must be {}');
  } else {
    expect('A2: readAtelierKeys is testable (homeDir param)', false,
      'the key reader is homedir-hardcoded — hand-edit-only forever');
    expect('A2: the canonical api-configs POLLINATIONS_KEY is read (the dialog-written store)', false, 'blocked: no param');
    expect('A2: the legacy atelier.json still satisfies (backward compat)', false, 'blocked: no param');
    expect('A2: canonical WINS over the legacy file (one truth)', false, 'blocked: no param');
    expect('A2: the honest empty keys when neither store has the key', false, 'blocked: no param');
  }

  // ── A2.2: the route allowlist + the dialog section ────────────────────────
  const routeSrc = fs.readFileSync(path.join(OLYMPUS, 'src/app/api/olympus/api-configs/route.ts'), 'utf-8');
  expect('A2: the api-configs route accepts POLLINATIONS_KEY (the Atelier allowlist)',
    routeSrc.includes('ALLOWED_ATELIER_KEYS') && routeSrc.includes('POLLINATIONS_KEY'),
    'the API Keys dialog cannot persist the embedding key — hand-edit-only');
  const dialogSrc = fs.readFileSync(path.join(OLYMPUS, 'src/components/olympus/api-config-dialog.tsx'), 'utf-8');
  expect('A2: the API Keys dialog renders the Atelier key section',
    dialogSrc.includes('POLLINATIONS_KEY') && /atelier/i.test(dialogSrc),
    'no surface in the app mentions the semantic lane key');

  // ── A2.3: the re-index route + the panel button ───────────────────────────
  const reindexPath = path.join(OLYMPUS, 'src/app/api/olympus/atelier/reindex/route.ts');
  const reindexRoute = fs.existsSync(reindexPath)
    ? fs.readFileSync(reindexPath, 'utf-8')
    : '';
  expect('A2: POST /api/olympus/atelier/reindex exists + calls reindexVault',
    reindexRoute.includes('reindexVault') && reindexRoute.includes('export async function POST'),
    'reindexVault (media-vault-vec.ts:104-112) still has zero callers — pre-key assets are never embedded');
  expect('A2: the reindex route reports the semantic lane honestly (has-key flag)',
    /semantic/.test(reindexRoute), 'the route must say whether the semantic lane is keyed');
  const panelSrc = fs.readFileSync(path.join(OLYMPUS, 'src/components/olympus/atelier-panel.tsx'), 'utf-8');
  expect('A2: the Atelier panel exposes the re-index action',
    panelSrc.includes('/api/olympus/atelier/reindex'), 'no UI entry point for the maintenance action');

  if (failures > 0) { console.error(`\natelier-keyfront: ${failures} FAIL`); process.exit(1); }
  console.log('\natelier-keyfront: all green.');
}

main().catch((e) => { console.error('FIXTURE CRASH:', e); process.exit(1); });
