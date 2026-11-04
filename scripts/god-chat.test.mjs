#!/usr/bin/env node
/**
 * god-chat.test.mjs — v0.0.76.
 *
 * The Parthenon must let the user talk to ONE god (its own agent), show the
 * god's last thought and what it is doing — without routing through Apollo.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const route = fs.readFileSync(path.join(ROOT, 'src/app/api/olympus/god/chat/route.ts'), 'utf-8');
const modal = fs.readFileSync(path.join(ROOT, 'src/components/olympus/god-chat-modal.tsx'), 'utf-8');
const panel = fs.readFileSync(path.join(ROOT, 'src/components/olympus/god-panel.tsx'), 'utf-8');
const godRun = fs.readFileSync(path.join(ROOT, 'src/lib/god-run.ts'), 'utf-8');
let failures = 0;
const check = (n, c, d) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${c ? '' : ' — ' + String(d).slice(0, 200)}`); if (!c) failures++; };

check('G-1: the route validates the 10 gods', /const GODS = new Set\(\[/.test(route) && /GODS\.has\(god\)/.test(route), 'no god allowlist');
check('G-2: the turn runs the god’s own agent', /'--agent', god/.test(godRun), 'not the god agent');
check('G-3: the answer is parsed from the JSON stream', /extractText/.test(godRun) && /part\?\.text/.test(godRun), 'no text parser');
check('G-4: a turn is bounded and killable', /timeoutMs/.test(godRun) && /SIGKILL/.test(godRun) && /TIMEOUT_MS/.test(route), 'no timeout');
check('G-5: the modal posts to the god route', /\/api\/olympus\/god\/chat/.test(modal) && /god: godId/.test(modal), 'modal not wired');
check('G-6: the modal shows the last thought', /reasoning/.test(modal) && /last thought/.test(modal), 'no thought');
check('G-7: the panel opens the chat', /setChatGod/.test(panel) && /GodChatModal/.test(panel), 'no entry point');
check('G-8: Apollo is not in the middle', !/agent: 'apollo'/.test(route), 'the route routes through Apollo');
check('G-9: a second god can join the session', /withGod/.test(route) && /replies/.test(route) && /runGodTurn\(withGod/.test(route), 'no god↔god round');
check('G-10: the exchange lands in the shared activity feed', /appendActivity/.test(route), 'no durable log');
check('G-11: the modal offers the second-god selector', /discuss with/.test(modal) && /setWithGod/.test(modal), 'no selector');
check('G-12: replies carry their god', /replies\.map/.test(modal) && /m\.god/.test(modal), 'replies lose the speaker');

console.log(`\ngod-chat: ${failures === 0 ? 'PASS' : failures + ' FAIL'}`);
process.exit(failures === 0 ? 0 : 1);
