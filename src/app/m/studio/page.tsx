'use client';

/**
 * /m/studio — v0.0.63: creativity, sized for the hand.
 *
 * The desktop's ImmersivePanel is a three-column surface (gods, constellation,
 * orb). A phone cannot host that grid, so this page keeps the SAME visual
 * language and the SAME machinery — PlasmaRing, the
 * per-god voice (`speakAs`), the live run-state and the studio chat — stacked
 * in one column with 44px targets.
 *
 * No new theme, no new reference, no new panel: this is the existing studio
 * adapted to the phone (the v0.0.63 surface freeze).
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2, Send, Sparkles, Volume2, VolumeX, Zap } from 'lucide-react';
import PlasmaRing from '@/components/olympus/plasma-ring';
import ProgressStrip from '@/components/olympus/progress-strip';
import GoUsageBar from '@/components/olympus/go-usage-bar';
import TaskSheetModal from '@/components/olympus/task-sheet-modal';
import { normalizeThemeState, resolvePalette, type ThemeState } from '@/lib/theme';
import { t, useLanguage } from '@/lib/i18n';
import { godPersona } from '@/lib/god-personas';
import { godName } from '@/lib/i18n';
import { GOD_VOICE, setVoiceEnabled, speakAs, voiceEnabled } from '@/lib/voice';
import { mobileFetch } from '@/lib/mobile-fetch';

const GOD_IDS = ['apollo', 'atlas', 'artemis', 'athena', 'dionysus', 'hephaestus', 'hermes', 'persephone', 'prometheus', 'callimachus'];

const TOKEN_KEY = 'olympus:mobile-token';
const THEME_KEY = 'olympus:mobile-theme';

type RunState = {
  line?: string;
  campaign?: { state?: string };
  hops?: {
    completed?: number;
    total?: number;
    inFlightList?: Array<{ hopId: string; god?: string }>;
    parked?: { hopId?: string; reason?: string } | null;
  };
};

type ChatMsg = { role: 'user' | 'god'; text: string; god?: string };
type SpeedState = {
  last?: { outTokPerSec: number; ttftMs: number | null; model: string } | null;
  hops?: { stat?: { n: number; avg: number; p50: number; p95: number } | null; recent?: Array<{ hop: string; god: string | null; outTokPerSec: number }> };
}

function godTint(palette: ReturnType<typeof resolvePalette>, god: string): string {
  const map: Record<string, string> = {
    apollo: palette.gold, atlas: palette.amberSoft, artemis: palette.red, athena: palette.purple,
    dionysus: palette.green, hephaestus: palette.blue, hermes: palette.cyan,
    persephone: palette.amber, prometheus: palette.teal, callimachus: palette.amberSoft,
  };
  return map[god] ?? palette.cyan;
}

export default function MobileStudio() {
  const language = useLanguage();
  const [token, setToken] = useState<string | null>(null);
  const [theme, setTheme] = useState<ThemeState | null>(null);
  const [god, setGod] = useState('apollo');
  const [run, setRun] = useState<RunState | null>(null);
  const [voice, setVoice] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [level, setLevel] = useState(0);
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeSlug, setActiveSlug] = useState('');
  const [queue, setQueue] = useState<Array<{ id: string; text: string; status: string; createdAt: string }>>([]);
  const [queueText, setQueueText] = useState('');
  // v0.0.77 — tapping a hop opens its info sheet on the phone too.
  const [sheetHop, setSheetHop] = useState<string | null>(null);
  const [feed, setFeed] = useState<Array<{ type: string; title: string; body: string; ts: string }>>([]);
  const [speed, setSpeed] = useState<SpeedState | null>(null);
  const studioStampRef = useRef('');
  const levelGate = useRef(0);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    try { setToken(localStorage.getItem(TOKEN_KEY)); } catch { /* private */ }
    setVoice(voiceEnabled());
    try {
      const cached = localStorage.getItem(THEME_KEY);
      if (cached) setTheme(JSON.parse(cached));
    } catch { /* private */ }
    mobileFetch('/api/olympus/theme', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.ok && d.state) setTheme(d.state); })
      .catch(() => { /* offline */ });
    (() => { const t = (() => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } })(); return mobileFetch('/api/olympus/projects', { cache: 'no-store', headers: t ? { 'x-olympus-token': t } : undefined }); })()
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.active?.slug) setActiveSlug(String(d.active.slug)); })
      .catch(() => { /* the progress strip hides */ });
  }, []);

  const headers = useMemo<Record<string, string>>(() => {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) h['x-olympus-token'] = token;
    return h;
  }, [token]);

  useEffect(() => {
    if (!token) return;
    const load = () => {
      if (document.visibilityState === 'hidden') return;
      mobileFetch('/api/olympus/run-state', { cache: 'no-store', headers })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => { if (d) setRun(d); })
        .catch(() => { /* offline */ });
    };
    load();
    const timer = setInterval(load, 5000);
    return () => clearInterval(timer);
  }, [token, headers]);

  // v0.0.64 — the studio mirrors the other surface (god + voice).
  const pullStudio = useCallback(async () => {
    try {
      const r = await mobileFetch('/api/olympus/studio/state', { cache: 'no-store', headers });
      const d = await r.json().catch(() => null);
      if (!r.ok || !d?.ok) return;
      const stamp = String(d.updatedAt || '');
      if (stamp && stamp === studioStampRef.current) return;
      studioStampRef.current = stamp;
      if (typeof d.god === 'string' && GOD_IDS.includes(d.god)) setGod(d.god);
      if (typeof d.voice === 'boolean') { setVoice(d.voice); setVoiceEnabled(d.voice); }
    } catch { /* offline */ }
  }, [headers]);

  const pushStudio = useCallback(async (patch: { god?: string; voice?: boolean }) => {
    try {
      const r = await fetch('/api/olympus/studio/state', {
        method: 'POST', headers, body: JSON.stringify(patch),
      });
      const d = await r.json().catch(() => null);
      if (d?.updatedAt) studioStampRef.current = String(d.updatedAt);
    } catch { /* the local choice stands */ }
  }, [headers]);

  const loadQueue = useCallback(async () => {
    if (!activeSlug) return;
    try {
      const r = await mobileFetch(`/api/olympus/prompt-queue?project=${encodeURIComponent(activeSlug)}`, { cache: 'no-store', headers });
      const d = await r.json().catch(() => null);
      if (r.ok && d?.ok) setQueue(Array.isArray(d.items) ? d.items : []);
    } catch { /* next poll */ }
  }, [activeSlug, headers]);

  const loadFeed = useCallback(async () => {
    try {
      const r = await mobileFetch('/api/olympus/notify?limit=6', { cache: 'no-store', headers });
      const d = await r.json().catch(() => null);
      if (r.ok && d?.ok) setFeed(Array.isArray(d.events) ? d.events : []);
    } catch { /* next poll */ }
  }, [headers]);

  useEffect(() => {
    if (!token) { setSpeed(null); return; }
    let live = true;
    const pull = async () => {
      try {
        const q = activeSlug ? `?project=${encodeURIComponent(activeSlug)}` : '';
        const r = await mobileFetch(`/api/olympus/token-speed${q}`, { cache: 'no-store', headers });
        const d = await r.json().catch(() => null);
        if (live && r.ok && d?.ok) setSpeed(d as SpeedState);
      } catch { /* next poll */ }
    };
    void pull();
    const timer = setInterval(() => { if (document.visibilityState !== 'hidden') void pull(); }, 30_000);
    return () => { live = false; clearInterval(timer); };
  }, [token, activeSlug, headers]);

  useEffect(() => {
    void pullStudio();
    void loadQueue();
    void loadFeed();
    const timer = setInterval(() => {
      if (document.visibilityState !== 'hidden') { void pullStudio(); void loadQueue(); void loadFeed(); }
    }, 10_000);
    return () => clearInterval(timer);
  }, [pullStudio, loadQueue, loadFeed]);

  const enqueue = async () => {
    const text = queueText.trim();
    if (!text || !activeSlug) return;
    setQueueText('');
    try {
      const r = await fetch('/api/olympus/prompt-queue', {
        method: 'POST', headers, body: JSON.stringify({ project: activeSlug, text, source: 'creative', god }),
      });
      const d = await r.json().catch(() => null);
      if (r.ok && d?.ok) setQueue(Array.isArray(d.items) ? d.items : []);
      else setError(d?.error || t('m.connectionFailed', language));
    } catch (e: any) { setError(e?.message || t('m.connectionFailed', language)); }
  };

  const sendQueued = async (id: string, text: string) => {
    await askApollo(text);
    try {
      await fetch('/api/olympus/prompt-queue', { method: 'PATCH', headers, body: JSON.stringify({ id, status: 'sent' }) });
      void loadQueue();
    } catch { /* the item stays queued; the user can retry */ }
  };

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ block: 'end' });
  }, [chat, busy]);

  const palette = useMemo(() => resolvePalette(normalizeThemeState(theme)), [theme]);
  const tint = godTint(palette, god);
  const persona = godPersona(god, language);
  const voiceProfile = GOD_VOICE[god] ?? GOD_VOICE.apollo;

  const onLevel = useCallback((v: number) => {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (now - levelGate.current < 90) return;
    levelGate.current = now;
    setLevel(v);
  }, []);

  const speak = useCallback((text: string) => {
    void speakAs(text, god, language, setSpeaking, onLevel);
  }, [god, language, onLevel]);

  const toggleVoice = () => {
    setVoice((v) => {
      const next = !v;
      setVoiceEnabled(next);
      if (!next && typeof window !== 'undefined') window.speechSynthesis?.cancel();
      void pushStudio({ voice: next });
      return next;
    });
  };

  const ask = useCallback(async (override?: string) => {
    const question = (override ?? input).trim();
    if (!question || busy) return;
    setInput('');
    setChat((prev) => [...prev, { role: 'user' as const, text: question }].slice(-10));
    setBusy(true);
    setError(null);
    try {
      let answer = '';
      try {
        const r = await mobileFetch('/api/olympus/studio/converse', {
          method: 'POST',
          headers: { ...headers, 'x-olympus-language': language },
          body: JSON.stringify({ message: question, god, language }),
        }, 120_000);
        if (r.ok) {
          const d = await r.json();
          if (d?.ok && d.answer) answer = String(d.answer);
        }
      } catch { /* fall through */ }
      if (!answer) {
        const r = await mobileFetch('/api/olympus/studio/chat', {
          method: 'POST',
          headers: { ...headers, 'x-olympus-language': language },
          body: JSON.stringify({ question, god, language }),
        }, 120_000);
        const d = await r.json().catch(() => null);
        answer = String(d?.answer || t('m.studioIdle', language));
      }
      setChat((prev) => [...prev, { role: 'god' as const, text: answer, god }].slice(-10));
      if (voice) speak(answer);
    } catch {
      setError(t('m.connectionFailed', language));
    } finally {
      setBusy(false);
    }
  }, [input, busy, headers, language, god, voice, speak]);

  // v0.0.81 — the creative studio is chat + project + hops, NO microphone.
  // The hold-to-talk ring lives only on /m (the home screen); here the ring
  // is the god's visual identity, not an input device.
  const askApollo = useCallback(async (text: string) => {
    const prompt = text.trim();
    if (!prompt || busy) return;
    setChat((prev) => [...prev, { role: 'user' as const, text: prompt }].slice(-10));
    setBusy(true);
    setError(null);
    try {
      const res = await mobileFetch('/api/olympus/action', {
        method: 'POST',
        headers,
        body: JSON.stringify({ action: 'prompt', text: prompt, conversationId: activeSlug ? `mobile-${activeSlug}` : 'mobile' }),
      }, 180_000);
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
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
            if (msg) answer = String(msg).replace(/\s+/g, ' ').slice(0, 600);
          } catch { /* keep reading */ }
        }
      }
      setChat((prev) => [...prev, { role: 'god' as const, text: answer || 'Apollo recebeu o pedido.', god: 'apollo' }].slice(-10));
      if (voice && answer) speak(answer);
    } catch (e: any) {
      setError(e?.message || t('m.connectionFailed', language));
    } finally {
      setBusy(false);
    }
  }, [activeSlug, busy, headers, language, speak, voice]);

  const inFlight = run?.hops?.inFlightList ?? [];
  const completed = Number(run?.hops?.completed ?? 0);
  const total = Number(run?.hops?.total ?? 0);
  const pct = total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0;

  return (
    <main className="relative min-h-dvh bg-olympus-bg text-olympus-text pb-[env(safe-area-inset-bottom)]">
      {/* v0.0.70 — one canvas on a phone: the ring. The ambient field is a
          static gradient here; the full particle field stays on the desktop. */}
      <div className="pointer-events-none fixed inset-0" style={{ background: `radial-gradient(circle at 50% 22%, ${palette.gold}14, transparent 62%)` }} aria-hidden="true" />
      <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-olympus-gold/10 bg-olympus-bg/95 px-3 pt-[calc(env(safe-area-inset-top)+8px)] pb-2.5 backdrop-blur">
        <Link
          href="/m"
          aria-label={t('m.studioBack', language)}
          className="flex h-11 w-11 items-center justify-center rounded-full border border-olympus-gold/20 text-olympus-gold"
        >
          <ArrowLeft size={17} />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-olympus-gold">{t('m.studioTitle', language)}</div>
          <div className="truncate text-[10px] text-olympus-text-dim">{t('m.studioHint', language)}</div>
        </div>
        <button
          onClick={toggleVoice}
          aria-pressed={voice}
          aria-label={t('m.studioSpeak', language)}
          className={`flex h-11 w-11 items-center justify-center rounded-full border ${voice ? 'border-olympus-green/50 text-olympus-green' : 'border-olympus-gold/20 text-olympus-text-dim'}`}
        >
          {voice ? <Volume2 size={17} /> : <VolumeX size={17} />}
        </button>
      </header>

      <section className="relative z-10 mx-auto w-full max-w-lg px-3 pt-3 space-y-3">
        <GoUsageBar token={token} />
        {(speed?.last || speed?.hops?.stat) && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-olympus-gold/15 bg-olympus-panel/60 px-2 py-1 text-[9px] font-mono text-olympus-text-dim">
            <Zap size={10} className="text-olympus-cyan" />
            {speed?.last ? <span><span className="text-olympus-green tabular-nums">{speed.last.outTokPerSec.toFixed(1)}</span> tok/s last turn{speed.last.ttftMs != null ? ` · ttft ${Math.round(speed.last.ttftMs)}ms` : ''}</span> : <span>— last turn</span>}
            {speed?.hops?.stat ? <span>· <span className="text-olympus-green tabular-nums">{speed.hops.stat.p50.toFixed(1)}</span> tok/s hop (p50, {speed.hops.stat.n})</span> : null}
          </div>
        )}
        {activeSlug && (
          <ProgressStrip
            slug={activeSlug}
            god={god}
            language={language}
            token={token}
            onExplain={(text, g) => {
              setChat((prev) => [...prev, { role: 'god' as const, text, god: g }].slice(-10));
              if (voice) speak(text);
            }}
          />
        )}
        {/* the god + the orb */}
        <div className="rounded-2xl border border-olympus-gold/15 bg-olympus-panel p-4">
          <div className="flex items-center gap-2">
            <Sparkles size={13} style={{ color: tint }} />
            <span className="text-[11px] font-semibold" style={{ color: tint }}>{persona.name}</span>
            <span className="truncate text-[10px] text-olympus-text-dim">{persona.epithet}</span>
          </div>
          <div className="mt-3 flex flex-col items-center">
            <PlasmaRing
              tint={tint}
              level={level}
              speaking={speaking && voice}
              recording={false}
              size={220}
            >
              <div
                aria-hidden="true"
                className="flex h-24 w-24 select-none items-center justify-center rounded-full border"
                style={{
                  borderColor: `${tint}55`,
                  background: `radial-gradient(circle at 50% 45%, ${tint}22, transparent 72%)`,
                  boxShadow: `0 0 26px ${tint}44`,
                }}
              >
                <Sparkles size={26} style={{ color: tint }} />
              </div>
            </PlasmaRing>
            <div className="mt-2 grid w-full grid-cols-2 gap-x-3 gap-y-1 text-[10px]">
              <span className="text-olympus-text-dim">{t('m.domain', language)}</span>
              <span className="truncate text-olympus-text">{persona.domain}</span>
              <span className="text-olympus-text-dim">{t('m.tone', language)}</span>
              <span className="text-olympus-text">{persona.tone}</span>
            </div>
            <select
              value={god}
              onChange={(e) => { setGod(e.target.value); void pushStudio({ god: e.target.value }); }}
              aria-label={t('m.studioGods', language)}
              className="mt-3 w-full rounded-xl border border-olympus-gold/20 bg-olympus-bg px-3 py-2.5 text-sm outline-none"
              style={{ borderColor: `${tint}44` }}
            >
              {GOD_IDS.map((g) => (
                <option key={g} value={g}>{godName(g, language)}</option>
              ))}
            </select>
            <p className="mt-2 text-center text-[10px] text-olympus-text-dim">
              {voice ? t('m.studioSpeak', language) : t('m.studioHint', language)} · {voiceProfile.rate.toFixed(2)}× / {voiceProfile.pitch.toFixed(2)}
            </p>
          </div>
        </div>

        {/* the campaign, live */}
        <div className="rounded-2xl border border-olympus-gold/10 bg-olympus-card p-3">
          <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-olympus-text-dim">
            <span>{t('m.studioGods', language)}</span>
            <span>{completed}/{total} {t('m.hops', language)}</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-olympus-bg">
            <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${pct}%`, background: tint }} />
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-olympus-text-dim break-words">
            {run?.line || t('m.studioIdle', language)}
          </p>
          {inFlight.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {inFlight.map((h) => (
                <button
                  key={h.hopId}
                  onClick={() => setSheetHop(h.hopId)}
                  aria-label={`Open ${h.hopId}`}
                  className="rounded-full border px-2 py-0.5 text-[10px]"
                  style={{ borderColor: `${godTint(palette, h.god || 'apollo')}44`, color: godTint(palette, h.god || 'apollo') }}
                >
                  {h.hopId}{h.god ? ` · ${h.god}` : ''}
                </button>
              ))}
            </div>
          )}
          {run?.hops?.parked?.hopId && (
            <p className="mt-2 text-[10px] text-olympus-gold">
              {t('m.parkedAt', language)} {run.hops.parked.hopId}{run.hops.parked.reason ? ` — ${run.hops.parked.reason}` : ''}
            </p>
          )}
        </div>

        {/* v0.0.64 — the development feed (project notifications). */}
        {feed.length > 0 && (
          <div className="rounded-2xl border border-olympus-gold/10 bg-olympus-card p-3">
            <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-olympus-text-dim">
              <span>{t('m.development', language)}</span>
              <span>{feed.length}</span>
            </div>
            <div className="mt-1.5 space-y-1">
              {feed.slice(0, 6).map((ev, i) => (
                <div key={`${ev.ts}:${i}`} className="flex items-start gap-1.5 text-[10px]">
                  <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: ev.type === 'error' ? palette.red : ev.type === 'walk' ? palette.cyan : ev.type === 'design' ? palette.purple : palette.green }} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-olympus-text">{ev.title}</span>
                    <span className="block truncate text-olympus-text-dim">{ev.body}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* v0.0.64 — the shared prompt queue: enqueue now, send when ready. */}
        {activeSlug && (
          <div className="rounded-2xl border border-olympus-gold/10 bg-olympus-card p-3">
            <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-olympus-text-dim">
              <span>{t('m.queue', language)}</span>
              <span>{queue.filter((q) => q.status === 'queued').length}</span>
            </div>
            <div className="mt-1.5 flex items-center gap-1.5">
              <input
                value={queueText}
                onChange={(e) => setQueueText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void enqueue(); } }}
                placeholder={t('m.queuePlaceholder', language)}
                aria-label={t('m.queuePlaceholder', language)}
                className="min-w-0 flex-1 rounded-lg border border-olympus-gold/20 bg-olympus-bg px-2.5 py-2 text-[12px] outline-none placeholder:text-olympus-text-dim"
              />
              <button onClick={() => void enqueue()} disabled={!queueText.trim()} className="rounded-lg bg-olympus-gold/15 px-3 py-2 text-[10px] font-mono text-olympus-gold ring-1 ring-olympus-gold/30 disabled:opacity-40">
                {t('m.enqueue', language)}
              </button>
            </div>
            {queue.length > 0 && (
              <div className="mt-2 space-y-1">
                {queue.slice(-6).map((q) => (
                  <div key={q.id} className="flex items-center gap-1.5 rounded-lg border border-olympus-gold/10 bg-olympus-bg/40 px-2 py-1.5">
                    <span className={`text-[8px] font-mono uppercase ${q.status === 'sent' ? 'text-olympus-green' : 'text-olympus-cyan'}`}>{q.status}</span>
                    <span className="min-w-0 flex-1 truncate text-[10px] text-olympus-text">{q.text}</span>
                    {q.status === 'queued' && (
                      <button onClick={() => void sendQueued(q.id, q.text)} disabled={busy} className="rounded px-1.5 py-0.5 text-[8px] font-mono text-olympus-gold ring-1 ring-olympus-gold/25 disabled:opacity-40">
                        {t('m.sendNow', language)}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* the conversation */}
        <div className="rounded-2xl border border-olympus-gold/15 bg-olympus-panel p-3">
          <div className="max-h-[38dvh] space-y-1.5 overflow-y-auto pr-0.5">
            {chat.length === 0 ? (
              <p className="text-[11px] leading-relaxed text-olympus-text-dim">{t('m.studioHint', language)}</p>
            ) : chat.map((m, i) => (
              <div key={`${m.role}:${i}`} className={m.role === 'user' ? 'text-right' : 'text-left'}>
                <span
                  className="inline-block max-w-full whitespace-pre-wrap rounded-xl px-2.5 py-2 text-left text-[12px] leading-relaxed"
                  style={{
                    background: m.role === 'user' ? `${palette.gold}18` : `${godTint(palette, m.god || god)}14`,
                    border: `1px solid ${m.role === 'user' ? palette.gold : godTint(palette, m.god || god)}33`,
                  }}
                >{m.text.replace(/\*\*/g, '')}</span>
              </div>
            ))}
            {busy && (
              <p className="flex items-center gap-1.5 text-[10px] text-olympus-text-dim">
                <Loader2 size={11} className="animate-spin" /> {t('m.studioThinking', language)}
              </p>
            )}
            <div ref={chatEndRef} />
          </div>
          <div className="mt-2 flex items-center gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void ask(); } }}
              placeholder={t('m.studioSay', language)}
              aria-label={t('m.studioSay', language)}
              className="min-w-0 flex-1 rounded-xl border border-olympus-gold/20 bg-olympus-bg px-3 py-2.5 text-base outline-none placeholder:text-olympus-text-dim"
            />
            <button
              onClick={() => void ask()}
              disabled={busy || !input.trim()}
              aria-label={t('m.studioSpeak', language)}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-olympus-gold text-olympus-bg disabled:opacity-40"
            >
              <Send size={16} />
            </button>
          </div>
          {error && <p className="mt-2 text-[10px] text-olympus-red">{error}</p>}
        </div>

        <div className="h-4" />
      </section>
      {sheetHop && <TaskSheetModal hopId={sheetHop} onClose={() => setSheetHop(null)} />}
    </main>
  );
}

