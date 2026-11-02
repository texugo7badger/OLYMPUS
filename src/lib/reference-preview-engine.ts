/**
 * reference-preview-engine.ts — v0.0.34: the canvas host for the native
 * reference previews.
 *
 * One engine per card. It sizes the canvas to its box (DPR capped at 2),
 * runs a single RAF only while the card is visible, and stops everything on
 * dispose. Pointer events drive interaction; when the pointer is idle an
 * automatic Lissajous path keeps the study alive so a grid of references can
 * be scanned at a glance.
 *
 * Stable motion draws one composed frame and never starts the loop.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import type { OlympusPalette } from './theme';
import { previewSpec, type PreviewKind } from './reference-previews';
import type { DrawEnv, PointerState } from './reference-previews/common';
import { drawBlackHole, drawFluid, drawGrid, drawParticles, drawTrail } from './reference-previews/motion';
import { drawCoverflow, drawInfinity, drawSpiral, drawStack } from './reference-previews/galleries';
import { drawMorph, drawScramble, drawSmoke, drawWeight } from './reference-previews/text';
import { drawBlink, drawBurst, drawEmoji, drawPixel, drawSnow } from './reference-previews/ambient';
import { drawIsland, drawLink, drawMembers, drawReveal, drawSwap, drawTooltip } from './reference-previews/ui';

export interface PreviewEngineOptions {
  referenceId: string;
  label: string;
  variant: string;
  palette: OlympusPalette;
  stable?: boolean;
}

export class PreviewEngine {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly opts: PreviewEngineOptions;
  private readonly kind: PreviewKind;
  private readonly state: Record<string, any> = {};
  private readonly pointer: PointerState = { x: 0, y: 0, px: 0, py: 0, active: false, down: false, downX: 0, downY: 0, lastMove: 0 };
  private readonly smooth = { x: 0, y: 0 };

  private w = 1;
  private h = 1;
  private dpr = 1;
  private t0 = 0;
  private last = 0;
  private raf = 0;
  private visible = false;
  private disposed = false;
  private io: IntersectionObserver | null = null;
  private ro: ResizeObserver | null = null;

  private readonly onMove = (e: PointerEvent) => {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.px = this.pointer.x;
    this.pointer.py = this.pointer.y;
    this.pointer.x = e.clientX - rect.left;
    this.pointer.y = e.clientY - rect.top;
    this.pointer.active = true;
    this.pointer.lastMove = performance.now();
  };
  private readonly onDown = (e: PointerEvent) => {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.downX = e.clientX - rect.left;
    this.pointer.downY = e.clientY - rect.top;
    this.pointer.x = this.pointer.downX;
    this.pointer.y = this.pointer.downY;
    this.pointer.px = this.pointer.x;
    this.pointer.py = this.pointer.y;
    this.pointer.down = true;
    this.pointer.active = true;
    this.pointer.lastMove = performance.now();
    try { this.canvas.setPointerCapture(e.pointerId); } catch { /* not critical */ }
  };
  private readonly onUp = (e: PointerEvent) => {
    this.pointer.down = false;
    this.pointer.lastMove = performance.now();
    try { this.canvas.releasePointerCapture(e.pointerId); } catch { /* not critical */ }
  };
  private readonly onLeave = () => {
    this.pointer.active = false;
  };

  constructor(canvas: HTMLCanvasElement, opts: PreviewEngineOptions) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) throw new Error('Canvas2D is unavailable');
    this.ctx = ctx;
    this.opts = opts;
    this.kind = previewSpec(opts.referenceId).kind;
  }

  start(): void {
    if (this.disposed) return;
    this.resize();
    this.smooth.x = this.w / 2;
    this.smooth.y = this.h / 2;
    this.t0 = performance.now();
    this.last = this.t0;
    if (this.opts.stable) {
      this.drawFrame(2600, 16);
      return;
    }
    this.canvas.addEventListener('pointermove', this.onMove);
    this.canvas.addEventListener('pointerdown', this.onDown);
    this.canvas.addEventListener('pointerup', this.onUp);
    this.canvas.addEventListener('pointercancel', this.onUp);
    this.canvas.addEventListener('pointerleave', this.onLeave);
    if (typeof ResizeObserver !== 'undefined') {
      this.ro = new ResizeObserver(() => {
        this.resize();
        if (this.opts.stable) this.drawFrame(2600, 16);
      });
      this.ro.observe(this.canvas);
    }
    if (typeof IntersectionObserver !== 'undefined') {
      this.io = new IntersectionObserver((entries) => {
        this.visible = entries.some((e) => e.isIntersecting);
        this.sync();
      }, { threshold: 0.02 });
      this.io.observe(this.canvas);
    } else {
      this.visible = true;
      this.sync();
    }
  }

  stop(): void {
    this.disposed = true;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.io?.disconnect();
    this.ro?.disconnect();
    this.io = null;
    this.ro = null;
    this.canvas.removeEventListener('pointermove', this.onMove);
    this.canvas.removeEventListener('pointerdown', this.onDown);
    this.canvas.removeEventListener('pointerup', this.onUp);
    this.canvas.removeEventListener('pointercancel', this.onUp);
    this.canvas.removeEventListener('pointerleave', this.onLeave);
  }

  private sync(): void {
    if (this.disposed) return;
    if (this.visible && !this.raf) {
      this.last = performance.now();
      this.raf = requestAnimationFrame(this.loop);
    } else if (!this.visible && this.raf) {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
    }
  }

  private resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    const nextW = Math.max(1, Math.round(rect.width));
    const nextH = Math.max(1, Math.round(rect.height));
    const nextDpr = Math.min(2, typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1);
    if (nextW === this.w && nextH === this.h && nextDpr === this.dpr && this.canvas.width) return;
    this.w = nextW;
    this.h = nextH;
    this.dpr = nextDpr;
    this.canvas.width = Math.round(nextW * nextDpr);
    this.canvas.height = Math.round(nextH * nextDpr);
    this.ctx.setTransform(nextDpr, 0, 0, nextDpr, 0, 0);
    if (this.smooth.x === 0 && this.smooth.y === 0) {
      this.smooth.x = nextW / 2;
      this.smooth.y = nextH / 2;
    }
  }

  private loop = (now: number): void => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    if (typeof document !== 'undefined' && document.hidden) return;
    const dt = Math.min(48, Math.max(1, now - this.last));
    this.last = now;
    this.drawFrame(now - this.t0, dt);
  };

  private target(now: number): { x: number; y: number } {
    const idle = !this.pointer.active || now - this.pointer.lastMove > 2400;
    if (!idle) return { x: this.pointer.x, y: this.pointer.y };
    const t = now * 0.001;
    return {
      x: this.w * (0.5 + 0.3 * Math.sin(t * 0.52) + 0.06 * Math.sin(t * 1.37)),
      y: this.h * (0.5 + 0.26 * Math.cos(t * 0.41) + 0.05 * Math.cos(t * 1.11)),
    };
  }

  private drawFrame(t: number, dt: number): void {
    const ctx = this.ctx;
    const { w, h } = this;
    ctx.clearRect(0, 0, w, h);
    const target = this.target(performance.now());
    const live = this.pointer.active && performance.now() - this.pointer.lastMove < 2400;
    const k = live ? 0.2 : 0.055;
    this.smooth.x += (target.x - this.smooth.x) * k;
    this.smooth.y += (target.y - this.smooth.y) * k;

    const env: DrawEnv = {
      ctx,
      w,
      h,
      t,
      dt,
      palette: this.opts.palette,
      pointer: this.pointer,
      smooth: this.smooth,
      state: this.state,
      label: this.opts.label,
      variant: this.opts.variant,
      now: performance.now(),
    };
    switch (this.kind) {
      case 'blackhole': drawBlackHole(env); break;
      case 'fluid': drawFluid(env); break;
      case 'particles': drawParticles(env); break;
      case 'grid': drawGrid(env); break;
      case 'spiral': drawSpiral(env); break;
      case 'coverflow': drawCoverflow(env); break;
      case 'stack': drawStack(env); break;
      case 'canvas': drawInfinity(env); break;
      case 'smoke': drawSmoke(env); break;
      case 'morph': drawMorph(env); break;
      case 'scramble': drawScramble(env); break;
      case 'weight': drawWeight(env); break;
      case 'pixel': drawPixel(env); break;
      case 'burst': drawBurst(env); break;
      case 'snow': drawSnow(env); break;
      case 'blink': drawBlink(env); break;
      case 'emoji': drawEmoji(env); break;
      case 'link': drawLink(env); break;
      case 'reveal': drawReveal(env); break;
      case 'island': drawIsland(env); break;
      case 'members': drawMembers(env); break;
      case 'tooltip': drawTooltip(env); break;
      case 'swap': drawSwap(env); break;
      case 'trail': drawTrail(env); break;
      default: drawParticles(env); break;
    }
  }
}
