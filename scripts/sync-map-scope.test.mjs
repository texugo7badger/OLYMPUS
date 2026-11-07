#!/usr/bin/env node
/**
 * sync-map-scope.test.mjs — v0.0.85: the Sync Map is the APP's ledger.
 *
 * The specimen: the Atlas chat.message hook recorded this operator
 * conversation and every [HOP CONTRACT] walker prompt as Apollo project
 * turns (657 entries, 0 app markers). The fix scopes ingest to the app's
 * mapped OpenCode sessions, skips hop/internal prompts, scopes session.idle
 * to its own session, and gives the read API an `app` default with an `all`
 * audit view.
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

const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'olympus-sync-home-'));
const tmpVault = fs.mkdtempSync(path.join(os.tmpdir(), 'olympus-sync-vault-'));
process.env.OLYMPUS_HOME = tmpHome;
process.env.OLYMPUS_VAULT = tmpVault;
fs.writeFileSync(path.join(tmpHome, 'opencode-sessions.json'), JSON.stringify({
  'app-terminal': { sessionId: 'ses_app', createdAt: '2026-11-06T20:00:00.000Z', lastUsedAt: '2026-11-06T23:00:00.000Z' },
  'mobile-aime': { sessionId: 'ses_mobile', createdAt: '2026-11-06T20:00:00.000Z', lastUsedAt: '2026-11-06T22:00:00.000Z' },
}, null, 2));

const scope = await import(OLYMPUS + '/src/lib/sync-map-scope.ts');
const atlas = await import(OLYMPUS + '/.opencode/olympus/lib/atlas-sync.ts');

const appSessions = scope.appSessionSet(JSON.parse(fs.readFileSync(path.join(tmpHome, 'opencode-sessions.json'), 'utf-8')));
expect('S-1: the session map resolves the app sessions', appSessions.has('ses_app') && appSessions.has('ses_mobile') && appSessions.size === 2, [...appSessions]);
expect('S-2: a mapped app session is in scope', atlas.isOlympusAppSession('ses_app') === true, 'mapped session refused');
expect('S-3: the operator session is out of scope', atlas.isOlympusAppSession('ses_operator') === false, 'operator session ingested');
expect('S-4: the app prompt marker is recognized', scope.isAppPromptMarker('[OLYMPUS-SESSION abc] hello') === true, 'marker miss');
expect('S-5: a raw operator prompt is not an app prompt', scope.isAppPromptMarker('Perfeito, agora da uma olhada nos logs') === false, 'raw prompt accepted');
expect('S-6: a hop contract is never a project prompt', scope.isHopPrompt('[HOP CONTRACT] Project lane root') === true && scope.isInternalAppPrompt('[HOP CONTRACT] Project lane root') === true, 'hop accepted');

const appEntry = { origin: 'project', intent: 'hello', meta: { sessionID: 'ses_app' } };
const operatorEntry = { origin: 'project', intent: 'Perfeito, agora da uma olhada', meta: { sessionID: 'ses_operator' } };
const dispatchEntry = { origin: 'dispatch', intent: 'task', meta: { sessionID: 'ses_hop' } };
const strategyEntry = { origin: 'project', intent: '[OLYMPUS ACTIVE STRATEGY — authoritative] ...', meta: { sessionID: 'ses_app' } };
expect('S-7: a mapped project row is visible in app scope', scope.isAppSyncEntry(appEntry, appSessions) === true, 'app row hidden');
expect('S-8: an operator row is hidden in app scope', scope.isAppSyncEntry(operatorEntry, appSessions) === false, 'operator row visible');
expect('S-9: dispatches are always visible', scope.isAppSyncEntry(dispatchEntry, appSessions) === true, 'dispatch hidden');
expect('S-10: internal strategy prompts are not human turns', scope.isInternalAppPrompt(strategyEntry.intent) === true, 'strategy shown');

const a = atlas.atlasIngestProjectPrompt({ sessionID: 'ses_app', text: '[OLYMPUS-SESSION abc] do the task', app: true });
const b = atlas.atlasIngestProjectPrompt({ sessionID: 'ses_operator', text: 'operator message', app: false });
const map1 = JSON.parse(fs.readFileSync(path.join(tmpHome, 'sync-map.json'), 'utf-8'));
expect('S-11: app ingest stamps meta.app', map1.entries[a.id]?.meta?.app === true, map1.entries[a.id]);
expect('S-12: the operator ingest has no app stamp', map1.entries[b.id]?.meta?.app !== true, map1.entries[b.id]);

atlas.atlasMarkProjectTurnsDone('ses_app');
const map2 = JSON.parse(fs.readFileSync(path.join(tmpHome, 'sync-map.json'), 'utf-8'));
expect('S-13: session.idle only closes its own session', map2.entries[a.id]?.status === 'done' && map2.entries[b.id]?.status === 'received', { a: map2.entries[a.id]?.status, b: map2.entries[b.id]?.status });

const hooks = fs.readFileSync(OLYMPUS + '/.opencode/olympus/olympus-hooks.ts', 'utf-8');
const bridge = fs.readFileSync(OLYMPUS + '/.opencode/olympus/v2-bridge.ts', 'utf-8');
const route = fs.readFileSync(OLYMPUS + '/src/app/api/olympus/sync-map/route.ts', 'utf-8');
const panel = fs.readFileSync(OLYMPUS + '/src/components/olympus/sync-map-panel.tsx', 'utf-8');
const action = fs.readFileSync(OLYMPUS + '/src/app/api/olympus/action/route.ts', 'utf-8');
expect('S-14: the chat.message hook gates on the app session/marker', /isOlympusAppSession\(input\.sessionID\)/.test(hooks) && /isAppPromptMarker\(promptText\)/.test(hooks) && /isHopPrompt\(promptText\)/.test(hooks), 'hook still ingests everything');
expect('S-15: session.idle carries the session id', /session\.idle.*input\?: \{ sessionID\?: string \}/.test(hooks) && /atlasMarkProjectTurnsDone\(input\?\.sessionID\)/.test(hooks) && /idleHandler\(\{ sessionID/.test(bridge), 'idle is global');
expect('S-16: the read API defaults to app scope with an all view', /get\('scope'\) === 'all' \? 'all' : 'app'/.test(route) && /isAppSyncEntry\(e, appSessions\)/.test(route) && /scope=\$\{scope\}/.test(panel), 'read path not scoped');
expect('S-17: the new-session handoff carries the session marker', /\[OLYMPUS-SESSION \$\{conversationId\}\]/.test(action), 'new-session unmarked');

fs.rmSync(tmpHome, { recursive: true, force: true });
fs.rmSync(tmpVault, { recursive: true, force: true });
console.log(failures === 0 ? '\nsync-map-scope: all green.' : `\nsync-map-scope: ${failures} failure(s).`);
process.exit(failures === 0 ? 0 : 1);
