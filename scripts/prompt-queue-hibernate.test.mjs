#!/usr/bin/env node
/**
 * prompt-queue-hibernate.test.mjs — v0.0.85 (backport): the phone drains while
 * OLYMPUS hibernates.
 *
 * THE SPECIMEN: the campaign parked while the user was away; `investigar` on
 * the phone queued the prompt, but the only drainer was the terminal renderer
 * — destroyed by hibernate. The fix is a server-side drain that runs only
 * while the hibernation marker is active, pins the project, calls the normal
 * action route and feeds the answer back to the PC/phone notification feed.
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
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : ' — ' + String(detail).slice(0, 240)}`);
  if (!cond) failures++;
}

const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'olympus-queue-home-'));
process.env.OLYMPUS_HOME = tmpHome;
fs.writeFileSync(path.join(tmpHome, 'session-token'), 'test-token\n', { mode: 0o600 });
fs.writeFileSync(path.join(tmpHome, 'opencode-sessions.json'), JSON.stringify({
  'terminal-current': { sessionId: 'ses_test', createdAt: '2026-11-06T21:00:00.000Z', lastUsedAt: '2026-11-06T21:55:00.000Z' },
  'older': { sessionId: 'ses_old', createdAt: '2026-11-05T21:00:00.000Z', lastUsedAt: '2026-11-05T21:55:00.000Z' },
}, null, 2));
fs.writeFileSync(path.join(tmpHome, 'active-project.json'), JSON.stringify({ slug: 'aime' }));
fs.writeFileSync(path.join(tmpHome, 'language.json'), JSON.stringify({ language: 'pt-BR' }));

const queue = await import(OLYMPUS + '/src/lib/prompt-queue.ts');
const drain = await import(OLYMPUS + '/src/lib/prompt-queue-drain.ts');
const notify = await import(OLYMPUS + '/src/lib/desktop-notify.ts');

function hibernate(active) {
  fs.writeFileSync(path.join(tmpHome, 'hibernation.json'), JSON.stringify({ active, at: new Date().toISOString() }));
}

const calls = [];
const fakeFetch = async (url, init) => {
  calls.push({ url: String(url), body: JSON.parse(String(init.body)), headers: init.headers });
  return new Response(
    'data: {"type":"msg","msg":"Investigação concluída: o hop c8 foi liberado e o walk retomou."}\n\n'
    + 'data: {"type":"action_done","action":"prompt","code":0}\n\n',
    { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
  );
};

hibernate(true);
const phone = queue.enqueuePrompt('aime', 'O hop c8-companion-notify está parked. Investigue o bloqueio e retome o walk.', Date.now(), { source: 'phone', priority: 'high' });
expect('Q-1: the phone prompt is queued', phone?.status === 'queued', phone);

const first = await drain.drainPhoneQueueOnce({ baseUrl: 'http://test', token: 'tok', fetchImpl: fakeFetch });
expect('Q-2: the hibernation drain dispatches the phone item', first.dispatched === 1 && calls.length === 1, first);
expect('Q-3: the prompt is pinned to the queued project', String(calls[0]?.body?.text || '').startsWith('[OLYMPUS-PROJECT aime]\n'), calls[0]?.body?.text);
expect('Q-4: the answer continues the terminal conversation', calls[0]?.body?.conversationId === 'terminal-current', calls[0]?.body?.conversationId);
expect('Q-5: the token is sent as the header, never the query', calls[0]?.headers?.['x-olympus-token'] === 'tok' && !String(calls[0]?.url).includes('tok='), calls[0]?.url);
const sent = queue.listQueue('aime').find((item) => item.id === phone.id);
expect('Q-6: a successful dispatch marks the item sent', sent?.status === 'sent' && Boolean(sent?.sentAt), sent);

const feed = notify.readDesktopNotifications(20);
expect('Q-7: the answer lands in the shared notification feed', feed.some((event) => /Apolo respondeu/.test(event.title) && /Investigação concluída/.test(event.body)), feed.slice(0, 3));

const creative = queue.enqueuePrompt('aime', 'refine the hero copy', Date.now() + 1, { source: 'creative' });
const before = calls.length;
const creativeDrain = await drain.drainPhoneQueueOnce({ baseUrl: 'http://test', token: 'tok', fetchImpl: fakeFetch });
expect('Q-8: a creative item is not auto-sent while hibernating', creativeDrain.dispatched === 0 && calls.length === before, creativeDrain);
expect('Q-9: the creative item stays queued', queue.listQueue('aime').find((item) => item.id === creative.id)?.status === 'queued', creative);

hibernate(false);
const awakeItem = queue.enqueuePrompt('aime', 'O hop z está parked. Investigue.', Date.now() + 2, { source: 'phone', priority: 'high' });
const awake = await drain.drainPhoneQueueOnce({ baseUrl: 'http://test', token: 'tok', fetchImpl: fakeFetch });
expect('Q-10: while awake the terminal renderer owns the queue', awake.skipped === 'not-hibernating' && calls.length === before, awake);
expect('Q-11: the awake item stays queued for the renderer', queue.listQueue('aime').find((item) => item.id === awakeItem.id)?.status === 'queued', awakeItem);

hibernate(true);
const failItem = queue.enqueuePrompt('aime', 'O hop y está parked. Investigue agora.', Date.now() + 3, { source: 'phone', priority: 'high' });
const failFetch = async () => new Response('data: {"type":"error","msg":"provider down"}\n\n', { status: 200 });
const failed = await drain.drainPhoneQueueOnce({ baseUrl: 'http://test', token: 'tok', fetchImpl: failFetch });
expect('Q-12: a failed dispatch is not marked sent', failed.dispatched === 0 && queue.listQueue('aime').find((item) => item.id === failItem.id)?.status === 'queued', failed);
const retry = await drain.drainPhoneQueueOnce({ baseUrl: 'http://test', token: 'tok', fetchImpl: failFetch });
expect('Q-13: a failed item backs off before retrying', retry.skipped === 'backoff', retry);
expect('Q-14: the failure is visible in the feed', notify.readDesktopNotifications(20).some((event) => event.type === 'error' && /prompt do celular falhou/.test(event.title)), notify.readDesktopNotifications(5));

const route = fs.readFileSync(OLYMPUS + '/src/app/api/olympus/prompt-queue/route.ts', 'utf-8');
expect('Q-15: the queue route starts the hibernation drain', /ensurePromptQueueDrain/.test(route) && /requireAuth/.test(route), 'drain not wired');

fs.rmSync(tmpHome, { recursive: true, force: true });
console.log(failures === 0 ? '\nprompt-queue-hibernate: all green.' : `\nprompt-queue-hibernate: ${failures} failure(s).`);
process.exit(failures === 0 ? 0 : 1);
