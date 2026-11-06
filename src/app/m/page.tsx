'use client';

/**
 * /m — the mobile companion, v0.0.70: ONE SCREEN, VOICE FIRST.
 *
 * The phone is not a dashboard. The whole screen is the plasma ring: hold the
 * mic in the middle, speak, release — the server STT transcribes and the
 * request goes to Apollo in the active project's lane. Pick a god below the
 * ring (the voice/persona of the answer); everything else (campaign, project,
 * preview, git, cost, theme, language) lives in the details sheet.
 *
 * v0.0.70 — the old /m was a stack of cards on a page that could not scroll
 * (the root <body> carried overflow-hidden). This screen is a fixed h-dvh
 * surface: no page scroll is needed, the sheet scrolls, the god row scrolls
 * horizontally, and the ring is the only canvas (60 FPS on a phone).
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Bell, Check, Download, ExternalLink, Loader2, Lock, Mic, Palette, Play,
  MousePointerClick, Radio, RefreshCw, Settings2, Smartphone, Sparkles, Square, Volume2, X,
} from 'lucide-react';
import PlasmaRing from '@/components/olympus/plasma-ring';
import TaskSheetModal from '@/components/olympus/task-sheet-modal';
import GoUsageBar from '@/components/olympus/go-usage-bar';
import { THEME_PRESETS, applyTheme, normalizeThemeState, resolvePalette, type ThemeState } from '@/lib/theme';
import { getPerformanceMode, setPerformanceMode } from '@/lib/performance-mode';
import { LANGUAGES, godName, setLanguage, t, useLanguage, type Language } from '@/lib/i18n';
import { speakAs } from '@/lib/voice';
import { useHoldToTalk } from '@/lib/use-hold-to-talk';
import { mobileFetch } from '@/lib/mobile-fetch';
import { godTintHex } from '@/lib/god-tint';
import { useMobilePwa } from '@/lib/use-mobile-pwa';
import { useCompanionNotifications } from '@/lib/use-companion-notifications';
import CompanionBriefing from '@/components/olympus/companion-briefing';
import { CompanionNotificationsSheet, CompanionToast } from '@/components/olympus/companion-notifications';
import type { ProjectBriefing } from '@/lib/project-briefing';
import { briefingSpeech, isBriefingIntent } from '@/lib/companion-text';

const GOD_IDS = ['apollo', 'atlas', 'artemis', 'athena', 'dionysus', 'hephaestus', 'hermes', 'persephone', 'prometheus', 'callimachus'];

type Project = {
  slug: string;
  name: string;
  path?: string;
  livePreviewPort?: number;
  brief?: { status?: string; completed?: number; total?: number };
};

type RunState = {
  line?: string;
  verdict?: string;
  campaign?: { state?: string; lane?: string };
  hops?: {
    completed?: number;
    total?: number;
    inFlight?: number;
    inFlightList?: Array<{ hopId: string; god?: string }>;
    parked?: { hopId?: string; reason?: string } | null;
  };
};

type PreviewState = {
  ok: boolean;
  port: number | null;
  running: boolean;
  remote: boolean;
  recommendedUrl: string | null;
  tunnelUrl: string | null;
  tunnelAvailable: boolean;
  note: string;
  error?: string;
};

const TOKEN_KEY = 'olympus:mobile-token';
const THEME_KEY = 'olympus:mobile-theme';

export default function MobileCompanion() {
  const language = useLanguage();
  const [token, setToken] = useState<string | null>(null);
  const [tokenDraft, setTokenDraft] = useState('');
  const [projects, setProjects] = useState<Project[]>([]);
  const [active, setActive] = useState('');
  const [run, setRun] = useState<RunState | null>(null);
  const [git, setGit] = useState<{ remote?: string | null; branch?: string | null; commits?: Array<{ hash: string; subject: string; relative: string }> } | null>(null);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  // v0.0.84 — the personal preview sheet (animated app + mark -> Athena).
  const [previewOpen, setPreviewOpen] = useState(false);
  const [markMode, setMarkMode] = useState(false);
  const [markPoint, setMarkPoint] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [markInstruction, setMarkInstruction] = useState('');
  const [markBusy, setMarkBusy] = useState(false);
  const [markNote, setMarkNote] = useState('');
  const [theme, setTheme] = useState<ThemeState | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [perfMode, setPerfMode] = useState(false);
  // v0.0.84 edit — the hibernation HUD loads /m?hud=1 and opens the live
  // status sheet (progress, GO bar, hops) instead of the full app. Read it
  // after mount: the SSR pass has no window, and a render-time const could
  // stay false through hydration (the HUD showed only the ring).
  const [hudMode, setHudMode] = useState(false);
  // v0.0.84 — the cost/details sheet is the phone's campaign window. Its hops
  // open the same TaskSheet as the PC creative's left column.
  const [sheetHop, setSheetHop] = useState<string | null>(null);
  const [god, setGod] = useState('apollo');
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [ringSize, setRingSize] = useState(280);
  const [studioStamp, setStudioStamp] = useState('');
  const [secure, setSecure] = useState(true);
  const [tunnelUrl, setTunnelUrl] = useState<string | null>(null);
  const [tunnelBusy, setTunnelBusy] = useState(false);
  const [typeDraft, setTypeDraft] = useState('');
  const [queueNote, setQueueNote] = useState<string | null>(null);
  const levelGate = useRef(0);
  const themeStampRef = useRef('');
  // v0.0.85 — the companion is installable, with the same themed icon as the
  // widget. One worker owns both surfaces; the switcher stays in scope.
  const pwa = useMobilePwa();
  const [briefing, setBriefing] = useState<ProjectBriefing | null>(null);
  const [briefingBusy, setBriefingBusy] = useState(false);
  const [briefingOpen, setBriefingOpen] = useState(false);
  const [notifyOpen, setNotifyOpen] = useState(false);
  const notifications = useCompanionNotifications({ token, language });

  // Boot: token from the QR fragment, then localStorage.
  useEffect(() => {
    try {
      const hash = window.location.hash || '';
      const fromHash = new URLSearchParams(hash.replace(/^#/, '')).get('t');
      if (fromHash) {
        localStorage.setItem(TOKEN_KEY, fromHash);
        history.replaceState(null, '', window.location.pathname + window.location.search);
      }
      const stored = fromHash || localStorage.getItem(TOKEN_KEY) || '';
      if (stored) setToken(stored);
    } catch { /* no storage */ }
    try {
      const cached = localStorage.getItem(THEME_KEY);
      if (cached) {
        const next = normalizeThemeState(JSON.parse(cached));
        applyTheme(next, document.documentElement);
        setTheme(next);
      }
    } catch { /* private */ }
    const fit = () => {
      const w = typeof window !== 'undefined' ? window.innerWidth : 390;
      const h = typeof window !== 'undefined' ? window.innerHeight : 844;
      setRingSize(Math.max(220, Math.min(340, Math.floor(Math.min(w * 0.78, h * 0.42)))));
    };
    fit();
    setSecure(typeof window !== 'undefined' ? window.isSecureContext : true);
    setPerfMode(getPerformanceMode());
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

  const headers = useMemo<Record<string, string>>(() => {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) h['x-olympus-token'] = token;
    return h;
  }, [token]);
  // v0.0.78 — the phone is a companion, not a second boss: a prompt can be
  // QUEUED for the terminal (source 'phone') and a parked/interrupted walk can
  // be resumed by the detached supervisor — without opening the desktop.
  const queuePrompt = useCallback(async (text: string) => {
    const q = text.trim();
    if (!q || !active) return;
    try {
      const r = await fetch('/api/olympus/prompt-queue', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ project: active, text: q, source: 'phone' }),
      });
      const d = await r.json();
      setQueueNote(d?.ok ? 'queued for the terminal' : (d?.error || 'queue failed'));
    } catch (e: any) { setQueueNote(e?.message || 'queue failed'); }
  }, [active, headers]);

  const resumeWalk = useCallback(async () => {
    if (!active) return;
    try {
      const r = await fetch('/api/olympus/walk/supervisor', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start', slug: active }),
      });
      const d = await r.json();
      setQueueNote(d?.ok ? 'walk resumed (detached)' : (d?.error || 'resume failed'));
    } catch (e: any) { setQueueNote(e?.message || 'resume failed'); }
  }, [active, headers]);


  useEffect(() => {
    try { setHudMode(new URLSearchParams(window.location.search).has('hud')); } catch { /* non-DOM */ }
  }, []);
  useEffect(() => {
    if (hudMode && active) setDetailsOpen(true);
  }, [hudMode, active]);

  const palette = useMemo(() => resolvePalette(normalizeThemeState(theme)), [theme]);
  const tint = godTintHex(palette, god);

  const pullTheme = useCallback(async () => {
    try {
      const r = await mobileFetch('/api/olympus/theme', { cache: 'no-store' });
      const d = await r.json();
      if (!d?.ok || !d.state) return;
      const stamp = String(d.updatedAt || '');
      if (stamp && stamp === themeStampRef.current) return;
      themeStampRef.current = stamp;
      const next = normalizeThemeState(d.state);
      applyTheme(next, document.documentElement);
      setTheme(next);
      try { localStorage.setItem(THEME_KEY, JSON.stringify(next)); } catch { /* private */ }
    } catch { /* offline */ }
  }, []);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const [pRes, rRes] = await Promise.all([
        mobileFetch('/api/olympus/projects', { cache: 'no-store', headers }, 20_000),
        mobileFetch('/api/olympus/run-state', { cache: 'no-store', headers }, 20_000),
      ]);
      if (pRes.ok) {
        const d = await pRes.json();
        setProjects(Array.isArray(d.projects) ? d.projects : []);
        setActive(String(d.active?.slug || ''));
      }
      if (rRes.ok) setRun(await rRes.json());
      setError(null);
    } catch (e: any) {
      setError(e?.message || t('m.connectionFailed', language));
    }
  }, [token, headers, language]);

  useEffect(() => {
    if (!token) return;
    mobileFetch('/api/olympus/mobile/tunnel', { cache: 'no-store', headers })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.running && d.url) setTunnelUrl(String(d.url)); })
      .catch(() => { /* the secure card explains */ });
    void load();
    void pullTheme();
    const timer = setInterval(() => {
      if (document.visibilityState !== 'hidden') void load();
    }, 6000);
    return () => clearInterval(timer);
  }, [token, load, pullTheme]);

  // The god/voice mirror (the creative on the desktop shares this state).
  useEffect(() => {
    if (!token) return;
    let live = true;
    const pull = async () => {
      try {
        const r = await mobileFetch('/api/olympus/studio/state', { cache: 'no-store', headers });
        const d = await r.json().catch(() => null);
        if (!live || !r.ok || !d?.ok) return;
        const stamp = String(d.updatedAt || '');
        if (stamp && stamp === studioStamp) return;
        setStudioStamp(stamp);
        if (typeof d.god === 'string' && GOD_IDS.includes(d.god)) setGod(d.god);
      } catch { /* offline */ }
    };
    void pull();
    const timer = setInterval(() => { if (document.visibilityState !== 'hidden') void pull(); }, 12_000);
    return () => { live = false; clearInterval(timer); };
  }, [token, headers, studioStamp]);

  const pushStudio = useCallback(async (patch: { god?: string }) => {
    try {
      const r = await fetch('/api/olympus/studio/state', {
        method: 'POST', headers, body: JSON.stringify(patch),
      });
      const d = await r.json().catch(() => null);
      if (d?.updatedAt) setStudioStamp(String(d.updatedAt));
    } catch { /* the local choice stands */ }
  }, [headers]);

  const switchProject = useCallback(async (slug: string) => {
    setActive(slug);
    setPreview(null);
    try {
      await fetch('/api/olympus/projects/active', {
        method: 'PUT', headers, body: JSON.stringify({ slug }),
      });
      void load();
    } catch { /* the poll corrects it */ }
  }, [headers, load]);

  const previewAction = useCallback(async (action: 'start' | 'stop' | 'start-tunnel' | 'stop-tunnel') => {
    if (!active || previewBusy) return;
    setPreviewBusy(true);
    try {
      const r = await mobileFetch('/api/olympus/projects/preview', {
        method: 'POST', headers, body: JSON.stringify({ slug: active, action }),
      });
      const d = await r.json().catch(() => null);
      if (d) setPreview(d);
      if (!r.ok) setError(d?.error || t('m.error', language));
    } catch (e: any) {
      setError(e?.message || t('m.connectionFailed', language));
    } finally { setPreviewBusy(false); }
  }, [active, previewBusy, headers, language]);

  const sendMark = useCallback(async () => {
    if (!active || !markPoint || !markInstruction.trim() || markBusy) return;
    setMarkBusy(true);
    setMarkNote('');
    try {
      const r = await fetch('/api/olympus/athena/edit', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          x: Math.round(markPoint.x),
          y: Math.round(markPoint.y),
          instruction: markInstruction.trim(),
          projectSlug: active,
          viewport: { width: Math.round(markPoint.w), height: Math.round(markPoint.h), devicePixelRatio: typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1 },
          route: '/',
        }),
      });
      const d = await r.json().catch(() => null);
      if (r.ok && d?.ok) {
        setMarkNote('Athena recebeu o mark — acompanhe no terminal');
        setMarkInstruction('');
        setMarkMode(false);
      } else setMarkNote(d?.error || 'mark failed');
    } catch (e: any) { setMarkNote(e?.message || 'mark failed'); }
    finally { setMarkBusy(false); }
  }, [active, markPoint, markInstruction, markBusy, headers]);

  useEffect(() => {
    if (!token || !active) { setPreview(null); return; }
    const pull = async () => {
      try {
        // The route probes the port (with one retry) before it calls a live
        // server down; 20s covers that plus a CPU-throttled host.
        const r = await mobileFetch(`/api/olympus/projects/preview?slug=${encodeURIComponent(active)}`, { cache: 'no-store', headers }, 20_000);
        const d = await r.json().catch(() => null);
        if (r.ok && d?.ok) setPreview(d);
      } catch { /* next poll */ }
    };
    void pull();
    const timer = setInterval(() => { if (document.visibilityState !== 'hidden') void pull(); }, 12_000);
    return () => clearInterval(timer);
  }, [token, active, headers]);

  useEffect(() => {
    if (!token || !active) { setGit(null); return; }
    let live = true;
    mobileFetch(`/api/olympus/projects/github?slug=${encodeURIComponent(active)}`, { cache: 'no-store', headers })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (live) setGit(d); })
      .catch(() => { if (live) setGit(null); });
    return () => { live = false; };
  }, [token, active, headers]);

  const onLevel = useCallback((v: number) => {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (now - levelGate.current < 90) return;
    levelGate.current = now;
    setLevel(v);
  }, []);

  const speak = useCallback((text: string) => {
    void speakAs(text, god, language, setSpeaking, onLevel);
  }, [god, language, onLevel]);

  // v0.0.66 — voice needs a secure context. The LAN HTTP page can still drive
  // the app, but the mic is blocked by the browser; this opens the same
  // session over the HTTPS tunnel (the token rides the fragment).
  const openSecure = useCallback(async () => {
    if (tunnelBusy) return;
    setTunnelBusy(true);
    setError(null);
    try {
      let url = tunnelUrl;
      if (!url) {
        const r = await mobileFetch('/api/olympus/mobile/tunnel', {
          method: 'POST', headers, body: JSON.stringify({ action: 'start' }),
        });
        const d = await r.json().catch(() => null);
        if (r.ok && d?.url) { url = String(d.url); setTunnelUrl(url); }
        else setError(d?.error || t('m.secureNeedsTunnel', language));
      }
      if (url && token) {
        // The target is the EXTERNAL tunnel origin, not an internal route.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.assign(`${url}/m#t=${encodeURIComponent(token)}`);
      }
    } catch (e: any) {
      setError(e?.message || t('m.connectionFailed', language));
    } finally { setTunnelBusy(false); }
  }, [tunnelBusy, tunnelUrl, headers, token, language]);

  const askApollo = useCallback(async (text: string) => {
    const prompt = text.trim();
    if (!prompt || busy || !token) return;
    setBusy(true);
    setError(null);
    setLog((l) => [...l.slice(-3), `${t('m.you', language)}: ${prompt}`]);
    try {
      // v0.0.84 edit — after a hibernate/wake the Next server can be
      // restarting exactly when the phone sends. One bounded retry turns a
      // transient 502/abort into delivery instead of a lost prompt.
      let res: Response | null = null;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          res = await mobileFetch('/api/olympus/action', {
            method: 'POST',
            headers,
            body: JSON.stringify({ action: 'prompt', text: prompt, conversationId: active ? `mobile-${active}` : 'mobile' }),
          }, 180_000);
          if (res.ok && res.body) break;
          if (attempt === 0 && (res.status >= 500 || res.status === 0)) {
            await new Promise((r) => setTimeout(r, 1500));
            continue;
          }
          break;
        } catch (e) {
          if (attempt === 0) {
            await new Promise((r) => setTimeout(r, 1500));
            continue;
          }
          throw e;
        }
      }
      if (!res || !res.ok || !res.body) throw new Error(`HTTP ${res?.status ?? 'network'}`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let answer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split('\n\n');
        buffer = frames.pop() || '';
        for (const frame of frames) {
          const line = frame.split('\n').find((l) => l.startsWith('data: '));
          if (!line) continue;
          try {
            const ev = JSON.parse(line.slice(6));
            const msg = ev?.msg || ev?.text || (ev?.part?.text ? String(ev.part.text) : '');
            if (msg) answer = String(msg).replace(/\s+/g, ' ').slice(0, 400);
          } catch { /* keep reading */ }
        }
      }
      const reply = answer || 'Apollo recebeu o pedido.';
      setLog((l) => [...l.slice(-3), reply]);
      speak(reply);
      void load();
    } catch (e: any) {
      setError(e?.message || t('m.connectionFailed', language));
    } finally {
      setBusy(false);
    }
  }, [active, busy, token, headers, language, speak, load]);

  // v0.0.85 — the companion's zero-token answer. "Resumo", "briefing",
  // "me atualiza" and "o que está sendo desenvolvido" read the project
  // document on disk and Apollo speaks it; a real task still goes to the
  // terminal. The same document is the widget's briefing.
  const loadBriefing = useCallback(async (): Promise<ProjectBriefing | null> => {
    if (!token) return null;
    setBriefingBusy(true);
    try {
      const response = await mobileFetch('/api/olympus/briefing', { cache: 'no-store', headers }, 20_000);
      if (!response.ok) return null;
      const data = await response.json().catch(() => null);
      if (data?.ok) setBriefing(data);
      return data;
    } catch { return null; }
    finally { setBriefingBusy(false); }
  }, [token, headers]);

  const speakBriefing = useCallback(async () => {
    const data = briefing?.ok ? briefing : await loadBriefing();
    if (!data?.ok) {
      setError(data?.error || t('m.connectionFailed', language));
      return;
    }
    const speech = briefingSpeech(data, language);
    setLog((lines) => [...lines.slice(-3), `Apollo: ${speech}`]);
    void speakAs(speech, 'apollo', language, setSpeaking, onLevel);
  }, [briefing, loadBriefing, language, onLevel]);

  useEffect(() => {
    if (briefingOpen && !briefing) void loadBriefing();
  }, [briefingOpen, briefing, loadBriefing]);

  const hold = useHoldToTalk({
    language,
    onText: (text) => { if (isBriefingIntent(text)) void speakBriefing(); else void askApollo(text); },
    onError: (message) => setError(message),
  });

  // The verdict is the honest word: a parked/interrupted walk often has no
  // live campaign state, but the user must see 'parado', not 'ocioso'.
  const campaign = (() => {
    const verdict = String(run?.verdict || '').toUpperCase();
    if (verdict === 'RUNNING') return 'running';
    if (verdict === 'PARKED') return 'parked';
    if (verdict === 'INTERRUPTED') return 'interrupted';
    if (verdict === 'IDLE') return 'idle';
    return run?.campaign?.state || 'none';
  })();
  const completed = Number(run?.hops?.completed ?? 0);
  const total = Number(run?.hops?.total ?? 0);
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  const campaignLabel =
    campaign === 'running' ? t('m.stateRunning', language)
      : campaign === 'parked' ? t('m.stateParked', language)
      : campaign === 'interrupted' ? t('m.interrupted', language)
        : campaign === 'unverified' ? t('m.interrupted', language)
          : campaign === 'done' ? t('m.stateDone', language)
            : campaign === 'none' ? t('m.stateIdle', language)
              : campaign;
  // v0.0.81 — resuming a walk is an IDLE action. A live campaign or an
  // in-flight hop means the walker is already holding the lane; showing a
  // resume button there invites a second walk and a lock fight.
  const inFlightCount = Number(run?.hops?.inFlight ?? 0);
  const canResumeWalk = !!active
    && campaign !== 'running'
    && inFlightCount === 0
    && (!!run?.hops?.parked?.hopId || campaign === 'parked' || campaign === 'unverified' || /parked|interrupted/i.test(campaign));
  const activeProject = projects.find((p) => p.slug === active);

  if (!token) {
    return (
      <main className="relative flex min-h-dvh flex-col items-center justify-center bg-olympus-bg px-6 py-10 text-olympus-text">
        <div className="w-full max-w-sm">
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-olympus-gold/40 text-xl font-semibold tracking-[0.2em] text-olympus-gold">O</div>
            <h1 className="text-xl font-semibold tracking-[0.18em]">OLYMPUS</h1>
            <p className="mt-2 text-xs leading-relaxed text-olympus-text-dim">{t('m.connectHint', language)}</p>
          </div>
          <input
            value={tokenDraft}
            onChange={(e) => setTokenDraft(e.target.value)}
            placeholder={t('m.tokenPlaceholder', language)}
            aria-label={t('m.tokenPlaceholder', language)}
            autoCapitalize="none" autoCorrect="off" spellCheck={false}
            className="w-full rounded-xl border border-olympus-gold/20 bg-olympus-panel px-4 py-3.5 text-base outline-none focus:border-olympus-gold/60"
          />
          <button
            onClick={() => {
              const v = tokenDraft.trim();
              if (!v) return;
              try { localStorage.setItem(TOKEN_KEY, v); } catch { /* ignore */ }
              setToken(v);
            }}
            className="mt-3 w-full rounded-xl bg-olympus-gold py-3.5 text-sm font-semibold text-olympus-bg active:scale-[0.99]"
          >{t('m.connect', language)}</button>
          <p className="mt-4 text-center text-[11px] leading-relaxed text-olympus-text-dim">{t('m.connectNote', language)}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="relative flex h-dvh w-full flex-col overflow-hidden bg-olympus-bg text-olympus-text">
      <div className="pointer-events-none absolute inset-0" style={{ background: `radial-gradient(circle at 50% 34%, ${tint}18, transparent 62%)` }} aria-hidden="true" />

      <header className="relative z-10 flex items-center gap-2 px-4 pt-[calc(env(safe-area-inset-top)+10px)] pb-1">
        <span className="h-2 w-2 shrink-0 rounded-full bg-olympus-green shadow-[0_0_8px_var(--olympus-green)]" />
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-semibold tracking-[0.22em]">OLYMPUS</div>
          <div className="truncate text-[10px] text-olympus-text-dim">{active || t('m.noProject', language)} · {campaignLabel}</div>
        </div>
        <Link href="/m/widget" aria-label={t('m.openWidget', language)} className="flex h-11 w-11 items-center justify-center rounded-full border border-olympus-gold/20 text-olympus-gold">
          <Smartphone size={16} />
        </Link>
        <button
          onClick={() => { setNotifyOpen(true); notifications.markRead(); }}
          aria-label={t('w.notifications', language)}
          className="relative flex h-11 w-11 items-center justify-center rounded-full border border-olympus-gold/20 text-olympus-gold"
        >
          <Bell size={16} />
          {notifications.unread > 0 && (
            <span className="absolute right-1 top-1 flex h-3 min-w-3 items-center justify-center rounded-full bg-olympus-gold px-0.5 text-[7px] font-bold text-olympus-bg">
              {notifications.unread > 9 ? '9+' : notifications.unread}
            </span>
          )}
        </button>
        <button onClick={() => setDetailsOpen(true)} aria-label={t('m.details', language)} className="flex h-11 w-11 items-center justify-center rounded-full border border-olympus-gold/20 text-olympus-gold">
          <Settings2 size={16} />
        </button>
      </header>

      {pwa.installEvent && (
        <div className="relative z-10 mx-4 mt-1 flex items-center gap-2 rounded-xl border border-olympus-gold/25 bg-olympus-gold/5 px-3 py-2">
          <Download size={12} className="shrink-0 text-olympus-gold" />
          <p className="min-w-0 flex-1 text-[9px] leading-snug text-olympus-text-dim">{t('m.installHint', language)}</p>
          <button
            onClick={() => void pwa.install()}
            className="shrink-0 rounded-lg bg-olympus-gold px-2.5 py-1.5 text-[9px] font-semibold text-olympus-bg active:scale-[0.98]"
          >
            {t('m.installApp', language)}
          </button>
        </div>
      )}

      <section className="relative z-10 flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-4">
        {!secure && (
          <div className="mb-1 w-full max-w-sm rounded-xl border border-olympus-gold/30 bg-olympus-gold/5 p-2.5 text-center">
            <p className="text-[10px] leading-relaxed text-olympus-gold">{t('m.secureVoice', language)}</p>
            <button
              onClick={() => void openSecure()}
              disabled={tunnelBusy}
              className="mt-1.5 inline-flex items-center gap-1 rounded-lg bg-olympus-gold px-3 py-1.5 text-[10px] font-semibold text-olympus-bg disabled:opacity-40"
            >
              {tunnelBusy ? <Loader2 size={11} className="animate-spin" /> : <Lock size={11} />} {t('m.secureOpen', language)}
            </button>
          </div>
        )}
        <button
          onClick={() => { const intro = `${godName(god, language)} — ${t('m.holdToTalk', language)}`; setLog((l) => [...l.slice(-3), intro]); if (god !== 'apollo') speak(intro); }}
          className="flex items-center gap-1.5 text-[11px] font-mono"
          style={{ color: tint }}
          aria-label={t('m.gods', language)}
        >
          <Sparkles size={12} /> {godName(god, language)}
        </button>

        <PlasmaRing
          tint={tint}
          level={hold.recording ? hold.level : level}
          speaking={speaking}
          recording={hold.recording}
          size={ringSize}
        >
          <button
            onPointerDown={(e) => { e.preventDefault(); if (!secure) { void openSecure(); return; } e.currentTarget.setPointerCapture(e.pointerId); void hold.start(); }}
            onPointerUp={(e) => { e.preventDefault(); hold.stop(false); }}
            onPointerCancel={() => hold.stop(true)}
            onContextMenu={(e) => e.preventDefault()}
            aria-label={t('m.holdToTalk', language)}
            aria-pressed={hold.recording}
            className="flex h-28 w-28 select-none items-center justify-center rounded-full border"
            style={{
              touchAction: 'none',
              borderColor: hold.recording ? palette.red : `${tint}55`,
              background: `radial-gradient(circle at 50% 45%, ${tint}22, transparent 72%)`,
              boxShadow: `0 0 ${hold.recording ? 54 : 28}px ${hold.recording ? palette.red : tint}44`,
            }}
          >
            {hold.transcribing
              ? <Loader2 size={26} className="animate-spin" style={{ color: tint }} />
              : hold.recording
                ? <Mic size={30} style={{ color: palette.red }} />
                : <Mic size={26} style={{ color: tint }} />}
          </button>
        </PlasmaRing>

        <p className="text-center text-[10px] font-mono" style={{ color: hold.recording ? palette.red : palette.textDim }}>
          {hold.recording ? t('m.recordingRelease', language) : hold.transcribing ? t('m.transcribing', language) : busy ? t('m.studioThinking', language) : t('m.holdToTalk', language)}
        </p>

        <div className="mt-1 flex w-full max-w-lg gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
          {GOD_IDS.map((g) => {
            const gt = godTintHex(palette, g);
            const on = g === god;
            return (
              <button
                key={g}
                onClick={() => { setGod(g); void pushStudio({ god: g }); }}
                aria-pressed={on}
                aria-label={godName(g, language)}
                className="flex min-w-[58px] flex-col items-center gap-1 rounded-xl border px-1.5 py-1.5"
                style={{ borderColor: on ? `${gt}99` : `${palette.gold}18`, background: on ? `${gt}18` : 'transparent' }}
              >
                <span className="h-2 w-2 rounded-full" style={{ background: gt }} />
                <span className="max-w-[56px] truncate text-[8px] font-mono" style={{ color: on ? gt : palette.textDim }}>{godName(g, language)}</span>
              </button>
            );
          })}
        </div>

        <p className="text-[9px] font-mono text-olympus-text-dim">
          {total > 0 ? `${pct}% · ${completed}/${total} ${t('m.hops', language)}` : campaignLabel}
          {run?.hops?.parked?.hopId ? ` · ${t('m.parkedAt', language)} ${run.hops.parked.hopId}` : ''}
        </p>

        <button
          onClick={() => { setBriefingOpen(true); void speakBriefing(); }}
          disabled={briefingBusy}
          className="olympus-rise mt-1 inline-flex items-center gap-1.5 rounded-full border border-olympus-gold/30 bg-olympus-gold/5 px-3 py-1.5 text-[10px] font-mono text-olympus-gold disabled:opacity-50"
        >
          {briefingBusy ? <Loader2 size={11} className="animate-spin" /> : <Volume2 size={11} />}
          {t('w.briefing', language)}
        </button>
      </section>

      <div className="relative z-10 px-4 pb-[calc(env(safe-area-inset-bottom)+12px)]">
        {log.slice(-3).map((line, i) => (
          <p key={i} className="mx-auto mb-1 max-w-lg truncate text-center text-[10px] leading-relaxed text-olympus-text-dim">{line}</p>
        ))}
        {error && (
          <button onClick={() => setError(null)} className="mx-auto mb-1 block max-w-lg truncate rounded-lg border border-olympus-red/40 bg-olympus-red/10 px-2 py-1 text-[10px] text-olympus-red">
            {error}
          </button>
        )}
      </div>

      {detailsOpen && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/60" onClick={() => setDetailsOpen(false)} role="dialog" aria-modal="true" aria-label={t('m.details', language)}>
          <div
            className="max-h-[86dvh] w-full overflow-y-auto rounded-t-2xl border-t border-olympus-gold/20 bg-olympus-panel p-4 pb-[calc(env(safe-area-inset-bottom)+16px)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 flex items-center gap-2">
              <Settings2 size={14} className="text-olympus-gold" />
              <span className="text-[12px] font-semibold tracking-wide">{t('m.details', language)}</span>
              <button onClick={() => setDetailsOpen(false)} aria-label={t('m.close', language)} className="p-2 text-olympus-text-dim"><X size={16} /></button>
            </div>
            {/* v0.0.84 — the phone's spend window carries the same measured GO
                bar as the creative and the PC Cost panel; the old line printed
                the $0.00 invoice as if the subscription were free. */}
            <div className="mb-2"><GoUsageBar /></div>

            <div className="rounded-xl border border-olympus-gold/10 bg-olympus-card p-3">
              <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-olympus-text-dim">
                <span>{t('m.campaign', language)}</span>
                <span>{campaignLabel}</span>
              </div>
              <p className="mt-1 text-[11px] leading-relaxed break-words">{run?.line || t('m.waitingWalker', language)}</p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-olympus-bg">
                <div className="h-full rounded-full bg-olympus-gold" style={{ width: `${pct}%` }} />
              </div>
              {(run?.hops?.inFlightList?.length ?? 0) > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {run!.hops!.inFlightList!.map((h) => (
                    <button
                      key={h.hopId}
                      onClick={() => setSheetHop(h.hopId)}
                      aria-label={`Open ${h.hopId}`}
                      data-tip="Open the hop task sheet"
                      className="cursor-pointer rounded-full border border-olympus-cyan/30 px-2 py-0.5 text-[10px] text-olympus-cyan"
                    >
                      {h.hopId}{h.god ? ` · ${h.god}` : ''}
                    </button>
                  ))}
                </div>
              )}
              {run?.hops?.parked?.hopId && (
                <button
                  onClick={() => setSheetHop(run.hops!.parked!.hopId!)}
                  aria-label={`Open parked hop ${run.hops.parked.hopId}`}
                  className="mt-1 cursor-pointer text-[9px] font-mono text-olympus-gold underline decoration-dotted"
                >
                  {t('m.parkedAt', language)} {run.hops.parked.hopId}
                </button>
              )}
              {active && (
                <button
                  onClick={() => { void askApollo(`Nova tarefa: continue o projeto ${active}`); setDetailsOpen(false); }}
                  disabled={busy}
                  className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-olympus-green/40 bg-olympus-green/10 py-2 text-[11px] text-olympus-green disabled:opacity-40"
                >
                  <Play size={12} /> {t('m.resume', language)}
                </button>
              )}
              {active && canResumeWalk && (
                <button
                  onClick={() => void resumeWalk()}
                  className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-olympus-cyan/40 bg-olympus-cyan/10 py-2 text-[11px] text-olympus-cyan"
                  data-tip="Resume only while the lane is idle"
                >
                  <RefreshCw size={12} /> resume the campaign (detached)
                </button>
              )}
              {active && !canResumeWalk && (campaign === 'running' || inFlightCount > 0) && (
                <p className="mt-1 text-[9px] font-mono text-olympus-text-dim">
                  {campaign === 'running' ? t('m.stateRunning', language) : campaignLabel} · resume available when idle
                </p>
              )}
              {queueNote && <p className="mt-1 text-[9px] font-mono text-olympus-cyan">{queueNote}</p>}
              {/* v0.0.68 — the keyboard fallback: when the mic is blocked (HTTP
                  LAN) or the room is loud, type the request to Apollo. */}
              <div className="mt-2 flex items-center gap-1.5">
                <input
                  value={typeDraft}
                  onChange={(e) => setTypeDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && typeDraft.trim()) { const q = typeDraft; setTypeDraft(''); setDetailsOpen(false); void askApollo(q); } }}
                  placeholder={t('m.typeRequest', language)}
                  aria-label={t('m.typeRequest', language)}
                  className="min-w-0 flex-1 rounded-lg border border-olympus-gold/20 bg-olympus-bg px-2.5 py-2 text-[12px] outline-none placeholder:text-olympus-text-dim"
                />
                <button
                  onClick={() => { if (!typeDraft.trim()) return; const q = typeDraft; setTypeDraft(''); setDetailsOpen(false); void askApollo(q); }}
                  disabled={!typeDraft.trim() || busy}
                  aria-label={t('m.send', language)}
                  className="rounded-lg bg-olympus-gold/15 px-3 py-2 text-[10px] font-mono text-olympus-gold ring-1 ring-olympus-gold/30 disabled:opacity-40"
                >{t('m.send', language)}</button>
                <button
                  onClick={() => { const q = typeDraft; setTypeDraft(''); void queuePrompt(q); }}
                  disabled={!typeDraft.trim()}
                  aria-label="Queue for the terminal"
                  data-tip="Queue this prompt for the terminal (the walk keeps running)"
                  className="rounded-lg bg-olympus-cyan/10 px-2.5 py-2 text-[10px] font-mono text-olympus-cyan ring-1 ring-olympus-cyan/30 disabled:opacity-40"
                >queue</button>
              </div>
            </div>

            <div className="mt-2 flex items-center gap-2">
              <select value={active} onChange={(e) => void switchProject(e.target.value)} aria-label={t('m.activeProject', language)} className="min-w-0 flex-1 rounded-xl border border-olympus-gold/15 bg-olympus-bg px-3 py-2.5 text-sm outline-none">
                {projects.length === 0 && <option value="">{t('m.noProjects', language)}</option>}
                {projects.map((p) => <option key={p.slug} value={p.slug}>{p.name || p.slug}</option>)}
              </select>
            </div>

            {active && (
              <div className="mt-2 rounded-xl border border-olympus-gold/10 bg-olympus-card p-3">
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-olympus-text-dim">
                  <span className={`h-2 w-2 rounded-full ${preview?.running ? 'bg-olympus-green' : 'bg-olympus-text-dim/40'}`} />
                  <span>{t('m.preview', language)}</span>
                  {preview?.port && <span className="ml-auto font-mono">:{preview.port}</span>}
                  {previewBusy && <Loader2 size={11} className="animate-spin text-olympus-gold" />}
                </div>
                <p className="mt-1 text-[10px] leading-relaxed text-olympus-text-dim break-words">{preview?.note || '—'}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {preview?.running && preview.recommendedUrl && (
                    <>
                      <button onClick={() => { setPreviewOpen(true); setMarkMode(false); setMarkNote(''); }} className="flex items-center gap-1 rounded-lg bg-olympus-gold px-3 py-2 text-[11px] font-semibold text-olympus-bg"><ExternalLink size={12} /> {t('m.preview', language)}</button>
                      <a href={preview.recommendedUrl} target="_blank" rel="noreferrer" aria-label="Open preview externally" className="rounded-lg border border-olympus-gold/20 px-2 py-2 text-[10px] text-olympus-text-dim"><ExternalLink size={11} /></a>
                    </>
                  )}
                  {!preview?.running && (
                    <button onClick={() => void previewAction('start')} disabled={previewBusy} className="flex items-center gap-1 rounded-lg bg-olympus-gold px-3 py-2 text-[11px] font-semibold text-olympus-bg disabled:opacity-40"><Play size={12} /> {t('m.startPreview', language)}</button>
                  )}
                  {preview?.running && preview.remote && !preview.tunnelUrl && (
                    <button onClick={() => void previewAction('start-tunnel')} disabled={previewBusy || !preview.tunnelAvailable} className="rounded-lg border border-olympus-gold/30 px-3 py-2 text-[11px] text-olympus-gold disabled:opacity-40">{t('m.openTunnel', language)}</button>
                  )}
                  {preview?.tunnelUrl && (
                    <button onClick={() => void previewAction('stop-tunnel')} disabled={previewBusy} className="rounded-lg border border-olympus-gold/20 px-3 py-2 text-[10px] text-olympus-text-dim">{t('m.closeTunnel', language)}</button>
                  )}
                  {preview?.running && (
                    <button onClick={() => void previewAction('stop')} disabled={previewBusy} className="flex items-center gap-1 rounded-lg border border-olympus-red/30 px-3 py-2 text-[10px] text-olympus-red disabled:opacity-40"><Square size={11} /> {t('m.stopPreview', language)}</button>
                  )}
                </div>
              </div>
            )}

            {git && (
              <div className="mt-2 rounded-xl border border-olympus-gold/10 bg-olympus-card p-3">
                <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-olympus-text-dim"><span>{t('m.git', language)}</span><span>{git.branch || '—'}</span></div>
                {git.remote ? (
                  <a href={git.remote.replace(/\.git$/, '')} target="_blank" rel="noreferrer" className="mt-1 block truncate text-[10px] text-olympus-gold">{git.remote}</a>
                ) : (
                  <p className="mt-1 text-[10px] text-olympus-text-dim">{t('m.noRemote', language)}</p>
                )}
                {(git.commits || []).slice(0, 3).map((c) => (
                  <div key={c.hash} className="mt-1 flex items-start gap-2 text-[10px]">
                    <span className="shrink-0 font-mono text-olympus-text-dim">{String(c.hash).slice(0, 7)}</span>
                    <span className="min-w-0 flex-1 truncate">{c.subject}</span>
                    <span className="shrink-0 text-olympus-text-dim">{c.relative}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-2 flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-wider text-olympus-text-dim">{t('settings.language', language)}</span>
              <select value={language} onChange={(e) => setLanguage(e.target.value as Language)} aria-label={t('settings.language', language)} className="ml-auto rounded-lg border border-olympus-gold/20 bg-olympus-bg px-2 py-1.5 text-[11px] outline-none">
                {LANGUAGES.map((l) => <option key={l.id} value={l.id}>{l.native}</option>)}
              </select>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-wider text-olympus-text-dim">{t('m.themeTitle', language)}</span>
              <button onClick={() => void pullTheme()} className="ml-auto flex items-center gap-1 rounded-lg border border-olympus-gold/15 px-2 py-1.5 text-[10px] text-olympus-text-dim"><RefreshCw size={10} /> {t('m.reloadTheme', language)}</button>
              <button onClick={() => setDetailsOpen(false)} className="flex items-center gap-1 rounded-lg border border-olympus-gold/15 px-2 py-1.5 text-[10px] text-olympus-gold"><Palette size={10} /> {t('m.theme', language)}</button>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {THEME_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  onClick={async () => {
                    const next = normalizeThemeState({ ...(theme ?? {}), presetId: preset.id, accent: null, custom: undefined });
                    applyTheme(next, document.documentElement);
                    setTheme(next);
                    try { localStorage.setItem(THEME_KEY, JSON.stringify(next)); } catch { /* private */ }
                    try {
                      const r = await fetch('/api/olympus/theme', { method: 'POST', headers, body: JSON.stringify(next) });
                      const d = await r.json().catch(() => null);
                      if (d?.updatedAt) themeStampRef.current = String(d.updatedAt);
                    } catch { /* the local theme stands */ }
                  }}
                  className="flex items-center gap-1.5 rounded-lg border border-olympus-gold/10 bg-olympus-bg/40 p-2 text-left"
                >
                  <span className="h-3 w-3 rounded-full border border-black/20" style={{ background: preset.colors.bg }} />
                  <span className="h-3 w-3 rounded-full border border-black/20" style={{ background: preset.colors.gold }} />
                  <span className="truncate text-[9px]">{preset.name}</span>
                  {theme?.presetId === preset.id && <Check size={10} className="ml-auto text-olympus-green" />}
                </button>
              ))}
            </div>
            <div className="mt-2 flex items-center gap-2 rounded-lg border border-olympus-gold/15 bg-olympus-bg/40 px-2.5 py-2">
              <span className="flex-1 text-[10px] uppercase tracking-wider text-olympus-text-dim" data-tip="Low-end phone: fewer particles, stable motion; keeps spinners/status">performance mode</span>
              <button
                onClick={() => { const next = !perfMode; setPerfMode(next); setPerformanceMode(next); }}
                aria-pressed={perfMode}
                className={`rounded-full px-2.5 py-1 text-[9px] font-mono ring-1 ${perfMode ? 'bg-olympus-green/15 text-olympus-green ring-olympus-green/30' : 'bg-olympus-gold/10 text-olympus-gold ring-olympus-gold/25'}`}
              >
                {perfMode ? 'on' : 'off'}
              </button>
            </div>
            <Link
              href="/m/widget"
              onClick={() => setDetailsOpen(false)}
              className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-olympus-cyan/30 bg-olympus-cyan/5 py-2 text-[10px] text-olympus-cyan"
            >
              <Smartphone size={11} /> {t('m.openWidget', language)}
            </Link>
            <Link
              href="/m/studio"
              onClick={() => setDetailsOpen(false)}
              className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-olympus-gold/20 py-2 text-[10px] text-olympus-gold"
            >
              <Radio size={11} /> {t('m.studio', language)}
            </Link>
            {pwa.installEvent && (
              <button
                onClick={() => void pwa.install()}
                className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-olympus-gold/30 bg-olympus-gold/10 py-2 text-[10px] text-olympus-gold"
              >
                <Download size={11} /> {t('m.installApp', language)}
              </button>
            )}
            {pwa.installed && (
              <p className="mt-2 text-center text-[9px] font-mono text-olympus-green">{t('m.installed', language)}</p>
            )}
            <button
              onClick={() => { try { localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ } setToken(null); }}
              className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-olympus-red/25 py-2 text-[10px] text-olympus-red"
            >
              <Lock size={11} /> {t('m.lock', language)}
            </button>
          </div>
        </div>
      )}

      {briefingOpen && (
        <div className="fixed inset-0 z-[340] flex items-end bg-black/60" onClick={() => setBriefingOpen(false)} role="dialog" aria-modal="true" aria-label={t('w.briefing', language)}>
          <div
            className="olympus-rise max-h-[88dvh] w-full overflow-y-auto rounded-t-2xl border-t border-olympus-gold/20 bg-olympus-panel p-3 pb-[calc(env(safe-area-inset-bottom)+14px)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-2 flex items-center gap-2 px-1">
              <Sparkles size={13} className="text-olympus-gold" />
              <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-olympus-gold">{t('w.briefing', language)}</span>
              <button onClick={() => setBriefingOpen(false)} aria-label={t('m.close', language)} className="ml-auto p-2 text-olympus-text-dim"><X size={16} /></button>
            </div>
            <CompanionBriefing
              briefing={briefing}
              language={language}
              palette={palette}
              busy={briefingBusy}
              onSpeak={(text, god = 'apollo') => void speakAs(text, god, language, setSpeaking, onLevel)}
              onInvestigate={(text) => { setBriefingOpen(false); void askApollo(text); }}
              onRefresh={() => void loadBriefing()}
            />
          </div>
        </div>
      )}

      <CompanionNotificationsSheet
        open={notifyOpen}
        onClose={() => setNotifyOpen(false)}
        state={notifications}
        language={language}
        palette={palette}
      />
      <CompanionToast state={notifications} language={language} palette={palette} onOpen={() => { setNotifyOpen(true); notifications.markRead(); }} />

      {sheetHop && <TaskSheetModal hopId={sheetHop} onClose={() => setSheetHop(null)} />}

      {/* v0.0.84 — the personal animated preview + mark. The public share link
          has no mark; only the OLYMPUS session can send an Athena edit. */}
      {previewOpen && preview?.recommendedUrl && (
        <div className="fixed inset-0 z-[320] flex flex-col bg-olympus-bg text-olympus-text">
          <header className="flex items-center gap-2 border-b border-olympus-gold/15 px-3 pt-[calc(env(safe-area-inset-top)+8px)] pb-2">
            <button onClick={() => { setPreviewOpen(false); setMarkMode(false); }} aria-label="Close preview" className="flex h-10 w-10 items-center justify-center rounded-full border border-olympus-gold/20 text-olympus-gold"><X size={16} /></button>
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-olympus-gold">preview</div>
              <div className="truncate text-[9px] font-mono text-olympus-text-dim">{active || 'project'} · :{preview.port || '—'} · live app</div>
            </div>
            <button onClick={() => setMarkMode((v) => !v)} aria-pressed={markMode} className={`flex h-10 items-center gap-1 rounded-full border px-3 text-[10px] font-mono ${markMode ? 'border-olympus-red/50 text-olympus-red' : 'border-olympus-cyan/30 text-olympus-cyan'}`}><MousePointerClick size={12} /> mark</button>
            <a href={preview.recommendedUrl} target="_blank" rel="noreferrer" aria-label="Open externally" className="flex h-10 w-10 items-center justify-center rounded-full border border-olympus-gold/20 text-olympus-gold"><ExternalLink size={14} /></a>
          </header>
          <div className="relative min-h-0 flex-1 bg-black">
            <iframe src={preview.recommendedUrl} title={`${active || 'project'} preview`} className="h-full w-full border-0" allow="fullscreen; clipboard-write" />
            {markMode && (
              <button
                aria-label="Place a mark on the preview"
                className="absolute inset-0 cursor-crosshair bg-olympus-red/5"
                onClick={(e) => {
                  const r = e.currentTarget.getBoundingClientRect();
                  setMarkPoint({ x: e.clientX - r.left, y: e.clientY - r.top, w: r.width, h: r.height });
                }}
              />
            )}
            {markPoint && (
              <span className="pointer-events-none absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-olympus-red bg-olympus-red/20" style={{ left: markPoint.x, top: markPoint.y }} />
            )}
          </div>
          <div className="border-t border-olympus-gold/15 bg-olympus-panel px-3 pb-[calc(env(safe-area-inset-bottom)+10px)] pt-2">
            <div className="flex items-center gap-1.5">
              <input
                value={markInstruction}
                onChange={(e) => setMarkInstruction(e.target.value)}
                placeholder={markMode ? 'descreva o que marcar…' : 'ative mark e toque no preview'}
                aria-label="Mark instruction"
                className="min-w-0 flex-1 rounded-lg border border-olympus-gold/20 bg-olympus-bg px-2.5 py-2 text-[12px] outline-none placeholder:text-olympus-text-dim"
              />
              <button onClick={() => void sendMark()} disabled={!markPoint || !markInstruction.trim() || markBusy} className="rounded-lg bg-olympus-gold/15 px-3 py-2 text-[10px] font-mono text-olympus-gold ring-1 ring-olympus-gold/30 disabled:opacity-40">
                {markBusy ? <Loader2 size={12} className="animate-spin" /> : 'enviar'}
              </button>
            </div>
            <div className="mt-1 flex items-center gap-2 text-[8px] font-mono text-olympus-text-dim">
              <span>{markMode ? (markPoint ? `mark em ${Math.round(markPoint.x)},${Math.round(markPoint.y)}` : 'toque no preview') : 'o app é interativo; mark ativa a mira'}</span>
              {markNote && <span className="ml-auto text-olympus-cyan">{markNote}</span>}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
