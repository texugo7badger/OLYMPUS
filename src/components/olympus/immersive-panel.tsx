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
import { Mic, Send, Sparkles, Volume2, X, Waypoints } from 'lucide-react';
import { resolvePalette } from '@/lib/theme';
import { useTheme } from '@/lib/theme-store';
import { useOlympus, GOD_IDS, GOD_ICONS } from '@/lib/olympus-store';
import { useLanguage, setLanguage, t, speechLocale, LANGUAGES, godName } from '@/lib/i18n';
import ThemedLogo from './themed-logo';

interface Particle { x: number; y: number; vx: number; vy: number; r: number; c: number; a: number }
interface InFlight { hopId: string; god?: string; status?: string; startedAt?: string }
interface Thought {
  id: string;
  kind: string;
  god: string;
  label: string;
  detail: string;
  ts: string;
  angle: number;
  radius: number;
}

/** One calm voice per god. Pitch/rate only — the browser picks the closest
 *  installed voice for the selected language, so no external TTS is needed. */
const GOD_VOICE: Record<string, { pitch: number; rate: number }> = {
  apollo: { pitch: 0.92, rate: 0.96 },
  atlas: { pitch: 0.78, rate: 0.9 },
  artemis: { pitch: 1.06, rate: 1.0 },
  athena: { pitch: 1.02, rate: 0.97 },
  dionysus: { pitch: 1.12, rate: 1.04 },
  hephaestus: { pitch: 0.7, rate: 0.88 },
  hermes: { pitch: 1.05, rate: 1.06 },
  persephone: { pitch: 0.96, rate: 0.93 },
  prometheus: { pitch: 0.84, rate: 0.96 },
  callimachus: { pitch: 1.0, rate: 0.9 },
};

