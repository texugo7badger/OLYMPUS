/**
 * desktop-notify.ts — v0.0.32 (Epic M): tray colors per notification type.
 *
 * The tray icon is the app's ambient state. A hop that finishes, a park, a
 * design question, a walk restart, a chat compaction and Callimachus cleaning
 * must be distinguishable at a glance, in the OLYMPUS palette — without
 * opening the window.
 *
 * This module lives in `electron/` on purpose: the Electron tsconfig compiles
 * only this directory, so importing `../src/lib/...` would move the common
 * root and break `dist-electron-tsc/main.js`. `src/lib/desktop-notify.ts`
 * mirrors the taxonomy for the API; `desktop-notify.test.mjs` pins both.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { deflateSync } from 'node:zlib';

export type NotifyType = 'ready' | 'error' | 'design' | 'walk' | 'compact' | 'curate';

export const NOTIFY_TYPES: NotifyType[] = ['ready', 'error', 'design', 'walk', 'compact', 'curate'];

/** The OLYMPUS palette (src/app/globals.css) — no invented colors. */
export const NOTIFY_COLORS: Record<NotifyType, string> = {
  ready: '#7BAE8E',   // olympus-green — something is ready
  error: '#C4756A',   // olympus-red — an error is being investigated
  design: '#9B7BAE',  // olympus-purple — Athena / Hephaestus design
  walk: '#6BAEB5',    // olympus-cyan — the walk is (re)starting
  compact: '#C4A265', // olympus-amber-soft — chat/terminal compacting
  curate: '#D4A574',  // olympus-gold — Callimachus curating
};

export const NOTIFY_LABELS: Record<NotifyType, string> = {
  ready: 'ready',
  error: 'error',
  design: 'design',
  walk: 'walk',
  compact: 'compact',
  curate: 'curate',
};

export function isNotifyType(value: unknown): value is NotifyType {
  return typeof value === 'string' && (NOTIFY_TYPES as string[]).includes(value);
}

const GOLD = '#D4A574';

function hexToRgb(hex: string): [number, number, number] {
  const v = hex.replace('#', '');
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
}

// ── a minimal PNG encoder (no dependency) ────────────────────────────────
let crcTable: number[] | null = null;
function crc32(buf: Buffer): number {
  if (!crcTable) {
    crcTable = [];
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (const byte of buf) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 0xff];
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(kind: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const type = Buffer.from(kind, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([type, data])), 0);
  return Buffer.concat([len, type, data, crc]);
}

export function encodePng(width: number, height: number, rgba: Buffer): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (width * 4 + 1)] = 0; // filter none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * A 32×32 tray dot: the type color, a 2 px gold ring, transparent outside.
 * Simple on purpose — it must read at 16 px in a dark tray.
 */
export function trayPng(color: string, size = 32, ringColor = GOLD): Buffer {
  const [r, g, b] = hexToRgb(color);
  const [gr, gg, gb] = hexToRgb(ringColor);
  const rgba = Buffer.alloc(size * size * 4);
  const c = (size - 1) / 2;
  const outer = c - 0.5;
  const inner = outer - Math.max(2, Math.round(size / 10));
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const i = (y * size + x) * 4;
      const d = Math.hypot(x - c, y - c);
      if (d > outer || d < inner) continue; // transparent
      const isRing = d > inner + 1.5;
      rgba[i] = isRing ? gr : r;
      rgba[i + 1] = isRing ? gg : g;
      rgba[i + 2] = isRing ? gb : b;
      rgba[i + 3] = 255;
    }
  }
  return encodePng(size, size, rgba);
}

export interface ThemeMarkColors {
  accent: string;
  purple: string;
  bg: string;
}

/**
 * The window/taskbar icon in the user's palette: the OLYMPUS mark (a peak
 * inside a disc) rendered with the PNG encoder — no dependency, no SVG
 * rasterizer. 256px by default; the taskbar downsamples cleanly.
 */
export function themeMarkPng(colors: ThemeMarkColors, size = 256): Buffer {
  const [ar, ag, ab] = hexToRgb(colors.accent);
  const [pr, pg, pb] = hexToRgb(colors.purple);
  const [br, bgc, bb] = hexToRgb(colors.bg);
  const rgba = Buffer.alloc(size * size * 4);
  const cx = (size - 1) / 2;
  const cy = (size - 1) / 2;
  const outer = size * 0.48;
  const ring = size * 0.035;
  // Triangle: apex (0.5, 0.24), base (0.24, 0.80)–(0.76, 0.80).
  const ax = size * 0.5, ay = size * 0.24;
  const bx = size * 0.24, by = size * 0.80;
  const dx = size * 0.76, dy = size * 0.80;
  const insideTriangle = (x: number, y: number): boolean => {
    const d1 = (x - dx) * (ay - dy) - (ax - dx) * (y - dy);
    const d2 = (x - bx) * (by - dy) - (bx - dx) * (y - dy);
    const d3 = (x - ax) * (ay - by) - (ax - bx) * (y - by);
    const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
    const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
    return !(hasNeg && hasPos);
  };
  const dotR = size * 0.035;
  const dotY = size * 0.17;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const i = (y * size + x) * 4;
      const d = Math.hypot(x - cx, y - cy);
      if (d > outer) continue;
      // ring
      const isRing = d > outer - ring;
      let r = br, g = bgc, b = bb;
      if (isRing) { r = ar; g = ag; b = ab; }
      if (!isRing && insideTriangle(x, y)) { r = ar; g = ag; b = ab; }
      if (Math.hypot(x - cx, y - dotY) <= dotR) { r = pr; g = pg; b = pb; }
      rgba[i] = r; rgba[i + 1] = g; rgba[i + 2] = b; rgba[i + 3] = 255;
    }
  }
  return encodePng(size, size, rgba);
}
