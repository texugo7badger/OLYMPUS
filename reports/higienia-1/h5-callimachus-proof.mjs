#!/usr/bin/env node
/**
 * h5-callimachus-proof.mjs — #92 (HIGIENIA-2 H5): the CERT-CALLIMACHUS
 * canonical proof, re-tried on a RESOLVABLE lane.
 *
 * The p4 attempt rode the spine end-to-end but the GOD SPAWN FAILED LOUD —
 * "This model is unavailable for free" (the callimachus god's pool model
 * had shifted; a different class than Prometheus's zero-artifact). The
 * re-try plan was exactly this: re-dispatch on a resolvable lane. Today
 * callimachus rides nvidia-glm/z-ai/glm-5.3-flash — ALIVE (the H4 bench
 * measured it at 0.65s minutes before this proof).
 *
 * The E4 contract (the certification's own law): the declared artifact +
 * the done-condition. The task: pattern extraction from the campaign's
 * real material — THE HONEST-PARK PATTERN (park-on-exhaustion with the
 * printed resume contract), the doctrine this whole campaign proved at
 * scale (B7: 18 parks survived by resume, 20/20 walked).
 *
 * Run from the repo root: npx tsx reports/higienia-1/h5-callimachus-proof.mjs
 * Exit 0 = the artifact verified deterministically (the mark EARNED).
 */
const OLYMPUS = process.cwd();
const HOME = process.env.HOME;
const ARTIFACT = HOME + '/OLYMPUS-VAULT/04_Knowledge/pattern-park-on-exhaustion.md';

const { spawnOpencode } = await import(OLYMPUS + '/src/lib/opencode-spawn.ts');
const { resolveGodModelLane } = await import(OLYMPUS + '/src/lib/hop-runtime/walker.ts');
const { existsSync, readFileSync } = await import('node:fs');

const lane = resolveGodModelLane('callimachus');
if (!lane) { console.error('PROOF REFUSED: no resolvable lane for callimachus (the honest refusal, not a silent skip).'); process.exit(2); }
console.log(`[proof] callimachus lane resolved: ${lane}`);

const task = [
  'Extract and write a reusable knowledge pattern for the OLYMPUS vault.',
  '',
  'Source material (real, from this campaign):',
  '- reports/plano-master-1/b3-wire-the-walk.md (the wire-the-walk cure: park-on-exhaustion with the resume contract printed)',
  '- reports/plano-master-1/b7-acceptance.md (the proof at scale: 18 parked attempts survived by resume, 20/20 hops walked)',
  '',
  'THE PATTERN: park-on-exhaustion with a printed 1-line resume contract.',
  'Write the file ' + ARTIFACT + ' with EXACTLY these three sections (markdown H2):',
  '## Pattern — the shape of an honest park (what parks, what prints, what never lies)',
  '## When to apply — the conditions (pool exhaustion, stream stalls, output-budget cuts; the alternative: the silent monolith death)',
  '## Evidence — the campaign citations (the b3 + b7 reports, the 18-park count, the resume-from-disk doctrine)',
  'Keep it under 40 lines. The file IS the deliverable.',
].join('\n');

const t0 = Date.now();
const r = await new Promise((resolve) => {
  const child = spawnOpencode(['run', '--model', lane, '--agent', 'callimachus', '--format', 'json', task], { cwd: OLYMPUS });
  let out = '';
  child.stdout?.on('data', (d) => { out += String(d); });
  child.stderr?.on('data', (d) => { out += String(d); });
  child.on('close', (code) => resolve({ code, out }));
  setTimeout(() => { try { child.kill('SIGKILL'); } catch {} }, 10 * 60_000);
});
console.log(`[proof] dispatch exit=${r.code} in ${Math.round((Date.now() - t0) / 1000)}s`);

// The deterministic verify (the done-condition): the artifact + the three sections.
if (!existsSync(ARTIFACT)) { console.error('PROOF FAILED: the declared artifact is absent (exit ' + r.code + '); tail: ' + r.out.slice(-400)); process.exit(2); }
const art = readFileSync(ARTIFACT, 'utf-8');
const sections = ['## Pattern', '## When to apply', '## Evidence'];
const missing = sections.filter((s) => !art.includes(s));
if (missing.length > 0) { console.error('PROOF FAILED: the artifact is missing sections: ' + missing.join(', ')); process.exit(2); }
console.log('[proof] THE ARTIFACT VERIFIED: ' + ARTIFACT + ' (' + art.length + ' bytes, all three sections present)');
console.log('[proof] THE CERT-CALLIMACHUS MARK IS EARNED — the pattern-extraction dispatch rode a resolvable lane and produced its declared artifact.');
process.exit(0);