export default function ImmersivePanel({ onClose }: { onClose: () => void }) {
  const [theme] = useTheme();
  const palette = resolvePalette(theme);
  const iconId = theme.iconId;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [inflight, setInflight] = useState<InFlight[]>([]);
  const [thoughts, setThoughts] = useState<Thought[]>([]);
  const thoughtSeq = useRef(0);
  const language = useLanguage();
  const [activeGod, setActiveGod] = useState('apollo');
  const [voice, setVoice] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [say, setSay] = useState('');
  const [chat, setChat] = useState<Array<{ role: 'user' | 'god'; text: string; god?: string }>>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatBusy, setChatBusy] = useState(false);

  // v0.0.34 — one calm, distinct voice per god. The orb form and color follow
  // the active god; the browser voice is chosen from the selected language.
  const speak = useCallback((text: string, god?: string) => {
    if (!text || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    try {
      const voiceGod = (god || activeGod).toLowerCase();
      const profile = GOD_VOICE[voiceGod] ?? GOD_VOICE.apollo;
      const u = new SpeechSynthesisUtterance(text.slice(0, 400));
      u.lang = speechLocale(language);
      u.pitch = profile.pitch;
      u.rate = profile.rate;
      const prefix = speechLocale(language).slice(0, 2).toLowerCase();
      const voices = window.speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith(prefix));
      const godIndex = Math.max(0, GOD_IDS.indexOf(voiceGod));
      if (voices.length) u.voice = voices[godIndex % voices.length];
      u.onstart = () => setSpeaking(true);
      u.onend = () => setSpeaking(false);
      u.onerror = () => setSpeaking(false);
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    } catch { /* voice optional */ }
  }, [language, activeGod]);

  const askStudio = useCallback(async () => {
    const question = chatInput.trim();
    if (!question || chatBusy) return;
    setChatInput('');
    setChat((prev) => [...prev, { role: 'user' as const, text: question }].slice(-8));
    setChatBusy(true);
    try {
      const r = await fetch('/api/olympus/studio/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-olympus-language': language },
        body: JSON.stringify({ question, god: activeGod, language }),
      });
      const d = await r.json();
      const answer = String(d?.answer || 'I could not read the live walk state.');
      setChat((prev) => [...prev, { role: 'god' as const, text: answer, god: activeGod }].slice(-8));
      if (voice) speak(answer, activeGod);
    } catch {
      setChat((prev) => [...prev, { role: 'god' as const, text: 'The studio could not reach the walk state.', god: activeGod }].slice(-8));
    } finally {
      setChatBusy(false);
    }
  }, [chatInput, chatBusy, activeGod, language, voice, speak]);

  const pickLang = useCallback((value: string) => {
    setLanguage(value as typeof language);
  }, []);

  const godTint = useCallback((god?: string) => {
    const key = (god || '').toLowerCase();
    const map: Record<string, string> = {
      apollo: palette.gold, atlas: palette.amberSoft, artemis: palette.red, athena: palette.purple,
      dionysus: palette.green, hephaestus: palette.blue, hermes: palette.cyan,
      persephone: palette.amber, prometheus: palette.teal, callimachus: palette.amberSoft,
    };
    return map[key] ?? palette.cyan;
  }, [palette]);
  const orbTint = godTint(activeGod);
  const ActiveGodIcon = GOD_ICONS[activeGod] ?? Sparkles;

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
          const type = String(ev?.type || '');
          const isThought = ['campaign_start', 'hop_start', 'hop_verify', 'hop_done', 'hop_parked', 'campaign_end'].includes(type);
          if (isThought) {
            // Each hop/verification/event becomes a NODE around the mark, with
            // a line back to the centre: the artistic map of the walk.
            const n = thoughtSeq.current++;
            const angle = n * 2.399963 + 0.6;
            const radius = 0.28 + (n % 3) * 0.05;
            const god = String(ev?.god || '');
            const hop = String(ev?.hop || ev?.hopId || ev?.campaignId || 'walk');
            const seconds = ev?.durationMs ? Math.max(1, Math.round(Number(ev.durationMs) / 1000)) : null;
            const detail = type === 'campaign_start'
              ? `${ev?.project || 'campaign'} · started`
              : type === 'campaign_end'
                ? `${ev?.completed ?? 0}/${ev?.total ?? '?'} hops · ended`
                : type === 'hop_verify'
                  ? `verify · ${ev?.reason || 'deterministic'}`
                  : type === 'hop_done'
                    ? `${god || 'god'} · done${seconds ? ` · ${seconds}s` : ''}`
                    : type === 'hop_parked'
                      ? `${god || 'god'} · parked · ${ev?.reason || 'resume available'}`
                      : `${god || 'god'} · started`;
            setThoughts((prev) => {
              // SHARED THOUGHTS: start/verify/done/park for the same hop are
              // one node that evolves, not four duplicated cards.
              const existing = prev.findIndex((t) => t.label === hop);
              const next: Thought = {
                id: `${hop}:${ev?.campaignId || 'walk'}`,
                kind: type,
                god,
                label: hop,
                detail,
                ts: String(ev?.ts || new Date().toISOString()),
                angle,
                radius,
              };
              if (existing >= 0) {
                const evolved = { ...prev[existing], ...next, angle: prev[existing].angle, radius: prev[existing].radius };
                return [...prev.slice(0, existing), ...prev.slice(existing + 1), evolved].slice(-16);
              }
              return [...prev, next].slice(-16);
            });
            burst({ x: 0.5 + Math.cos(angle) * radius, y: 0.5 + Math.sin(angle) * radius * 0.8 });
            if (voice && (type === 'hop_start' || type === 'hop_done' || type === 'hop_parked')) {
              speak(type === 'hop_done' ? `${god || 'a god'} finished ${hop}` : type === 'hop_parked' ? `${god || 'a god'} parked ${hop}` : `${god || 'a god'} started ${hop}`, god);
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
        <span className="text-[11px] font-mono font-semibold uppercase tracking-[0.22em]" style={{ color: palette.gold }}>{t('studio.title', language)}</span>
        <span className="text-[9px] font-mono" style={{ color: palette.textDim }}>{t('studio.subtitle', language)}</span>
        <button onClick={onClose} className="ml-auto rounded p-1 hover:opacity-80" aria-label="Close pattern studio" style={{ color: palette.textDim }}>
          <X size={15} />
        </button>
      </header>

      <div className="relative z-10 h-[calc(100%-52px)] grid grid-cols-[240px_1fr_240px] gap-3 px-4 pb-4">
        {/* the gods at work */}
        <aside className="rounded-xl border p-3 overflow-auto custom-scroll" style={{ borderColor: `${palette.gold}22`, background: `${palette.panel}99` }}>
          <div className="text-[9px] font-mono uppercase tracking-wide mb-2" style={{ color: palette.gold }}>{t('studio.gods', language)}</div>
          {inflight.length === 0 && <p className="text-[9px] font-mono" style={{ color: palette.textDim }}>{t('studio.idle', language)}</p>}
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

          <div className="mt-3 pt-2 border-t" style={{ borderColor: `${palette.gold}22` }}>
            <div className="flex items-center gap-1 text-[9px] font-mono uppercase tracking-wide mb-1.5" style={{ color: palette.cyan }}>
              <Waypoints size={10} /> thoughts &amp; connections
            </div>
            {thoughts.length === 0 ? (
              <p className="text-[9px] font-mono leading-relaxed" style={{ color: palette.textDim }}>
                each hop, verify and park becomes a node around the mark — with a line back to the centre.
              </p>
            ) : (
              thoughts.slice(-7).reverse().map((th) => (
                <div key={th.id} className="flex items-start gap-1.5 mb-1">
                  <span className="w-1.5 h-1.5 rounded-full mt-0.5 shrink-0" style={{ background: godTint(th.god) }} />
                  <div className="min-w-0">
                    <div className="text-[9px] font-mono truncate" style={{ color: palette.text }}>{th.label}</div>
                    <div className="text-[8px] font-mono truncate" style={{ color: palette.textDim }}>{th.detail}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </aside>

        {/* the mark + the title + the THOUGHT CONSTELLATION */}
        <main className="relative flex flex-col items-center justify-center">
          <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
            {thoughts.map((th) => {
              const nx = 50 + Math.cos(th.angle) * th.radius * 100;
              const ny = 50 + Math.sin(th.angle) * th.radius * 80;
              return (
                <line
                  key={`line:${th.id}`}
                  x1="50" y1="50" x2={nx} y2={ny}
                  stroke={godTint(th.god)}
                  strokeWidth="0.18"
                  vectorEffect="non-scaling-stroke"
                  opacity="0.38"
                />
              );
            })}
          </svg>
          {thoughts.map((th, i) => {
            const nx = 50 + Math.cos(th.angle) * th.radius * 100;
            const ny = 50 + Math.sin(th.angle) * th.radius * 80;
            const latest = i === thoughts.length - 1;
            const tint = godTint(th.god);
            return (
              <div
                key={th.id}
                onClick={() => setActiveGod(th.god || 'apollo')}
                className="absolute pointer-events-auto cursor-pointer rounded-lg border px-2 py-1 max-w-[150px] transition-opacity duration-500 hover:scale-[1.03]"
                style={{
                  left: `${nx}%`,
                  top: `${ny}%`,
                  transform: 'translate(-50%, -50%)',
                  borderColor: `${tint}${latest ? 'AA' : '44'}`,
                  background: `${palette.panel}E6`,
                  boxShadow: latest ? `0 0 18px ${tint}33` : undefined,
                  opacity: latest ? 1 : 0.72,
                }}
              >
                <div className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: tint }} />
                  <span className="text-[8px] font-mono font-semibold truncate" style={{ color: tint }}>{th.label}</span>
                  {latest && <span className="ml-auto w-1 h-1 rounded-full animate-pulse" style={{ background: tint }} />}
                </div>
                <div className="text-[7px] font-mono truncate" style={{ color: palette.textDim }}>{th.detail}</div>
              </div>
            );
          })}
          <div className="rounded-full p-6" style={{ background: `radial-gradient(circle, ${palette.gold}18, transparent 70%)` }}>
            <ThemedLogo iconId={iconId} size={132} />
          </div>
          <h2 className="mt-3 text-[18px] font-mono font-semibold tracking-[0.30em]" style={{ color: palette.gold }}>OLYMPUS</h2>
          <p className="mt-1 text-[9px] font-mono text-center" style={{ color: palette.textDim }}>
            every burst is a hop; every line is a dispatch
          </p>
          <p className="mt-1 flex items-center gap-1 text-[8px] font-mono" style={{ color: thoughts.length ? palette.cyan : palette.textDim }}>
            <Waypoints size={9} />
            {thoughts.length
              ? `${thoughts.length} thought${thoughts.length === 1 ? '' : 's'} · live connections`
              : 'start a walk — each thought becomes a node here'}
          </p>
        </main>

        {/* the voice orb */}
        <aside className="rounded-xl border p-3 flex flex-col items-center justify-start gap-2 overflow-y-auto custom-scroll" style={{ borderColor: `${palette.gold}22`, background: `${palette.panel}99` }}>
          <div className="text-[9px] font-mono uppercase tracking-wide" style={{ color: palette.gold }}>
            {t('studio.voice', language)} · {godName(activeGod, language)}
          </div>
          <button
            onClick={() => setVoice((v) => !v)}
            aria-pressed={voice}
            aria-label={`Voice of ${godName(activeGod, language)}`}
            className="relative w-28 h-28 rounded-full flex items-center justify-center shrink-0"
            style={{ background: palette.bg, boxShadow: `0 0 ${speaking ? 58 : 30}px ${orbTint}66` }}
          >
            <span className="absolute inset-0 rounded-full overflow-hidden">
              <span
                className="absolute inset-0"
                style={{
                  background: `conic-gradient(from 0deg, ${orbTint}, ${palette.purple}, ${palette.gold}, ${palette.cyan}, ${orbTint})`,
                  animation: theme.motion === 'stable' ? undefined : 'olympus-plasma 8s linear infinite',
                }}
              />
              <span className="absolute inset-[2px] rounded-full" style={{ background: palette.bg }} />
              <span
                className="absolute inset-[2px] rounded-full"
                style={{
                  background: `radial-gradient(circle at 50% 50%, transparent 52%, ${orbTint}33 59%, transparent 68%)`,
                  opacity: speaking ? 1 : 0.55,
                  animation: speaking && theme.motion !== 'stable' ? 'pulse 1.2s ease-in-out infinite' : undefined,
                }}
              />
              {Array.from({ length: 14 }).map((_, i) => (
                <span
                  key={i}
                  className="absolute inset-0"
                  style={{
                    transform: `rotate(${(i / 14) * 360}deg)`,
                    animation: theme.motion === 'stable' ? undefined : `olympus-plasma ${5 + (i % 5) * 0.8}s linear infinite${i % 2 ? ' reverse' : ''}`,
                  }}
                >
                  <span
                    className="absolute left-1/2 top-[2px] rounded-full"
                    style={{ width: 1.6, height: 1.6, background: i % 3 === 0 ? palette.gold : orbTint, transform: 'translateX(-50%)', opacity: 0.55 + (i % 3) * 0.15 }}
                  />
                </span>
              ))}
            </span>
            <span className="absolute inset-[13px] rounded-full" style={{ background: `radial-gradient(circle at 50% 38%, ${orbTint}2A, transparent 72%)` }} />
            <ActiveGodIcon size={26} className={speaking ? 'relative animate-pulse' : 'relative'} style={{ color: voice ? orbTint : palette.textDim }} />
            <Mic size={9} className="absolute bottom-5" style={{ color: voice ? palette.gold : palette.textDim }} />
          </button>
          <select
            value={activeGod}
            onChange={(e) => setActiveGod(e.target.value)}
            className="w-full rounded px-1.5 py-1 text-[9px] font-mono outline-none"
            style={{ background: palette.bg, color: palette.text, border: `1px solid ${orbTint}44` }}
            aria-label="God voice"
          >
            {GOD_IDS.map((g) => <option key={g} value={g}>{godName(g, language)}</option>)}
          </select>
          <select
            value={language}
            onChange={(e) => pickLang(e.target.value)}
            className="w-full rounded px-1.5 py-1 text-[9px] font-mono outline-none"
            style={{ background: palette.bg, color: palette.text, border: `1px solid ${palette.gold}33` }}
            aria-label="Language"
          >
            {LANGUAGES.map((l) => <option key={l.id} value={l.id}>{l.native}</option>)}
          </select>
          <div className="w-full flex items-center gap-1">
            <input
              value={say}
              onChange={(e) => setSay(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { speak(say); setSay(''); } }}
              placeholder={t('studio.say', language)}
              className="flex-1 min-w-0 rounded px-1.5 py-1 text-[9px] font-mono outline-none"
              style={{ background: palette.bg, color: palette.text, border: `1px solid ${palette.gold}33` }}
            />
            <button onClick={() => { speak(say); setSay(''); }} aria-label="Speak" className="rounded p-1" style={{ color: palette.gold }}>
              <Send size={11} />
            </button>
          </div>
          <p className="text-[8px] font-mono text-center flex items-center gap-1" style={{ color: speaking ? palette.gold : palette.textDim }}>
            <Volume2 size={9} /> {voice ? (speaking ? t('studio.speaking', language) : t('studio.voiceOn', language)) : t('studio.voiceOff', language)}
          </p>

          {/* The discreet studio chat: asks the live walk, answers as the
              active god, and speaks the answer when voice is on. */}
          <div className="w-full mt-1 pt-2 border-t" style={{ borderColor: `${palette.gold}22` }}>
            <div className="flex items-center gap-1 text-[8px] font-mono uppercase tracking-wide mb-1" style={{ color: orbTint }}>
              <Waypoints size={9} /> studio chat · {godName(activeGod, language)}
            </div>
            <div className="max-h-28 overflow-y-auto custom-scroll space-y-1 mb-1.5">
              {chat.length === 0 ? (
                <p className="text-[8px] font-mono leading-relaxed" style={{ color: palette.textDim }}>
                  ask “summarize what is being done” — the answer comes from the live walk, in your language.
                </p>
              ) : chat.map((m, i) => (
                <div key={`${m.role}:${i}`} className={m.role === 'user' ? 'text-right' : 'text-left'}>
                  <span
                    className="inline-block rounded-lg px-1.5 py-1 text-[8px] font-mono whitespace-pre-wrap text-left max-w-full"
                    style={{
                      background: m.role === 'user' ? `${palette.gold}18` : `${godTint(m.god || activeGod)}14`,
                      color: m.role === 'user' ? palette.text : palette.text,
                      border: `1px solid ${m.role === 'user' ? palette.gold : godTint(m.god || activeGod)}33`,
                    }}
                  >{m.text}</span>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-1">
              <input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void askStudio(); } }}
                placeholder={t('terminal.placeholder', language)}
                className="flex-1 min-w-0 rounded px-1.5 py-1 text-[8px] font-mono outline-none"
                style={{ background: palette.bg, color: palette.text, border: `1px solid ${orbTint}33` }}
              />
              <button onClick={() => void askStudio()} disabled={chatBusy || !chatInput.trim()} aria-label="Ask the studio" className="rounded p-1 disabled:opacity-40" style={{ color: orbTint }}>
                {chatBusy ? <span className="text-[9px] animate-pulse">…</span> : <Send size={11} />}
              </button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
