#!/usr/bin/env node
/**
 * design-choice.test.mjs — ATHENA'S IN-CHAT DESIGN CHOICE (v0.0.24).
 *
 * The Design Studio modal is gone. Athena proposes dynamic options inside
 * the terminal (palettes, 3 logo SVGs, layout references), the user picks one
 * or writes a refinement, and the decision is persisted in the project.
 *
 *   D1  the tool accepts dynamic options (not only the old candidates)
 *   D2  the card renders previews + a refinement box
 *   D3  the API persists to 02_Projects/<slug>/design-decisions.jsonl safely
 *   D4  the Design Studio is deleted everywhere
 *   D5  Athena's prompt declares the design-decision moment
 *   D6  the terminal mounts the card inline (no modal)
 *
 * Run: npx tsx scripts/design-choice.test.mjs (exit 0 = pass)
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0;
let failures = 0;
function expect(name, cond, detail) {
  if (cond) { passed++; console.log(`PASS  ${name}`); }
  else { failures++; console.log(`FAIL  ${name}${detail ? ' — ' + String(detail).slice(0, 300) : ''}`); }
}
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf-8');

// D1 — the tool.
{
  const tool = read('.opencode/olympus/tools/design-review.ts');
  expect('D1 tool accepts options[]', /options: tool\.schema/.test(tool));
  expect('D1 options carry svg/imageUrl/colors/text', /svg: tool\.schema/.test(tool) && /imageUrl: tool\.schema/.test(tool) && /colors: tool\.schema/.test(tool));
  expect('D1 options carry suggestions + allowRefine', /suggestions: tool\.schema/.test(tool) && /allowRefine: tool\.schema/.test(tool));
  expect('D1 writes design-choice-requested', /design-choice-requested/.test(tool));
  expect('D1 keeps legacy candidates', /candidates: tool\.schema/.test(tool));
  expect('D1 validates 2-6 options', /options\.length < 2/.test(tool) && /slice\(0, 6\)/.test(tool));
  expect('D1 resolves the vault, not a hardcoded home path', /vaultRoot\(\)/.test(tool) && !/06_Activity_Feed", "live\.jsonl"/.test(tool.slice(0, 2500)));
}

// D2 — the card.
{
  const card = read('src/components/olympus/design-choice-card.tsx');
  expect('D2 card fetches /api/olympus/design-choice', /api\/olympus\/design-choice/.test(card));
  expect('D2 card renders SVG previews as a data URL', /data:image\/svg\+xml/.test(card));
  expect('D2 card renders palettes', /o\.colors/.test(card));
  expect('D2 card renders images', /o\.imageUrl/.test(card));
  expect('D2 card has a refine input', /refineOpen/.test(card) && /instruction/.test(card));
  expect('D2 card injects the follow-up', /onAnswer\(d\.followUp/.test(card));
  expect('D2 card pauses when hidden', /useDocVisible/.test(card));
}

// D3 — the API.
{
  const route = read('src/app/api/olympus/design-choice/route.ts');
  expect('D3 route has GET + POST', /export async function GET/.test(route) && /export async function POST/.test(route));
  expect('D3 route validates the slug', /function safeSlug/.test(route) && /\^\[a-z0-9\]/.test(route));
  expect('D3 route persists design-decisions.jsonl', /design-decisions\.jsonl/.test(route));
  expect('D3 route writes inside 02_Projects', /02_Projects/.test(route));
  expect('D3 route appends select/refine events', /design-choice-selected/.test(route) && /design-choice-refined/.test(route));
  expect('D3 route returns a follow-up message', /followUp/.test(route));
}

// D4 — the Studio is gone.
{
  expect('D4 design-studio.tsx is gone', !fs.existsSync(path.join(ROOT, 'src/components/olympus/design-studio.tsx')));
  expect('D4 design-studio route is gone', !fs.existsSync(path.join(ROOT, 'src/app/api/olympus/design-studio/route.ts')));
  const term = read('src/components/olympus/interactive-terminal.tsx');
  expect('D4 terminal has no DesignStudio import', !/DesignStudio/.test(term));
  expect('D4 terminal mounts DesignChoiceCard inline', /<DesignChoiceCard/.test(term));
  expect('D4 terminal no longer renders the old review card', !/DesignReviewCard/.test(term));
}

// D5 — Athena's prompt.
{
  const prompt = read('.opencode/prompts/agents/gods/athena.txt');
  expect('D5 prompt has a Design Decision Moments section', /## Design Decision Moments/.test(prompt));
  expect('D5 prompt says 3 logo SVGs', /3 distinct SVG concepts/.test(prompt));
  expect('D5 prompt says generate NEW options on refinement', /3 NEW options/.test(prompt));
  expect('D5 prompt says no tool in unattended/hops', /UNATTENDED[\s\S]*do NOT call the tool/.test(prompt));
}

// D6 — the design marker teaches the planner the same contract.
{
  const route = read('src/app/api/olympus/action/route.ts');
  expect('D6 design marker mentions olympus-design-review', /Interactive design choices:[\s\S]*olympus-design-review/.test(route));
  expect('D6 design marker says no Design Studio modal', /no Design Studio modal/.test(route));
}

console.log(`\ndesign-choice: ${passed} passed, ${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
