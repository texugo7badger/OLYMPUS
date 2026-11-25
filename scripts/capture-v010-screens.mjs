#!/usr/bin/env node
/**
 * capture-v010-screens.mjs — the v0.1.0 gallery, captured from the running app.
 *
 * Six surfaces, English, 1600×1000 (phone at 390×844). No mockups. The script
 * restores the user's theme/language at the end and rewrites the manifest with
 * only the current screens (less is more).
 *
 * Usage: node scripts/capture-v010-screens.mjs
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
const PORT = Number(process.env.CDP_PORT || 9241);
const CHROME = process.env.CHROME_BIN || path.join(os.homedir(), '.cache', 'ms-playwright', 'chromium-1248', 'chrome-linux64', 'chrome');
const W = 1600;
const H = 1000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
  ws.on('message', (raw) => {
    let msg; try { msg = JSON.parse(String(raw)); } catch { return; }
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message)); else resolve(msg.result);
    }
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const n = ++id; pending.set(n, { resolve, reject });
    ws.send(JSON.stringify({ id: n, method, params }));
  });
  return { send, ready: new Promise((res, rej) => { ws.once('open', res); ws.once('error', rej); }), close: () => ws.close() };
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
    const token = (() => { try { return fs.readFileSync(path.join(os.homedir(), '.olympus', 'session-token'), 'utf-8').trim(); } catch { return ''; } })();
    if (token) await cdp.send('Network.setCookie', { name: 'olympus_token', value: token, domain: '127.0.0.1', path: '/', httpOnly: true, sameSite: 'Strict' });

    const ev = async (expression) => (await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }))?.result?.value;
    const go = async (url, wait = 5000) => { await cdp.send('Page.navigate', { url }); await sleep(wait); };
    const viewport = (width, height) => cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 600 });
    const shot = async (name) => {
      const r = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      fs.writeFileSync(path.join(OUT, name), Buffer.from(r.data, 'base64'));
      console.log(`shot ${name}`);
    };
    const waitFor = async (expr, timeoutMs = 45_000) => {
      for (let i = 0; i < Math.ceil(timeoutMs / 500); i++) {
        if (await ev(`(() => { try { return Boolean(${expr}); } catch { return false; } })()`)) return true;
        await sleep(500);
      }
      return false;
    };
    const click = async (expr) => ev(`(() => { const b = ${expr}; if (!b) return false; b.click(); return true; })()`);

    const originalTheme = await ev(`fetch('/api/olympus/theme').then(r => r.json()).then(d => d.state).catch(() => null)`);
    const originalLang = await ev(`fetch('/api/olympus/language').then(r => r.json()).then(d => d.language).catch(() => null)`);
    const setLang = (lang) => ev(`fetch('/api/olympus/language', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: ${JSON.stringify(JSON.stringify({ language: lang }))} }).catch(() => null)`);
    const setTheme = (state) => ev(`fetch('/api/olympus/theme', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: ${JSON.stringify(JSON.stringify(state))} }).catch(() => null)`);
    await viewport(W, H);
    await go(URL_BASE, 3000);
    await setTheme({ presetId: 'olympus', mode: 'dark', accent: null, iconId: 'classic', motion: 'full' });
    await setLang('en');

    // 1 — the Pantheon + status brief + Parthenon on the live project.
    await go(URL_BASE, 9000);
    await waitFor(`document.querySelector('[data-testid="status-brief"]')`, 45_000);
    await sleep(1500);
    await shot('01-pantheon-010.png');

    // 2 — the live preview (a framing-friendly fixture project; AIME sets
    // frame-ancestors 'none', so it cannot be embedded by design).
    await ev(`fetch('/api/olympus/projects/active', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug: 'fixture-demo' }) }).catch(() => null)`);
    await go(URL_BASE, 7000);
    await click(`[...document.querySelectorAll('button')].find(x => x.getAttribute('aria-label') === 'Live preview')`);
    await waitFor(`document.querySelector('iframe, webview')`, 30_000);
    await sleep(5000);
    await shot('02-live-preview-010.png');

    // 3 — the dedicated preview window (browser iframe, no black popup).
    await go(`${URL_BASE}preview-window?slug=fixture-demo`, 6000);
    await waitFor(`document.querySelector('iframe')`, 45_000);
    await sleep(4000);
    await shot('03-preview-window-010.png');
    await ev(`fetch('/api/olympus/projects/active', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug: 'aime' }) }).catch(() => null)`);

    // 4 — Cost with the real ledger and the honest degraded/retry state.
    await go(URL_BASE, 7000);
    await click(`[...document.querySelectorAll('button')].find(x => x.getAttribute('aria-label') === 'Cost')`);
    const costReady = await waitFor(`document.body.innerText.includes('GO plan') || document.body.innerText.includes('Cost telemetry') || document.body.innerText.includes('GO Plus')`, 60_000);
    if (!costReady) throw new Error('Cost pane did not settle — refusing to capture a loader as evidence');
    await sleep(1500);
    await shot('04-cost-010.png');

    // 5 — phone: the same campaign, one hand.
    await viewport(390, 844);
    await go(`${URL_BASE}m`, 3500);
    await ev(`(() => { try { localStorage.setItem('olympus:mobile-token', ${JSON.stringify(token)}); localStorage.setItem('olympus:language', 'en'); return true; } catch { return false; } })()`);
    await cdp.send('Page.reload', {});
    await sleep(6500);
    await shot('06-mobile-010.png');

    if (originalTheme) await setTheme(originalTheme);
    if (originalLang) await setLang(originalLang);

    const manifest = [
      { file: 'screenshots/screens/01-pantheon-010.png', title: 'The Pantheon', note: 'the ten gods, the Parthenon command deck and the disk-truth status brief (project, generation, hops, current hop, park, preview, design)' },
      { file: 'screenshots/screens/02-live-preview-010.png', title: 'Live preview', note: 'the real project inside OLYMPUS: the surface, the mark toolbar and a same-origin iframe on :3038' },
      { file: 'screenshots/screens/03-preview-window-010.png', title: 'Preview window', note: 'the dedicated window renders the app in a browser iframe (the Electron popup can no longer render black) with the durable mark queue' },
      { file: 'screenshots/screens/04-cost-010.png', title: 'Cost', note: 'the real ledger: GO month/5h/week, Smart Burn, step/list/invoice separation and the honest reconnect/retry state — never an endless loader' },
      { file: 'screenshots/screens/06-mobile-010.png', title: 'Phone', note: 'the same campaign in one hand: voice-first prompt, Parthenon, preview and marks' },
    ];
    fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    console.log(`manifest written: ${manifest.length} current screens`);
  } finally {
    try { cdp?.close(); } catch { /* gone */ }
    try { chrome.kill('SIGTERM'); } catch { /* gone */ }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
