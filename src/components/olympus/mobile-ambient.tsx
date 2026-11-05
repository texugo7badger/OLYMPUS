'use client';

/**
 * mobile-ambient.tsx — v0.0.60: the creativity page's particle field, sized
 * for a phone.
 *
 * The desktop ImmersivePanel owns a 96-particle field with bursts and links;
 * this is the same visual language at 44 particles, DPR capped at 1.5, with
 * NO link pass (the expensive part) and no bursts. It pauses when the tab is
 * hidden, respects `prefers-reduced-motion` and the theme's `stable` motion
 * (a static constellation instead of animation), and follows the live theme
 * palette.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { useEffect, useRef, useState } from 'react';
import { resolvePalette, type ThemeState } from '@/lib/theme';

type Particle = { x: number; y: number; vx: number; vy: number; r: number; a: number; c: number };

export default function MobileAmbient({ theme, enabled }: { theme: ThemeState | null; enabled: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const colorsRef = useRef<string[]>(['#D4A574']);
  const stableRef = useRef(false);
  const [low, setLow] = useState(false);

  useEffect(() => {
    const read = () => setLow(typeof document !== 'undefined' && document.documentElement.dataset.performance === 'low');
    read();
    window.addEventListener('olympus:performance', read);
    return () => window.removeEventListener('olympus:performance', read);
  }, []);

  useEffect(() => {
    if (!theme) return;
    const p = resolvePalette(theme);
    colorsRef.current = [p.gold, p.purple, p.cyan, p.green, p.blue];
    stableRef.current = theme.motion === 'stable';
  }, [theme]);

  useEffect(() => {
    if (!enabled || low) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;
    let raf = 0;
    let running = true;
    let particles: Particle[] = [];
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    const resize = () => {
      canvas.width = Math.floor(canvas.clientWidth * dpr);
      canvas.height = Math.floor(canvas.clientHeight * dpr);
      const count = reduce || stableRef.current ? 28 : 44;
      particles = Array.from({ length: count }, () => ({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.22 * dpr,
        vy: (Math.random() - 0.5) * 0.22 * dpr,
        r: (0.6 + Math.random() * 1.1) * dpr,
        a: 0.18 + Math.random() * 0.42,
        c: Math.floor(Math.random() * colorsRef.current.length),
      }));
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const draw = () => {
      if (!running) return;
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      for (const p of particles) {
        if (!reduce && !stableRef.current) {
          p.x += p.vx;
          p.y += p.vy;
          if (p.x < -8) p.x = w + 8;
          if (p.x > w + 8) p.x = -8;
          if (p.y < -8) p.y = h + 8;
          if (p.y > h + 8) p.y = -8;
        }
        const color = colorsRef.current[p.c] ?? colorsRef.current[0];
        ctx.globalAlpha = p.a;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      if (!reduce && !stableRef.current) raf = requestAnimationFrame(draw);
    };
    draw();

    const onVisibility = () => {
      if (document.hidden) {
        running = false;
        cancelAnimationFrame(raf);
      } else if (!reduce && !stableRef.current) {
        running = true;
        raf = requestAnimationFrame(draw);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      running = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [enabled, low]);

  if (!enabled) return null;
  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 h-dvh w-full opacity-70"
      style={{ zIndex: 0 }}
    />
  );
}
