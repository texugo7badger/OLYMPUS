#!/usr/bin/env node
/**
 * fps-probe-electron.mjs — v0.1.2: measure the REAL Electron renderer.
 *
 * The v0.0.81 probe ran headless Chromium with SwiftShader (software) and
 * called its 25 FPS a lower bound. This script launches the actual Electron
 * app with remote debugging, waits for the shell, and measures
 * requestAnimationFrame in the real GPU window. It also records long tasks.
 *
 * Usage:
 *   node scripts/fps-probe-electron.mjs --label before
 *   node scripts/fps-probe-electron.mjs --label after --url http://127.0.0.1:3737/
 *
 * Env: OLYMPUS_URL, CDP_PORT (default 9234), ELECTRON_BIN.
 * Output: screenshots/perf/electron-fps-<label>.json + a human summary.
 *
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
const PORT = Number(process.env.CDP_PORT || 9234);
const LABEL = (() => {
  const i = process.argv.indexOf('--label');
  return i >= 0 ? String(process.argv[i + 1] || 'run').replace(/[^a-z0-9._-]/gi, '-') : 'run';
})();
const ATTACH = process.argv.includes('--attach');
const SOFTWARE = process.argv.includes('--software');
const OUT_DIR = path.join(ROOT, 'screenshots', 'perf');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const pct = (arr, p) => {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1))];
};

async function waitForCdp() {
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const pages = await r.json();
      const page = pages.find((p) => p.type === 'page' && /127\.0\.0\.1:\d+|localhost:\d+/.test(p.url || ''));
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch { /* not up yet */ }
    await sleep(500);
  }
  throw new Error('Electron CDP did not expose the app page');
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
  return {
    send,
    ready: new Promise((res, rej) => { ws.once('open', res); ws.once('error', rej); }),
    close: () => { try { ws.close(); } catch { /* gone */ } },
  };
}

async function measure(cdp, label) {
  const r = await cdp.send('Runtime.evaluate', {
    expression: `new Promise((resolve) => {
      const samples = [];
      const longTasks = [];
      let observer = null;
      try {
        observer = new PerformanceObserver((list) => {
          for (const e of list.getEntries()) longTasks.push(Math.round(e.duration));
        });
        observer.observe({ entryTypes: ['longtask'] });
      } catch { /* unsupported */ }
      let frames = 0;
      let t0 = performance.now();
      let last = t0;
      const tick = (t) => {
        frames += 1;
        if (t - last >= 1000) { samples.push(frames); frames = 0; last = t; }
        if (t - t0 < 5000) requestAnimationFrame(tick);
        else {
          try { observer?.disconnect(); } catch {}
          resolve({
            samples,
            seconds: (t - t0) / 1000,
            longTasks,
            memory: performance.memory ? {
              usedMB: Math.round(performance.memory.usedJSHeapSize / 1048576),
              totalMB: Math.round(performance.memory.totalJSHeapSize / 1048576),
            } : null,
            gpu: (() => {
              try {
                const c = document.createElement('canvas');
                const gl = c.getContext('webgl2') || c.getContext('webgl');
                if (!gl) return 'no-webgl';
                const ext = gl.getExtension('WEBGL_debug_renderer_info');
                return ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : 'webgl';
              } catch { return 'unknown'; }
            })(),
            hardware: navigator.hardwareConcurrency || null,
          });
        }
      };
      requestAnimationFrame(tick);
    })`,
    awaitPromise: true,
    returnByValue: true,
  });
  const v = r?.result?.value ?? { samples: [] };
  const samples = Array.isArray(v.samples) ? v.samples.slice(1) : [];
  return {
    surface: label,
    samples,
    p50: pct(samples, 50),
    p95: pct(samples, 95),
    avg: samples.length ? Math.round(samples.reduce((a, b) => a + b, 0) / samples.length) : null,
    longTasks: v.longTasks ?? [],
    longestTaskMs: (v.longTasks ?? []).length ? Math.max(...v.longTasks) : 0,
    memory: v.memory,
    gpu: v.gpu,
    hardware: v.hardware,
  };
}



