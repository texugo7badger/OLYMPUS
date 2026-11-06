#!/usr/bin/env node
/**
 * handoff-continuity.test.mjs — v0.0.85: a context reset never forks a project.
 *
 * THE SPECIMEN (2026-11-06 18:54): the compaction handoff wrote
 * `~/.olympus/handoffs/.../olympus-handoff-context-window.md` and sent the
 * brief path as a normal prompt. The intake derived a project name from that
 * path and created `olympus-handoff-context-window` while AIME was active.
 *
 * The contract: a handoff is a CONTINUATION. The explicit
 * `[OLYMPUS-PROJECT <slug>]` pin wins; the `[OLYMPUS HANDOFF]` marker inherits
 * the active project; a real new prompt still creates a new project.
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

const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'olympus-handoff-home-'));
const tmpVault = fs.mkdtempSync(path.join(os.tmpdir(), 'olympus-handoff-vault-'));
const aime = path.join(tmpVault, '02_Projects', 'aime');
fs.mkdirSync(aime, { recursive: true });
fs.writeFileSync(path.join(aime, 'project.md'), '---\nslug: aime\nname: AIME\npath: ' + aime + '\ndescription: anime companion\n---\n');
fs.writeFileSync(path.join(tmpHome, 'active-project.json'), JSON.stringify({ slug: 'aime', ts: new Date().toISOString() }));

process.env.OLYMPUS_HOME = tmpHome;
process.env.OLYMPUS_VAULT = tmpVault;

const intent = await import(OLYMPUS + '/src/lib/project-intent.ts');

const handoff = `[OLYMPUS HANDOFF] The context window was reset before it could degrade. Read your continuation brief first:
/home/texugo/.olympus/handoffs/2026-11-06T21-12-13Z/olympus-handoff-context-window.md

Then CONTINUE the same task from where it stopped.`;

const pinned = intent.resolveKnownTurnProject({
  text: `[OLYMPUS-PROJECT aime]\n${handoff}`,
  conversationProject: null,
});
expect('H-1: the explicit project pin routes a handoff to AIME', pinned?.slug === 'aime' && pinned?.source === 'explicit', pinned);

const legacy = intent.resolveKnownTurnProject({ text: handoff, conversationProject: null });
expect('H-2: an older handoff without the pin inherits the active project', legacy?.slug === 'aime', legacy);

const activeAfter = JSON.parse(fs.readFileSync(path.join(tmpHome, 'active-project.json'), 'utf-8'));
expect('H-3: the handoff does not move the active pointer', activeAfter.slug === 'aime', activeAfter);

const routed = await intent.resolveAndRegisterIntent(handoff, []);
expect('H-4: the intake stage routes the handoff to AIME, never a new project', routed.kind === 'existing' && routed.slug === 'aime', routed);

const parkedQuestion = await intent.resolveAndRegisterIntent('O hop c8-companion-notify está parked. Investigue o bloqueio e retome o walk.', []);
expect('H-8: a parked-hop question stays in the active project', parkedQuestion.kind === 'existing' && parkedQuestion.slug === 'aime', parkedQuestion);

const campaignQuestion = await intent.resolveAndRegisterIntent('Why did the campaign fail with a provider rate limit?', []);
expect('H-9: a campaign question does not mint a project', campaignQuestion.kind === 'existing' && campaignQuestion.slug === 'aime', campaignQuestion);

const designFollowup = await intent.resolveAndRegisterIntent('O background escolhido para padrão em tudo foi o errado - agora a home está com o background feio - cade aquele com nuvens parecidas com a logo?', []);
expect('H-10: a short design follow-up stays in the active project', designFollowup.kind === 'existing' && designFollowup.slug === 'aime', designFollowup);

const explicitNew = await intent.resolveAndRegisterIntent('Create a new project called Aurora with a dashboard', []);
expect('H-11: an explicit create does fork a project', explicitNew.kind === 'new', explicitNew);

const normal = await intent.resolveAndRegisterIntent('Create a landing page for a petshop with a booking form and a gallery', []);
expect('H-5: a real new request still creates a project', normal.kind === 'new', normal);

const terminal = fs.readFileSync(OLYMPUS + '/src/components/olympus/interactive-terminal.tsx', 'utf-8');
expect('H-6: the reset prompt carries the pin', terminal.includes('[OLYMPUS-PROJECT ${activeProject.slug}]') && terminal.includes('OLYMPUS HANDOFF'), 'no pin in the reset prompt');

const route = fs.readFileSync(OLYMPUS + '/src/app/api/olympus/action/route.ts', 'utf-8');
expect('H-7: the new-session stream inherits the active project', /getActiveProjectSlug/.test(route) && /New-session handoff inherits/.test(route), 'new-session still forks');

fs.rmSync(tmpHome, { recursive: true, force: true });
fs.rmSync(tmpVault, { recursive: true, force: true });
console.log(failures === 0 ? '\nhandoff-continuity: all green.' : `\nhandoff-continuity: ${failures} failure(s).`);
process.exit(failures === 0 ? 0 : 1);
