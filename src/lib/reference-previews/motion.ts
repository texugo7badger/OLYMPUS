/**
 * motion.ts — the interactive-element studies: Black Hole, Fluid Trail,
 * SVG Particles, Kinetic Grid and the cursor image trail. Original canvas
 * interpretations of the interactions, not copies of upstream source.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { accent, clamp, drawStar, easeOut, hash, lerp, rgba, roundRect, TAU, tile, type DrawEnv } from './common';

/* ── Black Hole ─────────────────────────────────────────────────────────── */

export function drawBlackHole(env: DrawEnv): void {
  const { ctx, w, h, dt, palette, smooth, variant } = env;
  const maxR = Math.min(w, h) * 0.52;
  const ps = (env.state.bh ??= Array.from({ length: 230 }, (_, i) => {
    const r = hash(i * 3.1);
    return {
      a: hash(i * 7.7) * TAU,
      r: 22 + Math.pow(r, 0.72) * maxR,
      spd: 0.22 + hash(i * 1.7) * 0.8,
      size: 0.6 + hash(i * 9.3) * 1.5,
      col: accent(palette, i),
      ph: hash(i * 2.3) * TAU,
    };
  }));
  const cx = w / 2 + (smooth.x - w / 2) * 0.22;
  const cy = h / 2 + (smooth.y - h / 2) * 0.22;
  const pulse = variant === 'pulse' ? 1 + 0.12 * Math.sin(env.t * 0.004) : 1;

  // accretion glow
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(1, 0.55);
  const glow = ctx.createRadialGradient(0, 0, maxR * 0.12, 0, 0, maxR * 1.05);
  glow.addColorStop(0, rgba(palette.gold, 0.16));
  glow.addColorStop(0.45, rgba(palette.purple, 0.08));
  glow.addColorStop(1, rgba(palette.gold, 0));
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, 0, maxR * 1.05, 0, TAU);
  ctx.fill();
  for (let i = 0; i < 5; i += 1) {
    ctx.strokeStyle = rgba(i % 2 ? palette.cyan : palette.gold, 0.07 + i * 0.012);
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.arc(0, 0, maxR * (0.38 + i * 0.13), 0, TAU);
    ctx.stroke();
  }
  ctx.restore();

  if (variant === 'warp') {
    for (let i = 0; i < 3; i += 1) {
      const rr = 40 + i * 34 + Math.sin(env.t * 0.002 + i) * 6;
      ctx.strokeStyle = rgba(i % 2 ? palette.cyan : palette.purple, 0.22 - i * 0.05);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(smooth.x, smooth.y, rr, rr * 0.5, i * 0.5 + env.t * 0.0003, 0, TAU);
      ctx.stroke();
    }
  }

  for (const p of ps) {
    p.a += p.spd * dt * 0.00055 * (1 + 70 / (p.r + 34));
    p.r -= dt * 0.009 * pulse;
    if (p.r < 16) {
      p.r = maxR * (0.82 + hash(p.ph + env.t * 0.0001) * 0.3);
      p.a = hash(p.a * 3.7) * TAU;
    }
    const x = cx + Math.cos(p.a) * p.r;
    const y = cy + Math.sin(p.a) * p.r * 0.55;
    const depth = (Math.sin(p.a) + 1) / 2;
    ctx.fillStyle = rgba(p.col, 0.20 + depth * 0.65);
    ctx.beginPath();
    ctx.arc(x, y, p.size * (0.7 + depth * 0.8), 0, TAU);
    ctx.fill();
  }

  // event horizon + photon ring
  const core = 20 * pulse;
  ctx.fillStyle = rgba(palette.bg, 0.92);
  ctx.beginPath();
  ctx.arc(cx, cy, core, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = rgba(palette.gold, 0.55);
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(cx, cy, core + 2, 0, TAU);
  ctx.stroke();
  const halo = ctx.createRadialGradient(cx, cy, core * 0.4, cx, cy, core * 2.6);
  halo.addColorStop(0, rgba(palette.gold, 0.18));
  halo.addColorStop(1, rgba(palette.gold, 0));
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(cx, cy, core * 2.6, 0, TAU);
  ctx.fill();
}

