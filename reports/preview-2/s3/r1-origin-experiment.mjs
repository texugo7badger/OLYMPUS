#!/usr/bin/env node
/**
 * r1-origin-experiment.mjs — PREVIEW-2 Batch C (the auditor's 10-minute
 * question): the SMOKE-1 entry-gates record says the FLUENCY-1 proof's live
 * note AND transcript both carried `stacks: tml, css, javascript]` (the
 * leading `[`+`h` eaten) — yet the writer template `stacks: [${...join(', ')}]`
 * cannot produce that shape, and the intake path is deterministic (0 LLM).
 * The "chat-tail tokenizer salad" classification does not fit a 0-LLM path.
 *
 * THE EXPERIMENT: re-run the EXACT deterministic intake path with a FRESH
 * slug in the REAL vault, byte-check the note's `stacks:` line at three
 * sampled moments (immediately post-create, +250ms, after a read-back pass)
 * — if the shape is eaten on ANY sample, the bug is LIVE in the current
 * code and the call chain gets walked; if correct on all, the FLUENCY-1
 * specimen was transient (the rider-era mid-fix state — the proof ran while
 * the stack-detector ESM crash was being cured on the same tree).
 *
 * HYGIENE: the active-project pointer is snapshotted + restored; the
 * experiment's project dir is removed at the end (the vault returns to its
 * pre-experiment state either way). Exit 0 = the shape was correct.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OLYMPUS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const HOME = process.env.HOME;
const SLUG = 'preview-two-origin-check';
const LANE = path.join(HOME, 'OLYMPUS-VAULT', '02_Projects', SLUG);
const ACTIVE = path.join(HOME, '.olympus', 'active-project.json');
const PROMPT = 'Build a "Preview Two Origin Check" landing page for a bakery with an interactive menu';
const log = (t, v) => console.log(`\n=== ${t} ===\n` + (typeof v === 'string' ? v : JSON.stringify(v, null, 2)));

const activeBefore = fs.existsSync(ACTIVE) ? fs.readFileSync(ACTIVE, 'utf-8') : null;
log('HYGIENE snapshot', { activeBefore, lanePreExisted: fs.existsSync(LANE), removed: true });
fs.rmSync(LANE, { recursive: true, force: true });

const hexOf = (s) => Array.from(Buffer.from(s, 'utf-8')).map((b) => b.toString(16).padStart(2, '0')).join(' ');
const stacksLine = () => {
  const notePath = path.join(LANE, 'project.md');
  if (!fs.existsSync(notePath)) return null;
  const raw = fs.readFileSync(notePath, 'utf-8');
  const line = raw.split('\n').find((l) => l.startsWith('stacks:')) ?? '(absent)';
  return { line, hex: hexOf(line), byteCount: Buffer.from(line, 'utf-8').length };
};

const { resolveAndRegisterIntent, classifyFirstPrompt } = await import(OLYMPUS + '/src/lib/project-intent.ts');
const { listProjects } = await import(OLYMPUS + '/src/lib/project-context.ts');

const intent = await resolveAndRegisterIntent(PROMPT, ['html', 'css', 'javascript']);
log('INTENT (fresh slug, deterministic path — 0 LLM)', intent);

const s1 = stacksLine();
log('SAMPLE-1 (immediately post-create)', s1);
await new Promise((r) => setTimeout(r, 250));
const s2 = stacksLine();
log('SAMPLE-2 (+250ms — any deferred rewrite would have run)', s2);
const reread = classifyFirstPrompt('Add a menu to the Preview Two Origin Check page', listProjects());
const s3 = stacksLine();
log('SAMPLE-3 (after a read-back classification pass)', { ...s3, rereadKind: reread.kind, rereadSlug: reread.slug });

// the parse-back read (the consumer surface the auditor worried about)
const { getProject } = await import(OLYMPUS + '/src/lib/project-context.ts');
const proj = getProject(SLUG);
log('CONSUMER READ-BACK (project-context.getProject)', { stacks: proj?.stacks, anomalies: '(check project.md __anomalies via parseFrontmatter if line corrupt)' });

const correct = s1 && s2 && s3 && [s1, s2, s3].every((s) => s.line === 'stacks: [html, css, javascript]');
log('VERDICT', correct
  ? 'CORRECT on all three samples — the FLUENCY-1 specimen was TRANSIENT (the rider-era mid-fix tree state), not a live code defect; the OLD note keeps the eaten shape and the R1 __anomalies surface now flags exactly that class loudly'
  : 'EATEN — the bug is LIVE in the current code; the samples above pin WHERE it appears first');

// hygiene: restore the pointer ALWAYS; remove the experiment's project
try { if (activeBefore !== null) fs.writeFileSync(ACTIVE, activeBefore); else fs.rmSync(ACTIVE, { force: true }); } catch (e) { console.log('ACTIVE restore failed:', e.message); }
try { fs.rmSync(LANE, { recursive: true, force: true }); } catch (e) { console.log('lane cleanup failed:', e.message); }
log('HYGIENE restore', {
  activeRestored: fs.readFileSync(ACTIVE, 'utf-8') === activeBefore,
  laneRemoved: !fs.existsSync(LANE),
});
process.exit(correct ? 0 : 2);
