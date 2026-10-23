#!/usr/bin/env node
/**
 * lane-probe-harness.test.mjs — #193: the harness-only probe classes.
 *
 * The 2026-10-23 evidence: opencode-go refused a raw probe with
 * 400 MissingSessionID, then 401 api_key_expired with the stale auth.json
 * key — yet the same lane streamed through opencode (its own account auth).
 * Zen free refused a raw probe with 403 FreeTierError ("only be used from
 * within OpenCode"). A naive probe would false-warn over healthy lanes.
 *
 * This suite runs a local HTTP server that speaks those exact refusals and
 * asserts:
 *   1. GO/Zen probes send x-opencode-session (the harness signal).
 *   2. MissingSessionID / FreeTierError / api_key_expired = ok + aliveForUs
 *      (quiet — never a stall warning).
 *   3. A real 401 on a non-harness provider (OpenRouter) is still a FAIL
 *      (the quiet class never leaks to lanes whose auth we own).
 *
 * Run: npx tsx scripts/lane-probe-harness.test.mjs
 */
import { createServer } from 'node:http';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

let failures = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail && !ok ? `\n      ${detail}` : ''}`);
  if (!ok) failures++;
}

const seen = [];
const server = createServer((req, res) => {
  let body = '';
  req.on('data', c => { body += c; });
  req.on('end', () => {
    const session = req.headers['x-opencode-session'];
    seen.push({ url: req.url, session, auth: req.headers.authorization });
    const json = (status, obj) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(obj));
    };
    if (req.url?.startsWith('/go')) {
      if (!session) return json(400, { error: 'MissingSessionID' });
      return json(401, { error: 'api_key_expired' });
    }
    if (req.url?.startsWith('/zen')) {
      return json(403, { error: { type: 'FreeTierError', message: 'only be used from within OpenCode' } });
    }
    if (req.url?.startsWith('/or-401')) {
      return json(401, { error: { message: 'invalid api key' } });
    }
    if (req.url?.startsWith('/or-agentic')) {
      return json(403, { error: { message: 'This model is only available to agentic harnesses' } });
    }
    json(404, { error: 'not found' });
  });
});

await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;

const dir = mkdtempSync(path.join(tmpdir(), 'lane-probe-harness-'));
function writeConfig(model, providerId, baseURL) {
  writeFileSync(path.join(dir, 'opencode.json'), JSON.stringify({
    agent: { apollo: { model } },
    provider: { [providerId]: { options: { baseURL } } },
  }));
}
// The expired mirror key is deliberately present: the probe must not treat
// the auth-store stale key as a lane verdict on harness providers.
writeFileSync(path.join(dir, 'auth.json'), JSON.stringify({
  'opencode-go': { type: 'api', key: 'stale-go-key' },
  openrouter: { type: 'api', key: 'sk-or-bad' },
}));

const probe = await import('../src/lib/lane-probe.ts');
const opts = { workspacePath: path.join(dir, 'opencode.json'), authPath: path.join(dir, 'auth.json'), timeoutMs: 3000 };

writeConfig('opencode-go/deepseek-v4.1-flash', 'opencode-go', `http://127.0.0.1:${port}/go`);
const go = await probe.probeLane({ ...opts, agent: 'apollo' });
check('GO: the probe sends x-opencode-session (the harness signal)',
  seen.some(s => s.url?.startsWith('/go') && typeof s.session === 'string' && s.session.startsWith('olympus-probe-')),
  JSON.stringify(seen));
check('GO: an expired mirror key is UNVERIFIABLE-raw, not a dead lane',
  go?.ok === true && go?.aliveForUs === true && /opencode owns auth|MissingSessionID|expired/i.test(go?.note || ''),
  JSON.stringify(go));

writeConfig('opencode/glm-5.3-flash', 'opencode', `http://127.0.0.1:${port}/zen`);
const zen = await probe.probeLane({ ...opts, agent: 'apollo' });
check('ZEN: 403 FreeTierError = alive-for-us (opencode is the real verifier)',
  zen?.ok === true && zen?.aliveForUs === true && /FreeTierError/i.test(zen?.note || ''),
  JSON.stringify(zen));

writeConfig('openrouter/cohere/north-mini-code:free', 'openrouter', `http://127.0.0.1:${port}/or-401`);
const orBad = await probe.probeLane({ ...opts, agent: 'apollo' });
check('OPENROUTER: a real 401 is still a FAIL (the quiet class does not leak)',
  orBad?.ok === false && !orBad?.aliveForUs,
  JSON.stringify(orBad));

writeConfig('openrouter/thinkingmachines/inkling:free', 'openrouter', `http://127.0.0.1:${port}/or-agentic`);
const orAgentic = await probe.probeLane({ ...opts, agent: 'apollo' });
check('OPENROUTER: 403 agentic harness = alive-for-us (the W-X class holds)',
  orAgentic?.ok === true && orAgentic?.aliveForUs === true,
  JSON.stringify(orAgentic));

server.close();
rmSync(dir, { recursive: true, force: true });

console.log('');
if (failures > 0) {
  console.error(`lane-probe-harness: ${failures} assertion(s) failed`);
  process.exit(1);
}
console.log('lane-probe-harness: all 5 harness-class assertions passed');
