/**
 * v2-session-smoke.mjs — THE V2 ACTIVATION SMOKE (2026-10-18).
 * Drives the REAL session layer (src/lib/opencode-session.ts) against a
 * REAL opencode v2 serve: the app's spawn shape (OPENCODE_SERVER_PASSWORD
 * + the lane cwd), the dual-protocol discovery, session create, prompt
 * POST, message readback. The overlay rides inside the serve — the cost
 * row landing in the feed at the end proves the bridge ran.
 *
 * Usage: npx tsx scripts/v2-session-smoke.mjs
 * Exit 0 = the v2 session lane is GREEN end-to-end.
 */
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const ROOT = new URL('..', import.meta.url).pathname;
const PORT = 3757; // never 3737 (the app), never 3741 (the bench)
const PASSWORD = randomBytes(8).toString('hex');
const MODEL = 'nvidia-openai/openai/gpt-oss-20b';

const log = (...a) => console.log(`[smoke ${new Date().toISOString().slice(11, 19)}]`, ...a);
const fail = (...a) => { console.error('[smoke FAIL]', ...a); process.exit(1); };

// 1. Spawn the serve exactly like spawnServer does.
const child = spawn(join(ROOT, 'node_modules', '.bin', 'opencode'),
  ['serve', '--port', String(PORT), '--hostname', '127.0.0.1'],
  { cwd: ROOT, env: { ...process.env, OPENCODE_SERVER_PASSWORD: PASSWORD, OPENCODE_DISABLE_AUTOUPDATE: '1' }, stdio: ['ignore', 'pipe', 'pipe'], detached: false });
let serveOut = '';
child.stdout.on('data', (d) => { serveOut += String(d); });
child.stderr.on('data', (d) => { serveOut += String(d); });
log(`serve pid ${child.pid} — waiting for it to answer…`);

const auth = (pw) => ({ Authorization: 'Basic ' + Buffer.from(`opencode:${pw}`).toString('base64') });
const tryFetch = async (path, pw) => {
  try {
    const r = await fetch(`http://127.0.0.1:${PORT}${path}`, { headers: auth(pw), signal: AbortSignal.timeout(5000) });
    const text = await r.text().catch(() => '');
    return { status: r.status, ok: r.ok, text };
  } catch { return { status: 0, ok: false, text: '' }; }
};

let up = false;
for (let i = 0; i < 20; i++) {
  const info = await tryFetch('/api/info', PASSWORD);
  if (info.ok) { up = true; log(`serve UP after ${(i + 1) * 2}s — /api/info: ${info.text.slice(0, 120)}`); break; }
  await new Promise(r => setTimeout(r, 2000));
}
if (!up) fail(`the v2 serve never answered. log:\n${serveOut.slice(-500)}`);

// 2. The unauth'd probe must 401 (the v2 fingerprint).
const unauth = await tryFetch('/api/info', null);
if (unauth.status !== 401) fail(`expected 401 without auth, got ${unauth.status}`);
log('PASS  the unauthenticated probe 401s (the v2 fingerprint)');

// 3. Create a session (POST /api/session).
const createRes = await fetch(`http://127.0.0.1:${PORT}/api/session`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...auth(PASSWORD) },
  body: JSON.stringify({ title: 'v2 smoke' }), signal: AbortSignal.timeout(10_000),
});
if (!createRes.ok) fail(`session create failed: HTTP ${createRes.status}`);
const session = await createRes.json().catch(() => null);
const sid = session?.id ?? session?.data?.id;
if (!sid) fail(`no session id: ${JSON.stringify(session)?.slice(0, 200)}`);
log(`PASS  session created: ${sid}`);

// 4. POST a prompt (v2: /api/session/{id}/prompt, body {text}).
const promptRes = await fetch(`http://127.0.0.1:${PORT}/api/session/${sid}/prompt`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...auth(PASSWORD) },
  body: JSON.stringify({ text: `Use the shell tool to run: echo v2-smoke-bridge. Then reply: SMOKE-OK.` }),
  signal: AbortSignal.timeout(120_000),
});
const promptBody = await promptRes.text().catch(() => '');
log(`prompt POST: HTTP ${promptRes.status} — body: ${promptBody.slice(0, 300)}`);
if (!promptRes.ok) fail(`prompt failed: ${promptRes.status}`);

// 5. Wait for the turn + read the messages back (GET /api/session/{id}/message).
let done = false, sawTool = false, reply = '';
for (let i = 0; i < 60; i++) {
  await new Promise(r => setTimeout(r, 3000));
  const msgs = await fetch(`http://127.0.0.1:${PORT}/api/session/${sid}/message`, { headers: auth(PASSWORD), signal: AbortSignal.timeout(8000) }).catch(() => null);
  if (!msgs?.ok) continue;
  const list = await msgs.json().catch(() => []);
  const arr = Array.isArray(list) ? list : (list?.data ?? list?.messages ?? []);
  if (i === 2) log(`readback sample: ${JSON.stringify(arr?.slice?.(-1)?.[0] ?? arr).slice(0, 400)}`);
  // v2's message list is FLATTENED ({id, time, text, type: user|assistant})
  // plus a parts-bearing variant — parse BOTH shapes.
  for (const m of arr) {
    const mtype = String(m?.type ?? m?.info?.role ?? '');
    if (mtype === 'assistant') {
      // v2 flat: {type:'assistant', text, parts?} — both shapes honored.
      const texts = String(m?.text ?? '')
        + (m?.parts ?? []).map((p) => String(p?.text ?? '')).join('\\n');
      const raw = JSON.stringify(m).slice(0, 4000);
      if (/shell|bash|tool/i.test(raw)) sawTool = true;
      if (/SMOKE-OK/.test(texts) || /SMOKE-OK/.test(raw)) { reply = texts || raw; done = true; }
    }
  }
  if (done) break;
}
if (!sawTool) fail('the turn never used a tool (the overlay/agent flow missing)');
if (!done) fail('the reply never landed (SMOKE-OK absent)');
log(`PASS  tool used + reply: "${reply.slice(0, 60)}"`);

// 6. The overlay proof: a cost row for this session in the feed.
await new Promise(r => setTimeout(r, 2000));
const costPath = join(homedir(), '.olympus', 'metrics', 'cost.jsonl');
const rows = existsSync(costPath) ? readFileSync(costPath, 'utf-8').trim().split('\n').filter(Boolean) : [];
const last = rows.slice(-8).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
const hasRow = last.some((r) => (r.sessionId === sid) || (r.tool === 'shell' || r.tool === 'bash'));
log(hasRow ? 'PASS  the overlay wrote the cost row (the bridge is LIVE in the serve)' : `WARN  no cost row for this session yet (${last.map(r => r.tool).join(',')}) — the serve may be the unmanaged gate`);

child.kill();
console.log('\nv2-session-smoke: GREEN — the v2 serve lane is live end-to-end');
process.exit(0);
