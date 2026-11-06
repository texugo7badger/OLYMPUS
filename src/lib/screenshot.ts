/**
 * screenshot.ts — v0.0.85: real mobile/desktop captures of the live project.
 *
 * The phone briefing shows what is being developed; a description alone is
 * not enough for the user to critique the result. This module captures the
 * project's live preview with a locally installed Chromium (Playwright's
 * cache, the system browser, or OLYMPUS_CHROME) over the DevTools Protocol.
 *
 * It is deliberately best-effort: no browser means an honest refusal, never
 * a fake image. Files live under `~/.olympus/screenshots/<slug>/` with 0600
 * permissions; the capture route is the only reader.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export type ScreenshotViewport = 'mobile' | 'desktop';

export interface CaptureResult {
  ok: boolean;
  viewport: ScreenshotViewport;
  file: string | null;
  bytes: number;
  capturedAt: string | null;
  error?: string;
}

function chromeCandidates(): string[] {
  const out: string[] = [];
  if (process.env.OLYMPUS_CHROME) out.push(process.env.OLYMPUS_CHROME);
  const cache = path.join(os.homedir(), '.cache', 'ms-playwright');
  try {
    const dirs = fs.readdirSync(cache)
      .filter((d) => d.startsWith('chromium-') || d.startsWith('chromium_headless_shell-'))
      .sort()
      .reverse();
    for (const dir of dirs) {
      const root = path.join(cache, dir);
      out.push(
        path.join(root, 'chrome-linux64', 'chrome'),
        path.join(root, 'chrome-linux', 'chrome'),
        path.join(root, 'chrome-linux', 'headless_shell'),
        path.join(root, 'chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'),
        path.join(root, 'chrome-win', 'chrome.exe'),
      );
    }
  } catch { /* no playwright cache */ }
  out.push(
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/snap/bin/chromium',
    '/opt/google/chrome/chrome',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  );
  return [...new Set(out)];
}

