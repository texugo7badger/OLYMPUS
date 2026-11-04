#!/usr/bin/env node
/**
 * capture-themes-cdp.mjs — v0.0.72: one real screenshot per theme, headless.
 *
 * Electron's offscreen capture needs a display session; this uses the
 * Playwright-cached Chromium over CDP, which works on a locked/headless box.
 * Same contract as capture-themes.cjs: real app, clean terminal, one PNG per
 * theme, plus manifest.json for the README generator.
 *
 * Usage:
 *   node scripts/capture-themes-cdp.mjs            # all 18
 *   OLYMPUS_THEMES=olympus,ember node ...          # a subset
 *
 * Env: OLYMPUS_URL (default http://127.0.0.1:3737/), CHROME_BIN, CDP_PORT.
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'screenshots', 'themes');
const URL_BASE = process.env.OLYMPUS_URL || 'http://127.0.0.1:3737/';
const PORT = Number(process.env.CDP_PORT || 9223);
const CHROME = process.env.CHROME_BIN || path.join(os.homedir(), '.cache', 'ms-playwright', 'chromium-1248', 'chrome-linux64', 'chrome');
const ONLY = (process.env.OLYMPUS_THEMES || '').split(',').map((s) => s.trim()).filter(Boolean);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const THEMES = [
  ['olympus', 'Olympus', 'dark'], ['obsidian', 'Obsidian', 'dark'], ['ember', 'Ember', 'dark'],
  ['violet', 'Violet', 'dark'], ['forest', 'Forest', 'dark'], ['ice', 'Ice', 'dark'],
  ['parchment', 'Parchment', 'light'], ['eclipse', 'Eclipse', 'light'], ['mist', 'Mist', 'light'],
  ['blossom', 'Blossom', 'light'], ['sand', 'Sand', 'light'], ['mint', 'Mint', 'light'],
  ['vampire', 'Vampire', 'dark'], ['celestial', 'Celestial', 'dark'], ['abyss', 'Abyss', 'dark'],
  ['rosewood', 'Rosewood', 'dark'], ['ivory', 'Ivory', 'light'], ['paper', 'Paper', 'light'],
];

function launchChrome() {
  const child = spawn(CHROME, [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
    `--remote-debugging-port=${PORT}`, '--window-size=1440,900', 'about:blank',
  ], { stdio: 'ignore', detached: false });
  return child;
}

async function waitForCdp() {
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const pages = await r.json();
      const page = pages.find((p) => p.type === 'page');
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch { /* not up yet */ }
    await sleep(250);
  }
  throw new Error('CDP did not come up');
}

function client(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(String(raw)); } catch { return; }
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
    }
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const n = ++id;
    pending.set(n, { resolve, reject });
    ws.send(JSON.stringify({ id: n, method, params }));
  });
  const ready = new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
  return { send, ready, close: () => ws.close() };
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const chrome = launchChrome();
  let cdp;
  try {
    const wsUrl = await waitForCdp();
    cdp = client(wsUrl);
    await cdp.ready;
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Network.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

    const token = (() => {
      try { return fs.readFileSync(path.join(os.homedir(), '.olympus', 'session-token'), 'utf-8').trim(); } catch { return ''; }
    })();
    if (token) {
      await cdp.send('Network.setCookie', { name: 'olympus_token', value: token, domain: '127.0.0.1', path: '/', httpOnly: true, sameSite: 'Strict' });
    }

    const evaluate = async (expression) => {
      const r = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      return r?.result?.value;
    };
    const navigate = async (url, wait = 4500) => {
      await cdp.send('Page.navigate', { url });
      await sleep(wait);
    };
    const click = (js) => evaluate(js);

    const cleanTerminal = async () => {
      await click(`(() => { const b = [...document.querySelectorAll('button')].find((el) => /terminal/i.test(el.textContent || '') || /terminal/i.test(el.getAttribute('aria-label') || '')); b?.click(); return !!b; })()`);
      await sleep(1200);
      await click(`(() => { const b = [...document.querySelectorAll('button')].find((el) => /nova sessão|new session/i.test(el.textContent || '') || /nova sessão|new session/i.test(el.getAttribute('aria-label') || '')); b?.click(); return !!b; })()`);
      await sleep(900);
      await click(`(() => { const b = [...document.querySelectorAll('button')].find((el) => /start fresh|começar|iniciar/i.test((el.textContent || '').trim())); b?.click(); return !!b; })()`);
      // The clean state is the welcome + "fresh context window" line. Capture
      // as soon as that line lands, before the intro turn paints "thinking".
      let clean = false;
      for (let i = 0; i < 40; i++) {
        await sleep(300);
        clean = await evaluate(`/fresh context window|context window/i.test(document.body.innerText || '')`);
        if (clean) break;
      }
      if (!clean) await sleep(1200);
    };

    // The theme is a persisted user preference: the API store wins over
    // localStorage on boot. Save the current one and restore it at the end.
    const original = await evaluate(`fetch('/api/olympus/theme').then((r) => r.json()).then((d) => d.state).catch(() => null)`);
    const setTheme = async (state) => {
      await evaluate(`fetch('/api/olympus/theme', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: ${JSON.stringify(JSON.stringify(state))} }).then((r) => r.ok).catch(() => false)`);
      await evaluate(`(() => { try { localStorage.setItem('olympus:theme', ${JSON.stringify(JSON.stringify(state))}); return true; } catch { return false; } })()`);
    };

    const manifest = [];
    const list = ONLY.length ? THEMES.filter(([id]) => ONLY.includes(id)) : THEMES;
    for (const [id, name, mode] of list) {
      await navigate(URL_BASE, 3500);
      await setTheme({ presetId: id, mode, accent: null, iconId: 'classic', motion: 'full' });
      await cdp.send('Page.reload', {});
      await sleep(4500);
      await click(`(() => { const b = [...document.querySelectorAll('button')].find((el) => /skip|pular/i.test((el.textContent || '').trim())); b?.click(); return !!b; })()`);
      await sleep(500);
      await cleanTerminal();
      const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      fs.writeFileSync(path.join(OUT, `${id}.png`), Buffer.from(shot.data, 'base64'));
      manifest.push({ id, name, mode, file: `screenshots/themes/${id}.png`, capturedAt: new Date().toISOString() });
      console.log('shot', id, name);
    }
    // Merge with the existing manifest: capturing a subset must not drop the
    // other themes' evidence.
    let previous = [];
    try { previous = JSON.parse(fs.readFileSync(path.join(OUT, 'manifest.json'), 'utf-8')); } catch { /* first run */ }
    const byId = new Map([...previous, ...manifest].map((t) => [t.id, t]));
    fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify([...byId.values()], null, 2) + '\n');
    // Restore the user's theme (the capture must not change their app).
    if (original) await setTheme(original);
    console.log('manifest written', manifest.length, 'themes');
  } finally {
    try { cdp?.close(); } catch { /* gone */ }
    try { chrome.kill('SIGTERM'); } catch { /* gone */ }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
