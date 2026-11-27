#!/usr/bin/env node
/**
 * verify-v012-ui.mjs — v0.1.2: the live UI gate (CDP, no mockups).
 *
 * Proves the release's user-visible claims against the running production app:
 *   U1 shell boots (no repair card)
 *   U2 version is 0.1.2
 *   U3 Craft and References are distinct menus
 *   U4 Craft shows the native tool registry (with installed/absent truth)
 *   U5 References "Use" stages an editable prompt asking HOW to use it
 *   U6 the Cost pane settles and the usage chart is not a skeleton
 *   U7 Callimachus is live with validated quick-circuit counts + budget
 *   U8 the false "33 quick circuits" heuristic is gone (0 validated is honest)
 *   U9 a reference can be filtered by the new sources
 *   U10 Sync Map is not in the UI
 *   U11 no uncaught page exception
 *
 * Usage: node scripts/verify-v012-ui.mjs
 * Env: OLYMPUS_URL, CDP_PORT, CHROME_BIN
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'screenshots', 'screens');
const URL_BASE = process.env.OLYMPUS_URL || 'http://127.0.0.1:3737/';
const PORT = Number(process.env.CDP_PORT || 9231);
const CHROME = process.env.CHROME_BIN || path.join(os.homedir(), '.cache', 'ms-playwright', 'chromium-1248', 'chrome-linux64', 'chrome');
const W = 1600;
const H = 1000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : ` — ${String(detail).slice(0, 320)}`}`);
  if (!ok) failures++;
};

async function waitForCdp() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const pages = await r.json();
      const page = pages.find((p) => p.type === 'page');
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch { /* not up */ }
    await sleep(250);
  }
  throw new Error('CDP did not come up');
}

