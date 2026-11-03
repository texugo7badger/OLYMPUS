#!/usr/bin/env node
/**
 * mobile-companion.test.mjs — v0.0.58.
 *
 * The companion is the same server, the same campaign, the same token — not
 * a second app with a second secret. These assertions protect the contract:
 * the token rides the URL FRAGMENT (never a query/request line), the pair
 * payload is auth-gated, the page can prompt by text and voice, and the
 * desktop surfaces the QR + revocation.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OLYMPUS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let failures = 0;
function expect(name, cond, detail) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : ' — ' + String(detail).slice(0, 220)}`);
  if (!cond) failures++;
}

const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'olympus-mobile-'));
process.env.OLYMPUS_HOME = tmpHome;
const lib = await import(OLYMPUS + '/src/lib/mobile-pairing.ts');

const token = lib.ensureSessionToken();
expect('M-0: the token is real random material', typeof token === 'string' && token.length >= 24, token);
const stat = fs.statSync(path.join(tmpHome, 'session-token'));
expect('M-1: the token file is 0600 and reused', (stat.mode & 0o777) === 0o600 && lib.ensureSessionToken() === token, stat.mode.toString(8));

const url = lib.mobileUrlFor('192.168.1.10', 3737, token);
expect('M-2: the token rides the fragment, never the request line', url.includes('/m#t=') && !new URL(url).searchParams.has('t'), url);
expect('M-3: the mobile URL points at the LAN host and port', url.startsWith('http://192.168.1.10:3737/m'), url);

lib.writeNetworkMode('lan');
expect('M-4: the mode round-trips (lan)', lib.readNetworkMode() === 'lan', lib.readNetworkMode());
lib.writeNetworkMode('local');

const payload = await lib.buildPairPayload({ hostHeader: '127.0.0.1:3737' });
expect('M-5: the payload carries a QR data URL and the LAN URL', String(payload.qr || '').startsWith('data:image/png') && payload.url.includes('/m#t='), payload.qr ? 'qr missing data prefix' : 'no qr');
expect('M-6: the payload reports whether the bind is LAN-ready', payload.lanReady === false && payload.mode === 'local' && /restart/i.test(payload.note), JSON.stringify({ mode: payload.mode, lanReady: payload.lanReady }));

const route = fs.readFileSync(OLYMPUS + '/src/app/api/olympus/mobile/pair/route.ts', 'utf-8');
expect('M-7: the pair route is auth-gated on read and write', /export async function GET[\s\S]*?requireAuth\(req\)/.test(route) && /export async function POST[\s\S]*?requireAuth\(req\)/.test(route), 'missing requireAuth');
expect('M-8: the pair route validates the mode and supports rotation', /action === 'rotate'/.test(route) && /'local' && mode !== 'lan'/.test(route), 'missing rotate/mode guards');

const page = fs.readFileSync(OLYMPUS + '/src/app/m/page.tsx', 'utf-8');
expect('M-9: the phone can see the campaign and the in-flight hops', /hops\?\.completed/.test(page) && /inFlightList/.test(page) && /parked/.test(page), 'campaign missing');
expect('M-10: the phone can switch the active project', /projects\/active/.test(page) && /switchProject/.test(page), 'project switch missing');
expect('M-11: the phone can prompt by text and voice', /api\/olympus\/action/.test(page) && /SpeechRecognition/.test(page) && /x-olympus-token/.test(page), 'prompt/voice/auth missing');
expect('M-12: the phone can open the live preview', /livePreviewPort/.test(page), 'preview missing');
expect('M-15: the phone sees the project git remote and commits', /projects\/github/.test(page) && /git\.commits/.test(page), 'git missing');
expect('M-17: the campaign shows the real denominator', /hops\?\.total/.test(page), 'total missing');
expect('M-16: the campaign can be read aloud', /speechSynthesis/.test(page), 'tts missing');

const dialog = fs.readFileSync(OLYMPUS + '/src/components/olympus/mobile-pair-dialog.tsx', 'utf-8');
expect('M-18: the phone inherits the desktop theme store', /api\/olympus\/theme/.test(page) && /applyTheme\(/.test(page) && /THEME_PRESETS/.test(page), 'theme inheritance missing');
expect('M-19: the phone writes a theme change back to the desktop', /method: 'POST'/.test(page) && /saveTheme/.test(page) && /changes the PC too/.test(page), 'no write-back');
expect('M-20: the desktop watches the store for another device', /startThemeWatch/.test(fs.readFileSync(OLYMPUS + '/src/lib/theme-store.ts', 'utf-8')) && /updatedAt/.test(fs.readFileSync(OLYMPUS + '/src/app/api/olympus/theme/route.ts', 'utf-8')), 'desktop never notices the phone');
expect('M-21: the remote tunnel is auth-gated and startable', /requireAuth\(req\)/.test(fs.readFileSync(OLYMPUS + '/src/app/api/olympus/mobile/tunnel/route.ts', 'utf-8')) && /startTunnel/.test(fs.readFileSync(OLYMPUS + '/src/lib/mobile-tunnel.ts', 'utf-8')) && /start remote tunnel/.test(dialog), 'remote lane missing');
expect('M-22: the phone link can be copied with the token', /remote\.url}\/m#t=/.test(dialog), 'no remote link copy');
expect('M-23: the theme writes back to the PC', /saveTheme/.test(page) && /api\/olympus\/theme/.test(page), 'no theme write');
expect('M-13: the desktop shows the QR, rotates and toggles the bind', /pair\.qr/.test(dialog) && /action: 'rotate'/.test(dialog) && /action: 'set-mode'/.test(dialog), 'dialog incomplete');
const statusBar = fs.readFileSync(OLYMPUS + '/src/components/olympus/status-bar.tsx', 'utf-8');
expect('M-14: the status bar mounts the pairing dialog', /MobilePairDialog/.test(statusBar) && /setMobilePair\(true\)/.test(statusBar), 'not mounted');

fs.rmSync(tmpHome, { recursive: true, force: true });
console.log(failures === 0 ? '\nmobile-companion: all green.' : `\nmobile-companion: ${failures} failure(s).`);
process.exit(failures === 0 ? 0 : 1);
