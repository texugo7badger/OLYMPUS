#!/usr/bin/env node
/**
 * capture-screens-cdp.mjs — v0.0.72: the README Screens gallery, refreshed.
 *
 * Six real surfaces, one per page, at a consistent size, headless (CDP). The
 * old Screens block carried eleven images; this keeps the six that answer
 * "what is OLYMPUS?" and drops the rest.
 *
 * Output: screenshots/screens/<n>-<page>.png + manifest.json
 * Usage:  node scripts/capture-screens-cdp.mjs
 * Env:    OLYMPUS_URL, CHROME_BIN, CDP_PORT
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
const PORT = Number(process.env.CDP_PORT || 9224);
const CHROME = process.env.CHROME_BIN || path.join(os.homedir(), '.cache', 'ms-playwright', 'chromium-1248', 'chrome-linux64', 'chrome');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForCdp() {
  for (let i = 0; i < 40; i++) {
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
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
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
  const chrome = spawn(CHROME, ['--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', `--remote-debugging-port=${PORT}`, '--window-size=1440,900', 'about:blank'], { stdio: 'ignore' });
  let cdp;
  try {
    cdp = client(await waitForCdp());
    await cdp.ready;
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Network.enable');

    const token = (() => { try { return fs.readFileSync(path.join(os.homedir(), '.olympus', 'session-token'), 'utf-8').trim(); } catch { return ''; } })();
    if (token) await cdp.send('Network.setCookie', { name: 'olympus_token', value: token, domain: '127.0.0.1', path: '/', httpOnly: true, sameSite: 'Strict' });

    const evaluate = async (expression) => (await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }))?.result?.value;
    const viewport = (width, height) => cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 600 });
    const go = async (url, wait = 4500) => { await cdp.send('Page.navigate', { url }); await sleep(wait); };
    const click = (js) => evaluate(js);
    const shot = async (name) => {
      const r = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      fs.writeFileSync(path.join(OUT, name), Buffer.from(r.data, 'base64'));
      console.log('shot', name);
    };
    const byText = (re, tag = '[data-tip],[aria-label],button') => `(() => { const b = [...document.querySelectorAll('${tag}')].find((el) => ${re}.test((el.getAttribute('data-tip') || '') + ' ' + (el.getAttribute('aria-label') || '') + ' ' + (el.textContent || ''))); b?.click(); return !!b; })()`;
    const closePanel = () => click(`(() => { const b = [...document.querySelectorAll('button')].find((el) => /close|fechar/i.test(el.getAttribute('aria-label') || '')); b?.click(); return !!b; })()`);

    // The theme is a persisted user preference: capture on Olympus, restore after.
    const original = await (async () => {
      await viewport(1440, 900);
      await go(URL_BASE, 3500);
      return evaluate(`fetch('/api/olympus/theme').then((r) => r.json()).then((d) => d.state).catch(() => null)`);
    })();
    const setTheme = async (state) => {
      await evaluate(`fetch('/api/olympus/theme', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: ${JSON.stringify(JSON.stringify(state))} }).catch(() => null)`);
    };
    await setTheme({ presetId: 'olympus', mode: 'dark', accent: null, iconId: 'classic', motion: 'full' });

    // 1 — brain + clean terminal
    await go(URL_BASE, 4200);
    await click(byText(/terminal/i));
    await sleep(1200);
    await click(byText(/nova sessão|new session/i));
    await sleep(900);
    await click(`(() => { const b = [...document.querySelectorAll('button')].find((el) => /start fresh|começar|iniciar/i.test((el.textContent || '').trim())); b?.click(); return !!b; })()`);
    let clean = false;
    for (let i = 0; i < 40; i++) { await sleep(300); clean = await evaluate(`/fresh context window|context window/i.test(document.body.innerText || '')`); if (clean) break; }
    if (!clean) await sleep(1200);
    await shot('01-brain-terminal.png');

    // 2 — creative mode
    await click(byText(/criativ|creativ/i));
    await sleep(4500);
    await shot('02-creative.png');
    await closePanel();
    await sleep(900);

    // 3 — Build Hub (Craft → Builds)
    await click(byText(/craft/i));
    await sleep(4000);
    await click(`(() => { const b = [...document.querySelectorAll('button')].find((el) => (el.textContent || '').trim().toLowerCase() === 'builds'); b?.click(); return !!b; })()`);
    await sleep(3000);
    // The first visit opens the build tutorial — dismiss it, the shot is the hub.
    await click(`(() => { const b = [...document.querySelectorAll('button')].find((el) => /skip|pular/i.test((el.textContent || '').trim())); b?.click(); return !!b; })()`);
    await sleep(1200);
    await shot('03-builds.png');
    await closePanel();
    await sleep(900);

    // 4 — Settings (appearance) on a neutral home background
    await go(URL_BASE, 3800);
    await click(byText(/settings/i));
    await sleep(3000);
    await shot('04-settings.png');
    await closePanel();
    await sleep(800);

    // 5 — mobile companion
    await viewport(390, 844);
    await go(URL_BASE + 'm', 2500);
    await evaluate(`(() => { try { localStorage.setItem('olympus:mobile-token', ${JSON.stringify(token)}); return true; } catch { return false; } })()`);
    await cdp.send('Page.reload', {});
    await sleep(4500);
    await shot('05-mobile.png');

    // 6 — mobile creative
    await go(URL_BASE + 'm/studio', 4500);
    await shot('06-mobile-studio.png');

    // restore the user's theme
    if (original) await setTheme(original);

    const manifest = [
      { file: 'screenshots/screens/01-brain-terminal.png', title: 'Brain + terminal', note: 'the atlas and a clean session, Olympus theme' },
      { file: 'screenshots/screens/02-creative.png', title: 'Creative mode', note: 'progress, ring, build crystal and queue' },
      { file: 'screenshots/screens/03-builds.png', title: 'Build Hub', note: 'the talent builds and their crystals' },
      { file: 'screenshots/screens/04-settings.png', title: 'Settings', note: 'appearance, themes and performance' },
      { file: 'screenshots/screens/05-mobile.png', title: 'Mobile', note: 'one screen: ring, hold-to-talk and the god row' },
      { file: 'screenshots/screens/06-mobile-studio.png', title: 'Mobile creative', note: 'the same surface in one hand' },
    ];
    fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    console.log('manifest written', manifest.length);
  } finally {
    try { cdp?.close(); } catch { /* gone */ }
    try { chrome.kill('SIGTERM'); } catch { /* gone */ }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
