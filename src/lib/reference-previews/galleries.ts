/**
 * galleries.ts — image-gallery studies: Spiral Images, Coverflow Carousel,
 * Swipe Stack and Infinity Canvas. Each one is draggable/hoverable and draws
 * only transform-like canvas operations (save/translate/scale), no filters.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { accent, clamp, easeOut, hash, rgba, roundRect, TAU, tile, type DrawEnv } from './common';

function glyph(ctx: CanvasRenderingContext2D, kind: number, x: number, y: number, r: number, color: string): void {
  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, r * 0.12);
  if (kind === 0) {
    ctx.beginPath();
    ctx.arc(x, y, r * 0.55, 0, TAU);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, r * 0.18, 0, TAU);
    ctx.fill();
  } else if (kind === 1) {
    ctx.beginPath();
    ctx.moveTo(x, y - r * 0.6);
    ctx.lineTo(x + r * 0.55, y + r * 0.45);
    ctx.lineTo(x - r * 0.55, y + r * 0.45);
    ctx.closePath();
    ctx.fill();
  } else if (kind === 2) {
    ctx.beginPath();
    ctx.arc(x, y, r * 0.55, Math.PI, TAU);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - r * 0.55, y);
    ctx.lineTo(x - r * 0.55, y + r * 0.5);
    ctx.moveTo(x + r * 0.55, y);
    ctx.lineTo(x + r * 0.55, y + r * 0.5);
    ctx.stroke();
  } else {
    ctx.strokeRect(x - r * 0.42, y - r * 0.42, r * 0.84, r * 0.84);
    ctx.fillRect(x - r * 0.1, y - r * 0.1, r * 0.2, r * 0.2);
  }
  ctx.restore();
}

/* ── Spiral Images ──────────────────────────────────────────────────────── */

export function drawSpiral(env: DrawEnv): void {
  const { ctx, w, h, palette, t, variant, smooth } = env;
  const n = 13;
  const items = Array.from({ length: n }, (_, i) => {
    const base = i / n;
    let x: number;
    let y: number;
    let scale: number;
    let alpha: number;
    if (variant === 'tunnel') {
      const z = (base + t * 0.000045) % 1;
      const d = 0.25 + z * 1.15;
      x = w / 2 + Math.sin(i * 1.9 + t * 0.0002) * w * 0.28 * d;
      y = h / 2 + Math.cos(i * 1.27) * h * 0.3 * d;
      scale = 0.35 + z * 0.9;
      alpha = 0.25 + z * 0.75;
    } else {
      const a = base * TAU + t * 0.00028;
      x = w / 2 + Math.sin(a) * w * 0.3;
      y = h / 2 + Math.sin(i * 0.9 + t * 0.00018) * h * 0.16;
      scale = 0.55 + 0.45 * Math.cos(a);
      alpha = 0.4 + 0.6 * ((Math.cos(a) + 1) / 2);
    }
    return { i, x, y, scale, alpha, color: accent(palette, i) };
  }).sort((a, b) => a.scale - b.scale);

  for (const it of items) {
    const tw = 74 * it.scale;
    const th = 92 * it.scale;
    ctx.save();
    ctx.globalAlpha = it.alpha;
    ctx.translate(it.x, it.y);
    // pointer tilt
    const tilt = clamp((smooth.x - it.x) / (w * 0.8), -0.25, 0.25);
    ctx.rotate(tilt * 0.4);
    tile(ctx, -tw / 2, -th / 2, tw, th, 8 * it.scale, it.color, rgba(it.color, 0.35));
    ctx.globalAlpha = it.alpha * 0.9;
    glyph(ctx, it.i % 4, 0, -th * 0.08, Math.min(tw, th) * 0.42, rgba(palette.bg, 0.85));
    ctx.fillStyle = rgba(palette.bg, 0.6);
    roundRect(ctx, -tw * 0.34, th * 0.26, tw * 0.68, 2.4 * it.scale, 2);
    ctx.fill();
    roundRect(ctx, -tw * 0.34, th * 0.34, tw * 0.4, 1.8 * it.scale, 2);
    ctx.fill();
    ctx.restore();
  }

  const label = 'SPIRAL · drag to orbit';
  ctx.fillStyle = rgba(palette.textDim, 0.65);
  ctx.font = '8px ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.fillText(label, w / 2, h - 12);
}

