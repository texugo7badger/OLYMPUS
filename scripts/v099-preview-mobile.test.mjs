#!/usr/bin/env node
/**
 * v099-preview-mobile.test.mjs — v0.0.99: the preview and the phone.
 *
 * The release specimens:
 *   - the preview was a logged-out mirror (the 127.0.0.2 alias lost the
 *     app's cookies) and reloaded on every SSE replay;
 *   - the phone answered in English (no x-olympus-language header) and its
 *     SSE parser let a progress log replace the god's answer;
 *   - the pairing tunnel died with the app.
 *
 * This suite is hermetic: it reads source contracts and exercises the pure
 * accumulator + the hop-events cache in a temp home.
 *
 * Run: npx tsx scripts/v099-preview-mobile.test.mjs   (exit 0 = pass)
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OLYMPUS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'olympus-v99-home-'));
process.env.OLYMPUS_HOME = HOME;
process.on('exit', () => {
  try { fs.rmSync(HOME, { recursive: true, force: true }); } catch { /* gone */ }
});

let failures = 0;
function expect(name, cond, detail) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : ' — ' + String(detail).slice(0, 280)}`);
  if (!cond) failures++;
}
const src = (rel) => fs.readFileSync(path.join(OLYMPUS, rel), 'utf-8');

async function main() {
  // 1. The answer accumulator -------------------------------------------------
  const { createAnswerAccumulator } = await import(OLYMPUS + '/src/lib/stream-answer.ts');
  const chunks = [
    { type: 'log', msg: 'retry 1/3 — provider slow' },
    { type: 'text', part: { type: 'text', text: 'Olá' } },
    { type: 'text', part: { type: 'text', text: 'Olá, Texugo' } },
    { type: 'log', msg: 'a tool is running' },
    { type: 'text', part: { type: 'text', text: 'Pronto.' } },
    { type: 'error', msg: 'late provider error' },
  ];
  const acc = createAnswerAccumulator();
  acc.feed(chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join(''));
  expect('A1: text parts merge and a log never replaces the answer', acc.text === 'Olá, Texugo\n\nPronto.', acc.text);
  expect('A2: the error is kept separately', acc.error === 'late provider error', acc.error);
  const summary = createAnswerAccumulator();
  summary.feed(`data: ${JSON.stringify({ type: 'walk_summary', msg: 'walk resumed' })}\n\n`);
  expect('A3: a walk summary survives as a fallback answer', summary.summary === 'walk resumed', summary.summary);

  // 2. The preview surface keeps the real origin -----------------------------
  const surface = src('src/components/olympus/preview-surface.tsx');
  const live = src('src/components/olympus/live-preview.tsx');
  const win = src('src/app/preview-window/page.tsx');
  expect('P1: Electron renders a webview (own process, shared cookies)', /createElement\('webview'/.test(surface));
  expect('P2: the browser still gets an iframe', /<iframe/.test(surface));
  expect('P3: the live preview no longer uses the 127.0.0.2 alias', !/iframePreviewUrl|127\.0\.0\.2/.test(live));
  expect('P4: the preview window no longer uses the alias', !/isolatedUrl|iframePreviewUrl|127\.0\.0\.2/.test(win));
  expect('P5: the live preview explains mixed content honestly', /mixedContent/.test(live));
  expect('P6: a landed part is offered, never forced while interacting', /lastInteractionRef/.test(live) && /partReady/.test(live));
  expect('P7: the LAN origin is available for a second PC', /lanUrl/.test(live) && /lanUrl/.test(src('src/app/api/olympus/live-preview/route.ts')));

  // 3. The hop stream ignores its replay -------------------------------------
  const hopStream = src('src/lib/hop-stream.ts');
  expect('H1: stream_ready gates the live feed', /stream_ready/.test(hopStream) && /if \(!live\) return/.test(hopStream));
  expect('H2: both preview surfaces subscribe through the hook', /useHopParts/.test(live) && /useHopParts/.test(win));
  const hopEvents = src('src/lib/hop-runtime/hop-events.ts');
  expect('H3: hop events are parsed from a stat-keyed cache', /let cache:/.test(hopEvents) && /stat\.size/.test(hopEvents));

  // 4. The phone answers in the user's language ------------------------------
  const mobile = src('src/app/m/page.tsx');
  expect('M1: the phone sends x-olympus-language', /'x-olympus-language': language/.test(mobile));
  expect('M2: the phone uses the answer accumulator', /createAnswerAccumulator/.test(mobile));
  expect('M3: the phone has an abortable stop', /stopAsk/.test(mobile) && /abortRef/.test(mobile));
  expect('M4: voice is unlocked on the first gesture', /unlockVoice/.test(mobile) && /onPointerDownCapture=\{unlockVoice\}/.test(mobile));
  expect('M5: low-end phones start in performance mode', /hardwareConcurrency/.test(mobile) && /setPerformanceMode\(true\)/.test(mobile));
  expect('M6: the phone preview exposes a reload + loader', /previewKey/.test(mobile) && /previewLoaded/.test(mobile));
  const studio = src('src/app/m/studio/page.tsx');
  expect('M7: the studio uses the same accumulator', /createAnswerAccumulator/.test(studio));
  const voice = src('src/lib/voice.ts');
  expect('M8: the voice primer exists', /export function unlockVoice/.test(voice));

  // 5. The pairing door stays on --------------------------------------------
  const instrumentation = src('src/instrumentation-node.ts');
  expect('B1: the tunnel is supervised for the life of the server', /__olympusTunnelSupervisor/.test(instrumentation) && /ensureTunnel/.test(instrumentation));
  const pair = src('src/components/olympus/mobile-pair-dialog.tsx');
  expect('B2: the pairing card shows the phone heartbeat', /mobile\/presence/.test(pair) && /phone connected/.test(pair));
  expect('B3: the presence route is auth-gated', /requireAuth/.test(src('src/app/api/olympus/mobile/presence/route.ts')) && /requireReadAuth/.test(src('src/app/api/olympus/mobile/presence/route.ts')));

  // 6. The hop-events cache is correct across an append ---------------------
  const eventsFile = path.join(HOME, 'hop-events.jsonl');
  fs.writeFileSync(eventsFile, [
    JSON.stringify({ type: 'hop_start', hop: 'one', ts: '2026-01-01T00:00:00.000Z' }),
    JSON.stringify({ type: 'hop_done', hop: 'one', ts: '2026-01-01T00:00:01.000Z' }),
  ].join('\n') + '\n');
  const { readHopEvents } = await import(OLYMPUS + '/src/lib/hop-runtime/hop-events.ts');
  const first = readHopEvents({ limit: 10 });
  expect('C1: the cache returns both events', first.events.length === 2, first.events.length);
  fs.appendFileSync(eventsFile, JSON.stringify({ type: 'hop_done', hop: 'two', ts: '2026-01-01T00:00:02.000Z' }) + '\n');
  const second = readHopEvents({ limit: 10 });
  expect('C2: an append invalidates the cache', second.events.length === 3 && second.events[2].hop === 'two', second.events.length);
  const since = readHopEvents({ since: '2026-01-01T00:00:01.500Z', limit: 10 });
  expect('C3: the since cursor stays exclusive', since.events.length === 1 && since.events[0].hop === 'two', since.events.length);

  console.log(`\nv0.0.99 preview+mobile: ${failures === 0 ? 'PASS' : `${failures} FAIL`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
