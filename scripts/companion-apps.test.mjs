#!/usr/bin/env node
/**
 * companion-apps.test.mjs — v0.0.85: the companion contract.
 *
 * The phone is one installable app family (companion + live widget) with the
 * active theme's icon, a zero-token briefing, a real live-preview capture,
 * and one notification feed shared with the PC. These assertions pin the
 * surfaces and the honest limits (no fake capture, no fake push).
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
const read = (rel) => fs.readFileSync(path.join(OLYMPUS, rel), 'utf-8');

// ── 1. the installable surfaces ────────────────────────────────────────────
const mobileLayout = read('src/app/m/layout.tsx');
const widgetLayout = read('src/app/m/widget/layout.tsx');
const mobileManifestRoute = read('src/app/m/manifest.webmanifest/route.ts');
const widgetManifestRoute = read('src/app/m/widget/manifest.webmanifest/route.ts');
const manifestLib = read('src/lib/theme-manifest.ts');
const iconRoute = read('src/app/m/icon/[size]/route.ts');
const sw = read('public/m-sw.js');
const pwaHook = read('src/lib/use-mobile-pwa.ts');

expect('A-1: /m declares its own themed manifest', /manifest:\s*'\/m\/manifest\.webmanifest'/.test(mobileLayout), 'no mobile manifest');
expect('A-2: /m/widget declares its own themed manifest', /manifest:\s*'\/m\/widget\/manifest\.webmanifest'/.test(widgetLayout), 'no widget manifest');
expect('A-3: both manifests are generated per request from the theme store', /mobileManifest\('app'\)/.test(mobileManifestRoute) && /mobileManifest\('widget'\)/.test(widgetManifestRoute) && /readThemeState/.test(manifestLib), 'not themed');
expect('A-4: the manifest carries a theme-hashed icon and a maskable variant', /themeVersion/.test(manifestLib) && /maskable=1/.test(manifestLib) && /scope:\s*'\/m'/.test(manifestLib), 'no cache-busted icon');
expect('A-5: the icon route renders the themed mark through sharp', /themedAppIconSvg/.test(iconRoute) && /import\('sharp'\)/.test(iconRoute) && /image\/png/.test(iconRoute), 'no PNG icon');
expect('A-6: one service worker owns both surfaces and migrates the v0.0.84 worker', /register\('\/m-sw\.js',\s*\{\s*scope:\s*'\/m'/.test(pwaHook) && /widget-sw\.js/.test(pwaHook) && /notificationclick/.test(sw), 'no shared worker');
expect('A-7: the worker never caches API data or hashed JS chunks', !/\/api\//.test(sw) && /request\.mode !== 'navigate'/.test(sw), 'worker caches too much');
expect('A-8: both surfaces can switch to each other in-window', /href="\/m\/widget"/.test(read('src/app/m/page.tsx')) && /href="\/m"/.test(read('src/app/m/widget/page.tsx')), 'no switcher');

// ── 2. the briefing and the voice ─────────────────────────────────────────
const briefingRoute = read('src/app/api/olympus/briefing/route.ts');
const briefingLib = read('src/lib/project-briefing.ts');
const companionText = read('src/lib/companion-text.ts');
const mobilePage = read('src/app/m/page.tsx');
const widgetPage = read('src/app/m/widget/page.tsx');
const briefingComponent = read('src/components/olympus/companion-briefing.tsx');

expect('A-9: the briefing route is read-gated and read-only', /requireReadAuth/.test(briefingRoute) && !/writeFileSync|appendFileSync|saveHopState/.test(briefingRoute), 'briefing can write');
expect('A-10: the briefing reads plan, state and telemetry only', /dispatch-plan\.json/.test(briefingLib) && /\.olympus-hop-state\.json/.test(briefingLib) && /readHopTelemetry/.test(briefingLib) && !/writeFileSync|appendFileSync/.test(briefingLib), 'briefing invents or writes');
expect('A-11: the companion answers "brief me" locally, with Apollo', /isBriefingIntent/.test(mobilePage) && /speakBriefing/.test(mobilePage) && /speakAs\(speech, 'apollo'/.test(mobilePage), 'no voice briefing');
expect('A-12: the widget renders the briefing and can speak each god', /CompanionBriefing/.test(widgetPage) && /onSpeak=\{speak\}/.test(widgetPage) && /Volume2/.test(briefingComponent), 'no briefing component');
expect('A-13: the briefing UI exposes current, parked, recent and next', /briefing\.current/.test(briefingComponent) && /briefing\.parked/.test(briefingComponent) && /briefing\.recent/.test(briefingComponent) && /briefing\.next/.test(briefingComponent), 'briefing section missing');
expect('A-14: the intent parser does not hijack a real task', /walk\|campaign\|campanha\|parked\|hop/.test(companionText) && /isBriefingIntent/.test(companionText), 'intent too broad');
expect('A-15: every shipped language has the companion chrome', (read('src/lib/i18n-mobile.ts').match(/'w\.briefing':/g) || []).length === 7, 'missing locale');

// ── 3. notifications shared with the PC ──────────────────────────────────
const notifyRoute = read('src/app/api/olympus/notify/route.ts');
const walker = read('src/lib/hop-runtime/walker.ts');
const notifyLib = read('src/lib/desktop-notify.ts');
const notifHook = read('src/lib/use-companion-notifications.ts');
const notifComponent = read('src/components/olympus/companion-notifications.tsx');

expect('A-16: the notify feed is read-gated for the phone', /requireReadAuth\(req\)/.test(notifyRoute), 'feed is public');
expect('A-17: a settled hop appends to the same feed the PC watches', /appendDesktopNotify\(\{[\s\S]*?hop: row\.hop/.test(walker), 'hop events not shared');
expect('A-18: the feed carries hop/god provenance', /hop\?: string/.test(notifyLib) && /god\?: string/.test(notifyLib), 'no provenance');
expect('A-19: the phone raises a native notification through the worker', /showNotification/.test(notifHook) && /serviceWorker\.ready/.test(notifHook) && /notificationclick/.test(sw), 'no native notification');
expect('A-20: the in-app feed, toast and permission flow are mounted', /CompanionNotificationsSheet/.test(widgetPage) && /CompanionToast/.test(widgetPage) && /enableNative/.test(notifComponent), 'not mounted');
expect('A-21: the notification text ships in seven languages', ['en', "'pt-BR'", 'es', 'fr', 'de', 'ja', 'zh'].every((lang) => notifyLib.includes(`${lang}: {`)), 'missing notify locale');

// ── 4. the live screenshots ──────────────────────────────────────────────
const screenshotLib = read('src/lib/screenshot.ts');
const screenshotRoute = read('src/app/api/olympus/screenshots/route.ts');
const captures = read('src/components/olympus/companion-captures.tsx');

expect('A-22: captures use a real Chromium over CDP, never a mock', /remote-debugging-port=0/.test(screenshotLib) && /Page\.captureScreenshot/.test(screenshotLib) && /findChromium/.test(screenshotLib), 'no real capture');
expect('A-23: captures are private files under the OLYMPUS home', /0o600/.test(screenshotLib) && /screenshots/.test(screenshotLib) && /OLYMPUS_HOME/.test(screenshotLib), 'wrong permissions');
expect('A-24: the capture route probes the project preview before shooting', /probeDevServer/.test(screenshotRoute) && /live preview is not running/.test(screenshotRoute), 'can shoot a dead port');
expect('A-25: the widget shows mobile and desktop and sends a critique to Apollo', /mobile/.test(captures) && /desktop/.test(captures) && /onCritique/.test(captures) && /Sobre a tela/.test(captures), 'no critique lane');

// ── 5. the real briefing function ────────────────────────────────────────
const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'olympus-comp-home-'));
const tmpVault = fs.mkdtempSync(path.join(os.tmpdir(), 'olympus-comp-vault-'));
const lane = path.join(tmpVault, '02_Projects', 'demo');
fs.mkdirSync(lane, { recursive: true });
fs.writeFileSync(path.join(tmpVault, '02_Projects', 'demo', 'project.md'), `---\nslug: demo\nname: Demo Project\npath: ${lane}\ndescription: A small demo of the companion briefing.\n---\n`);
fs.writeFileSync(path.join(lane, 'dispatch-plan.json'), JSON.stringify({
  version: 1,
  laneRoot: lane,
  campaign: {},
  hops: [
    { id: 'a-one', god: 'athena', artifacts: ['out/a.txt'] },
    { id: 'b-two', god: 'hermes' },
    { id: 'c-three', god: 'apollo' },
  ],
}, null, 2));
fs.writeFileSync(path.join(lane, '.olympus-hop-state.json'), JSON.stringify({
  version: 1,
  completed: ['a-one'],
  parked: { hopId: 'b-two', reason: 'dispatch-failed', ts: '2026-11-06T20:00:00.000Z' },
  campaignId: 'cmp-demo',
  inFlight: [],
  updatedAt: '2026-11-06T20:00:00.000Z',
}, null, 2));
fs.writeFileSync(path.join(lane, '.olympus-hop-telemetry.jsonl'), [
  JSON.stringify({ ts: '2026-11-06T19:59:00.000Z', hop: 'a-one', god: 'athena', lane: 'test', tokensIn: 1, tokensOut: 2, durationMs: 1234, retriesAbsorbed: 0, status: 'completed' }),
  JSON.stringify({ ts: '2026-11-06T20:00:00.000Z', hop: 'b-two', god: 'hermes', lane: 'test', tokensIn: null, tokensOut: null, durationMs: 2345, retriesAbsorbed: 0, status: 'parked-dispatch-failed' }),
].join('\n') + '\n');
fs.writeFileSync(path.join(tmpHome, 'theme.json'), JSON.stringify({ presetId: 'ember', mode: 'dark', accent: null, iconId: 'classic', motion: 'full' }));

process.env.OLYMPUS_HOME = tmpHome;
process.env.OLYMPUS_VAULT = tmpVault;

const { computeProjectBriefing } = await import(OLYMPUS + '/src/lib/project-briefing.ts');
const briefing = computeProjectBriefing('demo');
expect('A-26: the briefing reads the real plan and state', briefing.ok && briefing.progress?.overall.total === 3 && briefing.progress?.overall.completed === 1, JSON.stringify(briefing.progress));
expect('A-27: the parked hop is named with its reason', briefing.parked?.hopId === 'b-two' && briefing.parked?.reason === 'dispatch-failed', briefing.parked);
expect('A-28: the next hop is the first pending plan hop', briefing.next[0]?.id === 'c-three', briefing.next.map((hop) => hop.id));
expect('A-29: recent telemetry becomes a readable event feed', briefing.recent.length === 2 && briefing.recent[0].hopId === 'b-two' && briefing.recent[0].status === 'parked', briefing.recent);

const text = await import(OLYMPUS + '/src/lib/companion-text.ts');
expect('A-30: "brief me" is recognized in the shipped languages', ['resumo do projeto', 'briefing', "what's happening", 'me atualiza', 'briefing por favor'].every((q) => text.isBriefingIntent(q)), 'intent miss');
expect('A-31: a real task is never hijacked by the briefing intent', ['continue o projeto aime', 'resume the campaign', 'corrija o hop c-three', 'deploy the build'].every((q) => !text.isBriefingIntent(q)), 'intent hijacks work');
expect('A-32: Apollo speaks the summary in Portuguese', /33%/.test(text.summaryLine(briefing, 'pt-BR')) && /Demo Project/.test(text.briefingSpeech(briefing, 'pt-BR')), text.summaryLine(briefing, 'pt-BR'));

// ── 6. the themed manifest function ──────────────────────────────────────
const themeManifest = await import(OLYMPUS + '/src/lib/theme-manifest.ts');
const appManifest = themeManifest.mobileManifest('app');
const widgetManifest = themeManifest.mobileManifest('widget');
expect('A-33: the active theme paints the manifest', appManifest.background_color === '#120D0A' && appManifest.theme_color === '#E8A45C', `${appManifest.background_color}/${appManifest.theme_color}`);
expect('A-34: both apps share scope and icon family but start on their own surface', appManifest.scope === '/m' && widgetManifest.scope === '/m' && appManifest.start_url === '/m' && widgetManifest.start_url === '/m/widget' && appManifest.icons[1].src.split('?')[0] === widgetManifest.icons[1].src.split('?')[0], 'scope/start mismatch');
expect('A-35: the maskable icon keeps the Android safe zone', /<rect width="80" height="80"/.test(themeManifest.themedAppIconSvg(themeManifest.readThemeState(), { maskable: true })), 'no maskable field');
const versionBefore = themeManifest.themeVersion();
fs.writeFileSync(path.join(tmpHome, 'theme.json'), JSON.stringify({ presetId: 'ice', mode: 'dark', accent: null, iconId: 'classic', motion: 'full' }));
expect('A-36: a theme change is a new icon URL', themeManifest.themeVersion() !== versionBefore, 'icon hash did not move');

// ── 7. the plan and the limits ───────────────────────────────────────────
const roadmap = read('ROADMAP.md');
const changelog = read('CHANGELOG.md');
expect('A-37: the native home-screen widget is planned with the PWA limit named', /native Android widget|Glance|home-screen widget/i.test(roadmap) && /PWA/.test(roadmap), 'native widget plan missing');
expect('A-38: the changelog records the companion, briefing, captures and notifications', /companion/i.test(changelog) && /briefing/i.test(changelog) && /notification/i.test(changelog) && /capture/i.test(changelog), 'changelog missing v0.0.85');

fs.rmSync(tmpHome, { recursive: true, force: true });
fs.rmSync(tmpVault, { recursive: true, force: true });
console.log(failures === 0 ? '\ncompanion-apps: all green.' : `\ncompanion-apps: ${failures} failure(s).`);
process.exit(failures === 0 ? 0 : 1);