/* ── Coverflow Carousel ─────────────────────────────────────────────────── */

export function drawCoverflow(env: DrawEnv): void {
  const { ctx, w, h, palette, t, variant, smooth } = env;
  const n = 7;
  const spacing = Math.min(76, w / 7);
  const y = h * 0.5 + Math.sin(t * 0.0009) * 3;
  for (let k = 0; k < n; k += 1) {
    const i = k - 3;
    const angle = variant === 'fan' ? i * 0.2 : i * 0.42;
    const sx = Math.max(0.1, Math.cos(angle));
    const x = w / 2 + i * spacing + (smooth.x - w / 2) * 0.04;
    const cy = y + Math.abs(i) * 3;
    const coverW = 80;
    const coverH = 104;
    ctx.save();
    ctx.translate(x, cy);
    if (variant === 'fan') {
      ctx.rotate(i * 0.14);
    } else {
      ctx.scale(sx, 1);
    }
    // cover
    ctx.globalAlpha = Math.abs(i) > 2 ? 0.55 : 1;
    tile(ctx, -coverW / 2, -coverH / 2, coverW, coverH, 8, accent(palette, k), rgba(palette.bg, 0.45));
    glyph(ctx, k % 4, 0, -6, 24, rgba(palette.bg, 0.8));
    ctx.fillStyle = rgba(palette.bg, 0.55);
    roundRect(ctx, -coverW * 0.34, coverH * 0.26, coverW * 0.68, 3, 2);
    ctx.fill();
    roundRect(ctx, -coverW * 0.34, coverH * 0.34, coverW * 0.44, 2, 2);
    ctx.fill();
    // edge highlight
    ctx.strokeStyle = rgba(palette.gold, 0.28);
    ctx.lineWidth = 1;
    roundRect(ctx, -coverW / 2 + 0.5, -coverH / 2 + 0.5, coverW - 1, coverH - 1, 8);
    ctx.stroke();
    ctx.restore();
  }
  ctx.fillStyle = rgba(palette.textDim, 0.62);
  ctx.font = '8px ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.fillText('COVERFLOW · hover to feel the depth', w / 2, h - 12);
}

/* ── Swipe Stack ────────────────────────────────────────────────────────── */

export function drawStack(env: DrawEnv): void {
  const { ctx, w, h, palette, pointer, now, variant, smooth } = env;
  const st = (env.state.stack ??= { order: 0, drag: 0, wasDown: false, fling: 0, flingAt: 0 });
  if (pointer.down) {
    st.drag = smooth.x - w / 2;
    st.wasDown = true;
  } else if (st.wasDown) {
    st.wasDown = false;
    st.fling = Math.abs(st.drag) > 52 ? Math.sign(st.drag) : 0;
    st.flingAt = now;
  }
  let offset = 0;
  if (!pointer.down) {
    if (st.fling && now - st.flingAt < 260) {
      offset = st.fling * easeOut((now - st.flingAt) / 260) * w * 0.8;
    } else if (st.fling) {
      st.fling = 0;
      st.order = (st.order + 1) % 5;
      st.drag = 0;
    } else {
      st.drag *= 0.86;
      offset = st.drag;
    }
  } else {
    offset = st.drag;
  }

  const spread = variant === 'fan' ? 18 : 10;
  const count = 5;
  // Fit the stack inside short cards: the old 150×192 card overflowed a
  // 220px stage and hid the caption.
  const cardH = Math.min(h * 0.68, 178);
  const cardW = Math.min(w * 0.44, cardH / 1.28);
  for (let k = count - 1; k >= 0; k -= 1) {
    const idx = (st.order + k) % count;
    const top = k === 0;
    const x = w / 2 + (top ? offset : 0) + (variant === 'fan' ? k * spread : 0);
    const y = h / 2 - (top ? 0 : k * 5) + (variant === 'fan' ? -k * 3 : 0);
    const rot = top ? offset * 0.0009 : (variant === 'fan' ? (k * 0.045) : k * 0.02);
    const scale = 1 - k * 0.035;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.scale(scale, scale);
    ctx.globalAlpha = 1 - k * 0.08;
    const col = accent(palette, idx);
    tile(ctx, -cardW / 2, -cardH / 2, cardW, cardH, 12, col, rgba(palette.bg, 0.5));
    glyph(ctx, idx % 4, 0, -cardH * 0.08, cardW * 0.22, rgba(palette.bg, 0.8));
    ctx.fillStyle = rgba(palette.bg, 0.55);
    roundRect(ctx, -cardW * 0.32, cardH * 0.25, cardW * 0.64, 3, 2);
    ctx.fill();
    roundRect(ctx, -cardW * 0.32, cardH * 0.32, cardW * 0.42, 2, 2);
    ctx.fill();
    ctx.strokeStyle = rgba(palette.gold, top ? 0.4 : 0.12);
    ctx.lineWidth = 1;
    roundRect(ctx, -cardW / 2 + 0.5, -cardH / 2 + 0.5, cardW - 1, cardH - 1, 12);
    ctx.stroke();
    ctx.restore();
  }
  ctx.fillStyle = rgba(palette.textDim, 0.62);
  ctx.font = '8px ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.fillText('SWIPE STACK · drag a card', w / 2, h - 12);
}