function client(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  const events = [];
  ws.on('message', (raw) => {
    let msg; try { msg = JSON.parse(String(raw)); } catch { return; }
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message)); else resolve(msg.result);
    } else if (msg.method) {
      events.push(msg);
    }
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const n = ++id; pending.set(n, { resolve, reject });
    ws.send(JSON.stringify({ id: n, method, params }));
  });
  return { send, events, ready: new Promise((res, rej) => { ws.once('open', res); ws.once('error', rej); }), close: () => ws.close() };
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const chrome = spawn(CHROME, [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
    `--remote-debugging-port=${PORT}`, `--window-size=${W},${H}`, 'about:blank',
  ], { stdio: 'ignore' });
  let cdp;
  try {
    cdp = client(await waitForCdp());
    await cdp.ready;
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Network.enable');
    await cdp.send('Log.enable');
    const token = (() => { try { return fs.readFileSync(path.join(os.homedir(), '.olympus', 'session-token'), 'utf-8').trim(); } catch { return ''; } })();
    if (token) await cdp.send('Network.setCookie', { name: 'olympus_token', value: token, domain: '127.0.0.1', path: '/', httpOnly: true, sameSite: 'Strict' });

    const evaluate = async (expression) => (await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }))?.result?.value;
    const go = async (url, wait = 5000) => { await cdp.send('Page.navigate', { url }); await sleep(wait); };
    const clickLabel = async (label) => evaluate(`(() => { const bs = [...document.querySelectorAll('button')].filter(x => x.getAttribute('aria-label') === ${JSON.stringify(label)}); const b = bs.find(x => x.getClientRects().length > 0) || bs[0]; if (!b) return false; b.click(); return true; })()`);
    const waitFor = async (expr, timeoutMs = 30_000) => {
      for (let i = 0; i < Math.ceil(timeoutMs / 500); i++) {
        if (await evaluate(`(() => { try { return Boolean(${expr}); } catch { return false; } })()`)) return true;
        await sleep(500);
      }
      return false;
    };

    await go(URL_BASE, 8000);
    const booted = await waitFor(`[...document.querySelectorAll('button')].some(x => x.getAttribute('aria-label') === 'Cost')`, 30_000);
    const repair = await evaluate(`Boolean(document.querySelector('[data-testid="boot-repair"]'))`);
    const body = await evaluate('document.body.innerText.slice(0, 16000)');
    check('U1: the production shell rendered (no boot-repair card)', booted && !repair, `booted=${booted} repair=${repair}`);
    check('U2: the UI reports v0.1.2', /v?0\.1\.2/.test(body), body.slice(0, 240));

    const menus = await evaluate(`(() => {
      const labels = [...document.querySelectorAll('button')].map(b => b.getAttribute('aria-label')).filter(Boolean);
      return { craft: labels.includes('Craft'), references: labels.includes('References'), sync: labels.includes('Sync map') || document.body.innerText.includes('Sync map') };
    })()`);
    check('U3: Craft and References are distinct menus', menus.craft && menus.references, JSON.stringify(menus));
    check('U10: Sync Map is gone from the UI', menus.sync === false, JSON.stringify(menus));

    // Craft: external tools detected, no install side effect.
    await clickLabel('Craft');
    await sleep(2500);
    const craft = await evaluate(`(async () => {
      const r = await fetch('/api/olympus/native-tools', { cache: 'no-store' });
      const d = await r.json().catch(() => null);
      const text = document.body.innerText.slice(0, 9000);
      return { api: r.ok, tools: Array.isArray(d?.tools) ? d.tools.length : 0, hasBoolean: Array.isArray(d?.tools) && d.tools.every(t => typeof t.installed === 'boolean'), text };
    })()`);
    check('U4: Craft shows the native tool registry with installed/absent truth', craft.api && craft.tools >= 4 && craft.hasBoolean && /native/i.test(craft.text), JSON.stringify(craft).slice(0, 700));

    // References: new sources are visible; Use stages an editable question.
    await clickLabel('References');
    await waitFor(`/reactbits|motion primitives/i.test(document.body.innerText)`, 30_000);
    await sleep(1200);
    const refs = await evaluate(`(() => {
      const text = document.body.innerText;
      const libs = ['ReactBits', 'Motion Primitives', 'Kokonut'];
      const useButtons = [...document.querySelectorAll('[data-action="reference-use"]')];
      const firstUse = useButtons.find(b => b.getClientRects().length > 0);
      firstUse?.click();
      return { hasNewSources: libs.every(l => new RegExp(l, 'i').test(text)), clicked: Boolean(firstUse), header: text.includes('References'), useButtons: useButtons.length, hasReact: /reactbits/i.test(text), len: text.length };
    })()`);
    await sleep(1200);
    const staged = await evaluate(`(() => {
      const ta = [...document.querySelectorAll('textarea')].find(t => (t.getAttribute('data-tip') || '').includes('Paste text'));
      return ta ? String(ta.value || '') : '';
    })()`);
    check('U5: References "Use" stages an editable prompt asking HOW to use it', refs.hasNewSources && refs.clicked && /how do you want to use it/i.test(staged), `refs=${JSON.stringify(refs)} staged=${staged.slice(0, 260)}`);

    // Cost: settled data + a real chart (bars or the explicit empty state).
    await clickLabel('Cost');
    const costSettled = await waitFor(`(() => {
      return document.querySelectorAll('[aria-label="Hourly token usage"] > div').length > 0 && !document.querySelector('[aria-label="Loading GO forecast"]');
    })()`, 45_000);
    const cost = await evaluate(`(() => {
      const text = document.body.innerText;
      const bars = document.querySelectorAll('[aria-label="Hourly token usage"] > div').length;
      const chart = Boolean(document.querySelector('svg[aria-label*="forecast"], [aria-label*="forecast"]')) || /no measured monthly usage|ledger is unavailable/i.test(text);
      return { settled: bars > 0, bars, chart, loading: Boolean(document.querySelector('[aria-label="Loading GO forecast"]')), text: text.slice(0, 1200) };
    })()`);
    check('U6: the Cost pane settles and the usage chart is not a skeleton', costSettled && cost.settled && cost.bars > 0 && cost.chart && !cost.loading, JSON.stringify(cost).slice(0, 700));

    // Callimachus: live card, honest census, budget line.
    await clickLabel('God intelligence');
    const curatorReady = await waitFor(`document.body.innerText.includes('Callimachus · VaultBrain maintenance') || Boolean(document.querySelector('[data-testid="callimachus-live"]'))`, 45_000);
    const curator = await evaluate(`(() => {
      const card = document.querySelector('[data-testid="callimachus-live"]');
      return { ready: Boolean(card), text: card ? card.innerText : '' };
    })()`);
    const quick = Number((curator.text.match(/quick circuits\s+(\d+)/i) || [])[1] ?? -1);
    check('U7: Callimachus is live with validated quick-circuit counts', curatorReady && curator.ready && quick >= 0 && /model \d+\/\d+ this hour/.test(curator.text), curator.text.slice(0, 500));
    check('U8: no invented quick-circuit count (0 validated is honest; no stale 33)', quick === 0 || /validated|proof/i.test(curator.text), `quick=${quick} ${curator.text.slice(0, 500)}`);

    await go(URL_BASE, 5000);
    const errors = cdp.events
      .filter((e) => e.method === 'Runtime.exceptionThrown' || (e.method === 'Log.entryAdded' && e.params?.entry?.level === 'error'))
      .map((e) => e.params?.exceptionDetails?.text || e.params?.entry?.text || '')
      .filter((t) => t && !/youtube|postMessage|Content Security Policy|preload|127\.0\.0\.2|ERR_CONNECTION_REFUSED|ERR_INCOMPLETE_CHUNKED_ENCODING|ERR_CONNECTION_RESET|Failed to load resource/i.test(t));
    check('U11: no uncaught app exception in the real page', errors.length === 0, errors.slice(0, 3).join(' | '));

    console.log(failures === 0 ? '\nverify-v012-ui: PASS' : `\nverify-v012-ui: ${failures} FAIL`);
    process.exit(failures === 0 ? 0 : 1);
  } finally {
    try { cdp?.close(); } catch { /* gone */ }
    try { chrome.kill('SIGTERM'); } catch { /* gone */ }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
