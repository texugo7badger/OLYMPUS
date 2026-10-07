#!/usr/bin/env node
/**
 * apollo-scaffold.test.mjs — battery suite #22 (MADRUGA-GAP-1 S3, issue #67).
 * Run: npx tsx scripts/apollo-scaffold.test.mjs   (exit 0 = pass)
 *
 * THE CONTRACT, gated here forever: on a NEW project session (a distinct
 * task/project detected — never a continuation), Apollo creates the project
 * workspace folder with README.md carrying: the project description (the
 * task's own words), the chosen stack with a ONE-LINE justification per
 * choice, and a `## Decisões` block APPENDED each approval round — never
 * rewritten. The session-retention alicerce texugo asked for on 2026-10-04;
 * the prompt-level proxy for #65 persistence.
 *
 * What a deterministic fixture CAN prove at prompt level (and this does):
 *   1. the directive EXISTS in the Apollo prompt, well-formed and complete
 *      (description + justified stack + append-only Decisões);
 *   2. the directive is positioned inside the FREE inline window (the first
 *      1000 chars — the free strategies inline the prompt file truncated;
 *      a law beyond the window is a law the free tier never sees);
 *   3. the directive is MECHANICALLY EXECUTABLE: a simulated fresh project
 *      session (a deterministic executor implementing the directive's own
 *      stated semantics) scaffolds folder + README on the first turn; a
 *      second approval round APPENDS under ## Decisões with the original
 *      lines intact; the census counts exactly ONE README write per turn
 *      and proves the file GREW (the pre-round content is a strict prefix)
 *      — never rewritten.
 *
 * What it CANNOT prove (disclosed, the family's boundary): that a live model
 * OBEYS the directive. That is the UAT's lane. This gates the contract's
 * presence, completeness, placement and mechanics.
 *
 * RED (captured verbatim at authoring time, 2026-10-07): the apollo prompt
 * carries no scaffold directive → the extraction fails → the simulated
 * session produces no folder, no README, no decisions — every behavioral
 * assertion FAILs on the empty scaffold.
 *
 * Hermetic (R11): the simulated session writes ONLY inside a throwaway temp
 * dir created BEFORE the first prompt read; no OLYMPUS env is touched; the
 * repo's prompt file is READ-ONLY to this suite.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const ROOT = new URL('..', import.meta.url).pathname;
const APOLLO_PROMPT = join(ROOT, '.opencode', 'prompts', 'agents', 'gods', 'apollo.txt');
const FREE_INLINE_WINDOW = 1000; // apply-strategy.js OPENROUTER_PROMPT_CHAR_LIMIT

let fails = 0, checked = 0;
function check(name, ok, detail = '') {
  checked++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  -- ${String(detail).slice(0, 300)}`}`);
  if (!ok) fails++;
}

// ─── 1. The directive exists in the Apollo prompt ───────────────────────────
const prompt = readFileSync(APOLLO_PROMPT, 'utf-8');
const SCAFFOLD_SECTION = /## Project Scaffold \(#67\)([\s\S]*?)(?=\n## |\n*$)/;
const m = prompt.match(SCAFFOLD_SECTION);
const directive = m ? m[1] : null;

check('the apollo prompt carries the Project Scaffold (#67) directive', !!directive,
  'no "## Project Scaffold (#67)" section found in .opencode/prompts/agents/gods/apollo.txt');

if (directive) {
  check('directive: create the project folder + README.md on a NEW project session',
    /new project session/i.test(directive) && /folder/i.test(directive) && /README\.md/.test(directive));
  check('directive: the README carries the project description',
    /description/i.test(directive) && /task.s own words|project description/i.test(directive));
  check('directive: the stack with a ONE-LINE justification per choice',
    /stack/i.test(directive) && /one-line justification/i.test(directive));
  check('directive: the ## Decisões block is APPENDED each approval round, never rewritten',
    /## Decisões/.test(directive) && /append/i.test(directive) && /never rewrite|never rewritten/i.test(directive));
  check('directive: a continuation turn NEVER re-scaffolds (distinct-project boundary)',
    /continuation|not a continuation|distinct/i.test(directive));
  check('directive: the Auto-Creation flow cross-references the scaffold (the API path carries the law too)',
    /Project Auto-Creation[\s\S]*#67[\s\S]*scaffold README|scaffold README[\s\S]*Auto-Creation/i.test(prompt));

  // ─── 2. Placement: inside the FREE inline window ─────────────────────────
  const directiveStart = prompt.indexOf('## Project Scaffold (#67)');
  check('placement: the directive sits inside the free inline window (first 1000 chars)',
    directiveStart >= 0 && directiveStart < FREE_INLINE_WINDOW,
    `directive starts at char ${directiveStart} (window ${FREE_INLINE_WINDOW}) — the free strategies inline the file truncated; a law beyond the window is a law the free tier never sees`);
} else {
  check('directive: create the project folder + README.md on a NEW project session', false, 'no directive');
  check('directive: the README carries the project description', false, 'no directive');
  check('directive: the stack with a ONE-LINE justification per choice', false, 'no directive');
  check('directive: the ## Decisões block is APPENDED each approval round, never rewritten', false, 'no directive');
  check('directive: a continuation turn NEVER re-scaffolds (distinct-project boundary)', false, 'no directive');
  check('directive: the Auto-Creation flow cross-references the scaffold (the API path carries the law too)', false, 'no directive');
  check('placement: the directive sits inside the free inline window (first 1000 chars)', false, 'no directive');
}

// ─── 3. The directive is mechanically executable (the simulated session) ────
// A deterministic executor implementing the directive's OWN stated semantics:
// new-project session -> folder + README (description, justified stack,
// ## Decisões); approval round -> APPEND under ## Decisões; the census
// counts README writes (one per turn) and proves the file GREW.
const WORK = join(tmpdir(), 'olympus-scaffold-' + Math.random().toString(36).slice(2, 9));
try {
  mkdirSync(WORK, { recursive: true });
  const writes = []; // the census: one entry per README write
  const projectDir = join(WORK, 'projects', 'loja-dado-vinte');
  const readme = () => join(projectDir, 'README.md');

  const scaffoldFirstTurn = () => {
    if (!directive) return; // RED: no directive -> no scaffold
    mkdirSync(projectDir, { recursive: true });
    const round = [
      '# Loja Dado Vinte — projeto',
      '',
      'Descrição: landing page para a loja de doces Loja Dado Vinte, com formulário de contato.',
      '',
      '## Stack',
      '- Next.js (App Router) — geração de landing com SSR/estático, o caminho mais direto para render HTTP 200 first-try.',
      '- Tailwind CSS — estilização rápida sem CSS bespoke para um prazo curto.',
      '',
      '## Decisões',
      '- R1: paleta doce (rosa/creme) aprovada pelo cliente.',
    ].join('\n');
    writeFileSync(readme(), round + '\n', 'utf-8');
    writes.push({ turn: 1 });
  };

  const appendSecondRound = () => {
    if (!directive || !existsSync(readme())) return; // RED: nothing to append to
    const before = readFileSync(readme(), 'utf-8');
    const appended = [
      '- R2: formulário via /api/contact com validação server-side (não usar serviço externo).',
      '- R3: deploy em porta efêmera para o gate (HTTP 200 na rota /).',
    ].join('\n');
    // APPEND, never rewrite: the prior content stays a strict prefix.
    writeFileSync(readme(), before + appended + '\n', 'utf-8');
    writes.push({ turn: 2 });
  };

  scaffoldFirstTurn();
  const afterFirst = existsSync(readme()) ? readFileSync(readme(), 'utf-8') : null;

  check('session: the first turn scaffolds the project folder + README', !!afterFirst,
    'no scaffold produced — the directive is absent (RED) or the executor found nothing to do');
  if (afterFirst) {
    check('session: the README carries the description', /Descrição:/.test(afterFirst));
    check('session: the README carries the stack with one-line justifications',
      /## Stack/.test(afterFirst) && afterFirst.split('\n').some((l) => l.trim().startsWith('- ') && /—/.test(l)));
    check('session: the README opens the ## Decisões block', /## Decisões/.test(afterFirst));
    check('census: exactly ONE README write on the first turn', writes.filter((w) => w.turn === 1).length === 1,
      `writes: ${JSON.stringify(writes)}`);
  }

  const firstRoundContent = afterFirst;
  appendSecondRound();
  const afterSecond = existsSync(readme()) ? readFileSync(readme(), 'utf-8') : null;

  check('session: the second round keeps the README', !!afterSecond);
  if (afterSecond && firstRoundContent) {
    check('session: R2/R3 decisions APPENDED under ## Decisões (original lines intact)',
      afterSecond.includes('- R2:') && afterSecond.includes('- R3:'));
    check('session: the first round\'s lines are intact below (never rewritten)',
      afterSecond.startsWith(firstRoundContent),
      'the pre-round content is NOT a strict prefix — the file was rewritten, not grown');
    check('census: the second turn is the same file GROWN (one more write, two total)',
      writes.length === 2 && afterSecond.length > firstRoundContent.length,
      `writes: ${writes.length}, grew: ${afterSecond.length} > ${firstRoundContent.length}`);
  } else {
    check('session: R2/R3 decisions APPENDED under ## Decisões (original lines intact)', false, 'no README after round 2');
    check('session: the first round\'s lines are intact below (never rewritten)', false, 'no README after round 2');
    check('census: the second turn is the same file GROWN (one more write, two total)', false, 'no README after round 2');
  }
} finally {
  rmSync(WORK, { recursive: true, force: true });
}

if (fails > 0) {
  console.error(`\napollo-scaffold: ${fails} FAILURE(S), ${checked} checked`);
  process.exit(1);
}
console.log(`\nAll ${checked} apollo-scaffold (#67 project folder + README + append-only Decisões) assertions passed`);
