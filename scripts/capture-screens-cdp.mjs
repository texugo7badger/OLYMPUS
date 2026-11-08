#!/usr/bin/env node
/**
 * capture-screens-cdp.mjs — v0.0.73: the README Screens gallery.
 *
 * Twelve real surfaces, in ENGLISH, at 1600×1000, headless (CDP). The app
 * language and theme are user preferences: both are switched for the capture
 * and restored at the end.
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
const PORT = Number(process.env.CDP_PORT || 9225);
const CHROME = process.env.CHROME_BIN || path.join(os.homedir(), '.cache', 'ms-playwright', 'chromium-1248', 'chrome-linux64', 'chrome');
const W = 1600;
const H = 1000;
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
  const chrome = spawn(CHROME, ['--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', `--remote-debugging-port=${PORT}`, `--window-size=${W},${H}`, 'about:blank'], { stdio: 'ignore' });
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
    const go = async (url, wait = 4200) => { await cdp.send('Page.navigate', { url }); await sleep(wait); };
    const click = (js) => evaluate(js);
    const shot = async (name) => {
      const r = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      fs.writeFileSync(path.join(OUT, name), Buffer.from(r.data, 'base64'));
      console.log('shot', name);
    };
    const byText = (re, tag = '[data-tip],[aria-label],button') => `(() => { const b = [...document.querySelectorAll('${tag}')].find((el) => ${re}.test((el.getAttribute('data-tip') || '') + ' ' + (el.getAttribute('aria-label') || '') + ' ' + (el.textContent || ''))); b?.click(); return !!b; })()`;
    const tab = (label) => `(() => { const b = [...document.querySelectorAll('button,[role=tab]')].find((el) => (el.textContent || '').trim().toLowerCase() === '${label}'); b?.click(); return !!b; })()`;
    const closePanel = () => click(`(() => { const b = [...document.querySelectorAll('button')].find((el) => /close|fechar/i.test(el.getAttribute('aria-label') || '')); b?.click(); return !!b; })()`);
    const waitFor = async (expr, timeoutMs = 20_000) => {
      const steps = Math.ceil(timeoutMs / 300);
      for (let i = 0; i < steps; i++) {
        if (await evaluate(`(() => { try { return Boolean(${expr}); } catch { return false; } })()`)) return true;
        await sleep(300);
      }
      return false;
    };

    // Preferences: language + theme are persisted server-side; save, switch,
    // restore at the end (the capture must not change the user's app).
    await viewport(W, H);
    await go(URL_BASE, 3500);
    const originalTheme = await evaluate(`fetch('/api/olympus/theme').then((r) => r.json()).then((d) => d.state).catch(() => null)`);
    const originalLang = await evaluate(`fetch('/api/olympus/language').then((r) => r.json()).then((d) => d.language).catch(() => null)`);
    const setTheme = (state) => evaluate(`fetch('/api/olympus/theme', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: ${JSON.stringify(JSON.stringify(state))} }).catch(() => null)`);
    const setLang = (lang) => evaluate(`fetch('/api/olympus/language', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: ${JSON.stringify(JSON.stringify({ language: lang }))} }).catch(() => null)`);
    await setTheme({ presetId: 'olympus', mode: 'dark', accent: null, iconId: 'classic', motion: 'full' });
    await setLang('en');

    // 1 — brain + clean terminal
    await go(URL_BASE, 4500);
    // The gallery should show the Build Hub, not its first-visit tutorial.
    await evaluate(`localStorage.setItem('olympus:build-tutorial', '1'); true`);
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

    // 3-6 — Craft: apps, references, design, builds
    await click(byText(/craft/i));
    // The craft API probes all 14 apps; wait for the grid, never a fixed sleep.
    await waitFor("document.body.innerText.includes('ArtCraft Studio') || document.body.innerText.includes('REFERENCES')", 25_000);
    await sleep(600);
    await shot('03-craft-apps.png');
    // v0.0.91 — target the Craft pane's tab, not the sidebar references button.
    await click(`(() => {
      const appTab = [...document.querySelectorAll('button')].find((el) => (el.textContent || '').trim().toLowerCase() === 'apps');
      if (!appTab) return false;
      const ref = [...appTab.parentElement.querySelectorAll('button')].find((el) => (el.textContent || '').trim().toLowerCase() === 'references');
      ref?.click();
      return !!ref;
    })()`);
    await waitFor("document.querySelector('[data-reference-collections]') || document.body.innerText.includes('all studies')", 25_000);
    await sleep(700);
    await shot('04-references.png');
    // v0.0.91 — design moved out of ArtCraft and into Athena's chat. Open her
    // chat through the same event the terminal uses, then the design studio.
    await evaluate(`window.dispatchEvent(new CustomEvent('olympus:open-god-chat', { detail: { god: 'athena' } })); true`);
    await sleep(1200);
    await click(`(() => { const b = [...document.querySelectorAll('button')].find((el) => /design studio/i.test(el.getAttribute('data-tip') || '') || (el.textContent || '').trim().toLowerCase() === 'design'); b?.click(); return !!b; })()`);
    await sleep(3500);
    await shot('05-design.png');
    await click(tab('builds'));
    // The tutorial flag is pre-set above; wait for the curated shelf, never a
    // fixed sleep (the builds API and the tutorial both race the first paint).
    await waitFor("document.body.innerText.includes('BUILD HUB') && !document.body.innerText.includes('BUILD HUB 0 hot')", 25_000);
    await sleep(700);
    await shot('06-builds.png');
    await closePanel();
    await sleep(900);

    // 7 — Settings (appearance)
    await go(URL_BASE, 5000);
    // v0.0.88 — exact aria: /settings/i also matched the editor's
    // "Editor settings" button, and the modal never opened.
    await click(`(() => { const b = [...document.querySelectorAll('[data-tip],[aria-label],button')].find((el) => /^(settings|configurações)$/i.test((el.getAttribute('aria-label') || el.getAttribute('data-tip') || '').trim())); b?.click(); return !!b; })()`);
    await sleep(3500);
    await shot('07-settings.png');
    await closePanel();
    await sleep(800);

    // 8 — Talent Studio
    await go(URL_BASE + 'talent', 4200);
    await shot('08-talent.png');

    // 9-10 — the terminal's Vault and Frames tabs
    await go(URL_BASE, 4000);
    await click(tab('vault'));
    await sleep(2500);
    await shot('09-vault.png');
    await click(tab('frames'));
    await sleep(2500);
    await shot('10-frames.png');

    // 11-12 — mobile (English too)
    await viewport(390, 844);
    await go(URL_BASE + 'm', 2500);
    await evaluate(`(() => { try { localStorage.setItem('olympus:mobile-token', ${JSON.stringify(token)}); localStorage.setItem('olympus:language', 'en'); return true; } catch { return false; } })()`);
    await cdp.send('Page.reload', {});
    await sleep(4500);
    await shot('11-mobile.png');
    await go(URL_BASE + 'm/studio', 4500);
    await shot('12-mobile-studio.png');

    // restore the user's preferences
    if (originalTheme) await setTheme(originalTheme);
    if (originalLang) await setLang(originalLang);

    const manifest = [
      { file: 'screenshots/screens/01-brain-terminal.png', title: 'Brain + terminal', note: 'the atlas and a clean session' },
      { file: 'screenshots/screens/02-creative.png', title: 'Creative mode', note: 'progress, ring, build crystal and queue' },
      { file: 'screenshots/screens/03-craft-apps.png', title: 'Craft apps', note: 'the vendored creative suite' },
      { file: 'screenshots/screens/04-references.png', title: 'References', note: 'the design reference catalog' },
      { file: 'screenshots/screens/05-design.png', title: 'Athena design studio', note: 'style, contract, review and approval — inside her chat' },
      { file: 'screenshots/screens/06-builds.png', title: 'Build Hub', note: 'the talent builds and their crystals' },
      { file: 'screenshots/screens/07-settings.png', title: 'Settings', note: 'appearance, themes and performance' },
      { file: 'screenshots/screens/08-talent.png', title: 'Talent Studio', note: 'the build editor and the crystal picker' },
      { file: 'screenshots/screens/09-vault.png', title: 'Vault', note: 'instincts, knowledge and skills' },
      { file: 'screenshots/screens/10-frames.png', title: 'Frames', note: 'the live tool frames' },
      { file: 'screenshots/screens/11-mobile.png', title: 'Mobile', note: 'one screen: ring, hold-to-talk and the god row' },
      { file: 'screenshots/screens/12-mobile-studio.png', title: 'Mobile creative', note: 'the same surface in one hand' },
    ];
    fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    console.log('manifest written', manifest.length);
  } finally {
    try { cdp?.close(); } catch { /* gone */ }
    try { chrome.kill('SIGTERM'); } catch { /* gone */ }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
