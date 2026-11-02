#!/usr/bin/env node
/**
 * voice-lane.test.mjs — v0.0.34: the free neural voice + local STT lanes.
 * Run: npx tsx scripts/voice-lane.test.mjs
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { GOD_VOICE } from '../src/lib/voice.ts';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf-8');
let pass = 0;
const ok = (name, fn) => { try { fn(); console.log('PASS ', name); pass += 1; } catch (e) { console.log('FAIL ', name, '—', e?.message || e); process.exitCode = 1; } };

ok('ten gods have distinct pitch/rate profiles', () => {
  const keys = Object.keys(GOD_VOICE);
  assert.equal(keys.length, 10);
  const sigs = new Set(Object.values(GOD_VOICE).map((v) => `${v.pitch}/${v.rate}`));
  assert.equal(sigs.size, 10);
});

ok('the speak route is the free edge-tts lane', () => {
  assert.ok(existsSync(new URL('../src/app/api/olympus/voice/speak/route.ts', import.meta.url)));
  const src = read('src/app/api/olympus/voice/speak/route.ts');
  assert.match(src, /edge-tts/);
  assert.match(src, /tts-edge\.py/);
  assert.match(src, /audio\/mpeg/);
});

ok('the honest voice status route exists', () => {
  assert.ok(existsSync(new URL('../src/app/api/olympus/voice/status/route.ts', import.meta.url)));
  assert.match(read('src/app/api/olympus/voice/status/route.ts'), /faster_whisper/);
});

ok('the STT route and script exist (local faster-whisper)', () => {
  assert.ok(existsSync(new URL('../src/app/api/olympus/voice/listen/route.ts', import.meta.url)));
  assert.match(read('src/app/api/olympus/voice/listen/route.ts'), /stt-whisper\.py/);
  assert.match(read('scripts/stt-whisper.py'), /faster_whisper/);
});

ok('the studio exposes microphone selection and a mic button', () => {
  const src = read('src/components/olympus/immersive-panel.tsx');
  assert.match(src, /enumerateDevices/);
  assert.match(src, /getUserMedia/);
  assert.match(src, /voice\/listen/);
  assert.match(src, /toggleMic/);
});

ok('the orb reacts to the real audio level', () => {
  assert.match(read('src/lib/voice.ts'), /createAnalyser/);
  assert.match(read('src/components/olympus/plasma-orb.tsx'), /levelRef/);
  assert.match(read('src/components/olympus/immersive-panel.tsx'), /voiceLevel/);
});

ok('voice answers questions only — no ambient hop narration', () => {
  const src = read('src/components/olympus/immersive-panel.tsx');
  assert.ok(!src.includes("voice && (type === 'hop_start'"), 'hop narration returned');
  assert.match(src, /voicePolicy/);
});

console.log(`\nvoice-lane: ${pass} passed`);
