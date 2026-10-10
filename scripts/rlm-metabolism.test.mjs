#!/usr/bin/env node
/**
 * rlm-metabolism.test.mjs — MADRUGA-3 p4 E6: the metabolism self-test.
 * Run: npx tsx scripts/rlm-metabolism.test.mjs   (exit 0 = pass)
 * Zero-deps; temp vault via OLYMPUS_VAULT (the canonical name the
 * machinery reads; OLYMPUS_VAULT_ROOT set for symmetry); the REAL source
 * (instinct-mutations.ts + brain-backup.mjs); never the live vault (R11).
 * Owns ONLY what p4 adds. (P2's fold-back suite owns its own behaviors.)
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const ROOT = new URL('..', import.meta.url).pathname;
const WORK = join(tmpdir(), 'olympus-p4-metabolism');
rmSync(WORK, { recursive: true, force: true });
const VAULT = join(WORK, 'vault');
const STORE = join(VAULT, '05_Auto_Learning', 'instincts', 'apollo', 'empirical');
mkdirSync(STORE, { recursive: true });
process.env.OLYMPUS_VAULT_ROOT = VAULT;
process.env.OLYMPUS_VAULT = VAULT; // the mutations lib reads the canonical name

let fails = 0, checked = 0;
const check = (n, ok, d = '') => { checked++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${ok ? '' : `  -- ${String(d).slice(0, 220)}`}`); if (!ok) fails++; };

const m = await import('../.opencode/olympus/lib/instinct-mutations.ts');

const CANDIDATE_FM = ['---',
  'god: apollo', 'confidence: 0.4', 'samples: 2', 'successes: 0', 'failures: 2',
  'source: empirical', 'immutable: false', 'status: candidate',
  'trigger: test trigger', 'action: test action', '---', 'body', ''].join('\n');
writeFileSync(join(STORE, 'valid-candidate.md'), CANDIDATE_FM);
writeFileSync(join(STORE, 'malformed.md'), 'no frontmatter here at all');

// 1. frontmatter gate
const rMal = m.promoteInstinct('apollo', 'malformed', ['e1', 'e2'], 'test', 'probe');
check('E6 frontmatter gate: a malformed instinct (no frontmatter) is refused loudly',
  rMal.ok === false && /REFUSED/.test(rMal.reason || ''), JSON.stringify(rMal).slice(0, 200));

// 2. promotion gate
const r1 = m.promoteInstinct('apollo', 'valid-candidate', ['only-one'], 'test', 'single');
check('E6 promotion gate: single-source candidate REFUSED',
  r1.ok === false && />= 2 corroborating pointers/.test(r1.reason || ''), JSON.stringify(r1).slice(0, 200));
const r2 = m.promoteInstinct('apollo', 'valid-candidate', ['reports/a.md', 'commit-b'], 'test', 'two sources');
check('E6 promotion gate: two-source candidate PROMOTED',
  r2.ok === true, JSON.stringify(r2).slice(0, 200));
const fmPost = readFileSync(join(STORE, 'valid-candidate.md'), 'utf-8');
check('E6 promotion writes the curation record (status + promoted_by + evidence)',
  /status: proven/.test(fmPost) && /promoted_by: test/.test(fmPost) && /reports\/a\.md/.test(fmPost));

// 3. reward/penalize math (v3.0: the bonus applies at RECALIBRATE, not per-call)
m.rewardInstinct('valid-candidate', 'apollo', 0.05);
const fm3 = readFileSync(join(STORE, 'valid-candidate.md'), 'utf-8');
check('E6 reward records the success (samples/successes update; bonus at recalibrate)',
  /samples: 3/.test(fm3) && /successes: 1/.test(fm3), fm3.split('\n').filter(l => /confidence|samples|successes/.test(l)).join(' · '));
m.penalizeInstinct('valid-candidate', 'apollo', 0.3);
const fm4 = readFileSync(join(STORE, 'valid-candidate.md'), 'utf-8');
check('E6 penalize moves confidence DOWN by the 0.3 penalty (0.5 -> 0.2) + failures update',
  /confidence: 0\.2/.test(fm4) && /failures: 3/.test(fm4), fm4.split('\n').filter(l => /confidence|failures/.test(l)).join(' · '));

// 4. recalibrate (v3.0 semantics) — the 0.95 cap honored
const CAP_FM = ['---',
  'god: apollo', 'confidence: 0.94', 'samples: 9', 'successes: 9', 'failures: 0',
  'source: empirical', 'immutable: false', 'status: candidate',
  'trigger: t', 'action: a', '---', 'b', ''].join('\n');
writeFileSync(join(STORE, 'cap-probe.md'), CAP_FM);
m.rewardInstinct('cap-probe', 'apollo', 0.05);
m.recalibrateInstinct('cap-probe', 'apollo');
const fmCap = readFileSync(join(STORE, 'cap-probe.md'), 'utf-8');
{
  const conf = parseFloat((fmCap.match(/confidence: ([0-9.]+)/) || [])[1] || 'NaN');
  check('E6 recalibrate runs on outcomes + the 0.95 empirical cap is honored (confidence stays <= 0.95)',
    !isNaN(conf) && conf <= 0.95 && conf > 0.5, `confidence: ${conf}`);
}
const r5 = m.recalibrateInstinct('valid-candidate', 'apollo');
check('E6 recalibrate on a mid-confidence entry stays healthy (no break)',
  r5 === true || (r5 && r5.ok !== false), JSON.stringify(r5).slice(0, 120));

// 5. backup → mutate → restore byte-exact + tamper loud
const MANIFEST = join(WORK, 'manifest.json');
const g1 = spawnSync(process.execPath, [join(ROOT, 'scripts', 'brain-backup.mjs'), 'backup', MANIFEST], { encoding: 'utf-8' });
check('E6 backup: the hermetic store backs up', /BACKUP: 3 file/.test(g1.stdout || ''), (g1.stdout || g1.stderr || '').slice(0, 150));
writeFileSync(join(STORE, 'valid-candidate.md'), 'MUTATED CONTENT — not the backed-up bytes');
const g2 = spawnSync(process.execPath, [join(ROOT, 'scripts', 'brain-backup.mjs'), 'restore', MANIFEST], { encoding: 'utf-8' });
check('E6 restore: mutated store returns to the backed-up state',
  /restored byte-exact/.test(g2.stdout || ''), (g2.stdout || g2.stderr || '').slice(0, 150));
const back = JSON.parse(readFileSync(MANIFEST, 'utf-8'));
const entry = back.files.find(f => f.path === 'apollo/empirical/valid-candidate.md');
const restored = readFileSync(join(STORE, 'valid-candidate.md'));
check('E6 restore byte-exactness verified against the manifest sha',
  createHash('sha256').update(restored).digest('hex') === entry.sha256);
const SIDECAR = join(WORK, 'brain-backup-content', 'apollo', 'empirical', 'valid-candidate.md');
writeFileSync(SIDECAR, 'TAMPERED' + readFileSync(SIDECAR, 'utf-8'));
const g3 = spawnSync(process.execPath, [join(ROOT, 'scripts', 'brain-backup.mjs'), 'restore', MANIFEST], { encoding: 'utf-8' });
check('E6 tamper: a flipped byte in the backup FAILS LOUD (refuses to restore corruption)',
  g3.status === 1 && /TAMPERED BACKUP — refusing/.test(g3.stderr || g3.stdout || ''), (g3.stderr || '').split('\n').slice(-3).join(' ').slice(0, 200));

// ── #84 (HIGIENIA-2 H3b / F1): the instinct RAG — proven instincts as
// prior-context blocks in dispatches (the D16 shape). Behavioral: a temp
// vault with matching + non-matching + below-confidence instincts; the
// wiring: the resonate tool composes the block INTO the payload.
{
  const rag = await import(new URL('../src/lib/instinct-rag.ts', import.meta.url).pathname);
  check('F-#84: instinctPriorContext exported (the RAG composer)',
    typeof rag.instinctPriorContext === 'function', 'absent — dispatches never consult the instinct store');
  if (typeof rag.instinctPriorContext === 'function') {
    const vault84 = join(WORK, 'vault-rag');
    const apolloSeed = join(vault84, '05_Auto_Learning', 'instincts', 'apollo', 'seed');
    const apolloEmp = join(vault84, '05_Auto_Learning', 'instincts', 'apollo', 'empirical');
    mkdirSync(apolloSeed, { recursive: true });
    mkdirSync(apolloEmp, { recursive: true });
    writeFileSync(join(apolloSeed, 'plan-first.md'),
      `---\ngod: apollo\nconfidence: 0.95\nsource: seed\ntrigger: Any architectural build task or complex web app request\naction: Emit a dispatch plan first; never monolithic single-turn code.\n---\n\nbody`);
    writeFileSync(join(apolloSeed, 'weak.md'),
      `---\ngod: apollo\nconfidence: 0.5\nsource: seed\ntrigger: Any architectural build task request\naction: Too unsure to matter.\n---\n\nbody`);
    writeFileSync(join(apolloEmp, 'hop-sizing.md'),
      `---\ngod: apollo\nconfidence: 0.85\nsource: empirical\ntrigger: Free-tier multi-file component hops planning\naction: Keep hops to five artifacts or fewer; route volume work to the flash lane.\n---\n\nbody`);
    const match84 = rag.instinctPriorContext('apollo', 'Build a complex web app with architectural multi-file component hops', { vaultRoot: vault84 });
    check('F-#84: a matching proven instinct RIDES as a prior-context block (the action text verbatim)',
      typeof match84 === 'string' && /dispatch plan first/.test(match84) && /PRIOR CONTEXT/.test(match84),
      String(match84).slice(0, 160));
    const none84 = rag.instinctPriorContext('apollo', 'Write a haiku about the sea', { vaultRoot: vault84 });
    check('F-#84: no match — NO block (the dispatch stays lean, never padded)',
      none84 === null, `a padded block appeared: ${String(none84).slice(0, 120)}`);
    const weak84 = rag.instinctPriorContext('apollo', 'Build task request', { vaultRoot: vault84 });
    check('F-#84: below-confidence instincts NEVER ride (the 0.5 weak one excluded)',
      weak84 === null || !/Too unsure/.test(weak84), String(weak84).slice(0, 120));
  }
  const resonateSrc84 = readFileSync(join(ROOT, '.opencode', 'olympus', 'symphony', 'tools', 'symphony-resonate.ts'), 'utf-8');
  check('F-#84: the resonate tool composes the RAG block INTO the dispatched payload (the wiring)',
    /instinctPriorContext\(/.test(resonateSrc84) && /effectivePayload84/.test(resonateSrc84),
    'the dispatch never consults the instinct store — the RAG stays a lib without a caller');
}

rmSync(WORK, { recursive: true, force: true });
if (fails > 0) { console.error(`\n${fails}/${checked} metabolism assertion(s) FAILED`); process.exit(1); }
console.log(`\nAll ${checked} rlm-metabolism assertions passed`);
