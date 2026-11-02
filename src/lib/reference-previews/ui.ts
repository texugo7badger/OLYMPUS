/**
 * ui.ts — interface studies: Link Preview, Image Reveal, Dynamic Island,
 * Hover Members, Vercel Tooltip and Token Swap. These draw real little
 * controls with hover/click states, so the reference card is useful before
 * the user ever opens the upstream demo.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { accent, clamp, easeOut, hash, rgba, roundRect, TAU, tile, type DrawEnv } from './common';

/* ── Link Preview ───────────────────────────────────────────────────────── */

export function drawLink(env: DrawEnv): void {
  const { ctx, w, h, palette, smooth, variant, now } = env;
  const st = (env.state.link ??= { hover: 0 });
  const linkW = Math.min(220, w * 0.55);
  const linkH = 30;
  const lx = w / 2 - linkW / 2;
  const ly = h * 0.66;
  const over = smooth.x > lx - 12 && smooth.x < lx + linkW + 12 && smooth.y > ly - 16 && smooth.y < ly + linkH + 16;
  const auto = Math.sin(now * 0.0009) > 0.82 ? 1 : 0;
  const target = over || auto ? 1 : 0;
  st.hover += (target - st.hover) * 0.12;
  const e = easeOut(st.hover);

  // link pill
  ctx.fillStyle = rgba(palette.gold, 0.1 + e * 0.1);
  roundRect(ctx, lx, ly, linkW, linkH, 8);
  ctx.fill();
  ctx.strokeStyle = rgba(palette.gold, 0.3 + e * 0.3);
  ctx.lineWidth = 1;
  roundRect(ctx, lx + 0.5, ly + 0.5, linkW - 1, linkH - 1, 8);
  ctx.stroke();
  ctx.fillStyle = e > 0.4 ? palette.gold : palette.text;
  ctx.font = '10px ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('open the reference  ↗', w / 2, ly + linkH / 2);
  ctx.strokeStyle = rgba(palette.gold, 0.55 * e);
  ctx.beginPath();
  ctx.moveTo(w / 2 - 64, ly + linkH - 8);
  ctx.lineTo(w / 2 + 64, ly + linkH - 8);
  ctx.stroke();

  // preview card
  if (e > 0.01) {
    const cardW = Math.min(230, w * 0.62);
    const cardH = 104;
    const cx = w / 2 - cardW / 2;
    const cy = ly - cardH - 12 + (1 - e) * 14;
    ctx.save();
    ctx.globalAlpha = e;
    if (variant === 'stack') {
      for (let i = 2; i >= 1; i -= 1) {
        ctx.fillStyle = rgba(palette.card, 0.7);
        ctx.strokeStyle = rgba(palette.gold, 0.12);
        roundRect(ctx, cx + i * 7, cy - i * 6, cardW, cardH, 9);
        ctx.fill();
        ctx.stroke();
      }
    }
    tile(ctx, cx, cy, cardW, cardH, 9, rgba(palette.panel, 0.98), rgba(palette.card, 0.98));
    // thumbnail
    tile(ctx, cx + 8, cy + 8, cardW * 0.36, cardH - 16, 6, palette.purple, rgba(palette.cyan, 0.6));
    ctx.fillStyle = rgba(palette.bg, 0.6);
    ctx.beginPath();
    ctx.arc(cx + 8 + cardW * 0.18, cy + cardH * 0.44, 14, 0, TAU);
    ctx.fill();
    // text bars
    ctx.fillStyle = rgba(palette.text, 0.75);
    roundRect(ctx, cx + cardW * 0.44, cy + 18, cardW * 0.42, 5, 2);
    ctx.fill();
    ctx.fillStyle = rgba(palette.textDim, 0.5);
    roundRect(ctx, cx + cardW * 0.44, cy + 31, cardW * 0.48, 3, 1.5);
    ctx.fill();
    roundRect(ctx, cx + cardW * 0.44, cy + 39, cardW * 0.36, 3, 1.5);
    ctx.fill();
    ctx.fillStyle = rgba(palette.gold, 0.7);
    roundRect(ctx, cx + cardW * 0.44, cy + 56, cardW * 0.24, 14, 4);
    ctx.fill();
    ctx.strokeStyle = rgba(palette.gold, 0.25);
    roundRect(ctx, cx + 0.5, cy + 0.5, cardW - 1, cardH - 1, 9);
    ctx.stroke();
    ctx.restore();
  }
}

