/**
 * ambient.ts — ambient/animation studies: Pixel Reveal, Star Burst, Snow
 * Fall, Blinking Squares and Emoji Burst.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { accent, clamp, drawStar, easeOut, hash, rgba, roundRect, TAU, type DrawEnv } from './common';

/* ── Pixel Reveal ───────────────────────────────────────────────────────── */

export function drawPixel(env: DrawEnv): void {
  const { ctx, w, h, palette, t, variant, smooth } = env;
  const cols = 18;
  const rows = Math.max(10, Math.round((h / w) * cols));
  const cellW = w / cols;
  const cellH = h / rows;
  const cycle = 7200;
  const phase = (t % cycle) / cycle;
  const progress = variant === 'dissolve'
    ? 1 - easeOut(clamp((phase - 0.42) / 0.5))
    : easeOut(clamp(phase / 0.55));

  for (let iy = 0; iy < rows; iy += 1) {
    for (let ix = 0; ix < cols; ix += 1) {
      const delay = hash(ix * 13.3 + iy * 7.7) * 0.42;
      const local = clamp((progress - delay) / 0.58);
      const near = Math.hypot((ix + 0.5) * cellW - smooth.x, (iy + 0.5) * cellH - smooth.y) < 78 ? 1 : 0;
      const reveal = clamp(local + near * 0.2);
      if (reveal <= 0.01) continue;
      const col = accent(palette, Math.floor(ix / 4) + Math.floor(iy / 3));
      const alpha = 0.14 + reveal * 0.72;
      ctx.fillStyle = rgba(col, alpha);
      const gap = 1.5;
      const cw = Math.max(1, cellW - gap);
      const ch = Math.max(1, cellH - gap);
      roundRect(ctx, ix * cellW + gap / 2, iy * cellH + gap / 2, cw, ch, 1.5);
      ctx.fill();
      if (reveal > 0.7) {
        ctx.fillStyle = rgba(palette.bg, 0.18 * (reveal - 0.7));
        ctx.fillRect(ix * cellW + gap / 2, iy * cellH + gap / 2, cw, ch * 0.4);
      }
    }
  }

  // a soft centre mark once the mosaic has assembled
  if (progress > 0.85) {
    const a = (progress - 0.85) / 0.15;
    ctx.save();
    ctx.globalAlpha = a * 0.8;
    ctx.strokeStyle = palette.gold;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, Math.min(w, h) * 0.1, 0, TAU);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(w / 2, h / 2 - 10);
    ctx.lineTo(w / 2 + 9, h / 2 + 7);
    ctx.lineTo(w / 2 - 9, h / 2 + 7);
    ctx.closePath();
    ctx.fillStyle = palette.gold;
    ctx.fill();
    ctx.restore();
  }

  ctx.fillStyle = rgba(palette.textDim, 0.58);
  ctx.font = '8px ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.fillText(variant === 'dissolve' ? 'PIXEL REVEAL · dissolving' : 'PIXEL REVEAL · assembling', w / 2, h - 10);
}

/* ── Star Burst ─────────────────────────────────────────────────────────── */

interface BurstParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  col: string;
  rot: number;
  vr: number;
  size: number;
}

export function drawBurst(env: DrawEnv): void {
  const { ctx, w, h, palette, variant, pointer, now, dt } = env;
  const st = (env.state.burst ??= { ps: [] as BurstParticle[], last: 0, wasDown: false });
  if (pointer.down && !st.wasDown) {
    st.wasDown = true;
    spawnBurst(st.ps, pointer.x, pointer.y, palette, variant, 34);
  } else if (!pointer.down) {
    st.wasDown = false;
  }
  // A persistent star field (twinkling) so the card is never empty between
  // bursts, plus a longer, larger automatic burst.
  for (let i = 0; i < 16; i += 1) {
    const x = hash(i * 3.7) * w;
    const y = hash(i * 7.1) * h;
    const tw = 0.25 + 0.25 * Math.sin(env.t * 0.0018 + i * 1.7);
    ctx.fillStyle = rgba(variant === 'confetti' ? accent(palette, i) : palette.amberSoft, tw);
    drawStar(ctx, x, y, 1.4 + hash(i * 9.3) * 2.4, 4, hash(i) * TAU, 0.3);
    ctx.fill();
  }
  if (now - st.last > 1300) {
    st.last = now;
    spawnBurst(st.ps, w * (0.2 + hash(now * 0.001) * 0.6), h * (0.25 + hash(now * 0.002) * 0.4), palette, variant, 26);
  }

  for (let i = st.ps.length - 1; i >= 0; i -= 1) {
    const p = st.ps[i];
    p.life += dt;
    if (p.life > p.max) { st.ps.splice(i, 1); continue; }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.985;
    p.vy = p.vy * 0.985 + (variant === 'confetti' ? 0.00012 * dt : 0.00003 * dt);
    p.rot += p.vr * dt;
    const f = 1 - p.life / p.max;
    ctx.save();
    ctx.globalAlpha = Math.sin(f * Math.PI) * 0.9;
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.fillStyle = p.col;
    if (variant === 'confetti') {
      ctx.fillRect(-p.size, -p.size * 0.45, p.size * 2, p.size * 0.9);
    } else {
      drawStar(ctx, 0, 0, p.size * (0.7 + f * 0.8), 4, 0, 0.3);
      ctx.fill();
    }
    ctx.restore();
  }

  // a quiet core so the card is alive before the first burst
  const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.min(w, h) * 0.35);
  g.addColorStop(0, rgba(palette.gold, 0.06));
  g.addColorStop(1, rgba(palette.gold, 0));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = rgba(palette.textDim, 0.58);
  ctx.font = '8px ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.fillText('STAR BURST · click to celebrate', w / 2, h - 10);
}

