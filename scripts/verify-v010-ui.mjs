#!/usr/bin/env node
/**
 * verify-v010-ui.mjs — v0.1.0: the live UI gate (CDP, no mockups).
 *
 * Opens the production app, proves the boot handshake rendered the shell
 * (no repair card), the status brief is present, the Cost pane settles (no
 * infinite loader), the preview window is an iframe, and captures the v0.1.0
 * evidence screenshots 77-81.
 *
 * Usage: node scripts/verify-v010-ui.mjs
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
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : ` — ${String(detail).slice(0, 300)}`}`);
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
    const go = async (url, wait = 4500) => { await cdp.send('Page.navigate', { url }); await sleep(wait); };
    const shot = async (name) => {
      const png = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      fs.writeFileSync(path.join(OUT, name), Buffer.from(png.data, 'base64'));
      console.log(`  saved screenshots/screens/${name}`);
    };

    await go(URL_BASE, 7000);
    // Boot gate: wait up to 20s for the shell, but never hide a repair card.
    let booted = false;
    for (let i = 0; i < 45; i++) {
      booted = await evaluate(`Boolean(document.querySelector('[data-testid="status-brief"]'))`);
      if (booted) break;
      await sleep(1000);
    }
    const body = await evaluate('document.body.innerText.slice(0, 12000)');
    const repair = await evaluate(`Boolean(document.querySelector('[data-testid="boot-repair"]'))`);
    check('U1: the production shell rendered (no boot-repair card)', booted && !repair, `booted=${booted} repair=${repair}`);
    check('U2: the UI shows v0.1.0', /v?0\.1\.0/.test(body), body.slice(0, 200));
    check('U3: the status brief card is mounted', await evaluate(`Boolean(document.querySelector('[data-testid="status-brief"]'))`));
    const briefText = await evaluate(`document.querySelector('[data-testid="status-brief"]')?.innerText || ''`);
    check('U4: the status brief names a project or an honest no-project state', /project|no project|gen/i.test(briefText), briefText);
    check('U5: the Parthenon command deck is present', /ask apollo|atlas|parthenon/i.test(body), body.slice(0, 300));
    await shot('77-hygiene-010.png');

    // Expand the brief for the evidence shot.
    await evaluate(`(() => { const b = document.querySelector('[data-testid="status-brief"] button[aria-expanded]'); if (b) b.click(); })()`);
    await sleep(700);
    await shot('78-status-brief-010.png');

    // Cost pane: click, then wait 25s. The dashboard must settle into data,
    // a degraded message or an empty state — never an endless loader.
    await evaluate(`(() => { const b = [...document.querySelectorAll('button')].find(x => x.getAttribute('aria-label') === 'Cost'); if (b) b.click(); })()`);
    await sleep(25_000);
    const costState = await evaluate(`(async () => {
      const r = await fetch('/api/olympus/costs?window=session', { cache: 'no-store' });
      const d = await r.json().catch(() => null);
      const loader = [...document.querySelectorAll('div,span,p')].find(el => /^loading costs$/i.test((el.textContent || '').trim()) && el.getClientRects().length > 0);
      return { api: r.ok, hasData: typeof d?.totalSpend === 'number', loader: Boolean(loader), text: document.body.innerText.slice(0, 1500) };
    })()`);
    check('U6: the Cost pane settles (no infinite loading)', costState.api && costState.hasData && !costState.loader, JSON.stringify(costState));
    check('U7: the Cost pane has a real ledger or an explicit degraded/empty state', costState.api && costState.hasData, JSON.stringify(costState).slice(0, 600));
    await shot('81-cost-010.png');

    // Model lanes: the configured roster is healthy, so the panel must say
    // "all clear" — the retired qwen/minimax lanes must not read as 3 dead.
    await evaluate(`(() => { const b = [...document.querySelectorAll('button')].find(x => x.getAttribute('aria-label') === 'LLM strategy'); if (b) b.click(); })()`);
    let lanesText = '';
    for (let i = 0; i < 15; i++) {
      lanesText = await evaluate(`document.documentElement.textContent?.slice(0, 30000) || ''`);
      if (/Model lanes/i.test(lanesText)) break;
      await sleep(1000);
    }
    check('U11: Model lanes reports all clear (retired lanes are not dead errors)', /all clear/i.test(lanesText) && !/\b3 dead\b|\bdead model lane/i.test(lanesText), lanesText.slice(0, 1200));
    await shot('82-model-lanes-010.png');

    // Preview window: the popup page must use an iframe (no black webview).
    await go(`${URL_BASE}preview-window?slug=aime`, 6500);
    let preview = { iframes: 0, webviews: 0, text: '' };
    for (let i = 0; i < 12; i++) {
      preview = await evaluate(`(async () => ({ iframes: document.querySelectorAll('iframe').length, webviews: document.querySelectorAll('webview').length, text: document.body.innerText.slice(0, 400), api: await fetch('/api/olympus/projects/preview?slug=aime', { cache: 'no-store' }).then(r => r.json()).catch(e => ({ error: String(e) })) }))()`);
      if (preview.iframes > 0) break;
      await sleep(1000);
    }
    check('U8: the preview window renders a browser iframe, not a webview', preview.iframes > 0 && preview.webviews === 0, JSON.stringify(preview));
    await shot('79-preview-window-010.png');

    // Marks: seed the durable queue through the same API the mark UI uses,
    // reload the preview window (the queue is read from disk), open the
    // panel and verify the batch controls. The queue is cleared afterwards
    // so the launch evidence leaves no fixture behind.
    const seeded = await evaluate(`(async () => {
      const mark = { id: 'mark-uat-0.1.0', x: 120, y: 80, page: '/', instruction: 'UAT: make the hero heading one step larger and keep the accent color', viewport: { width: 1600, height: 1000 }, url: 'http://127.0.0.1:3038', createdAt: new Date().toISOString() };
      const r = await fetch('/api/olympus/marks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug: 'aime', mark }) });
      return { ok: r.ok, status: r.status };
    })()`);
    await evaluate(`(async () => { await fetch('/api/olympus/marks?slug=aime', { method: 'DELETE' }).catch(() => null); return true; })()`);
    // Re-seed after the clean check above so the panel has exactly one mark.
    await evaluate(`(async () => {
      const mark = { id: 'mark-uat-0.1.0', x: 120, y: 80, page: '/', instruction: 'UAT: make the hero heading one step larger and keep the accent color', viewport: { width: 1600, height: 1000 }, url: 'http://127.0.0.1:3038', createdAt: new Date().toISOString() };
      await fetch('/api/olympus/marks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug: 'aime', mark }) });
      return true;
    })()`);
    await go(`${URL_BASE}preview-window?slug=aime`, 10000);
    let opened = false;
    for (let i = 0; i < 15; i++) {
      opened = await evaluate(`(() => { const b = [...document.querySelectorAll('button')].find(x => /mark/i.test(x.textContent || '') && x.hasAttribute('aria-expanded')); if (!b) return false; if (b.getAttribute('aria-expanded') === 'false') b.click(); return true; })()`);
      if (opened) break;
      await sleep(1000);
    }
    await sleep(900);
    const markText = await evaluate(`document.body.innerText.slice(0, 5000)`);
    const markCount = Number((markText.match(/\b(\d+)\s+marks?\b/) || [])[1] || 0);
    check('U10: a mark is durable and the batch panel offers copy/send', seeded.ok && markCount > 0 && /saved in this project|send to|copy all/i.test(markText), `seed=${JSON.stringify(seeded)} ${markText.slice(0, 400)}`);
    await shot('80-marks-batch-010.png');
    // Leave no fixture: clear the queue through the durable API after the
    // evidence shot.
    await evaluate(`(async () => { await fetch('/api/olympus/marks?slug=aime', { method: 'DELETE' }).catch(() => null); return true; })()`);

    // Console errors from the real page (ignore the known harmless YouTube /
    // CSP noise the Logs workspace filters; fail on app crashes/module errors).
    const errors = cdp.events
      .filter((e) => e.method === 'Runtime.exceptionThrown' || (e.method === 'Log.entryAdded' && e.params?.entry?.level === 'error'))
      .map((e) => e.params?.exceptionDetails?.text || e.params?.entry?.text || '')
      .filter((t) => t && !/youtube|postMessage|Content Security Policy|preload|127\.0\.0\.2|ERR_CONNECTION_REFUSED|ERR_INCOMPLETE_CHUNKED_ENCODING|ERR_CONNECTION_RESET|Failed to load resource/i.test(t));
    check('U9: no uncaught app exception in the real page', errors.length === 0, errors.slice(0, 3).join(' | '));

    console.log(failures === 0 ? '\nverify-v010-ui: PASS' : `\nverify-v010-ui: ${failures} FAIL`);
    process.exit(failures === 0 ? 0 : 1);
  } finally {
    try { cdp?.close(); } catch { /* gone */ }
    try { chrome.kill('SIGTERM'); } catch { /* gone */ }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