/** The first real Chromium/Chrome binary on this host, or null. */
export function findChromium(): string | null {
  for (const candidate of chromeCandidates()) {
    try { if (candidate && fs.statSync(candidate).isFile()) return candidate; } catch { /* absent */ }
  }
  return null;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function captureWithChrome(
  chrome: string,
  url: string,
  viewport: ScreenshotViewport,
  outFile: string,
  timeoutMs: number,
): Promise<CaptureResult> {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'olympus-shot-'));
  const width = viewport === 'mobile' ? 390 : 1440;
  const height = viewport === 'mobile' ? 844 : 900;
  const dpr = viewport === 'mobile' ? 2 : 1;
  const args = [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--hide-scrollbars',
    '--disable-extensions',
    '--no-first-run',
    '--no-default-browser-check',
    '--remote-debugging-port=0',
    `--user-data-dir=${profile}`,
    'about:blank',
  ];
  const child = spawn(chrome, args, { stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  let ws: WebSocket | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  try {
    const debuggerUrl = await new Promise<string>((resolve, reject) => {
      timer = setTimeout(() => reject(new Error('Chromium did not open the DevTools port in time')), Math.min(20_000, timeoutMs));
      child.stderr?.on('data', (chunk: Buffer) => {
        stderr = (stderr + chunk.toString('utf-8')).slice(-4_000);
        const match = /DevTools listening on (ws:\/\/[^\s]+)/.exec(stderr);
        if (match) {
          if (timer) clearTimeout(timer);
          resolve(match[1]);
        }
      });
      child.once('error', (error) => {
        if (timer) clearTimeout(timer);
        reject(error);
      });
      child.once('exit', (code) => {
        if (timer) clearTimeout(timer);
        reject(new Error(`Chromium exited before DevTools was ready (code ${code ?? '?'})`));
      });
    });

    // `DevTools listening on ws://…/devtools/browser/…` is the BROWSER
    // endpoint; Page.* lives on a page target. Ask the HTTP discovery port for
    // the page's own socket (the browser endpoint would answer
    // "'Page.enable' wasn't found").
    const portMatch = /:(\d+)\//.exec(debuggerUrl);
    if (!portMatch) throw new Error('DevTools URL carried no port');
    const discovery = `http://127.0.0.1:${portMatch[1]}`;
    let pageSocket = '';
    for (let attempt = 0; attempt < 30 && !pageSocket; attempt += 1) {
      try {
        const list = await fetch(`${discovery}/json/list`).then((response) => response.json()) as Array<{ type?: string; webSocketDebuggerUrl?: string }>;
        const page = list.find((target) => target?.type === 'page' && target?.webSocketDebuggerUrl);
        if (page?.webSocketDebuggerUrl) pageSocket = page.webSocketDebuggerUrl;
      } catch { /* Chrome is still binding */ }
      if (!pageSocket) await sleep(150);
    }
    if (!pageSocket) throw new Error('Chromium exposed no page target');
    ws = new WebSocket(pageSocket);
    let nextId = 0;
    const pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void }>();
    const eventWaiters = new Map<string, Array<() => void>>();
    ws.onmessage = (event) => {
      let message: any;
      try { message = JSON.parse(String(event.data)); } catch { return; }
      if (message?.id && pending.has(message.id)) {
        const waiter = pending.get(message.id)!;
        pending.delete(message.id);
        if (message.error) waiter.reject(new Error(String(message.error.message || 'CDP error')));
        else waiter.resolve(message.result);
        return;
      }
      if (message?.method) {
        const waiters = eventWaiters.get(message.method);
        if (waiters?.length) {
          eventWaiters.delete(message.method);
          for (const wake of waiters) wake();
        }
      }
    };
    await new Promise<void>((resolve, reject) => {
      ws!.onopen = () => resolve();
      ws!.onerror = () => reject(new Error('Could not connect to the DevTools socket'));
    });
    const send = (method: string, params: Record<string, unknown> = {}) => new Promise<any>((resolve, reject) => {
      const id = ++nextId;
      pending.set(id, { resolve, reject });
      try { ws!.send(JSON.stringify({ id, method, params })); } catch (error) {
        pending.delete(id);
        reject(error as Error);
      }
    });
    const waitFor = (method: string, ms: number) => new Promise<void>((resolve) => {
      const list = eventWaiters.get(method) ?? [];
      list.push(resolve);
      eventWaiters.set(method, list);
      setTimeout(() => {
        const current = eventWaiters.get(method);
        if (!current) return;
        eventWaiters.set(method, current.filter((wake) => wake !== resolve));
        resolve();
      }, ms);
    });

    await send('Page.enable');
    await send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: dpr,
      mobile: viewport === 'mobile',
    });
    if (viewport === 'mobile') {
      await send('Emulation.setUserAgentOverride', {
        userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
      });
    }
    await send('Page.navigate', { url });
    await waitFor('Page.loadEventFired', 15_000);
    // A live app animates and hydrates after `load`; let it settle before the
    // shutter so the capture is the screen a user would see, not a skeleton.
    await sleep(2_500);
    const shot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
    const bytes = Buffer.from(String(shot.data || ''), 'base64');
    if (bytes.length < 1_000) throw new Error('Chromium returned an empty screenshot');
    fs.mkdirSync(path.dirname(outFile), { recursive: true, mode: 0o700 });
    fs.writeFileSync(outFile, bytes, { mode: 0o600 });
    try { fs.chmodSync(outFile, 0o600); } catch { /* best effort */ }
    const stat = fs.statSync(outFile);
    return { ok: true, viewport, file: outFile, bytes: stat.size, capturedAt: stat.mtime.toISOString() };
  } catch (error: any) {
    return {
      ok: false,
      viewport,
      file: null,
      bytes: 0,
      capturedAt: null,
      error: String(error?.message || error || stderr.slice(-220) || 'capture failed'),
    };
  } finally {
    if (timer) clearTimeout(timer);
    try { ws?.close(); } catch { /* already closed */ }
    try { child.kill('SIGKILL'); } catch { /* already gone */ }
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* optional */ }
  }
}

/** Capture one viewport of a running preview. */
export async function capturePreview(
  url: string,
  viewport: ScreenshotViewport,
  outFile: string,
  timeoutMs = 35_000,
): Promise<CaptureResult> {
  const chrome = findChromium();
  if (!chrome) {
    return {
      ok: false,
      viewport,
      file: null,
      bytes: 0,
      capturedAt: null,
      error: 'no Chromium/Chrome found — set OLYMPUS_CHROME or install one',
    };
  }
  return captureWithChrome(chrome, url, viewport, outFile, timeoutMs);
}

/** The private screenshot directory for a project. */
export function screenshotDir(slug: string): string {
  const home = process.env.OLYMPUS_HOME || path.join(os.homedir(), '.olympus');
  return path.join(home, 'screenshots', String(slug).replace(/[^a-zA-Z0-9_-]/g, '_'));
}

export function screenshotFile(slug: string, viewport: ScreenshotViewport): string {
  return path.join(screenshotDir(slug), `${viewport}.png`);
}