/* ── Image Reveal ───────────────────────────────────────────────────────── */

function landscape(ctx: CanvasRenderingContext2D, w: number, h: number, palette: DrawEnv['palette'], bright: number): void {
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, rgba(palette.purple, 0.35 * bright));
  sky.addColorStop(0.55, rgba(palette.cyan, 0.25 * bright));
  sky.addColorStop(1, rgba(palette.gold, 0.3 * bright));
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  // sun
  const sx = w * 0.72;
  const sy = h * 0.34;
  const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, h * 0.18);
  glow.addColorStop(0, rgba(palette.amberSoft, 0.55 * bright));
  glow.addColorStop(0.45, rgba(palette.gold, 0.16 * bright));
  glow.addColorStop(1, rgba(palette.gold, 0));
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(sx, sy, h * 0.18, 0, TAU);
  ctx.fill();
  ctx.fillStyle = rgba(palette.amberSoft, 0.8 * bright);
  ctx.beginPath();
  ctx.arc(sx, sy, h * 0.055, 0, TAU);
  ctx.fill();

  // hills
  ctx.fillStyle = rgba(palette.green, 0.55 * bright);
  ctx.beginPath();
  ctx.moveTo(0, h * 0.75);
  ctx.bezierCurveTo(w * 0.25, h * 0.55, w * 0.45, h * 0.68, w * 0.62, h * 0.72);
  ctx.bezierCurveTo(w * 0.8, h * 0.76, w * 0.9, h * 0.66, w, h * 0.7);
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = rgba(palette.blue, 0.5 * bright);
  ctx.beginPath();
  ctx.moveTo(0, h * 0.84);
  ctx.bezierCurveTo(w * 0.3, h * 0.74, w * 0.55, h * 0.9, w * 0.75, h * 0.82);
  ctx.bezierCurveTo(w * 0.88, h * 0.77, w * 0.96, h * 0.8, w, h * 0.8);
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  ctx.fill();

  // tree — a readable silhouette, not a giant blob
  const tx = w * 0.28;
  const ty = h * 0.8;
  ctx.strokeStyle = rgba(palette.text, 0.7 * bright);
  ctx.lineWidth = Math.max(2, w * 0.007);
  ctx.beginPath();
  ctx.moveTo(tx, ty);
  ctx.lineTo(tx - w * 0.01, ty - h * 0.2);
  ctx.lineTo(tx + w * 0.03, ty - h * 0.26);
  ctx.stroke();
  for (let i = 0; i < 5; i += 1) {
    ctx.fillStyle = rgba(i % 2 ? palette.green : palette.teal, (0.55 - i * 0.04) * bright);
    ctx.beginPath();
    ctx.arc(tx + (hash(i * 3.3) - 0.5) * w * 0.09, ty - h * 0.26 - i * h * 0.014, w * 0.04, 0, TAU);
    ctx.fill();
  }
  // photographic grain
  if (bright > 0.9) {
    for (let i = 0; i < 90; i += 1) {
      ctx.fillStyle = rgba(palette.text, 0.04 + hash(i) * 0.04);
      ctx.fillRect(hash(i * 2.1) * w, hash(i * 5.3) * h, 1, 1);
    }
  }
}