/** Wait until the page has 12 consecutive frames under 22ms (steady state). */
async function waitForSmooth(cdp, timeoutMs = 12_000) {
  const r = await cdp.send('Runtime.evaluate', {
    expression: `new Promise((resolve) => {
      const start = performance.now();
      let good = 0;
      let last = start;
      const tick = (t) => {
        const dt = t - last;
        last = t;
        if (dt > 0 && dt < 22) good += 1; else good = 0;
        if (good >= 12) resolve(true);
        else if (t - start > ${timeoutMs}) resolve(false);
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    })`,
    awaitPromise: true,
    returnByValue: true,
  });
  return r?.result?.value === true;
}

async function measureWithDrag(cdp, label) {
  const pending = cdp.send('Runtime.evaluate', {
    expression: `new Promise((resolve) => {
      const samples = []; const longTasks = [];
      let observer = null;
      try { observer = new PerformanceObserver((list) => { for (const e of list.getEntries()) longTasks.push(Math.round(e.duration)); }); observer.observe({ entryTypes: ['longtask'] }); } catch {}
      let frames = 0; let t0 = performance.now(); let last = t0;
      const tick = (t) => {
        frames += 1;
        if (t - last >= 1000) { samples.push(frames); frames = 0; last = t; }
        if (t - t0 < 5000) requestAnimationFrame(tick);
        else { try { observer?.disconnect(); } catch {} resolve({ samples, longTasks }); }
      };
      requestAnimationFrame(tick);
    })`,
    awaitPromise: true,
    returnByValue: true,
  });
  await sleep(200);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 500, y: 400, button: 'left', buttons: 1, clickCount: 1 });
  for (let i = 0; i < 30; i++) {
    const x = 500 + Math.sin(i / 5) * 120;
    const y = 400 + Math.cos(i / 7) * 80;
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'left', buttons: 1 });
    await sleep(50);
  }
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 500, y: 400, button: 'left', buttons: 0, clickCount: 1 });
  const r = await Promise.race([pending, sleep(9000).then(() => null)]);
  if (!r) return { surface: label, skipped: true, reason: 'drag measure timed out' };
  const v = r?.result?.value ?? { samples: [] };
  const samples = Array.isArray(v.samples) ? v.samples.slice(1) : [];
  return {
    surface: label, samples,
    p50: pct(samples, 50), p95: pct(samples, 95),
    avg: samples.length ? Math.round(samples.reduce((a, b) => a + b, 0) / samples.length) : null,
    longTasks: v.longTasks ?? [], longestTaskMs: (v.longTasks ?? []).length ? Math.max(...v.longTasks) : 0,
    gpu: null, hardware: null,
  };
}

