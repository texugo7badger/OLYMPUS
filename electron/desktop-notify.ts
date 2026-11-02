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
 * v0.0.34 — the ORIGINAL OLYMPUS mark as a PNG, in the active palette.
 *
 * Geometry mirrors public/logo.svg (the 256 viewBox):
 *   background disc, outer + inner rings, the mountain peak, Callimachus
 *   floating above (purple), Atlas at the base (gold), the eight specialist
 *   gods in orbit, and the faint rays from the centre.
 *
 * Rendered 4x supersampled then box-filtered (premultiplied), so the 16px
 * tray still reads and the 256px window/dock icon stays crisp. No SVG
 * rasterizer, no dependency.
 */
function originalMarkPng(colors: ThemeMarkColors, size: number): Buffer {
  const ss = 4;
  const S = Math.max(32, size * ss);
  const [ar, ag, ab] = hexToRgb(colors.accent);
  const [pr, pg, pb] = hexToRgb(colors.purple);
  const [br, bgc, bb] = hexToRgb(colors.bg);

  const P = (v: number) => v * S;
  const cx = P(128 / 256);
  const cy = P(128 / 256);
  const bgR = P(124 / 256);
  const outerR = P(112 / 256);
  const innerR = P(96 / 256);
  const outerHalf = P(1.5 / 256) / 2;
  const innerHalf = P(1 / 256) / 2;

  // The 8 god dots (x, y, r, opacity) — same coordinates as the logo.
  const orbit: Array<[number, number, number, number]> = [
    [128, 24, 4, 1],
    [201.6, 54.4, 3.5, 0.85],
    [232, 128, 4, 1],
    [201.6, 201.6, 3.5, 0.85],
    [128, 232, 4, 1],
    [54.4, 201.6, 3.5, 0.85],
    [24, 128, 4, 1],
    [54.4, 54.4, 3.5, 0.85],
  ].map(([x, y, r, o]) => [P(x / 256), P(y / 256), P(r / 256), o] as [number, number, number, number]);

  const peak: Array<[number, number]> = ([
    [128, 76], [168, 168], [144, 168], [128, 132], [112, 168], [88, 168],
  ] as Array<[number, number]>).map(([x, y]) => [P(x / 256), P(y / 256)] as [number, number]);

  function inPeak(x: number, y: number): boolean {
    let inside = false;
    for (let i = 0, j = peak.length - 1; i < peak.length; j = i, i += 1) {
      const [xi, yi] = peak[i];
      const [xj, yj] = peak[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }

  /** Squared distance from a point to the centre→orbit-dot ray. */
  function rayDistance(x: number, y: number, tx: number, ty: number): number {
    const dx = tx - cx;
    const dy = ty - cy;
    const len2 = dx * dx + dy * dy;
    const t = Math.max(0, Math.min(1, ((x - cx) * dx + (y - cy) * dy) / len2));
    return Math.hypot(x - (cx + t * dx), y - (cy + t * dy));
  }

  const rgba = Buffer.alloc(S * S * 4);
  const blend = (i: number, r: number, g: number, b: number, a: number): void => {
    const da = rgba[i + 3] / 255;
    const outA = a + da * (1 - a);
    if (outA <= 0) return;
    rgba[i] = Math.round((r * a + rgba[i] * da * (1 - a)) / outA);
    rgba[i + 1] = Math.round((g * a + rgba[i + 1] * da * (1 - a)) / outA);
    rgba[i + 2] = Math.round((b * a + rgba[i + 2] * da * (1 - a)) / outA);
    rgba[i + 3] = Math.round(outA * 255);
  };

  for (let y = 0; y < S; y += 1) {
    for (let x = 0; x < S; x += 1) {
      const i = (y * S + x) * 4;
      const d = Math.hypot(x - cx, y - cy);
      // The disc is opaque; everything else lives inside it.
      if (d <= bgR) blend(i, br, bgc, bb, 1);
      else continue;
      // Faint rays from the centre to each god dot.
      for (const [ox, oy] of orbit) {
        if (rayDistance(x, y, ox, oy) <= P(0.5 / 256)) blend(i, ar, ag, ab, 0.15);
      }
      // The two rings.
      if (Math.abs(d - outerR) <= outerHalf) blend(i, ar, ag, ab, 0.4);
      if (Math.abs(d - innerR) <= innerHalf) blend(i, ar, ag, ab, 0.25);
      // The mountain.
      if (inPeak(x, y)) blend(i, ar, ag, ab, 1);
      // Callimachus above the peak (purple), Atlas at the base (gold).
      if (Math.hypot(x - cx, y - P(60 / 256)) <= P(3 / 256)) blend(i, pr, pg, pb, 1);
      if (Math.hypot(x - cx, y - P(168 / 256)) <= P(3 / 256)) blend(i, ar, ag, ab, 1);
      // The eight specialist gods in orbit.
      for (const [ox, oy, or, op] of orbit) {
        if (Math.hypot(x - ox, y - oy) <= or) blend(i, ar, ag, ab, op);
      }
    }
  }

  // Box-filter to the requested size with premultiplied alpha (no dark halo).
  const out = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let r = 0; let g = 0; let b = 0; let a = 0;
      for (let sy = 0; sy < ss; sy += 1) {
        for (let sx = 0; sx < ss; sx += 1) {
          const i = ((y * ss + sy) * S + (x * ss + sx)) * 4;
          const al = rgba[i + 3] / 255;
          r += rgba[i] * al;
          g += rgba[i + 1] * al;
          b += rgba[i + 2] * al;
          a += al;
        }
      }
      const n = ss * ss;
      const oi = (y * size + x) * 4;
      if (a > 0) {
        out[oi] = Math.round(r / a);
        out[oi + 1] = Math.round(g / a);
        out[oi + 2] = Math.round(b / a);
        out[oi + 3] = Math.round((a / n) * 255);
      }
    }
  }
  return encodePng(size, size, out);
}