/* ── Fluid Trail ────────────────────────────────────────────────────────── */

export function drawFluid(env: DrawEnv): void {
  const { ctx, w, h, palette, smooth, variant } = env;
  const pts: Array<{ x: number; y: number }> = (env.state.fluid ??= []);
  const head = pts[pts.length - 1];
  if (!head || Math.hypot(smooth.x - head.x, smooth.y - head.y) > 1.1) {
    pts.push({ x: smooth.x, y: smooth.y });
    if (pts.length > 110) pts.shift();
  }
  const n = pts.length;
  if (n < 2) return;
  const colors = [palette.gold, palette.cyan, palette.purple, palette.amberSoft];
  const colorAt = (i: number) => colors[Math.min(colors.length - 1, Math.floor((i / Math.max(1, n - 1)) * colors.length))];

  if (variant === 'ink') {
    for (let i = 0; i < n; i += 2) {
      const f = i / n;
      const p = pts[i];
      const r = 1 + f * 7;
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 2.4);
      g.addColorStop(0, rgba(colorAt(i), 0.18 + f * 0.22));
      g.addColorStop(1, rgba(colorAt(i), 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r * 2.4, 0, TAU);
      ctx.fill();
    }
    return;
  }

  if (variant === 'comet') {
    const from = Math.max(0, n - 42);
    for (let i = from + 1; i < n; i += 1) {
      const f = (i - from) / (n - from);
      const p0 = pts[i - 1];
      const p1 = pts[i];
      ctx.strokeStyle = rgba(colorAt(i), 0.05 + f * 0.55);
      ctx.lineWidth = 1 + f * 7;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p1.x, p1.y);
      ctx.stroke();
    }
    const headPt = pts[n - 1];
    const g = ctx.createRadialGradient(headPt.x, headPt.y, 0, headPt.x, headPt.y, 26);
    g.addColorStop(0, rgba(palette.gold, 0.5));
    g.addColorStop(1, rgba(palette.gold, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(headPt.x, headPt.y, 26, 0, TAU);
    ctx.fill();
    for (let i = 0; i < 8; i += 1) {
      const a = hash(i + env.now * 0.00005) * TAU;
      const d = hash(i * 3.3) * 22;
      ctx.fillStyle = rgba(i % 2 ? palette.cyan : palette.amberSoft, 0.5);
      ctx.beginPath();
      ctx.arc(headPt.x + Math.cos(a) * d, headPt.y + Math.sin(a) * d, 0.9, 0, TAU);
      ctx.fill();
    }
    return;
  }

  // ribbon — three layered strokes for a soft, wide band
  for (let pass = 0; pass < 3; pass += 1) {
    for (let i = 1; i < n; i += 1) {
      const f = i / n;
      const p0 = pts[i - 1];
      const p1 = pts[i];
      const width = pass === 0 ? 2 + f * 22 : pass === 1 ? 1 + f * 9 : 1 + f * 3;
      const alpha = pass === 0 ? 0.05 + f * 0.08 : pass === 1 ? 0.10 + f * 0.22 : 0.25 + f * 0.55;
      ctx.strokeStyle = rgba(colorAt(i), alpha);
      ctx.lineWidth = width;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p1.x, p1.y);
      ctx.stroke();
    }
  }
  const hp = pts[n - 1];
  const g = ctx.createRadialGradient(hp.x, hp.y, 0, hp.x, hp.y, 20);
  g.addColorStop(0, rgba(palette.gold, 0.35));
  g.addColorStop(1, rgba(palette.gold, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(hp.x, hp.y, 20, 0, TAU);
  ctx.fill();
}

/* ── SVG Particles ──────────────────────────────────────────────────────── */

export function drawParticles(env: DrawEnv): void {
  const { ctx, w, h, palette, smooth, variant, dt } = env;
  const ps = (env.state.particles ??= Array.from({ length: 95 }, (_, i) => ({
    x: hash(i * 2.1) * w,
    y: hash(i * 5.3) * h,
    vx: (hash(i * 7.1) - 0.5) * 0.09,
    vy: (hash(i * 9.9) - 0.5) * 0.09,
    r: 0.9 + hash(i * 3.3) * 2.1,
    col: accent(palette, i),
  })));
  ctx.save();
  for (const p of ps) {
    if (variant === 'vortex') {
      const dx = p.x - w / 2;
      const dy = p.y - h / 2;
      const a = Math.atan2(dy, dx) + 0.0035 * dt;
      const d = Math.hypot(dx, dy) * 0.999;
      p.x = w / 2 + Math.cos(a) * d;
      p.y = h / 2 + Math.sin(a) * d * 0.9;
    } else {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.x < -4) p.x = w + 4;
      if (p.x > w + 4) p.x = -4;
      if (p.y < -4) p.y = h + 4;
      if (p.y > h + 4) p.y = -4;
    }
    const dx = p.x - smooth.x;
    const dy = p.y - smooth.y;
    const d = Math.hypot(dx, dy) || 1;
    if (d < 96) {
      const force = (1 - d / 96) * (variant === 'constellation' ? 0.9 : 1.8);
      p.x += (dx / d) * force;
      p.y += (dy / d) * force;
    }
  }

  if (variant === 'constellation') {
    for (let i = 0; i < ps.length; i += 1) {
      for (let j = i + 1; j < ps.length; j += 1) {
        const a = ps[i];
        const b = ps[j];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d < 62) {
          ctx.strokeStyle = rgba(palette.cyan, (1 - d / 62) * 0.18);
          ctx.lineWidth = 0.6;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
    }
  }

  for (const p of ps) {
    const dx = p.x - smooth.x;
    const dy = p.y - smooth.y;
    const d = Math.hypot(dx, dy);
    const near = d < 120 ? 1 - d / 120 : 0;
    const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * (3 + near * 3));
    g.addColorStop(0, rgba(p.col, 0.35 + near * 0.45));
    g.addColorStop(1, rgba(p.col, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r * (3 + near * 3), 0, TAU);
    ctx.fill();
    ctx.fillStyle = rgba(p.col, 0.65 + near * 0.3);
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r * (0.8 + near * 0.5), 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

/* ── Kinetic Grid ───────────────────────────────────────────────────────── */

export function drawGrid(env: DrawEnv): void {
  const { ctx, w, h, palette, smooth, variant, t, pointer } = env;
  const gap = Math.max(22, Math.min(w, h) / 11);
  const cols = Math.ceil(w / gap) + 2;
  const rows = Math.ceil(h / gap) + 2;
  const pts: Array<Array<{ x: number; y: number; force: number; d: number }>> = [];
  for (let iy = 0; iy < rows; iy += 1) {
    const row: Array<{ x: number; y: number; force: number; d: number }> = [];
    for (let ix = 0; ix < cols; ix += 1) {
      const bx = (ix - 0.5) * gap;
      const by = (iy - 0.5) * gap;
      const dx = bx - smooth.x;
      const dy = by - smooth.y;
      const d = Math.hypot(dx, dy) || 1;
      const force = Math.exp(-(d * d) / (2 * 82 * 82));
      let x = bx;
      let y = by;
      if (variant === 'ripple') {
        const wave = Math.sin(d * 0.055 - t * 0.004) * 12 * force;
        x += (dx / d) * wave;
        y += (dy / d) * wave;
      } else if (variant === 'magnetic') {
        x -= (dx / d) * force * 28;
        y -= (dy / d) * force * 28;
      } else {
        y += Math.sin(bx * 0.024 + t * 0.0022) * 6 + Math.sin(by * 0.03 + t * 0.0017) * 3;
      }
      row.push({ x, y, force, d });
    }
    pts.push(row);
  }

  // The wires make it read as a GRID, not a field of dots.
  ctx.lineWidth = 0.7;
  for (let iy = 0; iy < rows; iy += 1) {
    for (let ix = 0; ix < cols - 1; ix += 1) {
      const a = pts[iy][ix];
      const b = pts[iy][ix + 1];
      const f = Math.max(a.force, b.force);
      ctx.strokeStyle = rgba(f > 0.3 ? palette.gold : palette.textDim, 0.05 + f * 0.22);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  }
  for (let ix = 0; ix < cols; ix += 1) {
    for (let iy = 0; iy < rows - 1; iy += 1) {
      const a = pts[iy][ix];
      const b = pts[iy + 1][ix];
      const f = Math.max(a.force, b.force);
      ctx.strokeStyle = rgba(f > 0.3 ? palette.gold : palette.textDim, 0.04 + f * 0.18);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  }

  for (const row of pts) {
    for (const p of row) {
      const near = p.d < 150 ? 1 - p.d / 150 : 0;
      const r = 1.2 + p.force * 2.2;
      ctx.fillStyle = rgba(p.force > 0.28 ? palette.gold : palette.textDim, 0.26 + p.force * 0.65 + near * 0.12);
      ctx.fillRect(p.x - r / 2, p.y - r / 2, r, r);
    }
  }
  if (pointer.down || variant === 'magnetic') {
    ctx.strokeStyle = rgba(palette.gold, 0.28);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(smooth.x, smooth.y, 46, 0, TAU);
    ctx.stroke();
  }
}

/* ── Cursor image trail ─────────────────────────────────────────────────── */

export function drawTrail(env: DrawEnv): void {
  const { ctx, palette, smooth, variant, now } = env;
  const stamps: Array<{ x: number; y: number; born: number; rot: number; col: string; glyph: number; kind: string }> = (env.state.trail ??= []);
  const last = stamps[stamps.length - 1];
  if (!last || Math.hypot(smooth.x - last.x, smooth.y - last.y) > 26) {
    stamps.push({
      x: smooth.x,
      y: smooth.y,
      born: now,
      rot: hash(now * 0.01) * 0.7 - 0.35,
      col: accent(palette, stamps.length),
      glyph: Math.floor(hash(stamps.length * 5.1) * 4),
      kind: variant === 'sparkles' ? 'star' : 'tile',
    });
    if (stamps.length > 18) stamps.shift();
  }
  for (let i = stamps.length - 1; i >= 0; i -= 1) {
    const s = stamps[i];
    const age = (now - s.born) / 1700;
    if (age >= 1) { stamps.splice(i, 1); continue; }
    const alpha = (1 - age) * (0.35 + (i / stamps.length) * 0.55);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(s.x, s.y);
    ctx.rotate(s.rot + (1 - age) * 0.3);
    if (s.kind === 'star') {
      ctx.fillStyle = s.col;
      drawStar(ctx, 0, 0, 4 + (1 - age) * 12, 4, 0, 0.28);
      ctx.fill();
    } else {
      const size = 34 + (1 - age) * 26;
      tile(ctx, -size / 2, -size * 0.6, size, size * 1.2, 6, rgba(s.col, 0.9), rgba(palette.bg, 0.25), 1);
      ctx.fillStyle = rgba(palette.bg, 0.8);
      if (s.glyph === 0) { ctx.beginPath(); ctx.arc(0, 0, size * 0.16, 0, TAU); ctx.fill(); }
      else if (s.glyph === 1) { ctx.beginPath(); ctx.moveTo(0, -size * 0.18); ctx.lineTo(size * 0.18, size * 0.16); ctx.lineTo(-size * 0.18, size * 0.16); ctx.closePath(); ctx.fill(); }
      else if (s.glyph === 2) { ctx.fillRect(-size * 0.2, -2, size * 0.4, 4); }
      else { ctx.lineWidth = 2; ctx.strokeStyle = rgba(palette.bg, 0.7); ctx.strokeRect(-size * 0.17, -size * 0.17, size * 0.34, size * 0.34); }
    }
    ctx.restore();
  }
  // head glow
  const g = ctx.createRadialGradient(smooth.x, smooth.y, 0, smooth.x, smooth.y, 30);
  g.addColorStop(0, rgba(palette.gold, 0.22));
  g.addColorStop(1, rgba(palette.gold, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(smooth.x, smooth.y, 30, 0, TAU);
  ctx.fill();
}