async function clickSurface(cdp, matcher) {
  const r = await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const norm = (s) => String(s || '').toLowerCase();
      const want = ${JSON.stringify(matcher)}.toLowerCase();
      const nodes = [...document.querySelectorAll('button, [role="button"], a')];
      const hit = nodes.find((el) => {
        const text = [el.getAttribute('data-tip'), el.getAttribute('aria-label'), el.getAttribute('title'), el.textContent].map(norm).join(' ');
        return text.includes(want);
      });
      if (!hit) return { ok: false, count: nodes.length };
      hit.click();
      return { ok: true, text: (hit.getAttribute('data-tip') || hit.getAttribute('aria-label') || hit.textContent || '').trim().slice(0, 80) };
    })()`,
    returnByValue: true,
  });
  return r?.result?.value ?? { ok: false };
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const electron = process.env.ELECTRON_BIN || path.join(ROOT, 'node_modules', '.bin', 'electron');
  if (!ATTACH && !fs.existsSync(electron)) throw new Error(`electron binary not found: ${electron}`);
  const args = ['.', `--remote-debugging-port=${PORT}`, '--no-sandbox'];
  if (!SOFTWARE) args.push('--reset-gpu');
  const child = ATTACH ? null : spawn(electron, args, {
    cwd: ROOT,
    stdio: 'ignore',
    env: { ...process.env, OLYMPUS_URL: URL_BASE, ELECTRON_ENABLE_LOGGING: '0' },
  });
  const results = [];
  let cdp;
  try {
    cdp = client(await waitForCdp());
    await cdp.ready;
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Network.enable');
    const token = (() => {
      try { return fs.readFileSync(path.join(os.homedir(), '.olympus', 'session-token'), 'utf-8').trim(); } catch { return ''; }
    })();
    if (token) {
      for (const url of ['http://127.0.0.1', 'http://localhost']) {
        await cdp.send('Network.setCookie', { name: 'olympus_token', value: token, url, path: '/', httpOnly: true, sameSite: 'Strict' }).catch(() => {});
      }
    }
    // A fresh launch may still be on its splash; an attached instance is
    // already loaded, so never reload it (that would discard its state).
    if (!ATTACH) await cdp.send('Page.navigate', { url: URL_BASE }).catch(() => {});
    await sleep(ATTACH ? 2500 : 8000);
    // Always start from the Pantheon, even when attaching to a window left on
    // another surface (otherwise the first row would be mislabeled).
    await cdp.send('Runtime.evaluate', {
      expression: `(() => { const b = [...document.querySelectorAll('button')].find(x => x.getAttribute('aria-label') === 'Brain graph'); b?.click(); return Boolean(b); })()`,
      returnByValue: true,
    }).catch(() => {});
    await sleep(3500);

    results.push(await measure(cdp, 'pantheon (brain + terminal)'));
    results.push(await measureWithDrag(cdp, 'pantheon (atlas drag)'));

    const surfaces = [
      ['God Intelligence', /god intelligence|intelligence/i, 'god intelligence'],
      ['Cost', /cost|costs/i, 'cost'],
      ['Craft', /craft/i, 'craft'],
      ['References', /references/i, 'references'],
      ['Logs', /logs/i, 'logs'],
      ['Live Preview', /preview/i, 'preview'],
    ];
    for (const [name, rx, label] of surfaces) {
      const clicked = await clickSurface(cdp, label);
      if (!clicked.ok) {
        results.push({ surface: label, skipped: true, reason: 'surface button not found' });
        continue;
      }
      // The preview embeds a real project; measure the settled surface, not
      // the iframe's first paint (the load itself is a long task by design).
      await sleep(label === 'preview' ? 10_000 : label === 'references' ? 8_000 : label === 'cost' ? 6_000 : label === 'logs' ? 6_000 : 3500);
      results.push({ ...(await measure(cdp, label)), smooth: await waitForSmooth(cdp) });
    }

    const report = {
      label: LABEL,
      measuredAt: new Date().toISOString(),
      environment: {
        kind: 'electron-window',
        renderer: (() => { const g = results.find(r => r.gpu && !r.skipped)?.gpu; return !g || g === 'no-webgl' ? 'Canvas2D (software fallback)' : g; })(),
        softwareFallback: SOFTWARE || fs.existsSync(path.join(os.homedir(), '.olympus', 'gpu-fallback')) || !results.some(r => /webgl/i.test(String(r.gpu || ''))),
        url: URL_BASE,
        platform: process.platform,
        arch: process.arch,
        display: process.env.DISPLAY || null,
        wayland: process.env.WAYLAND_DISPLAY || null,
        note: 'The GPU process segfaults on this host (exit 139), so the stable lane is Electron software rendering (Canvas2D brain). No claim of GPU acceleration is made.',
      },
      results,
    };
    const file = path.join(OUT_DIR, `electron-fps-${LABEL}.json`);
    fs.writeFileSync(file, JSON.stringify(report, null, 2) + '\n');
    console.log(`\nfps-probe-electron: ${LABEL}`);
    console.log(`gpu: ${results.find(r => r.gpu)?.gpu ?? 'unknown'}`);
    for (const r of results) {
      if (r.skipped) { console.log(`  ${r.surface.padEnd(28)} SKIP (${r.reason})`); continue; }
      const tasks = r.longTasks.length ? `${r.longTasks.length} long task(s), max ${r.longestTaskMs}ms` : 'no long tasks';
      console.log(`  ${r.surface.padEnd(28)} p50 ${String(r.p50 ?? '—').padStart(3)} · p95 ${String(r.p95 ?? '—').padStart(3)} · avg ${String(r.avg ?? '—').padStart(3)} · ${tasks}`);
    }
    console.log(`saved ${path.relative(ROOT, file)}`);
  } finally {
    cdp?.close();
    if (child) {
      try { child.kill('SIGTERM'); } catch { /* gone */ }
      await sleep(1200);
      try { child.kill('SIGKILL'); } catch { /* gone */ }
    }
  }
}

main().catch((e) => {
  console.error(`fps-probe-electron: ${e.message}`);
  process.exitCode = 1;
});