/* ── Infinity Canvas ────────────────────────────────────────────────────── */

export function drawInfinity(env: DrawEnv): void {
  const { ctx, w, h, palette, pointer, variant, now } = env;
  const st = (env.state.inf ??= { x: 0, y: 0, vx: 0.1, vy: 0.05, wasDown: false });
  if (pointer.down) {
    st.x += pointer.x - pointer.px;
    st.y += pointer.y - pointer.py;
    st.vx = (pointer.x - pointer.px) * 0.65;
    st.vy = (pointer.y - pointer.py) * 0.65;
    st.wasDown = true;
  } else {
    if (st.wasDown) { st.wasDown = false; }
    st.vx = st.vx * 0.94 + 0.035;
    st.vy = st.vy * 0.94 + 0.018;
    st.x += st.vx;
    st.y += st.vy;
  }

  const spacing = 132;
  const cols = Math.ceil(w / spacing) + 2;
  const rows = Math.ceil(h / spacing) + 2;
  const gridW = cols * spacing;
  const gridH = rows * spacing;
  const ox = ((st.x % gridW) + gridW) % gridW - spacing;
  const oy = ((st.y % gridH) + gridH) % gridH - spacing;
  let idx = 0;
  for (let iy = 0; iy < rows; iy += 1) {
    for (let ix = 0; ix < cols; ix += 1) {
      idx += 1;
      const jitterX = variant === 'free' ? (hash(idx * 3.7) - 0.5) * 46 : 0;
      const jitterY = variant === 'free' ? (hash(idx * 7.1) - 0.5) * 46 : 0;
      const x = ox + ix * spacing + jitterX;
      const y = oy + iy * spacing + jitterY;
      if (x < -90 || x > w + 90 || y < -100 || y > h + 100) continue;
      const col = accent(palette, idx);
      const hover = Math.hypot(x - pointer.x, y - pointer.y) < 80;
      tile(ctx, x - 42, y - 54, 84, 108, 9, rgba(col, 0.85), rgba(palette.bg, 0.35), hover ? 1 : 0.72);
      glyph(ctx, idx % 4, x, y - 8, 18, rgba(palette.bg, 0.75));
      ctx.fillStyle = rgba(palette.bg, 0.45);
      roundRect(ctx, x - 28, y + 30, 56, 3, 2);
      ctx.fill();
    }
  }
  ctx.fillStyle = rgba(palette.textDim, 0.62);
  ctx.font = '8px ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.fillText('INFINITY CANVAS · drag to explore', w / 2, h - 12);
}