function spawnBurst(ps: BurstParticle[], x: number, y: number, palette: DrawEnv['palette'], variant: string, count: number): void {
  for (let i = 0; i < count; i += 1) {
    const a = (i / count) * TAU + hash(i * 3.3) * 0.5;
    const speed = 0.05 + hash(i * 7.7) * 0.22;
    ps.push({
      x,
      y,
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed - 0.04,
      life: 0,
      max: 1500 + hash(i * 5.5) * 1200,
      col: accent(palette, i),
      rot: hash(i) * TAU,
      vr: (hash(i * 2.2) - 0.5) * 0.01,
      size: 1.5 + hash(i * 9.1) * 3.5,
    });
  }
}

/* ── Snow Fall ──────────────────────────────────────────────────────────── */

export function drawSnow(env: DrawEnv): void {
  const { ctx, w, h, palette, variant, dt } = env;
  const flakes = (env.state.snow ??= Array.from({ length: 120 }, (_, i) => ({
    x: hash(i * 3.1) * w,
    y: hash(i * 7.3) * h,
    z: 1 + Math.floor(hash(i * 5.7) * 3),
    sway: hash(i * 9.1) * TAU,
  })));
  const storm = variant === 'storm';
  for (const f of flakes) {
    const speed = (0.012 + f.z * 0.012) * (storm ? 2.3 : 1) * dt;
    f.y += speed;
    f.x += Math.sin(env.t * 0.001 + f.sway) * (storm ? 0.08 : 0.025) + (storm ? 0.06 : 0.01);
    if (f.y > h + 8) { f.y = -8; f.x = hash(f.x + env.t) * w; }
    if (f.x > w + 8) f.x = -8;
    if (f.x < -8) f.x = w + 8;
    const r = 0.6 + f.z * 0.7;
    ctx.fillStyle = rgba(f.z === 3 ? palette.gold : palette.text, 0.2 + f.z * 0.16);
    ctx.beginPath();
    ctx.arc(f.x, f.y, r, 0, TAU);
    ctx.fill();
    if (f.z === 3) {
      const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, r * 5);
      g.addColorStop(0, rgba(palette.cyan, 0.12));
      g.addColorStop(1, rgba(palette.cyan, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(f.x, f.y, r * 5, 0, TAU);
      ctx.fill();
    }
  }
  const g = ctx.createLinearGradient(0, h * 0.7, 0, h);
  g.addColorStop(0, rgba(palette.bg, 0));
  g.addColorStop(1, rgba(palette.bg, 0.35));
  ctx.fillStyle = g;
  ctx.fillRect(0, h * 0.7, w, h * 0.3);
}

/* ── Blinking Squares ───────────────────────────────────────────────────── */

export function drawBlink(env: DrawEnv): void {
  const { ctx, w, h, palette, t, variant } = env;
  const cols = 14;
  const rows = 8;
  const gap = 7;
  const cell = Math.min((w - gap * (cols + 1)) / cols, (h - gap * (rows + 1)) / rows);
  const ox = (w - (cell * cols + gap * (cols - 1))) / 2;
  const oy = (h - (cell * rows + gap * (rows - 1))) / 2;
  const scan = ((t * 0.00018) % 1) * cols;
  for (let iy = 0; iy < rows; iy += 1) {
    for (let ix = 0; ix < cols; ix += 1) {
      const n = hash(ix * 7.7 + iy * 3.3);
      let alpha: number;
      if (variant === 'scan') {
        const d = Math.abs(ix - scan);
        alpha = d < 2 ? 0.85 - d * 0.25 : 0.08 + n * 0.08;
      } else {
        alpha = 0.12 + 0.55 * (0.5 + 0.5 * Math.sin(t * 0.0013 + n * TAU));
      }
      const col = accent(palette, ix + iy);
      ctx.fillStyle = rgba(col, alpha);
      roundRect(ctx, ox + ix * (cell + gap), oy + iy * (cell + gap), cell, cell, 2);
      ctx.fill();
      if (variant === 'scan' && alpha > 0.45) {
        ctx.strokeStyle = rgba(palette.gold, 0.4);
        ctx.lineWidth = 0.8;
        roundRect(ctx, ox + ix * (cell + gap) + 1, oy + iy * (cell + gap) + 1, cell - 2, cell - 2, 2);
        ctx.stroke();
      }
    }
  }
}

/* ── Emoji Burst ────────────────────────────────────────────────────────── */

export function drawEmoji(env: DrawEnv): void {
  const { ctx, w, h, pointer, now, dt, variant } = env;
  const st = (env.state.emoji ??= { ps: [] as Array<{ x: number; y: number; vx: number; vy: number; life: number; max: number; ch: string; size: number; rot: number }>, wasDown: false, last: 0 });
  const chars = ['✨', '💫', '🌟', '⚡', '🔥', '♦'];
  if (pointer.down && !st.wasDown) {
    st.wasDown = true;
    for (let i = 0; i < 18; i += 1) {
      const a = (i / 18) * TAU;
      st.ps.push({ x: pointer.x, y: pointer.y, vx: Math.cos(a) * (0.08 + hash(i) * 0.15), vy: Math.sin(a) * (0.08 + hash(i) * 0.15) - 0.05, life: 0, max: 900 + hash(i * 3) * 700, ch: chars[i % chars.length], size: 13 + hash(i * 5) * 14, rot: hash(i) * TAU });
    }
  } else if (!pointer.down) st.wasDown = false;

  for (let i = st.ps.length - 1; i >= 0; i -= 1) {
    const p = st.ps[i];
    p.life += dt;
    if (p.life > p.max) { st.ps.splice(i, 1); continue; }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 0.00009 * dt;
    p.rot += 0.001 * dt;
    ctx.save();
    ctx.globalAlpha = Math.sin((1 - p.life / p.max) * Math.PI) * 0.95;
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.font = `${p.size}px ui-sans-serif, "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(p.ch, 0, 0);
    ctx.restore();
  }

  if (variant === 'float') {
    for (let i = 0; i < 7; i += 1) {
      const t = now * 0.0004 + i * 0.9;
      const x = w * (0.18 + 0.64 * (0.5 + 0.5 * Math.sin(t * 0.8 + i)));
      const y = h * (0.2 + 0.62 * (0.5 + 0.5 * Math.cos(t + i * 1.7)));
      ctx.save();
      ctx.globalAlpha = 0.35 + 0.3 * Math.sin(t * 1.3 + i);
      ctx.font = `${16 + (i % 3) * 5}px ui-sans-serif, "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(chars[i % chars.length], x, y);
      ctx.restore();
    }
  } else {
    // A quiet field so the card is never empty between bursts, plus a small
    // fountain every ~1.1s.
    for (let i = 0; i < 5; i += 1) {
      const ft = now * 0.0006 + i * 1.3;
      const x = w * (0.22 + 0.56 * (0.5 + 0.5 * Math.sin(ft * 0.9 + i)));
      const y = h * (0.22 + 0.56 * (0.5 + 0.5 * Math.cos(ft + i * 1.7)));
      ctx.save();
      ctx.globalAlpha = 0.28 + 0.18 * Math.sin(ft * 1.4 + i);
      ctx.font = `${14 + (i % 3) * 4}px ui-sans-serif, "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(chars[i % chars.length], x, y);
      ctx.restore();
    }
    if (now - st.last > 1100) {
      st.last = now;
      for (let i = 0; i < 3; i += 1) {
        const a = hash(now + i * 1.7) * TAU;
        st.ps.push({
          x: w / 2 + Math.cos(a) * 24,
          y: h / 2 + Math.sin(a) * 16,
          vx: Math.cos(a) * 0.13,
          vy: Math.sin(a) * 0.1 - 0.12,
          life: 0,
          max: 1100 + hash(now + i) * 600,
          ch: chars[Math.floor(hash(now * 2 + i) * chars.length)],
          size: 15 + hash(now + i * 3) * 9,
          rot: hash(now + i) * TAU,
        });
      }
    }
  }
}