/**
 * The window/taskbar icon in the user's palette: the OLYMPUS mark (a peak
 * inside a disc) rendered with the PNG encoder — no dependency, no SVG
 * rasterizer. 256px by default; the taskbar downsamples cleanly.
 */
export function themeMarkPng(colors: ThemeMarkColors, size = 256, iconId = 'classic'): Buffer {
  // v0.0.34 — PRIORITY: the system icon carries the ORIGINAL OLYMPUS mark
  // (two rings, the peak, the eight gods in orbit, Callimachus above and
  // Atlas at the base), not a simplified triangle. The icon-family options
  // still render for users who picked one, but 'classic' is the true mark
  // everywhere: window, taskbar, tray and Linux dock.
  if (iconId === 'classic') return originalMarkPng(colors, size);
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
  // The selected logo family must reach the OS icon too.
  const orbit = iconId === 'orbit';
  const peakOnly = iconId === 'peak';
  const monogram = iconId === 'monogram';
  const orbitDots = orbit
    ? [[0.5, 0.20], [0.78, 0.5], [0.5, 0.80], [0.22, 0.5]].map(([x, y]) => [size * x, size * y])
    : [];
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const i = (y * size + x) * 4;
      const d = Math.hypot(x - cx, y - cy);
      if (d > outer) continue;
      // ring
      const isRing = d > outer - ring;
      let r = br, g = bgc, b = bb;
      if (isRing) { r = ar; g = ag; b = ab; }
      if (monogram && !isRing && Math.abs(Math.hypot(x - cx, y - cy) - size * 0.30) < size * 0.012) { r = ar; g = ag; b = ab; }
      if (!peakOnly && !orbit && !monogram && !isRing && insideTriangle(x, y)) { r = ar; g = ag; b = ab; }
      if (peakOnly && !isRing && insideTriangle(x, y)) { r = ar; g = ag; b = ab; }
      if (orbit) {
        for (const [ox, oy] of orbitDots) {
          if (Math.hypot(x - ox, y - oy) <= size * 0.045) { r = ar; g = ag; b = ab; }
        }
      }
      if (!orbit && Math.hypot(x - cx, y - dotY) <= dotR) { r = pr; g = pg; b = pb; }
      rgba[i] = r; rgba[i + 1] = g; rgba[i + 2] = b; rgba[i + 3] = 255;
    }
  }
  return encodePng(size, size, rgba);
}
