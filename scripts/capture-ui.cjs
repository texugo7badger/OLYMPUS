/**
 * capture-ui.cjs — v0.0.32: README/UX screenshots from the LIVE app.
 *
 * Run with the app up:  npx electron scripts/capture-ui.cjs
 * It opens an offscreen window on http://127.0.0.1:3737, walks the panes and
 * writes screenshots/*.png. No mocks: the real UI, the real data.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'screenshots');
const URL = process.env.OLYMPUS_URL || 'http://127.0.0.1:3737/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const win = new BrowserWindow({
    width: 1600,
    height: 1000,
    show: false,
    webPreferences: { offscreen: true, sandbox: true },
  });
  try {
    // The standalone server is in lan mode: the desktop authenticates with the
    // HttpOnly cookie the Electron main sets. An offscreen capture must set it
    // too, or every read is 401 and the shots show an empty shell.
    const token = (() => { try { return fs.readFileSync(path.join(require('os').homedir(), '.olympus', 'session-token'), 'utf-8').trim(); } catch { return ''; } })();
    if (token) {
      try {
        await win.webContents.session.cookies.set({ url: 'http://127.0.0.1:3737', name: 'olympus_token', value: token, httpOnly: true, sameSite: 'strict' });
      } catch (e) { console.log('cookie failed', e?.message); }
    }
    await win.loadURL(URL);
    await sleep(7000);
    const shot = async (name) => {
      const img = await win.webContents.capturePage();
      fs.writeFileSync(path.join(OUT, name), img.toPNG());
      console.log('shot', name);
    };
    const click = async (js) => {
      try { await win.webContents.executeJavaScript(js, true); } catch (e) { console.log('click failed', e?.message); }
    };
    await shot('01-brain.png');

    // Craft (activity bar tooltip/aria) then Builds / Style / References tabs
    await click(`(() => { const b = [...document.querySelectorAll('[data-tip],[aria-label],button')].find((el) => /craft/i.test(el.getAttribute('data-tip') || el.getAttribute('aria-label') || el.textContent || '')); b?.click(); return !!b; })()`);
    await sleep(6500);
    await shot('02-craft-apps.png');
    await click(`(() => { const b = [...document.querySelectorAll('button')].find((el) => (el.textContent || '').trim().toLowerCase() === 'builds'); b?.click(); return !!b; })()`);
    await sleep(3500);
    await shot('03-builds.png');
    await click(`(() => { const b = [...document.querySelectorAll('button')].find((el) => (el.textContent || '').trim().toLowerCase() === 'style'); b?.click(); return !!b; })()`);
    await sleep(3500);
    await shot('04-style.png');
    await click(`(() => { const b = [...document.querySelectorAll('button')].find((el) => (el.textContent || '').trim().toLowerCase() === 'references'); b?.click(); return !!b; })()`);
    await sleep(3500);
    await shot('05-references.png');

    // Settings (Appearance)
    await click(`(() => { const b = [...document.querySelectorAll('[data-tip],[aria-label],button')].find((el) => /settings/i.test(el.getAttribute('data-tip') || el.getAttribute('aria-label') || '')); b?.click(); return !!b; })()`);
    await sleep(2500);
    await shot('06-appearance.png');

    // v0.0.64 — the creative mode: progress, ring, crystal, queue, feed.
    await click(`(() => { const b = [...document.querySelectorAll('[data-tip],[aria-label],button')].find((el) => /criativ|creativ/i.test(el.getAttribute('data-tip') || el.getAttribute('aria-label') || '')); b?.click(); return !!b; })()`);
    await sleep(4500);
    await shot('07-creative.png');
    await click(`(() => { const b = [...document.querySelectorAll('button')].find((el) => /close|fechar/i.test(el.getAttribute('aria-label') || '')); b?.click(); return !!b; })()`);
    await sleep(800);
    // The Talent Studio (the crystal cuts).
    await win.loadURL(URL + 'talent');
    await sleep(3500);
    await shot('10-talent.png');

    // The phone, at a phone's size, with the paired token (localStorage).
    const phone = new BrowserWindow({
      width: 390, height: 844, show: false,
      webPreferences: { offscreen: true, sandbox: true, userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Mobile Safari/537.36' },
    });
    try {
      await phone.loadURL(URL + 'm');
      if (token) {
        await phone.webContents.executeJavaScript(`localStorage.setItem('olympus:mobile-token', ${JSON.stringify(token)}); true;`, true);
        await phone.loadURL(URL + 'm');
      }
      await sleep(5000);
      const phoneShot = async (name) => {
        const img = await phone.webContents.capturePage();
        fs.writeFileSync(path.join(OUT, name), img.toPNG());
        console.log('shot', name);
      };
      await phoneShot('08-mobile.png');
      await phone.loadURL(URL + 'm/studio');
      await sleep(5000);
      await phoneShot('09-mobile-studio.png');
    } finally {
      phone.destroy();
    }
  } finally {
    win.destroy();
    app.quit();
  }
}

app.whenReady().then(main).catch((e) => { console.error(e); app.exit(1); });
