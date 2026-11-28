#!/usr/bin/env node
/**
 * verify-v017-ui.mjs — v0.1.7: the live UI gate (CDP, no mockups).
 *
 * Proves the release's user-visible claims against the running production app:
 *   U1 shell boots (no repair card)
 *   U2 version is 0.1.5
 *   U3 Craft and References are distinct menus
 *   U4 Craft shows the native tool registry (with installed/absent truth)
 *   U5 References "Use" stages an editable prompt asking HOW to use it
 *   U6 the Cost pane settles and the usage chart is not a skeleton
 *   U7 Callimachus is live with validated quick-circuit counts + budget
 *   U8 the false "33 quick circuits" heuristic is gone (0 validated is honest)
 *   U9 a reference can be filtered by the new sources
 *   U10 Sync Map is not in the UI
 *   U11 no uncaught page exception
 *   U15 status labels never clip (1600 + 1280)
 *   U16 no fullscreen loader after boot
 *   U17 OLYMPUS opens without a project
 *   U18 Logs has six runtime tabs (Boot/Hygiene gone)
 *   U19 clean boot: no campaign/task rows in the Parthenon
 *   U20 no cost numbers in the status bar
 *   U21 the brain starts Smooth
 *   U22 the Parthenon follows the language (pt-BR)
 *
 * Usage: node scripts/verify-v012-ui.mjs
 * Env: OLYMPUS_URL, CDP_PORT, CHROME_BIN
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'screenshots');
const URL_BASE = process.env.OLYMPUS_URL || 'http://127.0.0.1:3737/';
const PORT = Number(process.env.CDP_PORT || 9231);
const CHROME = process.env.CHROME_BIN || path.join(os.homedir(), '.cache', 'ms-playwright', 'chromium-1248', 'chrome-linux64', 'chrome');
const W = 1600;
const H = 1000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : ` — ${String(detail).slice(0, 320)}`}`);
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
  ], { stdio: 'ignore', detached: true });
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
    const go = async (url, wait = 5000) => { await cdp.send('Page.navigate', { url }); await sleep(wait); };
    const clickLabel = async (label) => evaluate(`(() => { const bs = [...document.querySelectorAll('button')].filter(x => x.getAttribute('aria-label') === ${JSON.stringify(label)}); const b = bs.find(x => x.getClientRects().length > 0) || bs[0]; if (!b) return false; b.click(); return true; })()`);
    const waitFor = async (expr, timeoutMs = 30_000) => {
      for (let i = 0; i < Math.ceil(timeoutMs / 500); i++) {
        if (await evaluate(`(() => { try { return Boolean(${expr}); } catch { return false; } })()`)) return true;
        await sleep(500);
      }
      return false;
    };

    await go(URL_BASE, 8000);
    const booted = await waitFor(`[...document.querySelectorAll('button')].some(x => x.getAttribute('aria-label') === 'Cost')`, 30_000);
    const repair = await evaluate(`Boolean(document.querySelector('[data-testid="boot-repair"]'))`);
    const body = await evaluate('document.body.innerText.slice(0, 16000)');
    check('U1: the production shell rendered (no boot-repair card)', booted && !repair, `booted=${booted} repair=${repair}`);
    check('U2: the UI reports v0.1.7', /v?0\.1\.7/.test(body), body.slice(0, 240));

    const menus = await evaluate(`(() => {
      const labels = [...document.querySelectorAll('button')].map(b => b.getAttribute('aria-label')).filter(Boolean);
      return { craft: labels.includes('Craft'), references: labels.includes('References'), sync: labels.includes('Sync map') || document.body.innerText.includes('Sync map') };
    })()`);
    check('U3: Craft and References are distinct menus', menus.craft && menus.references, JSON.stringify(menus));
    check('U10: Sync Map is gone from the UI', menus.sync === false, JSON.stringify(menus));

    // Craft: external tools detected, no install side effect.
    await clickLabel('Craft');
    await sleep(2500);
    const craft = await evaluate(`(async () => {
      const r = await fetch('/api/olympus/native-tools', { cache: 'no-store' });
      const d = await r.json().catch(() => null);
      const text = document.body.innerText.slice(0, 9000);
      return { api: r.ok, tools: Array.isArray(d?.tools) ? d.tools.length : 0, hasBoolean: Array.isArray(d?.tools) && d.tools.every(t => typeof t.installed === 'boolean'), text };
    })()`);
    check('U4: Craft shows the native tool registry with installed/absent truth', craft.api && craft.tools >= 4 && craft.hasBoolean && /native/i.test(craft.text), JSON.stringify(craft).slice(0, 700));

    // References: new sources are visible; Use stages an editable question.
    await clickLabel('References');
    await waitFor(`/reactbits|motion primitives/i.test(document.body.innerText)`, 30_000);
    await sleep(1200);
    const refs = await evaluate(`(() => {
      const text = document.body.innerText;
      const libs = ['ReactBits', 'Motion Primitives', 'Kokonut'];
      const useButtons = [...document.querySelectorAll('[data-action="reference-use"]')];
      const firstUse = useButtons.find(b => b.getClientRects().length > 0);
      firstUse?.click();
      return { hasNewSources: libs.every(l => new RegExp(l, 'i').test(text)), clicked: Boolean(firstUse), header: text.includes('References'), useButtons: useButtons.length, hasReact: /reactbits/i.test(text), len: text.length };
    })()`);
    await sleep(1200);
    const staged = await evaluate(`(() => {
      const ta = [...document.querySelectorAll('textarea')].find(t => (t.getAttribute('data-tip') || '').includes('Paste text'));
      return ta ? String(ta.value || '') : '';
    })()`);
    check('U5: References "Use" stages an editable prompt asking HOW to use it', refs.hasNewSources && refs.clicked && /how do you want to use it/i.test(staged), `refs=${JSON.stringify(refs)} staged=${staged.slice(0, 260)}`);

    // Cost: settled data + a real chart (bars or the explicit empty state).
    await clickLabel('Cost');
    const costSettled = await waitFor(`(() => {
      return document.querySelectorAll('[aria-label="Hourly token usage"] > div').length > 0 && !document.querySelector('[aria-label="Loading GO forecast"]');
    })()`, 45_000);
    const cost = await evaluate(`(() => {
      const text = document.body.innerText;
      const bars = document.querySelectorAll('[aria-label="Hourly token usage"] > div').length;
      const chart = Boolean(document.querySelector('svg[aria-label*="forecast"], [aria-label*="forecast"]')) || /no measured monthly usage|ledger is unavailable/i.test(text);
      return { settled: bars > 0, bars, chart, loading: Boolean(document.querySelector('[aria-label="Loading GO forecast"]')), text: text.slice(0, 1200) };
    })()`);
    check('U6: the Cost pane settles and the usage chart is not a skeleton', costSettled && cost.settled && cost.bars > 0 && cost.chart && !cost.loading, JSON.stringify(cost).slice(0, 700));

    // Callimachus: live card, honest census, budget line.
    await clickLabel('God intelligence');
    // Wait for the pane's main return first (the retrieval card), then the
    // curator card. A cold brain-stats read can exceed the old 45s window.
    await waitFor(`Boolean(document.querySelector('[data-testid="retrieval-status"]'))`, 60_000);
    const curatorReady = await waitFor(`document.body.innerText.includes('Callimachus · VaultBrain maintenance') || Boolean(document.querySelector('[data-testid="callimachus-live"]'))`, 60_000);
    const curator = await evaluate(`(() => {
      const card = document.querySelector('[data-testid="callimachus-live"]');
      return { ready: Boolean(card), text: card ? card.innerText : '' };
    })()`);
    const quick = Number((curator.text.match(/quick circuits\s+(\d+)/i) || [])[1] ?? -1);
    check('U7: Callimachus is live with validated quick-circuit counts', curatorReady && curator.ready && quick >= 0 && /model \d+\/\d+ this hour/.test(curator.text), curator.text.slice(0, 500));
    check('U8: no invented quick-circuit count (0 validated is honest; no stale 33)', quick === 0 || /validated|proof/i.test(curator.text), `quick=${quick} ${curator.text.slice(0, 500)}`);

    let retrievalText = '';
    for (let i = 0; i < 20; i++) {
      retrievalText = await evaluate(`document.querySelector('[data-testid="retrieval-status"]')?.innerText || ''`);
      if (retrievalText) break;
      await sleep(500);
    }
    const hasIndexButton = await evaluate(`Boolean(document.querySelector('[data-testid="retrieval-index-button"]'))`);
    check('U12: the local hybrid retrieval index is visible (768d, chunks, build button)', /Retrieval · local hybrid/.test(retrievalText) && /768d/.test(retrievalText) && /(chunks|docs)/.test(retrievalText) && hasIndexButton, retrievalText.slice(0, 400));

    // v0.1.4 — the offline fallback must say the SAME thing as the canonical
    // strategy table. The v0.1.2 fallback still assigned GLM-5.3 to Apollo.
    await clickLabel('LLM strategy');
    // The strategy pane is a dynamic chunk; wait for its canonical text, not
    // a fixed 1.8s that can race a cold chunk.
    await waitFor(`/GO Balanced/.test(document.body.innerText) && /DeepSeek V4\\.1 Flash/.test(document.body.innerText)`, 20_000);
    await sleep(300);
    const strategyText = await evaluate(`document.body.innerText.slice(0, 6000)`);
    check('U13: LLM Strategy shows the canonical GO Balanced roster (no stale Apollo GLM)', /GO Balanced/.test(strategyText) && /DeepSeek V4\.1 Flash/.test(strategyText) && !/Apollo: GLM-5\.3/.test(strategyText) && !/Specialists: Qwen3\.7 Plus/.test(strategyText), strategyText.slice(0, 700));

    // v0.1.5 — the shell must follow the language selector. Switch to pt-BR,
    // reload, assert the activity bar/status/notification labels, then reset.
    await evaluate(`(async()=>{try{localStorage.setItem('olympus:language','pt-BR');localStorage.setItem('olympus:language-updated-at',new Date().toISOString());await fetch('/api/olympus/language',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({language:'pt-BR'})});}catch{}setTimeout(()=>location.reload(),50);return true;})()`);
    await waitFor(`!document.querySelector('[aria-label="OLYMPUS is loading"]')`, 20_000);
    await sleep(1200);
    const ptText = await evaluate(`document.body.innerText`);
    check('U14: the shell follows the language (notificar/Custo)', /notificar|notificações/i.test(ptText) && /Custo/.test(ptText), ptText.slice(0, 700));
    check('U22: the Parthenon follows the language (panteão/sempre ativo)', /panteão|sempre ativo/i.test(ptText), ptText.slice(0, 900));
    await evaluate(`(async()=>{try{localStorage.setItem('olympus:language','en');localStorage.setItem('olympus:language-updated-at',new Date().toISOString());await fetch('/api/olympus/language',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({language:'en'})});}catch{}setTimeout(()=>location.reload(),50);return true;})()`);
    await waitFor(`!document.querySelector('[aria-label="OLYMPUS is loading"]')`, 20_000);
    await sleep(800);

    // v0.1.6 — the status bar keeps full labels. At 1600 all four are
    // visible; at 1280 the context pair drops as a whole but skills/agents
    // stay readable. A clipped label (scrollWidth > clientWidth) is a FAIL.
    const statusAt = async (width) => {
      if (width !== 1600) await cdp.send('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: false });
      await sleep(900);
      return evaluate(`(() => {
        const labels = [...document.querySelectorAll('[data-status-label]')].map((el) => ({
          key: el.getAttribute('data-status-label'),
          text: (el.textContent || '').trim(),
          visible: el.getClientRects().length > 0,
          clipped: el.scrollWidth > el.clientWidth + 1,
        }));
        return { width: window.innerWidth, labels };
      })()`);
    };
    const status1920 = await statusAt(1920);
    const by1920 = Object.fromEntries(status1920.labels.map((l) => [l.key, l]));
    check('U15c: status labels are full at 1920px', ['instincts', 'conf', 'skills', 'agents'].every((k) => by1920[k]?.visible && !by1920[k]?.clipped && by1920[k]?.text), JSON.stringify(status1920));
    const status1600 = await statusAt(1600);
    const by1600 = Object.fromEntries(status1600.labels.map((l) => [l.key, l]));
    check('U15a: status labels are full at 1600px', ['instincts', 'conf', 'skills', 'agents'].every((k) => by1600[k]?.visible && !by1600[k]?.clipped && by1600[k]?.text), JSON.stringify(status1600));
    const status1280 = await statusAt(1280);
    const by1280 = Object.fromEntries(status1280.labels.map((l) => [l.key, l]));
    check('U15b: agents/skills stay full at 1280px', ['skills', 'agents'].every((k) => by1280[k]?.visible && !by1280[k]?.clipped && by1280[k]?.text), JSON.stringify(status1280));
    await cdp.send('Emulation.clearDeviceMetricsOverride');
    await sleep(500);

    // v0.1.6 — the fullscreen route loader is gone; the boot overlay must be
    // absent after the shell settles, and a pane change must not bring it back.
    const fullscreenLoader = await evaluate(`Boolean(document.querySelector('[aria-label="OLYMPUS is loading"]'))`);
    check('U16: no fullscreen loader after boot', fullscreenLoader === false, `present=${fullscreenLoader}`);

    // v0.1.6 — clean boot: the last project is a suggestion, not an active one.
    const activeState = await evaluate(`(async()=>{try{const r=await fetch('/api/olympus/projects/active',{cache:'no-store'});const d=await r.json();return {slug:d.slug??null, project:d.project?.slug??null};}catch(e){return {error:String(e)}}})()`);
    const projectButton = await evaluate(`document.querySelector('[aria-label="Switch project"]')?.innerText || ''`);
    check('U17: OLYMPUS opens without a project', activeState.slug === null && /No Project/i.test(projectButton), JSON.stringify({ activeState, projectButton }));

    // v0.1.6 — Logs is six runtime tabs. Boot health and Hygiene moved to
    // Settings; they must not exist as Logs tabs.
    await clickLabel('Logs');
    await waitFor(`/Issues/i.test(document.body.innerText)`, 20_000);
    await sleep(800);
    const logTabs = await evaluate(`(() => {
      const wanted = ['Overview','Hops','Campaigns','Issues','Models','Economy'];
      const buttons = [...document.querySelectorAll('button')].filter((b) => b.getClientRects().length > 0);
      const found = wanted.filter((label) => buttons.some((b) => (b.innerText || '').trim().startsWith(label)));
      const forbidden = ['Boot','Hygiene','Portfolio','Plan','Recovery','Errors'].filter((label) => buttons.some((b) => (b.innerText || '').trim().startsWith(label)));
      return { found, forbidden };
    })()`);
    check('U18: Logs has six runtime tabs and no Boot/Hygiene tab', logTabs.found.length === 6 && logTabs.forbidden.length === 0, JSON.stringify(logTabs));

    // v0.1.7 — clean boot: the Parthenon must not inherit the last campaign.
    const bootText = await evaluate(`document.querySelector('[aria-label="Atlas and Apollo command deck"]')?.innerText || ''`);
    check('U19: clean boot has no campaign/task rows', !/Campaign aime|library-served-proof|report-mvp/i.test(bootText) && /No active campaign|Nenhuma campanha ativa/i.test(bootText), bootText.slice(0, 900));

    // The cost numbers moved out of the status bar; only the icon remains.
    const statusText = await evaluate(`document.querySelector('[data-drag-region]')?.innerText || ''`);
    check('U20: no cost numbers in the status bar', !/\$\d|step \$|list \$|tok/.test(statusText), statusText.slice(0, 500));

    // The brain must always start Smooth (the full cloud).
    await clickLabel('Brain graph');
    await waitFor(`document.querySelector('canvas.brain-atlas-canvas')`, 20_000);
    await sleep(600);
    const preset = await evaluate(`[...document.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === 'Performance preset')?.innerText || ''`);
    check('U21: the brain starts Smooth', /Smooth|Suave|Fluide|Flüssig|スムーズ|流畅/i.test(preset), preset);


    await go(URL_BASE, 5000);
    // The boot overlay is a full-screen click blocker until it fades. Wait for
    // the door to actually open before the pane clicks (the 5s race).
    await waitFor(`!document.querySelector('[aria-label="OLYMPUS is loading"]')`, 15_000);
    const errors = cdp.events
      .filter((e) => e.method === 'Runtime.exceptionThrown' || (e.method === 'Log.entryAdded' && e.params?.entry?.level === 'error'))
      .map((e) => e.params?.exceptionDetails?.text || e.params?.entry?.text || '')
      .filter((t) => t && !/youtube|postMessage|Content Security Policy|preload|127\.0\.0\.2|ERR_CONNECTION_REFUSED|ERR_INCOMPLETE_CHUNKED_ENCODING|ERR_CONNECTION_RESET|Failed to load resource/i.test(t));
    check('U11: no uncaught app exception in the real page', errors.length === 0, errors.slice(0, 3).join(' | '));

    console.log(failures === 0 ? '\nverify-v017-ui: PASS' : `\nverify-v017-ui: ${failures} FAIL`);
    process.exitCode = failures === 0 ? 0 : 1;
  } finally {
    try { cdp?.close(); } catch { /* gone */ }
    try { process.kill(-chrome.pid, 'SIGKILL'); } catch { try { chrome.kill('SIGKILL'); } catch { /* gone */ } }
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