export function drawReveal(env: DrawEnv): void {
  const { ctx, w, h, palette, smooth, variant, t } = env;
  const pad = 9;
  const fw = w - pad * 2;
  const fh = h - pad * 2;
  const radius = 72 + Math.sin(t * 0.0012) * 6;
  const band = Math.max(96, w * 0.2);

  // The photo frame (this is an image reveal, not a floating circle).
  ctx.save();
  roundRect(ctx, pad, pad, fw, fh, 7);
  ctx.clip();
  landscape(ctx, w, h, palette, 0.52);
  // bright layer, clipped to the moving reveal
  ctx.save();
  ctx.beginPath();
  if (variant === 'curtain') {
    ctx.rect(smooth.x - band / 2, 0, band, h);
  } else {
    ctx.arc(smooth.x, smooth.y, radius, 0, TAU);
  }
  ctx.clip();
  landscape(ctx, w, h, palette, 1);
  ctx.restore();
  // a subtle vignette inside the photo
  const v = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.7);
  v.addColorStop(0, rgba(palette.bg, 0));
  v.addColorStop(1, rgba(palette.bg, 0.32));
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();

  // frame + reveal edge
  ctx.strokeStyle = rgba(palette.gold, 0.3);
  ctx.lineWidth = 1;
  roundRect(ctx, pad + 0.5, pad + 0.5, fw - 1, fh - 1, 7);
  ctx.stroke();
  if (variant === 'spotlight') {
    ctx.strokeStyle = rgba(palette.gold, 0.55);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(smooth.x, smooth.y, radius, 0, TAU);
    ctx.stroke();
  } else {
    ctx.strokeStyle = rgba(palette.gold, 0.35);
    ctx.beginPath();
    ctx.moveTo(smooth.x - band / 2, pad);
    ctx.lineTo(smooth.x - band / 2, h - pad);
    ctx.moveTo(smooth.x + band / 2, pad);
    ctx.lineTo(smooth.x + band / 2, h - pad);
    ctx.stroke();
  }
  // label chip inside the photo
  ctx.fillStyle = rgba(palette.bg, 0.55);
  roundRect(ctx, pad + 6, pad + 6, 108, 15, 4);
  ctx.fill();
  ctx.fillStyle = rgba(palette.text, 0.8);
  ctx.font = '7px ui-monospace, monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('IMAGE REVEAL · spotlight', pad + 12, pad + 14);
}

/* ── Dynamic Island ─────────────────────────────────────────────────────── */

