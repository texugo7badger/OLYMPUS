/**
 * immersive-panel.tsx — v0.0.32: the Pattern Studio.
 *
 * A full-screen, artistic view of the machine thinking: a drifting particle
 * field (the Originkit particle-drift idea) where each burst is a real hop
 * event, the OLYMPUS mark breathing in the center, the gods' live activity on
 * the left and the voice orb (plasma ring) on the right. The user can simply
 * watch; nothing here writes.
 *
 * 60 FPS: one canvas, ~140 particles, DPR capped at 2, links only within a
 * short radius, pause when hidden, a static frame in stable mode. Theme-driven
 * from the CSS variables.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Mic, Send, Sparkles, Volume2, X } from 'lucide-react';
import { resolvePalette } from '@/lib/theme';
import { useTheme } from '@/lib/theme-store';
import { useOlympus } from '@/lib/olympus-store';
import ThemedLogo from './themed-logo';

interface Particle { x: number; y: number; vx: number; vy: number; r: number; c: number; a: number }
interface InFlight { hopId: string; god?: string; status?: string; startedAt?: string }

const LANGS = [
  ['en', 'English'], ['pt-BR', 'Português'], ['es', 'Español'], ['fr', 'Français'],
  ['de', 'Deutsch'], ['ja', '日本語'], ['zh', '中文'],
] as const;

export default function ImmersivePanel({ onClose }: { onClose: () => void }) {
  const [theme] = useTheme();
  const palette = resolvePalette(theme);
  const iconId = theme.iconId;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [inflight, setInflight] = useState<InFlight[]>([]);
  const [lang, setLang] = useState('en');
  const [voice, setVoice] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [say, setSay] = useState('');

  useEffect(() => {
    try { setLang(localStorage.getItem('olympus:language') || 'en'); } catch { /* private */ }
  }, []);

  // v0.0.32 — the first voice slice: speech synthesis in the selected
  // language. The orb animates while speaking; voice is OFF by default.
  const speak = useCallback((text: string) => {
    if (!text || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    try {
      const u = new SpeechSynthesisUtterance(text.slice(0, 400));
      u.lang = lang;
      u.rate = 1.02;
      u.onstart = () => setSpeaking(true);
      u.onend = () => setSpeaking(false);
      u.onerror = () => setSpeaking(false);
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    } catch { /* voice optional */ }
  }, [lang]);

  const pickLang = useCallback((value: string) => {
    setLang(value);
    try { localStorage.setItem('olympus:language', value); } catch { /* private */ }
  }, []);

  // Live gods: the run-state in flight list (5s poll; no churn when hidden).
  useEffect(() => {
    const load = () => {
      if (document.visibilityState === 'hidden') return;
      fetch('/api/olympus/run-state', { cache: 'no-store' })
        .then((r) => r.json())
        .then((d) => setInflight(Array.isArray(d?.hops?.inFlightList) ? d.hops.inFlightList : []))
        .catch(() => { /* offline */ });
    };
    load();
    const iv = setInterval(load, 5000);
    return () => clearInterval(iv);
  }, []);

  // The particle field.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let raf = 0;
    let running = true;
    let particles: Particle[] = [];
    const colors = [palette.gold, palette.cyan, palette.purple, palette.green, palette.amberSoft];
    const resize = () => {
      canvas.width = Math.floor(canvas.clientWidth * dpr);
      canvas.height = Math.floor(canvas.clientHeight * dpr);
    };
    resize();
    particles = Array.from({ length: 140 }, () => ({
      x: Math.random(), y: Math.random(),
      vx: (Math.random() - 0.5) * 0.0006, vy: (Math.random() - 0.5) * 0.0006,
      r: 0.7 + Math.random() * 1.6, c: Math.floor(Math.random() * colors.length), a: 0.25 + Math.random() * 0.6,
    }));
    const burst = (at?: { x: number; y: number }) => {
      const ox = at?.x ?? Math.random();
      const oy = at?.y ?? Math.random();
      for (let i = 0; i < 10; i += 1) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 0.0008 + Math.random() * 0.0016;
        particles.push({ x: ox, y: oy, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, r: 1 + Math.random() * 1.4, c: Math.floor(Math.random() * colors.length), a: 0.9 });
      }
      if (particles.length > 220) particles = particles.slice(particles.length - 220);
    };
    const draw = () => {
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > 1) p.vx *= -1;
        if (p.y < 0 || p.y > 1) p.vy *= -1;
        p.x = Math.max(0, Math.min(1, p.x));
        p.y = Math.max(0, Math.min(1, p.y));
      }
      // Links: only a short radius keeps this cheap.
      const link = Math.min(w, h) * 0.11;
      for (let i = 0; i < particles.length; i += 1) {
        const a = particles[i];
        for (let j = i + 1; j < particles.length; j += 1) {
          const b = particles[j];
          const dx = (a.x - b.x) * w;
          const dy = (a.y - b.y) * h;
          const d = Math.hypot(dx, dy);
          if (d > link) continue;
          ctx.strokeStyle = colors[a.c];
          ctx.globalAlpha = (1 - d / link) * 0.16;
          ctx.lineWidth = 0.6 * dpr;
          ctx.beginPath();
          ctx.moveTo(a.x * w, a.y * h);
          ctx.lineTo(b.x * w, b.y * h);
          ctx.stroke();
        }
      }
      for (const p of particles) {
        ctx.globalAlpha = p.a;
        ctx.fillStyle = colors[p.c];
        ctx.beginPath();
        ctx.arc(p.x * w, p.y * h, p.r * dpr, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };
    const loop = () => {
      if (!running) return;
      draw();
      raf = requestAnimationFrame(loop);
    };
    if (theme.motion === 'stable') draw();
    else loop();

    let es: EventSource | null = null;
    try {
      es = new EventSource('/api/olympus/hops/stream');
      es.onmessage = (e) => {
        try {
          const ev = JSON.parse(e.data);
          if (ev?.type === 'hop_start' || ev?.type === 'hop_done' || ev?.type === 'hop_parked') {
            burst();
            if (voice) {
              const god = ev?.god || 'a god';
              const hop = ev?.hop || ev?.hopId || 'a hop';
              speak(ev.type === 'hop_done' ? `${god} finished ${hop}` : ev.type === 'hop_parked' ? `${god} parked ${hop}` : `${god} started ${hop}`);
            }
          }
        } catch { /* torn */ }
      };
    } catch { /* optional */ }

    const onResize = () => { resize(); if (theme.motion === 'stable') draw(); };
    window.addEventListener('resize', onResize);
    const onVis = () => {
      if (document.visibilityState === 'hidden') { running = false; cancelAnimationFrame(raf); }
      else if (theme.motion !== 'stable') { running = true; loop(); }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      running = false;
      cancelAnimationFrame(raf);
      es?.close();
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [palette.gold, palette.cyan, palette.purple, palette.green, palette.amberSoft, theme.motion, voice, speak]);

  return (
    <div
      className="fixed inset-0 z-[150] overflow-hidden"
      style={{ background: palette.bg, color: palette.text }}
      role="dialog"
      aria-modal="true"
      aria-label="OLYMPUS pattern studio"
    >
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" aria-hidden="true" />
      <div className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(circle at 50% 45%, ${palette.gold}14, transparent 58%)` }} />

      <header className="relative z-10 flex items-center gap-2 px-4 py-3">
        <Sparkles size={13} style={{ color: palette.gold }} />
        <span className="text-[11px] font-mono font-semibold uppercase tracking-[0.22em]" style={{ color: palette.gold }}>pattern studio</span>
        <span className="text-[9px] font-mono" style={{ color: palette.textDim }}>the machine thinking — live</span>
        <button onClick={onClose} className="ml-auto rounded p-1 hover:opacity-80" aria-label="Close pattern studio" style={{ color: palette.textDim }}>
          <X size={15} />
        </button>
      </header>

      <div className="relative z-10 h-[calc(100%-52px)] grid grid-cols-[240px_1fr_240px] gap-3 px-4 pb-4">
        {/* the gods at work */}
        <aside className="rounded-xl border p-3 overflow-auto custom-scroll" style={{ borderColor: `${palette.gold}22`, background: `${palette.panel}99` }}>
          <div className="text-[9px] font-mono uppercase tracking-wide mb-2" style={{ color: palette.gold }}>the gods, live</div>
          {inflight.length === 0 && <p className="text-[9px] font-mono" style={{ color: palette.textDim }}>the pantheon is idle — start a campaign to watch the patterns.</p>}
          {inflight.map((h) => (
            <div key={h.hopId} className="mb-2">
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: palette.green }} />
                <span className="text-[10px] font-mono truncate">{h.god ?? 'god'}</span>
                <span className="ml-auto text-[8px] font-mono uppercase" style={{ color: palette.cyan }}>{h.status ?? 'running'}</span>
              </div>
              <div className="text-[9px] font-mono truncate pl-3" style={{ color: palette.textDim }}>{h.hopId}</div>
            </div>
          ))}
        </aside>

        {/* the mark + the title */}
        <main className="relative flex flex-col items-center justify-center">
          <div className="rounded-full p-6" style={{ background: `radial-gradient(circle, ${palette.gold}18, transparent 70%)` }}>
            <ThemedLogo iconId={iconId} size={132} />
          </div>
          <h2 className="mt-3 text-[18px] font-mono font-semibold tracking-[0.30em]" style={{ color: palette.gold }}>OLYMPUS</h2>
          <p className="mt-1 text-[9px] font-mono" style={{ color: palette.textDim }}>
            every burst is a hop; every line is a dispatch
          </p>
        </main>

        {/* the voice orb */}
        <aside className="rounded-xl border p-3 flex flex-col items-center justify-center gap-3" style={{ borderColor: `${palette.gold}22`, background: `${palette.panel}99` }}>
          <div className="text-[9px] font-mono uppercase tracking-wide" style={{ color: palette.gold }}>voice</div>
          <button
            onClick={() => setVoice((v) => !v)}
            aria-pressed={voice}
            aria-label="Voice orb"
            className="relative w-24 h-24 rounded-full flex items-center justify-center"
            style={{ background: palette.bg, boxShadow: `0 0 ${speaking ? 46 : 32}px ${speaking ? palette.gold : palette.cyan}66` }}
          >
            <span
              className="absolute inset-0 rounded-full"
              style={{
                background: `conic-gradient(from 0deg, ${palette.cyan}, ${palette.purple}, ${palette.gold}, ${palette.cyan})`,
                animation: theme.motion === 'stable' ? undefined : 'olympus-plasma 9s linear infinite',
              }}
            />
            <span className="absolute inset-1 rounded-full" style={{ background: palette.bg }} />
            <Mic size={22} className={speaking ? 'relative animate-pulse' : 'relative'} style={{ color: voice ? palette.gold : palette.textDim }} />
          </button>
          <select
            value={lang}
            onChange={(e) => pickLang(e.target.value)}
            className="w-full rounded px-1.5 py-1 text-[9px] font-mono outline-none"
            style={{ background: palette.bg, color: palette.text, border: `1px solid ${palette.gold}33` }}
            aria-label="Language"
          >
            {LANGS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <div className="w-full flex items-center gap-1">
            <input
              value={say}
              onChange={(e) => setSay(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { speak(say); setSay(''); } }}
              placeholder="say something…"
              className="flex-1 min-w-0 rounded px-1.5 py-1 text-[9px] font-mono outline-none"
              style={{ background: palette.bg, color: palette.text, border: `1px solid ${palette.gold}33` }}
            />
            <button onClick={() => { speak(say); setSay(''); }} aria-label="Speak" className="rounded p-1" style={{ color: palette.gold }}>
              <Send size={11} />
            </button>
          </div>
          <p className="text-[8px] font-mono text-center flex items-center gap-1" style={{ color: speaking ? palette.gold : palette.textDim }}>
            <Volume2 size={9} /> {voice ? (speaking ? 'speaking…' : 'voice on — hop events are spoken') : 'voice off — the orb and the language stay here'}
          </p>
        </aside>
      </div>
    </div>
  );
}
