#!/usr/bin/env node
/**
 * fps-probe.mjs — v0.0.81: measured frames, four surfaces.
 *
 * Loads the running app in headless Chromium over CDP, waits for each surface
 * to settle, and counts requestAnimationFrame callbacks for 5 seconds. Reports
 * the per-second FPS samples, p50 and p95 — no claim without a number.
 *
 * HONEST NOTE: headless Chromium renders with SwiftShader (software). The
 * numbers are a LOWER BOUND for the user's GPU Electron window; the probe is
 * the repeatable instrument, the environment is named in the report.
 *
 * Usage: node scripts/fps-probe.mjs [--json]
 * Env: OLYMPUS_URL, CHROME_BIN, CDP_PORT
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const URL_BASE = process.env.OLYMPUS_URL || 'http://127.0.0.1:3737/';
const PORT = Number(process.env.CDP_PORT || 9232);
const CHROME = process.env.CHROME_BIN || path.join(os.homedir(), '.cache', 'ms-playwright', 'chromium-1248', 'chrome-linux64', 'chrome');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const json = process.argv.includes('--json');

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

const pct = (arr, p) => {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1))];
};

async function measure(cdp, label) {
  const r = await cdp.send('Runtime.evaluate', {
    expression: `new Promise((resolve) => {
      const samples = [];
      let frames = 0;
      let t0 = performance.now();
      let last = t0;
      const tick = (t) => {
        frames += 1;
        if (t - last >= 1000) { samples.push(frames); frames = 0; last = t; }
        if (t - t0 < 5000) requestAnimationFrame(tick);
        else resolve({ samples, seconds: (t - t0) / 1000, raf: typeof requestAnimationFrame === 'function' });
      };
      requestAnimationFrame(tick);
    })`,
    awaitPromise: true,
    returnByValue: true,
  });
  const v = r?.result?.value ?? { samples: [] };
  const samples = Array.isArray(v.samples) ? v.samples.slice(1) : [];
  return { surface: label, samples, p50: pct(samples, 50), p95: pct(samples, 95), avg: samples.length ? Math.round(samples.reduce((a, b) => a + b, 0) / samples.length) : null };
}

async function main() {
  const chrome = spawn(CHROME, ['--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', `--remote-debugging-port=${PORT}`, '--window-size=1600,1000', 'about:blank'], { stdio: 'ignore' });
  let cdp;
  const results = [];
  try {
    cdp = client(await waitForCdp());
    await cdp.ready;
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Network.enable');
    const token = (() => { try { return fs.readFileSync(path.join(os.homedir(), '.olympus', 'session-token'), 'utf-8').trim(); } catch { return ''; } })();
    if (token) await cdp.send('Network.setCookie', { name: 'olympus_token', value: token, domain: '127.0.0.1', path: '/', httpOnly: true, sameSite: 'Strict' });
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });

    const ev = async (e) => (await cdp.send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }))?.result?.value;

    // 1 — brain + terminal (the default home)
    await cdp.send('Page.navigate', { url: URL_BASE });
    await sleep(7000);
    results.push(await measure(cdp, 'brain+terminal'));

    // 2 — creative studio
    await ev(`(() => { const b=[...document.querySelectorAll('button')].find(el=>/criativ|creativ/i.test((el.getAttribute('data-tip')||'')+' '+(el.getAttribute('aria-label')||'')+' '+(el.textContent||''))); b?.click(); return !!b; })()`);
    await sleep(4500);
    results.push(await measure(cdp, 'creative studio'));
    await ev(`(() => { const b=[...document.querySelectorAll('button')].find(el=>/close|fechar/i.test(el.getAttribute('aria-label')||'')); b?.click(); return !!b; })()`);
    await sleep(800);

    // 2b — creative studio with the performance mode ON (the honest lever)
    await ev(`(() => { try { localStorage.setItem('olympus:performance', 'low'); return true; } catch { return false; } })()`);
    await cdp.send('Page.reload', {});
    await sleep(5000);
    await ev(`(() => { const b=[...document.querySelectorAll('button')].find(el=>/criativ|creativ/i.test((el.getAttribute('data-tip')||'')+' '+(el.getAttribute('aria-label')||'')+' '+(el.textContent||''))); b?.click(); return !!b; })()`);
    await sleep(4500);
    results.push(await measure(cdp, 'creative (perf mode)'));
    await ev(`(() => { try { localStorage.setItem('olympus:performance', 'full'); return true; } catch { return false; } })()`);

    // 3 — mobile creative (390×844)
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await cdp.send('Page.navigate', { url: `${URL_BASE}m/studio` });
    await sleep(3500);
    await ev(`(() => { try { localStorage.setItem('olympus:mobile-token', ${JSON.stringify(token)}); return true; } catch { return false; } })()`);
    await cdp.send('Page.reload', {});
    await sleep(4500);
    results.push(await measure(cdp, 'mobile creative'));

    // 4 — mobile one-screen
    await cdp.send('Page.navigate', { url: `${URL_BASE}m` });
    await sleep(4500);
    results.push(await measure(cdp, 'mobile /m'));
  } finally {
    try { cdp?.close(); } catch { /* gone */ }
    try { chrome.kill('SIGTERM'); } catch { /* gone */ }
  }

  const report = {
    at: new Date().toISOString(),
    environment: 'headless Chromium / SwiftShader (software) — a LOWER BOUND for the GPU window',
    surfaces: results,
  };
  if (json) console.log(JSON.stringify(report, null, 2));
  else {
    console.log(`\nOLYMPUS FPS probe — ${report.at}`);
    console.log('environment: headless Chromium / SwiftShader (software) — lower bound\n');
    console.log('| surface | p50 | p95 | samples (fps/s) |');
    console.log('|---|---:|---:|---|');
    for (const r of results) console.log(`| ${r.surface} | ${r.p50 ?? '—'} | ${r.p95 ?? '—'} | ${r.samples.join(', ')} |`);
    const below = results.filter((r) => (r.p50 ?? 0) < 58).map((r) => r.surface);
    console.log(`\n${below.length === 0 ? 'p50 >= 58 on every surface' : `below 58: ${below.join(', ')} (software renderer — report the honest number)`}\n`);
  }
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
