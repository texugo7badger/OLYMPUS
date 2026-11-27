#!/usr/bin/env node
/**
 * capture-v012-screens.mjs — v0.1.2: one clean screen per menu.
 *
 * The gallery is captured from the running production app (no mockups), in
 * English, at 1600×1000 (Cost at 1600×1400 so the whole usage chart is
 * visible; the phone at 390×844). Every activity-bar menu gets a screen:
 * Pantheon, Live preview, God Intelligence, Recent activity, Logs, Cost,
 * Benchmarks, Craft, References, LLM strategy, MCP configuration, God detail;
 * plus the preview window (marks) and the phone.
 *
 * Usage: node scripts/capture-v012-screens.mjs
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
const PORT = Number(process.env.CDP_PORT || 9242);
const CHROME = process.env.CHROME_BIN || path.join(os.homedir(), '.cache', 'ms-playwright', 'chromium-1248', 'chrome-linux64', 'chrome');
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
  const fixtureDir = path.join(os.homedir(), 'OLYMPUS-VAULT', '02_Projects', 'fixture-demo');
  fs.mkdirSync(fixtureDir, { recursive: true });
  fs.writeFileSync(path.join(fixtureDir, 'project.md'), `---\nslug: fixture-demo\nname: Fixture Demo\npath: ${fixtureDir}\nstacks: [static]\ncreated: "2026-11-25T00:00:00.000Z"\nlast_active: "2026-11-25T00:00:00.000Z"\ndescription: Framing-friendly page used only for the v0.1.2 screenshots.\nlivePreviewPort: 4173\n---\n# Fixture Demo\n`);
  fs.writeFileSync(path.join(fixtureDir, 'index.html'), `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Northwind Studio</title><style>:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#0a0d12;color:#efede7;font-family:ui-sans-serif,system-ui,sans-serif;min-height:100vh}.nav{display:flex;justify-content:space-between;padding:24px 6vw;border-bottom:1px solid #d4a5741f}.brand{font:600 15px ui-monospace,monospace;letter-spacing:.18em;color:#d4a574}.nav a{color:#8e8a83;font-size:12px;text-decoration:none;margin-left:22px}.wrap{width:min(1100px,88vw);margin:auto;padding:86px 0}.eyebrow{font:10px ui-monospace,monospace;letter-spacing:.3em;color:#d4a574;text-transform:uppercase}h1{font-size:clamp(44px,6.4vw,86px);line-height:.96;letter-spacing:-.045em;margin:20px 0 24px;max-width:820px}h1 em{font-style:normal;color:#d4a574}p{max-width:560px;color:#a7a49c;font-size:16px;line-height:1.75}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-top:52px}.card{background:#0e1219;border:1px solid #d4a57422;border-radius:18px;padding:22px;min-height:150px;display:flex;flex-direction:column;justify-content:space-between}.card b{font-size:18px}.card span{font:11px ui-monospace,monospace;color:#8e8a83;letter-spacing:.12em;text-transform:uppercase}.row{display:flex;gap:12px;margin-top:34px}.pill{border:1px solid #d4a57444;border-radius:999px;padding:8px 13px;font:11px ui-monospace,monospace;color:#d4a574}</style></head><body><nav class="nav"><span class="brand">NORTHWIND</span><span><a href="#">Work</a><a href="#">Studio</a><a href="#">Contact</a></span></nav><main class="wrap"><div class="eyebrow">Independent design studio · Oslo</div><h1>Objects for a <em>slower</em> internet.</h1><p>Identity, interfaces and small digital tools. We build fewer things, with more care — for teams who would rather be understood than merely seen.</p><div class="grid"><div class="card"><b>Identity systems</b><span>01</span></div><div class="card"><b>Product interfaces</b><span>02</span></div><div class="card"><b>Objects &amp; print</b><span>03</span></div></div><div class="row"><span class="pill">currently accepting Q1</span><span class="pill">hello@northwind.studio</span></div></main></body></html>`);
  const fixtureServer = spawn('python3', ['-m', 'http.server', '4173', '--bind', '127.0.0.1'], { cwd: fixtureDir, stdio: 'ignore' });
  await sleep(700);
  const chrome = spawn(CHROME, [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
    `--remote-debugging-port=${PORT}`, '--window-size=1600,1000', 'about:blank',
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
    const clickLabel = async (label) => ev(`(() => { const bs = [...document.querySelectorAll('button')].filter(x => x.getAttribute('aria-label') === ${JSON.stringify(label)}); const b = bs.find(x => x.getClientRects().length > 0) || bs[0]; if (!b) return false; b.click(); return true; })()`);
    const setLang = (lang) => ev(`fetch('/api/olympus/language', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: ${JSON.stringify(JSON.stringify({ language: lang }))} }).catch(() => null)`);
    const setTheme = (state) => ev(`fetch('/api/olympus/theme', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: ${JSON.stringify(JSON.stringify(state))} }).catch(() => null)`);

    const originalTheme = await ev(`fetch('/api/olympus/theme').then(r => r.json()).then(d => d.state).catch(() => null)`);
    const originalLang = await ev(`fetch('/api/olympus/language').then(r => r.json()).then(d => d.language).catch(() => null)`);
    await viewport(1600, 1000);
    await go(URL_BASE, 9000);
    await setTheme({ presetId: 'olympus', mode: 'dark', accent: null, iconId: 'classic', motion: 'full' });
    await setLang('en');
    await go(URL_BASE, 6000);

    // 01 — Pantheon (brain + terminal + Parthenon)
    await waitFor(`document.body.textContent.includes('Parthenon')`);
    await sleep(2000);
    await shot('01-pantheon-012.png');

    // 02 — Live preview of the fixture project
    await ev(`fetch('/api/olympus/projects/active', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug: 'fixture-demo' }) }).catch(() => null)`);
    await go(URL_BASE, 7000);
    await clickLabel('Live preview');
    await waitFor(`document.querySelector('iframe, webview')`, 30_000);
    await sleep(5000);
    await shot('02-live-preview-012.png');

    // 03 — God Intelligence (Callimachus live)
    await clickLabel('God intelligence');
    await waitFor(`document.body.innerText.includes('Callimachus · VaultBrain maintenance')`, 30_000);
    await sleep(1500);
    await shot('03-god-intelligence-012.png');

    // 04 — Recent activity
    await clickLabel('Recent activity');
    await sleep(3500);
    await shot('04-recent-activity-012.png');

    // 05 — Logs
    await clickLabel('Logs');
    await sleep(3500);
    await shot('05-logs-012.png');

    // 06 — Cost, tall enough for the whole usage chart
    await viewport(1600, 1400);
    await clickLabel('Cost');
    await waitFor(`(() => document.body.innerText.includes('Usage ·') && !document.querySelector('[aria-label="Loading GO forecast"]'))()`, 60_000);
    await sleep(2500);
    await shot('06-cost-012.png');

    // 07 — Benchmarks
    await viewport(1600, 1000);
    await clickLabel('Benchmarks');
    await sleep(3500);
    await shot('07-benchmarks-012.png');

    // 08 — Craft (ArtCraft + native tools). The panel is a lazy chunk; the
    // branded loader is not evidence, so wait until the hub itself renders.
    await clickLabel('Craft');
    await waitFor(`!document.body.innerText.includes('CRAFTAPPSPANEL') && (document.body.innerText.includes('STUDIO') || document.body.innerText.includes('Craft apps'))`, 45_000);
    await sleep(2500);
    await shot('08-craft-012.png');

    // 09 — References (new sources visible). Wait for a real Use action, not
    // the lazy-chunk loader.
    await clickLabel('References');
    await waitFor(`document.querySelector('[data-action="reference-use"]') && /reactbits|motion primitives/i.test(document.body.innerText)`, 45_000);
    await sleep(2000);
    await shot('09-references-012.png');

    // 10 — LLM strategy
    await clickLabel('LLM strategy');
    await sleep(3500);
    await shot('10-llm-strategy-012.png');

    // 11 — MCP configuration
    await clickLabel('MCP Configuration');
    await sleep(3500);
    await shot('11-mcp-configuration-012.png');

    // 12 — God detail (Apollo)
    await ev(`(() => { const b = document.querySelector('button[aria-label="apollo"]'); if (b) b.click(); return Boolean(b); })()`);
    await sleep(3000);
    await shot('12-god-detail-012.png');

    // 13 — Preview window + durable marks
    await ev(`(async () => {
      await fetch('/api/olympus/marks?slug=fixture-demo', { method: 'DELETE' }).catch(() => null);
      const now = new Date().toISOString();
      for (const [i, instruction] of ['Make the hero heading one step larger', 'Keep the accent color on the primary button'].entries()) {
        await fetch('/api/olympus/marks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug: 'fixture-demo', mark: { id: 'shot-mark-' + i, x: 240 + i * 120, y: 180, page: '/', instruction, viewport: { width: 1600, height: 1000 }, url: 'http://127.0.0.1:4173', createdAt: now } }) });
      }
      return true;
    })()`);
    await go(`${URL_BASE}preview-window?slug=fixture-demo`, 7000);
    await waitFor(`document.querySelector('iframe')`, 45_000);
    await sleep(2500);
    await ev(`(() => { const b = [...document.querySelectorAll('button')].find(x => /mark/i.test(x.textContent || '') && x.hasAttribute('aria-expanded')); if (b && b.getAttribute('aria-expanded') === 'false') b.click(); return Boolean(b); })()`);
    await sleep(900);
    await shot('13-preview-window-012.png');
    await ev(`fetch('/api/olympus/marks?slug=fixture-demo', { method: 'DELETE' }).catch(() => null)`);

    // 14 — Phone: the real AIME campaign, not the preview fixture.
    await ev(`fetch('/api/olympus/projects/active', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug: 'aime' }) }).catch(() => null)`);
    await viewport(390, 844);
    await go(`${URL_BASE}m`, 4000);
    await ev(`(() => { try { localStorage.setItem('olympus:mobile-token', ${JSON.stringify(token)}); localStorage.setItem('olympus:language', 'en'); return true; } catch { return false; } })()`);
    await cdp.send('Page.reload', {});
    await sleep(7000);
    await shot('14-phone-012.png');

    await ev(`fetch('/api/olympus/projects/active', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug: 'aime' }) }).catch(() => null)`);
    if (originalTheme) await setTheme(originalTheme);
    if (originalLang) await setLang(originalLang);

    const manifest = [
      { file: 'screenshots/screens/01-pantheon-012.png', title: 'The Pantheon', note: 'ten gods, the Parthenon command deck and the disk-truth status brief' },
      { file: 'screenshots/screens/02-live-preview-012.png', title: 'Live preview', note: 'a real project inside OLYMPUS: same-origin surface, mark toolbar, no mockup' },
      { file: 'screenshots/screens/03-god-intelligence-012.png', title: 'God Intelligence', note: 'per-god stats and the live Callimachus card: last/next pass, validated quick circuits, technical vs project memory and the hourly model budget' },
      { file: 'screenshots/screens/04-recent-activity-012.png', title: 'Recent activity', note: 'the live event feed: dispatches, hops, approvals and curator passes' },
      { file: 'screenshots/screens/05-logs-012.png', title: 'Logs', note: 'the workspace log stream, with the real severity and source of each line' },
      { file: 'screenshots/screens/06-cost-012.png', title: 'Cost', note: 'the real ledger: GO usage, hourly token chart, Smart Burn and step/list/invoice separation — chart fully loaded' },
      { file: 'screenshots/screens/07-benchmarks-012.png', title: 'Benchmarks', note: 'the measured performance and lane benchmarks, with the environment named' },
      { file: 'screenshots/screens/08-craft-012.png', title: 'Craft', note: 'the app hub: ArtCraft stays on, the 13 vendored apps and the detected native tools (Blender, Godot, OBS, Inkscape, Krita…)' },
      { file: 'screenshots/screens/09-references-012.png', title: 'References', note: 'the creative library as its own surface: search, collections, live studies, Use/Queue and the new free/open-source sources' },
      { file: 'screenshots/screens/10-llm-strategy-012.png', title: 'LLM strategy', note: 'the lane roster and the strategy builder — every model is a lane, context rides Symphony' },
      { file: 'screenshots/screens/11-mcp-configuration-012.png', title: 'MCP configuration', note: 'the curated MCP surface: health classified before probe, 128-tool budget, per-server control' },
      { file: 'screenshots/screens/12-god-detail-012.png', title: 'God detail', note: 'one god in depth: model, skills, instincts, dispatches and recent activity' },
      { file: 'screenshots/screens/13-preview-window-012.png', title: 'Preview window', note: 'the dedicated preview window with the durable mark queue that becomes one Apollo terminal prompt' },
      { file: 'screenshots/screens/14-phone-012.png', title: 'Phone', note: 'the same campaign in one hand: voice-first prompt, Parthenon, preview and marks' },
    ];
    fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    console.log(`manifest written: ${manifest.length} menu screens`);
  } finally {
    try { cdp?.close(); } catch { /* gone */ }
    try { chrome.kill('SIGTERM'); } catch { /* gone */ }
    try { fixtureServer.kill('SIGTERM'); } catch { /* gone */ }
    try { fs.rmSync(fixtureDir, { recursive: true, force: true }); } catch { /* gone */ }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
