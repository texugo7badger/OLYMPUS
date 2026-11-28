#!/usr/bin/env node
/**
 * capture-olympus-screen.mjs — v0.1.6: the ONE repository screenshot.
 *
 * The README carries a single image: the brain atlas + the Apollo chat, captured
 * from the running app. No gallery, no mockups, no tour. The script is kept so
 * the image is reproducible (`npm run shots`).
 *
 * Usage: npm run shots   (the app must be running on :3737)
 * Env: OLYMPUS_URL, CDP_PORT, CHROME_BIN
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import WebSocket from 'ws';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.CDP_PORT || 9273);
const OUT = path.join(ROOT, 'screenshots', 'olympus.png');
const CHROME = process.env.CHROME_BIN || path.join(os.homedir(), '.cache/ms-playwright/chromium-1248/chrome-linux64/chrome');
const APP_URL = process.env.OLYMPUS_URL || 'http://127.0.0.1:3737/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chrome = spawn(CHROME, [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
  `--remote-debugging-port=${PORT}`, '--window-size=1600,1000', 'about:blank',
], { stdio: 'ignore', detached: true });

let wsUrl = null;
for (let i = 0; i < 40; i++) {
  try {
    const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
    const page = (await r.json()).find((x) => x.type === 'page');
    if (page) { wsUrl = page.webSocketDebuggerUrl; break; }
  } catch { /* not up yet */ }
  await sleep(250);
}
if (!wsUrl) { try { process.kill(-chrome.pid, 'SIGKILL'); } catch {} throw new Error('CDP page never appeared'); }

const ws = new WebSocket(wsUrl);
let id = 0;
const pending = new Map();
ws.on('message', (raw) => {
  const m = JSON.parse(String(raw));
  if (m.id && pending.has(m.id)) {
    const { resolve, reject } = pending.get(m.id);
    pending.delete(m.id);
    if (m.error) reject(new Error(m.error.message));
    else resolve(m.result);
  }
});
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const n = ++id;
  pending.set(n, { resolve, reject });
  ws.send(JSON.stringify({ id: n, method, params }));
});
await new Promise((res, rej) => { ws.once('open', res); ws.once('error', rej); });

await send('Page.enable');
await send('Runtime.enable');
await send('Network.enable');
try {
  const token = fs.readFileSync(path.join(os.homedir(), '.olympus/session-token'), 'utf-8').trim();
  await send('Network.setCookie', {
    name: 'olympus_token', value: token, domain: '127.0.0.1', path: '/', httpOnly: true, sameSite: 'Strict',
  });
} catch { /* a local build without a token still renders the public shell */ }

const ev = async (expr) => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }))?.result?.value;
const waitFor = async (expr, ms = 25000) => {
  for (let i = 0; i < Math.ceil(ms / 500); i++) {
    if (await ev(`(()=>{try{return Boolean(${expr})}catch{return false}})()`)) return true;
    await sleep(500);
  }
  return false;
};

await send('Page.navigate', { url: APP_URL });
await waitFor(`!document.querySelector('[aria-label="OLYMPUS is loading"]')`);
await waitFor(`document.querySelector('canvas.brain-atlas-canvas')`);
await sleep(3000);

// The repository screenshot is English so contributors read the same labels.
await ev(`(async()=>{try{
  localStorage.setItem('olympus:language','en');
  localStorage.setItem('olympus:language-updated-at',new Date().toISOString());
  await fetch('/api/olympus/language',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({language:'en'})});
}catch{}return true;})()`);
await send('Page.reload');
await waitFor(`!document.querySelector('[aria-label="OLYMPUS is loading"]')`);
await waitFor(`document.querySelector('canvas.brain-atlas-canvas')`);
await sleep(4000);

const shot = await send('Page.captureScreenshot', { format: 'png' });
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, Buffer.from(shot.data, 'base64'));
console.log(`shot ${path.relative(ROOT, OUT)}`);

try { process.kill(-chrome.pid, 'SIGKILL'); } catch {}