export function drawIsland(env: DrawEnv): void {
  const { ctx, w, h, palette, smooth, variant, t, pointer } = env;
  const st = (env.state.island ??= { open: false, anim: 0, wasDown: false });
  const pillW = Math.min(250, w * 0.66);
  const pillH = 44;
  const x = w / 2 - pillW / 2;
  const y = h * 0.18;
  const near = smooth.x > x - 20 && smooth.x < x + pillW + 20 && smooth.y > y - 20 && smooth.y < y + pillH + 30;
  const auto = variant === 'notify' ? 1 : Math.sin(t * 0.0011) > 0.72 ? 1 : 0;
  const want = st.open || near || auto ? 1 : 0;
  st.anim += (want - st.anim) * 0.12;
  const e = easeOut(st.anim);
  const openH = pillH + e * 38;
  if (pointer.down && !st.wasDown && near) { st.open = !st.open; st.wasDown = true; }
  if (!pointer.down) st.wasDown = false;

  // shadow
  ctx.fillStyle = rgba(palette.bg, 0.35);
  roundRect(ctx, x + 2, y + 5, pillW, openH, openH / 2);
  ctx.fill();
  // pill
  ctx.fillStyle = rgba(palette.bg, 0.96);
  roundRect(ctx, x, y, pillW, openH, Math.min(24, openH / 2));
  ctx.fill();
  ctx.strokeStyle = rgba(palette.gold, 0.22);
  ctx.lineWidth = 1;
  roundRect(ctx, x + 0.5, y + 0.5, pillW - 1, openH - 1, Math.min(24, openH / 2));
  ctx.stroke();

  // left icon
  const ix = x + 24;
  const iy = y + pillH / 2;
  const iconG = ctx.createLinearGradient(ix - 12, iy - 12, ix + 12, iy + 12);
  iconG.addColorStop(0, palette.gold);
  iconG.addColorStop(1, palette.purple);
  ctx.fillStyle = iconG;
  ctx.beginPath();
  ctx.arc(ix, iy, 11, 0, TAU);
  ctx.fill();
  ctx.fillStyle = palette.bg;
  ctx.beginPath();
  ctx.arc(ix, iy, 4.5, 0, TAU);
  ctx.fill();

  // title + sub
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = palette.text;
  ctx.font = '600 10px ui-monospace, monospace';
  ctx.fillText(variant === 'notify' ? 'Athena' : 'OLYMPUS', ix + 20, iy - 5);
  ctx.fillStyle = rgba(palette.textDim, 0.85);
  ctx.font = '8px ui-monospace, monospace';
  ctx.fillText(variant === 'notify' ? 'design task ready' : 'the island is alive', ix + 20, iy + 7);

  // right indicator
  ctx.fillStyle = variant === 'notify' ? palette.green : palette.gold;
  ctx.beginPath();
  ctx.arc(x + pillW - 22, iy, 3.4, 0, TAU);
  ctx.fill();

  if (e > 0.05) {
    ctx.globalAlpha = e;
    ctx.fillStyle = rgba(palette.textDim, 0.8);
    ctx.font = '8px ui-monospace, monospace';
    ctx.textAlign = 'left';
    ctx.fillText(variant === 'notify' ? 'open the task · 2m ago' : 'expand · tap the island', ix + 20, y + pillH + 12);
    const barW = pillW - 48;
    ctx.fillStyle = rgba(palette.textDim, 0.2);
    roundRect(ctx, ix + 20, y + pillH + 22, barW, 3, 2);
    ctx.fill();
    ctx.fillStyle = rgba(variant === 'notify' ? palette.green : palette.gold, 0.8);
    roundRect(ctx, ix + 20, y + pillH + 22, barW * (0.35 + 0.3 * Math.sin(t * 0.001)), 3, 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

/* ── Hover Members ──────────────────────────────────────────────────────── */

export function drawMembers(env: DrawEnv): void {
  const { ctx, w, h, palette, smooth, variant } = env;
  const people = [
    { initials: 'AP', name: 'Apollo', role: 'planner', col: palette.gold },
    { initials: 'AT', name: 'Athena', role: 'frontend', col: palette.blue },
    { initials: 'HE', name: 'Hermes', role: 'integrations', col: palette.cyan },
    { initials: 'HF', name: 'Hephaestus', role: 'backend', col: palette.red },
  ];
  let hover = -1;
  if (variant === 'grid') {
    const cw = Math.min(122, (w - 48) / 2);
    const ch = Math.min(62, (h - 54) / 2);
    const ox = (w - (cw * 2 + 12)) / 2;
    const oy = (h - (ch * 2 + 12)) / 2;
    people.forEach((p, i) => {
      const x = ox + (i % 2) * (cw + 12);
      const y = oy + Math.floor(i / 2) * (ch + 12);
      const over = smooth.x > x && smooth.x < x + cw && smooth.y > y && smooth.y < y + ch;
      if (over) hover = i;
      tile(ctx, x, y, cw, ch, 9, rgba(palette.card, 0.95), rgba(palette.panel, 0.95), 1);
      ctx.fillStyle = rgba(p.col, 0.9);
      ctx.beginPath();
      ctx.arc(x + 26, y + ch / 2, 15, 0, TAU);
      ctx.fill();
      ctx.fillStyle = palette.bg;
      ctx.font = '700 9px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(p.initials, x + 26, y + ch / 2);
      ctx.fillStyle = palette.text;
      ctx.font = '600 9px ui-monospace, monospace';
      ctx.textAlign = 'left';
      ctx.fillText(p.name, x + 48, y + ch / 2 - 6);
      ctx.fillStyle = rgba(palette.textDim, 0.75);
      ctx.font = '8px ui-monospace, monospace';
      ctx.fillText(p.role, x + 48, y + ch / 2 + 7);
      if (over) {
        ctx.strokeStyle = rgba(p.col, 0.5);
        ctx.lineWidth = 1;
        roundRect(ctx, x + 0.5, y + 0.5, cw - 1, ch - 1, 9);
        ctx.stroke();
      }
    });
    return;
  }

  const cy = h * 0.48;
  const baseX = w / 2;
  for (let i = 0; i < people.length; i += 1) {
    const p = people[i];
    if (Math.hypot(smooth.x - (baseX + (i - 1.5) * 46), smooth.y - cy) < 30) hover = i;
  }
  const offsetFor = (i: number) => {
    if (hover < 0) return (i - 1.5) * 46;
    const dir = i < hover ? -1 : i > hover ? 1 : 0;
    return (i - 1.5) * 46 + dir * 12;
  };
  for (let i = people.length - 1; i >= 0; i -= 1) {
    const p = people[i];
    const x = baseX + offsetFor(i);
    const r = i === hover ? 26 : 22;
    const g = ctx.createRadialGradient(x - 6, cy - 8, 2, x, cy, r);
    g.addColorStop(0, rgba(p.col, 0.95));
    g.addColorStop(1, rgba(p.col, 0.35));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, cy, r, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = rgba(palette.bg, 0.85);
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = palette.bg;
    ctx.font = '700 10px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(p.initials, x, cy);
  }
  if (hover >= 0) {
    const p = people[hover];
    const cardW = 132;
    const cardX = w / 2 - cardW / 2;
    const cardY = cy + 46;
    tile(ctx, cardX, cardY, cardW, 34, 7, rgba(palette.card, 0.98), rgba(palette.panel, 0.98), 1);
    ctx.fillStyle = palette.text;
    ctx.font = '600 9px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(p.name, w / 2, cardY + 12);
    ctx.fillStyle = rgba(palette.textDim, 0.8);
    ctx.font = '8px ui-monospace, monospace';
    ctx.fillText(p.role, w / 2, cardY + 24);
  }
  ctx.fillStyle = rgba(palette.textDim, 0.55);
  ctx.font = '8px ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.fillText('HOVER MEMBERS · meet the team', w / 2, h - 10);
}

/* ── Vercel Tooltip ─────────────────────────────────────────────────────── */

export function drawTooltip(env: DrawEnv): void {
  const { ctx, w, h, palette, smooth, variant, t } = env;
  const st = (env.state.tip ??= { hover: 0 });
  const bw = 92;
  const bh = 28;
  const bx = w / 2 - bw / 2;
  const by = h * 0.62;
  const near = smooth.x > bx - 16 && smooth.x < bx + bw + 16 && smooth.y > by - 26 && smooth.y < by + bh + 16;
  // Visible most of the time: the card must communicate the tooltip at a
  // glance, not wait for a rare sine peak.
  const auto = Math.sin(t * 0.0007 + 0.6) > -0.1 ? 1 : 0;
  st.hover += ((near || auto ? 1 : 0) - st.hover) * 0.16;
  const e = easeOut(st.hover);

  ctx.fillStyle = rgba(palette.gold, 0.08 + e * 0.06);
  roundRect(ctx, bx, by, bw, bh, variant === 'soft' ? 8 : 4);
  ctx.fill();
  ctx.strokeStyle = rgba(palette.gold, 0.25 + e * 0.3);
  ctx.lineWidth = 1;
  roundRect(ctx, bx + 0.5, by + 0.5, bw - 1, bh - 1, variant === 'soft' ? 8 : 4);
  ctx.stroke();
  ctx.fillStyle = palette.text;
  ctx.font = '9px ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('hover me', w / 2, by + bh / 2);

  if (e > 0.01) {
    const tw = 148;
    const th = 38;
    const tx = w / 2 - tw / 2;
    const ty = by - th - 12 + (1 - e) * 10;
    ctx.save();
    ctx.globalAlpha = e;
    if (variant === 'soft') {
      ctx.fillStyle = rgba(palette.bg, 0.5);
      roundRect(ctx, tx + 3, ty + 5, tw, th, 10);
      ctx.fill();
    }
    ctx.fillStyle = rgba(palette.panel, 0.98);
    roundRect(ctx, tx, ty, tw, th, variant === 'soft' ? 10 : 4);
    ctx.fill();
    ctx.strokeStyle = rgba(palette.gold, 0.35);
    ctx.lineWidth = 1;
    roundRect(ctx, tx + 0.5, ty + 0.5, tw - 1, th - 1, variant === 'soft' ? 10 : 4);
    ctx.stroke();
    // arrow
    ctx.fillStyle = rgba(palette.panel, 0.98);
    ctx.beginPath();
    ctx.moveTo(w / 2 - 5, ty + th);
    ctx.lineTo(w / 2 + 5, ty + th);
    ctx.lineTo(w / 2, ty + th + 5);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = palette.text;
    ctx.font = '600 9px ui-monospace, monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('Crafted microcopy', tx + 10, ty + 14);
    ctx.fillStyle = rgba(palette.textDim, 0.8);
    ctx.font = '8px ui-monospace, monospace';
    ctx.fillText('lands precisely, every time', tx + 10, ty + 26);
    ctx.restore();
  }
}

/* ── Token Swap ─────────────────────────────────────────────────────────── */

export function drawSwap(env: DrawEnv): void {
  const { ctx, w, h, palette, smooth, variant, pointer } = env;
  const st = (env.state.swap ??= { target: 0, value: 0, wasDown: false });
  if (pointer.down && !st.wasDown) {
    st.wasDown = true;
    if (Math.abs(pointer.x - w / 2) < 30 && Math.abs(pointer.y - h / 2) < 30) st.target = st.target ? 0 : 1;
  } else if (!pointer.down) st.wasDown = false;
  st.value += (st.target - st.value) * 0.1;
  const e = easeOut(clamp(st.value));

  const cardW = Math.min(118, w * 0.33);
  const cardH = 72;
  const y = h / 2 - cardH / 2;
  const leftX = w / 2 - cardW - 18;
  const rightX = w / 2 + 18;
  const ax = leftX + (rightX - leftX) * e;
  const bx = rightX - (rightX - leftX) * e;

  const drawToken = (x: number, symbol: string, name: string, amount: string, col: string) => {
    if (variant === 'aave') {
      tile(ctx, x, y, cardW, cardH, 10, rgba(col, 0.28), rgba(palette.card, 0.95));
    } else {
      ctx.fillStyle = rgba(palette.card, 0.95);
      roundRect(ctx, x, y, cardW, cardH, 8);
      ctx.fill();
      ctx.strokeStyle = rgba(palette.gold, 0.18);
      ctx.lineWidth = 1;
      roundRect(ctx, x + 0.5, y + 0.5, cardW - 1, cardH - 1, 8);
      ctx.stroke();
    }
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(x + 22, y + 24, 12, 0, TAU);
    ctx.fill();
    ctx.fillStyle = palette.bg;
    ctx.font = '700 10px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(symbol, x + 22, y + 24);
    ctx.fillStyle = rgba(palette.textDim, 0.85);
    ctx.font = '8px ui-monospace, monospace';
    ctx.textAlign = 'left';
    ctx.fillText(name, x + 40, y + 20);
    ctx.fillStyle = palette.text;
    ctx.font = '600 10px ui-monospace, monospace';
    ctx.fillText(amount, x + 40, y + 33);
    ctx.fillStyle = rgba(palette.textDim, 0.6);
    ctx.font = '8px ui-monospace, monospace';
    ctx.fillText('balance', x + 12, y + cardH - 12);
    ctx.textAlign = 'right';
    ctx.fillText('$1,204.80', x + cardW - 12, y + cardH - 12);
  };

  drawToken(ax, 'Ξ', 'ETH', '0.842', palette.purple);
  drawToken(bx, '$', 'USDC', '2,401', palette.green);

  // arrow button
  const cx = w / 2;
  const cy = h / 2;
  ctx.fillStyle = rgba(palette.gold, 0.14);
  ctx.beginPath();
  ctx.arc(cx, cy, 17, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = rgba(palette.gold, 0.45);
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(e * Math.PI);
  ctx.strokeStyle = palette.gold;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(0, -7);
  ctx.lineTo(0, 7);
  ctx.moveTo(-4, 3);
  ctx.lineTo(0, 7);
  ctx.lineTo(4, 3);
  ctx.stroke();
  ctx.restore();

  ctx.fillStyle = rgba(palette.textDim, 0.6);
  ctx.font = '8px ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.fillText('TOKEN SWAP · click the arrow', w / 2, h - 12);
}
