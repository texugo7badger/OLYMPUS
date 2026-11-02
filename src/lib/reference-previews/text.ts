/**
 * text.ts — typographic studies: Smoky Text, Text Morph, Scramble Text and
 * Weight Hover. All text is drawn in the theme ink/accent, sized to fit.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { clamp, easeOut, fitText, hash, rgba, TAU, type DrawEnv } from './common';

/* ── Smoky Text ─────────────────────────────────────────────────────────── */

export function drawSmoke(env: DrawEnv): void {
  const { ctx, w, h, palette, variant, dt, now } = env;
  const text = env.label.toUpperCase();
  const size = fitText(ctx, text, w * 0.82, Math.min(34, w / 7.5), 700);
  const y = h * 0.56;
  const parts: Array<{ x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; col: string; }> = (env.state.smoke ??= []);
  if (parts.length < 130) {
    const span = ctx.measureText(text).width;
    for (let s = 0; s < 2; s += 1) {
      const life = 900 + hash(now * 0.01 + s) * 600;
      parts.push({
        x: w / 2 + (hash(now * 0.003 + s * 7.1) - 0.5) * span,
        y: y - size * 0.25 + hash(now * 0.005 + s * 3.7) * size * 0.5,
        vx: (hash(now * 0.004 + s * 11.3) - 0.5) * 0.035,
        vy: -0.05 - hash(now * 0.006 + s * 2.9) * 0.08,
        life: 0,
        max: life,
        size: 2 + hash(now * 0.007 + s) * 7,
        col: variant === 'aurora' ? (s % 2 ? palette.cyan : palette.purple) : variant === 'ink' ? palette.text : (s % 2 ? palette.gold : palette.textDim),
      });
    }
  }
  for (let i = parts.length - 1; i >= 0; i -= 1) {
    const p = parts[i];
    p.life += dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy -= 0.00003 * dt;
    if (p.life > p.max) { parts.splice(i, 1); continue; }
    const f = p.life / p.max;
    const alpha = Math.sin(f * Math.PI) * 0.22;
    const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * (2 + f * 2));
    g.addColorStop(0, rgba(p.col, alpha));
    g.addColorStop(1, rgba(p.col, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * (2 + f * 2), 0, TAU);
    ctx.fill();
  }

  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 ${size}px ui-sans-serif, system-ui, sans-serif`;
  const grad = ctx.createLinearGradient(w * 0.2, 0, w * 0.8, 0);
  grad.addColorStop(0, palette.text);
  grad.addColorStop(0.55, palette.gold);
  grad.addColorStop(1, palette.textDim);
  ctx.fillStyle = grad;
  ctx.globalAlpha = 0.9;
  ctx.fillText(text, w / 2, y);
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = palette.gold;
  ctx.fillRect(w * 0.22, y + size * 0.72, w * 0.56, 1);
  ctx.restore();
}

/* ── Text Morph ─────────────────────────────────────────────────────────── */

export function drawMorph(env: DrawEnv): void {
  const { ctx, w, h, palette, t, variant } = env;
  const base = env.label.toUpperCase();
  const words = [base, 'BECOME', 'ALIVE', 'OLYMPUS'];
  const cycle = 2800;
  const step = Math.floor(t / cycle);
  const phase = (t % cycle) / cycle;
  const current = words[step % words.length];
  const next = words[(step + 1) % words.length];
  const size = fitText(ctx, base, w * 0.8, Math.min(36, w / 8), 700);
  let progress = 0;
  if (phase > 0.7) progress = (phase - 0.7) / 0.3;
  const e = easeOut(progress);

  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 ${size}px ui-sans-serif, system-ui, sans-serif`;

  const drawWord = (word: string, alpha: number, scale: number, dy: number, color: string) => {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(w / 2, h / 2 + dy);
    ctx.scale(scale, scale);
    if (variant === 'split') {
      ctx.globalAlpha = alpha * 0.4;
      ctx.fillStyle = palette.cyan;
      ctx.fillText(word, -2.5, 0);
      ctx.fillStyle = palette.red;
      ctx.fillText(word, 2.5, 0);
      ctx.globalAlpha = alpha;
    }
    ctx.fillStyle = color;
    ctx.fillText(word, 0, 0);
    ctx.restore();
  };

  if (progress > 0) drawWord(current, 1 - e, 1 + e * 0.08, -e * 12, palette.text);
  drawWord(progress > 0 ? next : current, progress > 0 ? e : 1, 0.92 + (1 - e) * 0.08, progress > 0 ? (1 - e) * 16 : 0, progress > 0 ? palette.gold : palette.gold);
  ctx.restore();

  ctx.fillStyle = rgba(palette.textDim, 0.6);
  ctx.font = '8px ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.fillText('TEXT MORPH · one word flows into the next', w / 2, h - 12);
}

