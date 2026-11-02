/**
 * common.ts — shared helpers and the DrawEnv contract for the native
 * reference previews (v0.0.34). Canvas-only, no DOM lookups, no deps.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import type { OlympusPalette } from '../theme';

export interface PointerState {
  x: number;
  y: number;
  px: number;
  py: number;
  active: boolean;
  down: boolean;
  downX: number;
  downY: number;
  lastMove: number;
}

export interface DrawEnv {
  ctx: CanvasRenderingContext2D;
  w: number;
  h: number;
  /** Milliseconds since the preview started. */
  t: number;
  /** Delta since the last frame, clamped to 48ms. */
  dt: number;
  palette: OlympusPalette;
  pointer: PointerState;
  /** Smoothed pointer / idle auto-motion (the living target). */
  smooth: { x: number; y: number };
  state: Record<string, any>;
  label: string;
  variant: string;
  now: number;
}

export const TAU = Math.PI * 2;

export function clamp(v: number, lo = 0, hi = 1): number {
  return Math.max(lo, Math.min(hi, v));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function easeOut(t: number): number {
  return 1 - (1 - t) ** 3;
}

export function rgba(color: string, a: number): string {
  if (typeof color !== 'string') return `rgba(212,165,116,${a})`;
  if (color.startsWith('rgb(')) return color.replace('rgb(', 'rgba(').replace(')', `,${a})`);
  let h = color.replace('#', '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  if (h.length !== 6) return `rgba(212,165,116,${a})`;
  return `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${a})`;
}

/** Deterministic 0..1 noise for a number (stable layouts across frames). */
export function hash(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

export function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

export function drawStar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  points = 4,
  rotation = 0,
  inner = 0.32,
): void {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i += 1) {
    const rad = i % 2 === 0 ? r : r * inner;
    const a = rotation + (i / (points * 2)) * TAU;
    const px = x + Math.cos(a) * rad;
    const py = y + Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

/** Pick a theme accent by index (front-end friendly, all keys exist). */
export function accent(palette: OlympusPalette, i: number): string {
  const keys = ['gold', 'cyan', 'purple', 'green', 'amberSoft', 'blue', 'teal', 'red'] as const;
  return palette[keys[Math.abs(i) % keys.length]];
}

/** Shrink a font size until the text fits the width. */
export function fitText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  start: number,
  weight = 600,
  family = 'ui-sans-serif, system-ui, -apple-system, sans-serif',
): number {
  let size = start;
  for (let i = 0; i < 14; i += 1) {
    ctx.font = `${weight} ${size}px ${family}`;
    if (ctx.measureText(text).width <= maxWidth) return size;
    size *= 0.9;
  }
  return size;
}

/** A rounded card tile with a soft gradient, used by several studies. */
export function tile(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  from: string,
  to: string,
  alpha = 1,
): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  const g = ctx.createLinearGradient(x, y, x + w, y + h);
  g.addColorStop(0, from);
  g.addColorStop(1, to);
  ctx.fillStyle = g;
  roundRect(ctx, x, y, w, h, r);
  ctx.fill();
  ctx.strokeStyle = rgba('#FFFFFF', 0.18);
  ctx.lineWidth = 1;
  roundRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, r);
  ctx.stroke();
  ctx.restore();
}

/** Draw a soft edge vignette around the preview (theme-aware). */
export function vignette(ctx: CanvasRenderingContext2D, w: number, h: number, color: string): void {
  const g = ctx.createRadialGradient(w * 0.5, h * 0.45, Math.min(w, h) * 0.25, w * 0.5, h * 0.45, Math.max(w, h) * 0.72);
  g.addColorStop(0, rgba(color, 0));
  g.addColorStop(1, rgba(color, 0.10));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}
