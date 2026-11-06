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
import { useLanguage, t, godName, godDomain, getLanguage } from '@/lib/i18n';
import { toast } from 'sonner';
import { speakAs } from '@/lib/voice';
import { godIntro } from '@/lib/god-personas';
import ThemedLogo from './themed-logo';
import PlasmaRing from './plasma-ring';
import ProgressStrip from './progress-strip';
import TaskSheetModal from './task-sheet-modal';
import AlignmentBar from './alignment-bar';
import GoUsageBar from './go-usage-bar';

interface Particle { x: number; y: number; vx: number; vy: number; r: number; c: number; a: number }
interface Cell { x: number; y: number; r: number; phase: number; splitAt: number; c: number; drift: number }
interface Stroke { x: number; y: number; angle: number; len: number; c: number; speed: number }
interface InFlight { hopId: string; god?: string; status?: string; startedAt?: string }
interface LearningItem {
  id: string;
  type: 'instinct' | 'knowledge' | 'skill' | 'mcp';
  name: string;
  god: string;
  ts: string;
  summary: string;
  confidence?: number;
}

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



export default function ImmersivePanel({ onClose }: { onClose: () => void }) {
  const [theme] = useTheme();
  const palette = resolvePalette(theme);
  const activeProject = useOlympus((s) => s.activeProject);
  // v0.0.77 — a hop click opens its info sheet (the same live sheet Recent
  // Activity uses), scoped to the active lane.
  const [sheetHop, setSheetHop] = useState<string | null>(null);
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('olympus:close-tutorial'));
  }, []);
  const iconId = theme.iconId;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [inflight, setInflight] = useState<InFlight[]>([]);
  const [thoughts, setThoughts] = useState<Thought[]>([]);
  const [learnings, setLearnings] = useState<LearningItem[]>([]);
  const thoughtSeq = useRef(0);
  const language = useLanguage();
  const [activeGod, setActiveGod] = useState('apollo');
  const [projectSlug, setProjectSlug] = useState('');
  const studioStampRef = useRef('');
  // v0.0.34 — the studio opens with voice on (unless the user turned it off):
  // a chat answer is also spoken with the active god's voice.
  const [voice, setVoice] = useState(() => {
    try { return window.localStorage.getItem('olympus:voice-enabled') !== '0'; } catch { return true; }
  });
  const [speaking, setSpeaking] = useState(false);
  const [voiceLevel, setVoiceLevel] = useState(0);
  const [say, setSay] = useState('');
  const [chat, setChat] = useState<Array<{ role: 'user' | 'god'; text: string; god?: string }>>([]);
  const [chatInput, setChatInput] = useState('');

  // v0.0.82 — the markview USE bridge reaches the creative composer too.
  useEffect(() => {
    const onUse = (e: Event) => {
      const d = (e as CustomEvent).detail || {};
      if (!d?.name) return;
      const text = `Use the "${d.name}" reference${d.library ? ` (${d.library}${d.category ? ` · ${d.category}` : ''})` : ''}.${d.what ? ` ${d.what}` : ''}${d.demoUrl ? ` Reference: ${d.demoUrl}` : ''}`;
      setChatInput(text);
    };
    window.addEventListener('olympus:reference-use', onUse);
    return () => window.removeEventListener('olympus:reference-use', onUse);
  }, []);
  const [chatBusy, setChatBusy] = useState(false);
  const [micDevices, setMicDevices] = useState<MediaDeviceInfo[]>([]);
  const [micId, setMicId] = useState('');
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  // v0.0.34 — the gods learned to speak: the free edge-tts neural lane gives
  // ten distinct god voices in the selected language. Announce it once, with
  // the honest status of the local STT lane too.
  const [voiceCount, setVoiceCount] = useState(0);
  const [sttReady, setSttReady] = useState<boolean | null>(null);
  const voiceAnnounced = useRef(false);
  useEffect(() => {
    let cancelled = false;
    fetch('/api/olympus/voice/status', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        setVoiceCount(d?.neural ? Number(d?.godVoices || 10) : 0);
        setSttReady(Boolean(d?.stt));
        if (!voiceAnnounced.current && d?.neural) {
          voiceAnnounced.current = true;
          const timer = setTimeout(() => {
            toast.success(t('studio.voicesReady', getLanguage(), { n: Number(d?.godVoices || 10) }), { id: 'olympus-gods-voice' });
          }, 900);
          return () => clearTimeout(timer);
        }
        return undefined;
      })
      .catch(() => { if (!cancelled) { setVoiceCount(0); setSttReady(false); } });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => () => {
    try { recorderRef.current?.stop(); } catch { /* already stopped */ }
    streamRef.current?.getTracks().forEach((t) => t.stop());
  }, []);


  // v0.0.34 — local microphone: choose an input device and send speech as
  // text. The STT lane is faster-whisper on this machine (no cloud).
  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try {
        const ds = await navigator.mediaDevices.enumerateDevices();
        if (!cancelled) setMicDevices(ds.filter((d) => d.kind === 'audioinput'));
      } catch { /* permission not granted yet */ }
    };
    void refresh();
    navigator.mediaDevices?.addEventListener?.('devicechange', refresh);
    return () => {
      cancelled = true;
      navigator.mediaDevices?.removeEventListener?.('devicechange', refresh);
    };
  }, []);

  // v0.0.34 — one calm, distinct voice per god. The free edge-tts neural lane
  // is the primary voice; the browser voice is the fallback. The orb form and
  // color follow the active god; the language comes from Settings.
  // v0.0.38 — PERFORMANCE: the analyser reports a level every animation
  // frame. Feeding that into React state re-rendered this whole panel 60x/s.
  // The orb reads the level from a ref and animates on its own; the prop only
  // needs ~10 updates per second.
  const levelGate = useRef(0);
  const onVoiceLevel = useCallback((level: number) => {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (now - levelGate.current < 90) return;
    levelGate.current = now;
    setVoiceLevel(level);
  }, []);
  const speak = useCallback((text: string, god?: string) => {
    void speakAs(text, god || activeGod, language, setSpeaking, onVoiceLevel);
  }, [language, activeGod, onVoiceLevel]);

  const askStudio = useCallback(async (override?: string) => {
    const question = (override ?? chatInput).trim();
    if (!question || chatBusy) return;
    setChatInput('');
    setChat((prev) => [...prev, { role: 'user' as const, text: question }].slice(-8));
    setChatBusy(true);
    try {
      let answer = '';
      // v0.0.38 — HUMAN conversation first: the god answers in its own words
      // with the live walk as context. The deterministic summary is fallback.
      try {
        const cr = await fetch('/api/olympus/studio/converse', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-olympus-language': language },
          body: JSON.stringify({ message: question, god: activeGod, language }),
        });
        if (cr.ok) {
          const cd = await cr.json();
          if (cd?.ok && cd.answer) answer = String(cd.answer);
        }
      } catch { /* fall through */ }
      if (!answer) {
        const r = await fetch('/api/olympus/studio/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-olympus-language': language },
          body: JSON.stringify({ question, god: activeGod, language }),
        });
        const d = await r.json();
        answer = String(d?.answer || 'I could not read the live walk state.');
      }
      setChat((prev) => [...prev, { role: 'god' as const, text: answer, god: activeGod }].slice(-8));
      if (voice) speak(answer, activeGod);
    } catch {
      setChat((prev) => [...prev, { role: 'god' as const, text: 'The studio could not reach the walk state.', god: activeGod }].slice(-8));
    } finally {
      setChatBusy(false);
    }
  }, [chatInput, chatBusy, activeGod, language, voice, speak]);


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
    fetch('/api/olympus/projects', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.active?.slug) setProjectSlug(String(d.active.slug)); })
      .catch(() => { /* the strip hides */ });
  }, []);

  // v0.0.64 — the studio mirrors the phone: god + voice are shared.
  useEffect(() => {
    let live = true;
    const pull = async () => {
      try {
        const r = await fetch('/api/olympus/studio/state', { cache: 'no-store' });
        const d = await r.json().catch(() => null);
        if (!live || !r.ok || !d?.ok) return;
        const stamp = String(d.updatedAt || '');
        if (stamp && stamp === studioStampRef.current) return;
        studioStampRef.current = stamp;
        if (typeof d.god === 'string' && GOD_IDS.includes(d.god)) setActiveGod(d.god);
        if (typeof d.voice === 'boolean') setVoice(d.voice);
      } catch { /* offline */ }
    };
    void pull();
    const timer = setInterval(() => { if (document.visibilityState !== 'hidden') void pull(); }, 15_000);
    return () => { live = false; clearInterval(timer); };
  }, []);

  const pushStudio = useCallback(async (patch: { god?: string; voice?: boolean }) => {
    try {
      const r = await fetch('/api/olympus/studio/state', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
      });
      const d = await r.json().catch(() => null);
      if (d?.updatedAt) studioStampRef.current = String(d.updatedAt);
    } catch { /* the local choice stands */ }
  }, []);

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

  // v0.0.34 — the learning feed: the newest instincts, knowledge, skills and
  // MCPs. Clicking an item lets the god SAY what it learned.
  useEffect(() => {
    const load = () => {
      if (document.visibilityState === 'hidden') return;
      fetch('/api/olympus/learning/recent?limit=8', { cache: 'no-store' })
        .then((r) => r.json())
        .then((d) => setLearnings(Array.isArray(d?.learnings) ? d.learnings : []))
        .catch(() => { /* offline */ });
    };
    load();
    const iv = setInterval(load, 60_000);
    return () => clearInterval(iv);
  }, []);

  const explainLearning = useCallback((l: LearningItem) => {
    const g = GOD_IDS.includes(l.god) ? l.god : activeGod;
    setActiveGod(g);
    const text = `${t('learning.learned', language)} ${l.name}. ${l.summary}. ${t('learning.improved', language, { domain: godDomain(g, language) })}`;
    setChat((prev) => [...prev, { role: 'god' as const, text, god: g }].slice(-8));
    if (voice) speak(text, g);
  }, [activeGod, language, voice, speak]);
  const introduceGod = useCallback((g: string) => {
    setActiveGod(g);
    void pushStudio({ god: g });
    const intro = godIntro(g, language);
    setChat((prev) => [...prev, { role: 'god' as const, text: intro, god: g }].slice(-8));
    if (voice) speak(intro, g);
  }, [language, voice, speak]);

  const toggleMic = useCallback(async () => {
    if (recording) {
      try { recorderRef.current?.stop(); } catch { /* already stopped */ }
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: micId ? { deviceId: { exact: micId } } : true,
      });
      streamRef.current = stream;
      const mime = typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus' : '';
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      recorderRef.current = rec;
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
      rec.onstop = async () => {
        setRecording(false);
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' });
        if (!blob.size) return;
        setTranscribing(true);
        try {
          const fd = new FormData();
          fd.append('audio', blob, 'mic.webm');
          fd.append('language', language);
          const r = await fetch('/api/olympus/voice/listen', { method: 'POST', body: fd });
          const d = await r.json();
          if (d?.ok && d.text) void askStudio(String(d.text));
          else toast.error(d?.error || t('studio.noSpeech', language));
        } catch {
          toast.error(t('studio.micDenied', language));
        } finally {
          setTranscribing(false);
        }
      };
      rec.start();
      setRecording(true);
      const ds = await navigator.mediaDevices.enumerateDevices();
      setMicDevices(ds.filter((d) => d.kind === 'audioinput'));
    } catch {
      toast.error(t('studio.micDenied', language));
    }
  }, [recording, micId, language, askStudio]);



  // The particle field.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    // 60 FPS: a 1600x1000 surface at DPR 2 costs 6.4M pixels a frame. 1.5
    // keeps the field crisp and cuts the fill rate by ~44%.
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    let raf = 0;
    let running = true;
    let particles: Particle[] = [];
    const colors = [palette.gold, palette.cyan, palette.purple, palette.green, palette.amberSoft];
    const resize = () => {
      canvas.width = Math.floor(canvas.clientWidth * dpr);
      canvas.height = Math.floor(canvas.clientHeight * dpr);
    };
    resize();
    particles = Array.from({ length: (typeof document !== 'undefined' && document.documentElement.dataset.performance === 'low') ? 28 : 64 }, () => ({
      x: Math.random(), y: Math.random(),
      vx: (Math.random() - 0.5) * 0.0006, vy: (Math.random() - 0.5) * 0.0006,
      r: 0.7 + Math.random() * 1.6, c: Math.floor(Math.random() * colors.length), a: 0.25 + Math.random() * 0.6,
    }));
    // Living cells: membranes that breathe, connect and divide.
    let cells: Cell[] = Array.from({ length: 22 }, (_, i) => ({
      x: Math.random(), y: Math.random(),
      r: 0.018 + Math.random() * 0.045,
      phase: Math.random() * Math.PI * 2,
      splitAt: performance.now() + 2500 + Math.random() * 9000,
      c: i % colors.length,
      drift: (Math.random() - 0.5) * 0.00012,
    }));
    // Van Gogh brushstrokes following a slow flow field.
    const strokes: Stroke[] = Array.from({ length: 90 }, (_, i) => ({
      x: Math.random(), y: Math.random(),
      angle: Math.random() * Math.PI * 2,
      len: 0.008 + Math.random() * 0.022,
      c: i % colors.length,
      speed: 0.00015 + Math.random() * 0.00035,
    }));
    const burst = (at?: { x: number; y: number }) => {
      const ox = at?.x ?? Math.random();
      const oy = at?.y ?? Math.random();
      for (let i = 0; i < 10; i += 1) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 0.0008 + Math.random() * 0.0016;
        particles.push({ x: ox, y: oy, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, r: 1 + Math.random() * 1.4, c: Math.floor(Math.random() * colors.length), a: 0.9 });
      }
      if (particles.length > 120) particles = particles.slice(particles.length - 120);
    };
    const draw = () => {
      const w = canvas.width;
      const h = canvas.height;
      const now = performance.now();
      ctx.clearRect(0, 0, w, h);

      // ── layer 1: Van Gogh brushstrokes (a slow flow field) ──────────────
      for (const s of strokes) {
        s.angle += Math.sin(s.y * 9 + now * 0.00013) * 0.012 + Math.cos(s.x * 7 - now * 0.00011) * 0.01;
        s.x += Math.cos(s.angle) * s.speed;
        s.y += Math.sin(s.angle) * s.speed;
        if (s.x < -0.02) s.x = 1.02; if (s.x > 1.02) s.x = -0.02;
        if (s.y < -0.02) s.y = 1.02; if (s.y > 1.02) s.y = -0.02;
        ctx.strokeStyle = colors[s.c];
        ctx.globalAlpha = 0.075 + 0.06 * (0.5 + 0.5 * Math.sin(now * 0.0004 + s.angle));
        ctx.lineWidth = Math.max(1, 1.4 * dpr);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(s.x * w, s.y * h);
        ctx.lineTo((s.x + Math.cos(s.angle) * s.len) * w, (s.y + Math.sin(s.angle) * s.len) * h);
        ctx.stroke();
      }

      // ── layer 2: living cells — breathe, connect, multiply ──────────────
      let alive = 0;
      for (const c of cells) {
        c.x += Math.sin(now * 0.00018 + c.phase) * 0.00009 + c.drift;
        c.y += Math.cos(now * 0.00015 + c.phase * 1.7) * 0.00009;
        if (c.x < 0.02 || c.x > 0.98) c.drift *= -1;
        c.x = Math.max(0.01, Math.min(0.99, c.x));
        c.y = Math.max(0.01, Math.min(0.99, c.y));
        const breath = 1 + 0.12 * Math.sin(now * 0.0016 + c.phase);
        const r = c.r * breath;
        if (now > c.splitAt && cells.length < 34) {
          c.splitAt = now + 7000 + Math.random() * 12000;
          c.r = Math.max(0.012, c.r * 0.78);
          cells.push({ ...c, x: c.x + 0.012, y: c.y - 0.008, r: c.r * 0.7, phase: c.phase + 1.7, splitAt: now + 7000 + Math.random() * 9000, drift: -c.drift });
        }
        // Two soft alpha circles replace a per-frame radial gradient: the
        // gradient object was allocated 22+ times every frame and dominated
        // the creative-mode budget. Same glow, no allocation.
        ctx.fillStyle = colors[c.c];
        ctx.globalAlpha = 0.035;
        ctx.beginPath();
        ctx.arc(c.x * w, c.y * h, r * w, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 0.065;
        ctx.beginPath();
        ctx.arc(c.x * w, c.y * h, r * w * 0.62, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 0.42;
        ctx.beginPath();
        ctx.arc(c.x * w, c.y * h, Math.max(1, 1.5 * dpr), 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        if (alive < 60) {
          for (const other of cells) {
            if (other === c) continue;
            const dx = (c.x - other.x) * w;
            const dy = (c.y - other.y) * h;
            const reach = Math.min(w, h) * 0.12;
            if (dx * dx + dy * dy > reach * reach) continue;
            ctx.strokeStyle = colors[c.c];
            ctx.globalAlpha = 0.10;
            ctx.lineWidth = 0.5 * dpr;
            ctx.beginPath();
            ctx.moveTo(c.x * w, c.y * h);
            ctx.lineTo(other.x * w, other.y * h);
            ctx.stroke();
          }
        }
        alive += 1;
      }

      // ── layer 3: the particles + their short connections ────────────────
      for (const p of particles) {
        p.x += p.vx + Math.sin(p.y * 8 + now * 0.0002) * 0.00006;
        p.y += p.vy + Math.cos(p.x * 7 - now * 0.00017) * 0.00006;
        if (p.x < 0 || p.x > 1) p.vx *= -1;
        if (p.y < 0 || p.y > 1) p.vy *= -1;
        p.x = Math.max(0, Math.min(1, p.x));
        p.y = Math.max(0, Math.min(1, p.y));
      }
      const link = Math.min(w, h) * 0.11;
      const link2 = link * link;
      ctx.globalAlpha = 1;
      // Batch the proximity links per palette color: one Path2D and one
      // stroke per color instead of hundreds of stroke() calls, and squared
      // distance instead of hypot in the O(n^2) walk.
      const linkPaths = colors.map(() => new Path2D());
      for (let i = 0; i < particles.length; i += 1) {
        const a = particles[i];
        const ax = a.x * w;
        const ay = a.y * h;
        for (let j = i + 1; j < particles.length; j += 1) {
          const b = particles[j];
          const bx = b.x * w;
          const by = b.y * h;
          const dx = ax - bx;
          const dy = ay - by;
          if (dx * dx + dy * dy > link2) continue;
          linkPaths[a.c].moveTo(ax, ay);
          linkPaths[a.c].lineTo(bx, by);
        }
      }
      for (let c = 0; c < linkPaths.length; c += 1) {
        ctx.strokeStyle = colors[c];
        ctx.globalAlpha = 0.10;
        ctx.lineWidth = 0.6 * dpr;
        ctx.stroke(linkPaths[c]);
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
      // A hidden panel must not burn a core; the visibility handler resumes it.
      if (document.visibilityState !== 'hidden') draw();
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
            const dlang = getLanguage();
            const detail = type === 'campaign_start'
              ? `${ev?.project || 'campaign'} · ${t('thought.started', dlang)}`
              : type === 'campaign_end'
                ? `${ev?.completed ?? 0}/${ev?.total ?? '?'} hops · ${t('thought.ended', dlang)}`
                : type === 'hop_verify'
                  ? `${t('thought.verify', dlang)} · ${ev?.reason || 'deterministic'}`
                  : type === 'hop_done'
                    ? `${god || 'god'} · ${t('thought.done', dlang)}${seconds ? ` · ${seconds}s` : ''}`
                    : type === 'hop_parked'
                      ? `${god || 'god'} · ${t('thought.parked', dlang)} · ${ev?.reason || 'resume available'}`
                      : `${god || 'god'} · ${t('thought.started', dlang)}`;
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

      <div className="relative z-10 h-[calc(100%-52px)] grid grid-cols-[240px_1fr_380px] gap-3 px-4 pb-4">
        {/* the gods at work */}
        <aside className="rounded-xl border p-3 overflow-auto custom-scroll" style={{ borderColor: `${palette.gold}22`, background: `${palette.panel}99` }}>
          <div className="text-[9px] font-mono uppercase tracking-wide mb-2" style={{ color: palette.gold }}>{t('studio.gods', language)}</div>
          {inflight.length === 0 && <p className="text-[9px] font-mono" style={{ color: palette.textDim }}>{t('studio.idle', language)}</p>}
          {inflight.map((h) => (
            <button
              key={h.hopId}
              onClick={() => setSheetHop(h.hopId)}
              aria-label={`Open ${h.hopId}`}
              data-tip="Open the hop task sheet"
              className="mb-2 w-full cursor-pointer rounded-md px-1 py-0.5 text-left transition-colors hover:bg-white/5"
            >
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: palette.green }} />
                <span className="text-[10px] font-mono truncate">{h.god ?? 'god'}</span>
                <span className="ml-auto text-[8px] font-mono uppercase" style={{ color: palette.cyan }}>{h.status ?? 'running'}</span>
              </div>
              <div className="text-[9px] font-mono truncate pl-3" style={{ color: palette.textDim }}>{h.hopId}</div>
            </button>
          ))}

          <div className="mt-3 pt-2 border-t" style={{ borderColor: `${palette.gold}22` }}>
            <div className="flex items-center gap-1 text-[9px] font-mono uppercase tracking-wide mb-1.5" style={{ color: palette.cyan }}>
              <Waypoints size={10} /> {t('studio.thoughts', language)}
            </div>
            {thoughts.length === 0 ? (
              <p className="text-[9px] font-mono leading-relaxed" style={{ color: palette.textDim }}>
                {t('studio.thoughtsHint', language)}
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

          <div className="mt-3 pt-2 border-t" style={{ borderColor: `${palette.gold}22` }}>
            <div className="flex items-center gap-1 text-[9px] font-mono uppercase tracking-wide mb-1.5" style={{ color: palette.green }}>
              <Sparkles size={10} /> {t('learning.title', language)}
            </div>
            {learnings.length === 0 ? (
              <p className="text-[8px] font-mono" style={{ color: palette.textDim }}>—</p>
            ) : learnings.slice(0, 5).map((l) => (
              <button
                key={l.id}
                onClick={() => explainLearning(l)}
                className="w-full text-left flex items-start gap-1.5 mb-1 rounded px-1 py-0.5 hover:bg-olympus-gold/5"
                data-tip={`${l.type} · ${l.god}`}
              >
                <span className="text-[7px] font-mono uppercase px-1 rounded shrink-0" style={{ background: `${godTint(l.god)}18`, color: godTint(l.god) }}>{l.type}</span>
                <span className="min-w-0">
                  <span className="block text-[8px] font-mono truncate" style={{ color: palette.text }}>{l.name}</span>
                  <span className="block text-[7px] font-mono truncate" style={{ color: palette.textDim }}>{godName(l.god, language)} · click to hear it</span>
                </span>
              </button>
            ))}
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
                onClick={() => { setActiveGod(th.god || 'apollo'); setSheetHop(th.label); }}
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
          <div className="relative w-[300px] h-[300px] flex items-center justify-center">
            <span className="absolute inset-2 rounded-full border" style={{ borderColor: `${palette.gold}18` }} />
            <span
              className="absolute inset-8 rounded-full border border-dashed"
              style={{ borderColor: `${palette.gold}20`, animation: theme.motion === 'stable' ? undefined : 'olympus-plasma 40s linear infinite' }}
            />
            <span
              className="absolute w-[196px] h-[196px] rounded-full"
              style={{
                background: `conic-gradient(from 0deg, transparent, ${palette.gold}22, transparent 32%, ${palette.cyan}18, transparent 68%, ${palette.purple}16, transparent)`,
                animation: theme.motion === 'stable' ? undefined : 'olympus-plasma 18s linear infinite',
              }}
            />
            {GOD_IDS.map((g, i) => {
              const a = (i / GOD_IDS.length) * Math.PI * 2 - Math.PI / 2;
              const x = Math.cos(a) * 126;
              const y = Math.sin(a) * 126;
              const Icon = GOD_ICONS[g] ?? Sparkles;
              const tint = godTint(g);
              return (
                <button
                  key={g}
                  onClick={() => introduceGod(g)}
                  data-tip={godName(g, language)}
                  aria-label={godName(g, language)}
                  aria-pressed={activeGod === g}
                  className="absolute w-7 h-7 rounded-full flex items-center justify-center transition-colors hover:brightness-125"
                  style={{
                    left: `calc(50% + ${x}px)`,
                    top: `calc(50% + ${y}px)`,
                    transform: 'translate(-50%, -50%)',
                    background: `${tint}14`,
                    border: `1px solid ${tint}${activeGod === g ? 'AA' : '44'}`,
                    color: tint,
                    boxShadow: activeGod === g ? `0 0 16px ${tint}55` : undefined,
                  }}
                >
                  <Icon size={13} />
                </button>
              );
            })}
            <div className="rounded-full p-6" style={{ background: `radial-gradient(circle, ${orbTint}1F, transparent 70%)` }}>
              <ThemedLogo iconId={iconId} size={132} />
            </div>
          </div>
          <h2 className="mt-3 text-[18px] font-mono font-semibold tracking-[0.30em]" style={{ color: palette.gold }}>OLYMPUS</h2>
          <p className="mt-1 text-[9px] font-mono text-center" style={{ color: palette.textDim }}>
            {t('studio.tagline', language)}
          </p>
          <p className="mt-1 flex items-center gap-1 text-[8px] font-mono" style={{ color: thoughts.length ? palette.cyan : palette.textDim }}>
            <Waypoints size={9} />
            {thoughts.length
              ? `${thoughts.length} ${t('studio.thoughts', language)} · ${t('studio.live', language)}`
              : t('studio.startWalk', language)}
          </p>
        </main>

        {/* the voice orb */}
        <aside className="rounded-xl border p-3 flex flex-col items-center justify-start gap-2 overflow-y-auto custom-scroll" style={{ borderColor: `${palette.gold}22`, background: `${palette.panel}99` }}>
          {projectSlug && (
            <>
              <ProgressStrip
                slug={projectSlug}
                god={activeGod}
                language={language}
                onExplain={(text, g) => {
                  setChat((prev) => [...prev, { role: 'god' as const, text, god: g }].slice(-8));
                  if (voice) speak(text, g);
                }}
              />
              <AlignmentBar slug={projectSlug} />
              <GoUsageBar />
            </>
          )}
          <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wide" style={{ color: palette.gold }}>
            <ActiveGodIcon size={13} style={{ color: orbTint }} />
            {t('studio.voice', language)} · {godName(activeGod, language)}
          </div>
          <button
            onClick={() => setVoice((v) => { const next = !v; try { window.localStorage.setItem('olympus:voice-enabled', next ? '1' : '0'); } catch { /* private */ } void pushStudio({ voice: next }); return next; })}
            aria-pressed={voice}
            aria-label={`Voice of ${godName(activeGod, language)}`}
            className="relative w-40 h-40 rounded-full flex items-center justify-center shrink-0"
            style={{
              // v0.0.76 — the orb follows the theme. The hardcoded near-black
              // ball read as a black hole on the light themes; the light
              // family gets a paper ball with the god's ink ring instead.
              background: theme.mode === 'light'
                ? `radial-gradient(circle at 50% 45%, ${palette.card} 0%, ${palette.panel} 56%, ${palette.bg}AA 72%, transparent 80%)`
                : 'radial-gradient(circle at 50% 45%, #0B0B16 0%, #06060C 56%, rgba(6,6,12,0.55) 72%, transparent 80%)',
              boxShadow: `0 0 ${speaking ? 64 : 34}px ${orbTint}55, inset 0 0 0 1px ${orbTint}33`,
            }}
          >
            <PlasmaRing tint={orbTint} speaking={speaking && voice} level={voiceLevel} size={160}>
              <ActiveGodIcon size={40} style={{ color: orbTint }} />
            </PlasmaRing>
          </button>
          <select
            value={activeGod}
            onChange={(e) => introduceGod(e.target.value)}
            className="w-full rounded px-1.5 py-1 text-[9px] font-mono outline-none"
            style={{ background: palette.bg, color: palette.text, border: `1px solid ${orbTint}44` }}
            aria-label="God voice"
          >
            {GOD_IDS.map((g) => <option key={g} value={g}>{godName(g, language)}</option>)}
          </select>

          <div className="w-full flex items-center gap-1">
            <select
              value={micId}
              onChange={(e) => setMicId(e.target.value)}
              className="flex-1 min-w-0 rounded px-1.5 py-1 text-[8px] font-mono outline-none"
              style={{ background: palette.bg, color: palette.text, border: `1px solid ${palette.gold}33` }}
              aria-label={t('studio.mic', language)}
            >
              <option value="">{t('studio.defaultMic', language)}</option>
              {micDevices.map((d, i) => (
                <option key={d.deviceId || i} value={d.deviceId}>{d.label || `${t('studio.mic', language)} ${i + 1}`}</option>
              ))}
            </select>
            <button
              onClick={() => void toggleMic()}
              disabled={sttReady === false}
              aria-label={recording ? t('studio.listening', language) : t('studio.mic', language)}
              className={recording ? 'rounded p-1 text-olympus-red animate-pulse' : 'rounded p-1 disabled:opacity-40'}
              style={{ color: recording ? palette.red : orbTint, background: `${orbTint}12`, border: `1px solid ${orbTint}33` }}
            >
              <Mic size={12} />
            </button>
          </div>
          {(recording || transcribing) && (
            <p className="text-[7px] font-mono text-center" style={{ color: recording ? palette.red : palette.cyan }}>
              {recording ? t('studio.listening', language) : t('studio.transcribing', language)}
            </p>
          )}
          <div className="w-full flex items-center gap-1">
            <input
              value={say}
              onChange={(e) => setSay(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && say.trim()) { const q = say; setSay(''); void askStudio(q); } }}
              placeholder={t('studio.say', language)}
              className="flex-1 min-w-0 rounded px-1.5 py-1 text-[9px] font-mono outline-none"
              style={{ background: palette.bg, color: palette.text, border: `1px solid ${palette.gold}33` }}
            />
            <button onClick={() => { if (say.trim()) { const q = say; setSay(''); void askStudio(q); } }} aria-label="Ask the god" className="rounded p-1" style={{ color: palette.gold }}>
              <Send size={11} />
            </button>
          </div>
          <p className="text-[8px] font-mono text-center flex items-center gap-1" style={{ color: speaking ? palette.gold : palette.textDim }}>
            <Volume2 size={9} /> {voice ? (speaking ? t('studio.speaking', language) : t('studio.voiceOn', language)) : t('studio.voiceOff', language)}
          </p>
          <p className="text-[7px] font-mono text-center" style={{ color: voiceCount > 0 ? palette.green : palette.textDim }}>
            {voiceCount > 0 ? t('studio.voicesReady', language, { n: voiceCount }) : t('studio.voicesLoading', language)}
          </p>
          <p className="text-[7px] font-mono text-center" style={{ color: palette.textDim }}>
            {t('studio.voicePolicy', language)}
          </p>

          {/* The discreet studio chat: asks the live walk, answers as the
              active god, and speaks the answer when voice is on. */}
          <div className="w-full mt-1 pt-2 border-t" style={{ borderColor: `${palette.gold}22` }}>
            <div className="flex items-center gap-1 text-[8px] font-mono uppercase tracking-wide mb-1" style={{ color: orbTint }}>
              <Waypoints size={9} /> {t('studio.chat', language)} · {godName(activeGod, language)}
              <button
                onClick={() => void askStudio(language === 'pt-BR' ? 'resuma o projeto e o que está sendo feito' : 'summarize the project and what is being done')}
                className="ml-auto text-[7px] font-mono px-1.5 py-0.5 rounded normal-case tracking-normal"
                style={{ background: `${orbTint}18`, color: orbTint, border: `1px solid ${orbTint}33` }}
              >{t('studio.projectSummary', language)}</button>
            </div>
            <div className="max-h-56 overflow-y-auto custom-scroll space-y-1.5 mb-2 pr-0.5">
              {chat.length === 0 ? (
                <p className="text-[8px] font-mono leading-relaxed" style={{ color: palette.textDim }}>
                  ask “summarize what is being done” — the answer comes from the live walk, in your language.
                </p>
              ) : chat.map((m, i) => (
                <div key={`${m.role}:${i}`} className={m.role === 'user' ? 'text-right' : 'text-left'}>
                  <span
                    className="inline-block rounded-lg px-2 py-1.5 text-[9px] font-mono whitespace-pre-wrap text-left max-w-full leading-relaxed"
                    style={{
                      background: m.role === 'user' ? `${palette.gold}18` : `${godTint(m.god || activeGod)}14`,
                      color: m.role === 'user' ? palette.text : palette.text,
                      border: `1px solid ${m.role === 'user' ? palette.gold : godTint(m.god || activeGod)}33`,
                    }}
                  >{m.text.replace(/\*\*/g, '')}</span>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-1">
              <input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void askStudio(); } }}
                placeholder={t('terminal.placeholder', language)}
                className="flex-1 min-w-0 rounded px-2 py-1.5 text-[9px] font-mono outline-none"
                style={{ background: palette.bg, color: palette.text, border: `1px solid ${orbTint}33` }}
              />
              <button onClick={() => void askStudio()} disabled={chatBusy || !chatInput.trim()} aria-label="Ask the studio" className="rounded p-1 disabled:opacity-40" style={{ color: orbTint }}>
                {chatBusy ? <span className="text-[9px] animate-pulse">…</span> : <Send size={11} />}
              </button>
            </div>
          </div>
        </aside>
      </div>
      {sheetHop && <TaskSheetModal hopId={sheetHop} lane={activeProject?.path ?? null} onClose={() => setSheetHop(null)} />}
    </div>
  );
}