/* ── Scramble Text ──────────────────────────────────────────────────────── */

export function drawScramble(env: DrawEnv): void {
  const { ctx, w, h, palette, t, variant } = env;
  const target = env.label.toUpperCase();
  const size = fitText(ctx, target, w * 0.82, Math.min(28, w / 9), 700, 'ui-monospace, SFMono-Regular, monospace');
  const y = h * 0.5;
  const cycle = 2600;
  const phase = (t % cycle) / cycle;
  const reveal = phase < 0.55 ? easeOut(phase / 0.55) : 1;
  const chars = '!<>-_\\/[]{}—=+*^?#$%&';
  const settleAt = Math.floor(reveal * target.length);

  if (variant === 'rain') {
    ctx.font = `${Math.max(9, size * 0.42)}px ui-monospace, monospace`;
    ctx.textAlign = 'center';
    const cols = Math.max(8, Math.floor(w / 18));
    for (let i = 0; i < cols; i += 1) {
      const speed = 0.4 + hash(i * 3.3) * 0.9;
      const baseY = (t * 0.03 * speed + hash(i * 7.7) * h * 2) % (h + 40) - 20;
      for (let k = 0; k < 7; k += 1) {
        const c = chars[Math.floor(hash(i * 11 + k + Math.floor(t / 90)) * chars.length)];
        ctx.fillStyle = rgba(k === 0 ? palette.cyan : palette.green, 0.35 - k * 0.045);
        ctx.fillText(c, 10 + i * 18, baseY - k * 13);
      }
    }
  }

  ctx.save();
  ctx.font = `700 ${size}px ui-monospace, SFMono-Regular, monospace`;
  ctx.textBaseline = 'middle';
  const widths = Array.from(target).map((ch) => ctx.measureText(ch).width);
  const total = widths.reduce((a, b) => a + b, 0);
  let x = w / 2 - total / 2;
  for (let i = 0; i < target.length; i += 1) {
    const settled = i < settleAt;
    const ch = settled ? target[i] : chars[Math.floor(hash(i * 13.7 + Math.floor(t / 55)) * chars.length)];
    ctx.fillStyle = settled ? palette.text : rgba(i % 2 ? palette.purple : palette.cyan, 0.55 + 0.35 * hash(i + Math.floor(t / 55)));
    ctx.fillText(ch, x + widths[i] / 2, y);
    x += widths[i];
  }
  ctx.restore();

  ctx.fillStyle = rgba(palette.textDim, 0.55);
  ctx.font = '8px ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.fillText(reveal < 1 ? 'SCRAMBLE · decoding…' : 'SCRAMBLE · settled', w / 2, h - 12);
}

/* ── Weight Hover ───────────────────────────────────────────────────────── */

export function drawWeight(env: DrawEnv): void {
  const { ctx, w, h, palette, smooth, variant, t } = env;
  const text = env.label.toUpperCase();
  const size = fitText(ctx, text, w * 0.84, Math.min(32, w / 7.5), 700);
  const cx = w / 2;
  const cy = h / 2;
  const d = Math.hypot(smooth.x - cx, smooth.y - cy);
  const prox = clamp(1 - d / (Math.min(w, h) * 0.7));
  const breathe = 0.5 + 0.5 * Math.sin(t * 0.0016);
  const weight = variant === 'breathe' ? breathe : prox;
  const scaleX = 1 + (variant === 'stretch' ? (smooth.x - cx) / w * 0.18 : 0) + weight * 0.05;
  const stroke = 0.3 + weight * 2.6;

  // faint guide ring follows the pointer
  ctx.strokeStyle = rgba(palette.gold, 0.12 + weight * 0.2);
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.arc(smooth.x, smooth.y, 24 + weight * 18, 0, TAU);
  ctx.stroke();

  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scaleX, 1);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 ${size}px ui-sans-serif, system-ui, sans-serif`;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = rgba(palette.gold, 0.55);
  ctx.lineWidth = stroke;
  ctx.strokeText(text, 0, 0);
  ctx.fillStyle = palette.text;
  ctx.fillText(text, 0, 0);
  ctx.restore();

  const barW = w * 0.4;
  const bx = cx - barW / 2;
  const by = cy + size * 0.9;
  ctx.fillStyle = rgba(palette.textDim, 0.2);
  ctx.fillRect(bx, by, barW, 2);
  ctx.fillStyle = palette.gold;
  ctx.fillRect(bx, by, barW * weight, 2);
  ctx.fillStyle = rgba(palette.textDim, 0.6);
  ctx.font = '8px ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.fillText(`WEIGHT HOVER · ${Math.round(300 + weight * 600)}`, cx, by + 12);
}
