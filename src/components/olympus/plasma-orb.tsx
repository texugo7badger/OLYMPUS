/**
 * plasma-orb.tsx — v0.0.34: the voice as an organic plasma sphere.
 *
 * The clean lat/long "globe" read as a mesh cage. This version draws ~70
 * irregular plasma filaments that wander across a sphere with a slow wobble,
 * white at the crest, pink/blue on the flanks, plus drifting glow particles.
 * It is deliberately imperfect — a living plasma body, not a wireframe globe.
 *
 * The active god's tint colors the aura; speaking expands the sphere and
 * accelerates the flow.
 *
 * 60 FPS: one small canvas, DPR capped at 2, ~70 polylines, RAF only while
 * mounted; static frame in stable mode.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

'use client';

import { useEffect, useRef } from 'react';
import { useTheme } from '@/lib/theme-store';

const TAU = Math.PI * 2;

function hash(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

interface Filament {
  lat: number;
  lon: number;
  wobble: number;
  phase: number;
  speed: number;
  color: number;
  width: number;
}

export default function PlasmaOrb({
  tint,
  speaking,
  size = 144,
  level = 0,
}: {
  tint: string;
  speaking: boolean;
  size?: number;
  level?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const levelRef = useRef(level);
  useEffect(() => { levelRef.current = level; }, [level]);
  const [theme] = useTheme();
  const stable = theme.motion === 'stable';

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cx = size / 2;
    const cy = size / 2;
    const R = size * 0.34;
    const start = performance.now();
    let raf = 0;
    let running = true;

    // Organic filaments: irregular paths, not latitude/longitude rings.
    const filaments: Filament[] = Array.from({ length: 74 }, (_, i) => ({
      lat: -1.25 + hash(i * 2.1) * 2.5,
      lon: hash(i * 5.7) * TAU,
      wobble: 0.08 + hash(i * 9.3) * 0.16,
      phase: hash(i * 3.3) * TAU,
      speed: 0.35 + hash(i * 7.1) * 0.7,
      color: i % 3,
      width: 0.45 + hash(i * 11.7) * 0.65,
    }));
    const sparks = Array.from({ length: 34 }, (_, i) => ({
      lat: -1.15 + hash(i * 4.1) * 2.3,
      lon: hash(i * 6.7) * TAU,
      speed: 0.2 + hash(i * 8.3) * 0.5,
      size: 0.9 + hash(i * 2.9) * 2.4,
      phase: hash(i * 12.7) * TAU,
    }));

    const project = (x: number, y: number, z: number): [number, number, number] => {
      const persp = 1 / (1 + z * 0.24);
      return [cx + x * R * persp, cy + y * R * persp, z];
    };
    const sphere = (lat: number, lon: number, radius: number): [number, number, number] => {
      const cl = Math.cos(lat);
      return [Math.cos(lon) * cl * radius, Math.sin(lat) * radius, Math.sin(lon) * cl * radius];
    };
    const rotate = (p: [number, number, number], ax: number, ay: number): [number, number, number] => {
      const cy1 = Math.cos(ay); const sy1 = Math.sin(ay);
      const x1 = p[0] * cy1 + p[2] * sy1;
      const z1 = -p[0] * sy1 + p[2] * cy1;
      const cx1 = Math.cos(ax); const sx1 = Math.sin(ax);
      const y1 = p[1] * cx1 - z1 * sx1;
      const z2 = p[1] * sx1 + z1 * cx1;
      return [x1, y1, z2];
    };

    const draw = (now: number) => {
      const t = (now - start) / 1000;
      const drive = speaking ? Math.min(1, levelRef.current) : 0;
      const amp = (speaking ? 1.035 + 0.035 * Math.sin(t * 6) : 1 + 0.012 * Math.sin(t * 1.7)) + drive * 0.06;
      const ax = 0.28 + Math.sin(t * 0.13) * 0.12;
      const ay = t * ((speaking ? 0.62 : 0.26) + drive * 0.25);
      ctx.clearRect(0, 0, size, size);
      ctx.globalCompositeOperation = 'lighter';

      // aura
      const aura = ctx.createRadialGradient(cx, cy, R * 0.25, cx, cy, R * 1.5);
      aura.addColorStop(0, `${tint}${Math.round(26 + drive * 26).toString(16).padStart(2, '0')}`);
      aura.addColorStop(0.55, `${tint}0D`);
      aura.addColorStop(1, `${tint}00`);
      ctx.fillStyle = aura;
      ctx.beginPath();
      ctx.arc(cx, cy, R * 1.5, 0, TAU);
      ctx.fill();

      // soft core
      const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 0.95);
      core.addColorStop(0, 'rgba(255,255,255,0.09)');
      core.addColorStop(0.6, 'rgba(150,170,255,0.05)');
      core.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(cx, cy, R * 0.95, 0, TAU);
      ctx.fill();

      const colorOf = (z: number, i: number): string => {
        if (z > 0.42) return '#FFFFFF';
        if (z > 0.08) return i === 0 ? '#FFD9F4' : '#F58AD9';
        if (z < -0.42) return '#9FB4FF';
        if (z < -0.08) return '#6E8BFF';
        return i === 2 ? '#FFFFFF' : '#E8D8FF';
      };

      // organic plasma filaments
      for (const f of filaments) {
        const steps = 22;
        let prev: [number, number, number] | null = null;
        for (let s = 0; s <= steps; s += 1) {
          const k = s / steps;
          const lat = f.lat + Math.sin(t * 0.24 * f.speed + f.phase + k * 3.1) * f.wobble * 0.62;
          const lon = f.lon + k * 2.4 + Math.sin(t * 0.18 * f.speed + f.phase + k * 1.7) * 0.28;
          const radius = 1 + 0.035 * Math.sin(k * 7 + t * 1.1 + f.phase) + (amp - 1) * 1.6;
          const p = rotate(sphere(lat, lon, radius), ax, ay);
          const [x, y, z] = project(p[0], p[1], p[2]);
          if (prev) {
            const a = 0.06 + 0.14 * Math.max(0, z + 0.2) * (0.6 + 0.4 * Math.sin(t * 0.9 + f.phase + k * 4));
            ctx.strokeStyle = colorOf(z, f.color);
            ctx.globalAlpha = a;
            ctx.lineWidth = f.width;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(prev[0], prev[1]);
            ctx.lineTo(x, y);
            ctx.stroke();
          }
          prev = [x, y, z];
        }
      }

      // bright surface sparks
      for (const sp of sparks) {
        const lon = sp.lon + t * 0.1 * sp.speed;
        const lat = sp.lat + Math.sin(t * 0.2 + sp.phase) * 0.06;
        const p = rotate(sphere(lat, lon, 1.01), ax, ay);
        const [x, y, z] = project(p[0], p[1], p[2]);
        if (z < -0.25) continue;
        ctx.globalAlpha = 0.35 + 0.55 * Math.max(0, z);
        ctx.fillStyle = z > 0.35 ? '#FFFFFF' : (sp.size > 1.8 ? '#F9B8EC' : '#BFD0FF');
        ctx.beginPath();
        ctx.arc(x, y, sp.size * (0.7 + 0.4 * z), 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    };

    const loop = () => {
      if (!running) return;
      draw(performance.now());
      raf = requestAnimationFrame(loop);
    };
    if (stable) draw(performance.now());
    else loop();
    const onVis = () => {
      if (document.visibilityState === 'hidden') { running = false; cancelAnimationFrame(raf); }
      else if (!stable) { running = true; loop(); }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      running = false;
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [tint, speaking, size, stable]);

  return <canvas ref={canvasRef} width={size} height={size} className="absolute inset-0 w-full h-full" aria-hidden />;
}
