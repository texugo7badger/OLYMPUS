'use client';

/**
 * /m — the mobile companion.
 *
 * The same app, the same server, the same campaign: a phone-sized surface to
 * see what the gods are doing, switch the active project, send a prompt (by
 * typing or voice) and open the live preview.
 *
 * v0.0.63 — three fixes from the field:
 *   1. PREVIEW: the URL comes from `/api/olympus/projects/preview`, which
 *      knows the desktop's LAN address and can open an HTTPS tunnel for the
 *      project port. The old `http://<location.hostname>:<port>` could never
 *      work over the tunnel (wrong host, mixed content).
 *   2. LANGUAGE: every label comes from the shared dictionary, and the phone
 *      adopts the desktop's language on boot (it never overwrites it).
 *   3. CREATIVITY: `/m/studio` carries the same particles, orb and voice.
 *
 * Auth: the pairing QR carries the session token in the URL FRAGMENT. The
 * token is stored in localStorage and sent as `x-olympus-token`, which is the
 * header `requireAuth` already trusts in lan/tunnel mode. The fragment never
 * reaches the server in a request line.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Check, ExternalLink, Loader2, Mic, Palette, Play, Radio, RefreshCw,
  Send, Sparkles, Square, Volume2, X,
} from 'lucide-react';
import MobileAmbient from '@/components/olympus/mobile-ambient';
import { THEME_PRESETS, applyTheme, normalizeThemeState, type ThemeState } from '@/lib/theme';
import { LANGUAGES, setLanguage, speechLocale, t, useLanguage, type Language } from '@/lib/i18n';
import { speakAs } from '@/lib/voice';

type Project = {
  slug: string;
  name: string;
  path?: string;
  livePreviewPort?: number;
  brief?: { status?: string; completed?: number; total?: number };
};

type RunState = {
  verdict?: string;
  line?: string;
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
  slug: string;
  name?: string | null;
  port: number | null;
  running: boolean;
  remote: boolean;
  lanUrl: string | null;
  localUrl: string;
  tunnelUrl: string | null;
  recommendedUrl: string | null;
  tunnelAvailable: boolean;
  probeMs?: number | null;
  note: string;
  error?: string;
};

const TOKEN_KEY = 'olympus:mobile-token';
const THEME_KEY = 'olympus:mobile-theme';
const AMBIENT_KEY = 'olympus:mobile-ambient';

export default function MobileCompanion() {
  const language = useLanguage();
  const [token, setToken] = useState<string | null>(null);
  const [tokenDraft, setTokenDraft] = useState('');
  const [projects, setProjects] = useState<Project[]>([]);
  const [active, setActive] = useState<string>('');
  const [run, setRun] = useState<RunState | null>(null);
  const [cost, setCost] = useState<{ spend?: number; rows?: number } | null>(null);
  const [git, setGit] = useState<{ remote?: string | null; branch?: string | null; commits?: Array<{ hash: string; subject: string; relative: string }>; ghReady?: boolean } | null>(null);
  const [text, setText] = useState('');
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [unattended, setUnattended] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // v0.0.60 — the phone is a second surface of the SAME theme: it inherits
  // the desktop's store on load, polls for changes, and writes back.
  const [theme, setTheme] = useState<ThemeState | null>(null);
  const [themeOpen, setThemeOpen] = useState(false);
  const [themeBusy, setThemeBusy] = useState(false);
  const [ambient, setAmbient] = useState(true);
  // v0.0.63 — the preview is a SERVER answer, not a client-side guess.
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const themeStampRef = useRef<string>('');
  const abortRef = useRef<AbortController | null>(null);
  const logRef = useRef<HTMLDivElement | null>(null);

  // Boot: token from the QR fragment, then localStorage.
  useEffect(() => {
    try { setAmbient(localStorage.getItem(AMBIENT_KEY) !== 'off'); } catch { /* default on */ }
    try {
      const hash = window.location.hash || '';
      const fromHash = new URLSearchParams(hash.replace(/^#/, '')).get('t');
      if (fromHash) {
        localStorage.setItem(TOKEN_KEY, fromHash);
        // Drop the fragment from the address bar after storing it.
        history.replaceState(null, '', window.location.pathname + window.location.search);
      }
      const stored = fromHash || localStorage.getItem(TOKEN_KEY) || '';
      if (stored) setToken(stored);
    } catch { /* no storage */ }
  }, []);

  const headers = useMemo<Record<string, string>>(() => {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) h['x-olympus-token'] = token;
    return h;
  }, [token]);

  const applyLocalTheme = useCallback((value: ThemeState, stamp?: string | null) => {
    const next = normalizeThemeState(value);
    applyTheme(next, document.documentElement);
    setTheme(next);
    if (stamp !== undefined) themeStampRef.current = stamp || '';
    try { localStorage.setItem(THEME_KEY, JSON.stringify(next)); } catch { /* private */ }
  }, []);

  const pullTheme = useCallback(async () => {
    try {
      const r = await fetch('/api/olympus/theme', { cache: 'no-store' });
      const d = await r.json();
      if (!d?.ok || !d.state) return;
      const stamp = String(d.updatedAt || '');
      if (stamp && stamp === themeStampRef.current) return;
      applyLocalTheme(d.state, stamp);
    } catch { /* offline: keep the local theme */ }
  }, [applyLocalTheme]);

  const saveTheme = useCallback(async (next: ThemeState) => {
    applyLocalTheme(next, themeStampRef.current);
    setThemeBusy(true);
    try {
      const r = await fetch('/api/olympus/theme', {
        method: 'POST',
        headers,
        body: JSON.stringify(next),
      });
      const d = await r.json().catch(() => null);
      if (d?.updatedAt) themeStampRef.current = d.updatedAt;
    } catch { /* the local theme stands; the next poll retries */ }
    finally { setThemeBusy(false); }
  }, [applyLocalTheme, headers]);

  // Boot: a cached palette paints immediately, then the desktop's store wins.
  // The language boot lives in i18n.ts (`useLanguage` above): the phone READS
  // the desktop's choice and never writes it back.
  useEffect(() => {
    try {
      const cached = localStorage.getItem(THEME_KEY);
      if (cached) applyLocalTheme(JSON.parse(cached));
    } catch { /* private */ }
    void pullTheme();
    const timer = setInterval(() => {
      if (document.visibilityState !== 'hidden' && !themeOpen) void pullTheme();
    }, 10_000);
    return () => clearInterval(timer);
  }, [applyLocalTheme, pullTheme, themeOpen]);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const [pRes, rRes, cRes] = await Promise.all([
        fetch('/api/olympus/projects', { cache: 'no-store', headers }),
        fetch('/api/olympus/run-state', { cache: 'no-store', headers }),
        fetch('/api/olympus/costs?window=24h', { cache: 'no-store', headers }),
      ]);
      if (pRes.ok) {
        const d = await pRes.json();
        setProjects(Array.isArray(d.projects) ? d.projects : []);
        setActive(String(d.active?.slug || ''));
      }
      if (rRes.ok) setRun(await rRes.json());
      if (cRes.ok) {
        const d = await cRes.json();
        setCost({ spend: Number(d?.spend ?? d?.stepCost ?? d?.total ?? 0), rows: Number(d?.rows ?? 0) });
      }
      setError(null);
    } catch (e: any) {
      setError(e?.message || t('m.connectionFailed', language));
    }
  }, [token, headers, language]);

  useEffect(() => {
    if (!token) return;
    void load();
    const timer = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      void load();
    }, 5000);
    return () => clearInterval(timer);
  }, [token, load]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [log]);

  // v0.0.63 — the preview truth comes from the server (LAN address + tunnel).
  const pullPreview = useCallback(async () => {
    if (!token || !active) { setPreview(null); return; }
    try {
      const r = await fetch(`/api/olympus/projects/preview?slug=${encodeURIComponent(active)}`, { cache: 'no-store', headers });
      const d = await r.json().catch(() => null);
      if (r.ok && d?.ok) setPreview(d);
    } catch { /* the next poll retries */ }
  }, [token, active, headers]);

  useEffect(() => {
    if (!token || !active) { setPreview(null); return; }
    void pullPreview();
    const timer = setInterval(() => {
      if (document.visibilityState !== 'hidden') void pullPreview();
    }, 12_000);
    return () => clearInterval(timer);
  }, [token, active, pullPreview]);

  const previewAction = useCallback(async (action: 'start' | 'stop' | 'start-tunnel' | 'stop-tunnel') => {
    if (!active || previewBusy) return;
    setPreviewBusy(true);
    setError(null);
    try {
      const post = async () => {
        const r = await fetch('/api/olympus/projects/preview', {
          method: 'POST',
          headers,
          body: JSON.stringify({ slug: active, action }),
        });
        const d = await r.json().catch(() => null);
        if (d) setPreview(d);
        if (!r.ok) setError(d?.error || t('m.error', language));
        return { ok: r.ok, data: d as PreviewState | null };
      };
      const first = await post();
      // A dev server takes seconds to bind: poll the probe instead of
      // declaring "not running" the instant the spawn returns.
      if (action === 'start' && first.ok) {
        for (let i = 0; i < 10; i += 1) {
          await new Promise((r) => setTimeout(r, 1500));
          const r = await fetch(`/api/olympus/projects/preview?slug=${encodeURIComponent(active)}`, { cache: 'no-store', headers });
          const d = await r.json().catch(() => null);
          if (d?.ok && d.running) { setPreview(d); break; }
        }
      }
    } catch (e: any) {
      setError(e?.message || t('m.connectionFailed', language));
    } finally {
      setPreviewBusy(false);
    }
  }, [active, previewBusy, headers, language]);

  // Git, per project — the phone sees the repo and the last commits. Read-only.
  useEffect(() => {
    if (!token || !active) { setGit(null); return; }
    let live = true;
    fetch(`/api/olympus/projects/github?slug=${encodeURIComponent(active)}`, { cache: 'no-store', headers })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (live) setGit(d); })
      .catch(() => { if (live) setGit(null); });
    return () => { live = false; };
  }, [token, active, headers]);

  const switchProject = async (slug: string) => {
    setActive(slug);
    setPreview(null);
    try {
      await fetch('/api/olympus/projects/active', {
        method: 'PUT',
        headers,
        body: JSON.stringify({ slug }),
      });
      void load();
    } catch { /* the poll corrects it */ }
  };

  const send = async (override?: string) => {
    const prompt = (override ?? text).trim();
    if (!prompt || busy || !token) return;
    setBusy(true);
    setError(null);
    setLog([`${t('m.you', language)}: ${prompt.slice(0, 160)}`]);
    setText('');
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const res = await fetch('/api/olympus/action', {
        method: 'POST',
        headers,
        signal: ctrl.signal,
        body: JSON.stringify({
          action: 'prompt',
          text: prompt,
          unattended,
          conversationId: active ? `mobile-${active}` : 'mobile',
        }),
      });
      if (!res.ok || !res.body) {
        const msg = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status}${msg ? ` — ${msg.slice(0, 160)}` : ''}`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
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
            const msg = ev?.msg || ev?.text || (ev?.part?.text ? String(ev.part.text).slice(0, 300) : '');
            if (msg) {
              setLog((l) => [...l.slice(-40), String(msg).replace(/\s+/g, ' ').slice(0, 300)]);
            }
          } catch { /* keep reading */ }
        }
      }
      void load();
      void pullPreview();
    } catch (e: any) {
      if (e?.name === 'AbortError') setLog((l) => [...l, t('m.stopped', language)]);
      else {
        setError(e?.message || t('m.error', language));
        setLog((l) => [...l, `${t('m.error', language)}: ${e?.message || ''}`]);
      }
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  };

  const mic = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      setError(t('m.voiceUnsupported', language));
      return;
    }
    const rec = new SR();
    rec.lang = speechLocale(language);
    rec.interimResults = true;
    rec.continuous = false;
    rec.onresult = (ev: any) => {
      let heard = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) heard += ev.results[i][0].transcript;
      setText((prev) => `${prev} ${heard}`.trim());
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    setListening(true);
    rec.start();
  };

  const stop = () => {
    abortRef.current?.abort();
    abortRef.current = null;
  };

  const inFlight = run?.hops?.inFlightList ?? [];
  const completed = Number(run?.hops?.completed ?? 0);
  const total = Number(run?.hops?.total ?? 0);
  const pct = total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0;
  const campaign = run?.campaign?.state || 'none';
  const activeProject = projects.find((p) => p.slug === active);
  const campaignLabel =
    campaign === 'running' ? t('m.stateRunning', language)
      : campaign === 'parked' ? t('m.stateParked', language)
        : campaign === 'done' ? t('m.stateDone', language)
          : campaign === 'unverified' ? t('m.interrupted', language)
            : campaign === 'none' ? t('m.stateIdle', language)
              : campaign;

  if (!token) {
    return (
      <main className="relative min-h-dvh bg-olympus-bg text-olympus-text flex flex-col items-center justify-center px-6 py-10">
        <MobileAmbient theme={theme} enabled={ambient} />
        <div className="relative z-10 w-full max-w-sm">
          <div className="text-center mb-8">
            <div className="mx-auto mb-4 h-14 w-14 rounded-full border border-olympus-gold/40 flex items-center justify-center text-olympus-gold text-xl font-semibold tracking-[0.2em]">
              O
            </div>
            <h1 className="text-xl font-semibold tracking-[0.18em]">OLYMPUS</h1>
            <p className="mt-2 text-xs text-olympus-text-dim leading-relaxed">
              {t('m.connectHint', language)}
            </p>
          </div>
          <input
            value={tokenDraft}
            onChange={(e) => setTokenDraft(e.target.value)}
            placeholder={t('m.tokenPlaceholder', language)}
            aria-label={t('m.tokenPlaceholder', language)}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className="w-full rounded-xl bg-olympus-panel border border-olympus-gold/20 px-4 py-3.5 text-base outline-none focus:border-olympus-gold/60"
          />
          <button
            onClick={() => {
              const v = tokenDraft.trim();
              if (!v) return;
              try { localStorage.setItem(TOKEN_KEY, v); } catch { /* ignore */ }
              setToken(v);
            }}
            className="mt-3 w-full rounded-xl bg-olympus-gold text-olympus-bg font-semibold py-3.5 text-sm active:scale-[0.99] transition-transform"
          >
            {t('m.connect', language)}
          </button>
          <p className="mt-4 text-[11px] text-olympus-text-dim text-center leading-relaxed">
            {t('m.connectNote', language)}
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="relative min-h-dvh bg-olympus-bg text-olympus-text pb-[env(safe-area-inset-bottom)]">
      <MobileAmbient theme={theme} enabled={ambient} />
      <header className="sticky top-0 z-20 border-b border-olympus-gold/10 bg-olympus-bg/95 backdrop-blur px-3 pt-[calc(env(safe-area-inset-top)+8px)] pb-2.5 flex items-center gap-2">
        <span className="h-2 w-2 shrink-0 rounded-full bg-olympus-green shadow-[0_0_8px_var(--olympus-green)]" />
        <div className="min-w-0 flex-1">
          <div className="text-[11px] tracking-[0.22em] font-semibold">OLYMPUS</div>
          <div className="text-[10px] text-olympus-text-dim truncate">{active || t('m.noProject', language)} · {campaignLabel}</div>
        </div>
        <Link
          href="/m/studio"
          aria-label={t('m.studio', language)}
          className="flex items-center justify-center h-11 w-11 rounded-full border border-olympus-gold/20 text-olympus-gold active:scale-95 transition-transform"
        >
          <Radio size={16} />
        </Link>
        <button
          onClick={() => {
            setAmbient((v) => {
              const next = !v;
              try { localStorage.setItem(AMBIENT_KEY, next ? 'on' : 'off'); } catch { /* private */ }
              return next;
            });
          }}
          aria-label={t('m.ambient', language)}
          aria-pressed={ambient}
          className={`flex items-center justify-center h-11 w-11 rounded-full border ${ambient ? 'text-olympus-cyan border-olympus-cyan/30' : 'text-olympus-text-dim border-olympus-gold/15'}`}
        >
          <Sparkles size={16} />
        </button>
        <button
          onClick={() => setThemeOpen(true)}
          aria-label={t('m.theme', language)}
          className="flex items-center justify-center h-11 w-11 text-olympus-gold border border-olympus-gold/15 rounded-full"
        >
          <Palette size={16} />
        </button>
        <button
          onClick={() => {
            void speakAs(`${campaignLabel}. ${run?.line || ''}`, 'atlas', language);
          }}
          aria-label={t('m.readAloud', language)}
          className="flex items-center justify-center h-11 w-11 text-olympus-gold border border-olympus-gold/15 rounded-full"
        >
          <Volume2 size={16} />
        </button>
      </header>

      <section className="relative z-10 mx-auto w-full max-w-lg px-3 pt-3 space-y-3">
        <div className="rounded-2xl border border-olympus-gold/15 bg-olympus-panel p-4">
          <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-olympus-text-dim">
            <span>{t('m.campaign', language)}</span>
            <span className={campaign === 'running' ? 'text-olympus-green' : campaign === 'parked' ? 'text-olympus-gold' : 'text-olympus-text-dim'}>{campaignLabel}</span>
          </div>
          <div className="mt-2 text-sm leading-snug break-words">{run?.line || t('m.waitingWalker', language)}</div>
          <div className="mt-3 h-1.5 rounded-full bg-olympus-card overflow-hidden">
            <div className="h-full rounded-full bg-olympus-gold transition-[width] duration-500" style={{ width: `${pct}%` }} />
          </div>
          <div className="mt-2 flex items-center justify-between text-[10px] text-olympus-text-dim">
            <span>{completed}/{total} {t('m.hops', language)}</span>
            <span>{run?.hops?.inFlight ?? inFlight.length} {t('m.inFlight', language)}</span>
          </div>
          {inFlight.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {inFlight.map((h) => (
                <span key={h.hopId} className="text-[10px] rounded-full border border-olympus-gold/20 px-2 py-0.5 text-olympus-gold">
                  {h.hopId}{h.god ? ` · ${h.god}` : ''}
                </span>
              ))}
            </div>
          )}
          {run?.hops?.parked?.hopId && (
            <div className="mt-3 rounded-lg border border-olympus-gold/25 bg-olympus-gold/5 px-2.5 py-2 text-[11px] text-olympus-gold">
              {t('m.parkedAt', language)} {run.hops.parked.hopId}{run.hops.parked.reason ? ` — ${run.hops.parked.reason}` : ''}
            </div>
          )}
          {active && (
            <button
              onClick={() => void send(`Nova tarefa: continue o projeto ${active}`)}
              disabled={busy}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-olympus-green/40 bg-olympus-green/10 py-2.5 text-[12px] font-medium text-olympus-green disabled:opacity-40"
            >
              <Play size={13} /> {t('m.resume', language)}
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <select
            value={active}
            onChange={(e) => void switchProject(e.target.value)}
            className="flex-1 min-w-0 rounded-xl bg-olympus-panel border border-olympus-gold/15 px-3 py-3 text-sm outline-none"
            aria-label={t('m.activeProject', language)}
          >
            {projects.length === 0 && <option value="">{t('m.noProjects', language)}</option>}
            {projects.map((p) => (
              <option key={p.slug} value={p.slug}>{p.name || p.slug}</option>
            ))}
          </select>
        </div>

        {/* v0.0.63 — the preview, reachable from wherever the phone is. */}
        {active && (
          <div className="rounded-2xl border border-olympus-gold/15 bg-olympus-panel p-3">
            <div className="flex items-center gap-2">
              <span className={`h-2 w-2 shrink-0 rounded-full ${preview?.running ? 'bg-olympus-green shadow-[0_0_8px_var(--olympus-green)]' : 'bg-olympus-text-dim/40'}`} />
              <span className="text-[11px] uppercase tracking-wider text-olympus-text-dim">{t('m.preview', language)}</span>
              {preview && (
                <span className="ml-auto text-[10px] font-mono text-olympus-text-dim">
                  {preview.port ? `:${preview.port}` : ''}{preview.probeMs != null ? ` · ${preview.probeMs}ms` : ''}
                </span>
              )}
              {previewBusy && <Loader2 size={12} className="animate-spin text-olympus-gold" />}
            </div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-olympus-text-dim break-words">
              {preview?.note || (previewBusy ? t('m.previewStarting', language) : '—')}
            </p>
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              {preview?.running && preview.recommendedUrl && (
                <a
                  href={preview.recommendedUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 rounded-xl bg-olympus-gold px-3 py-2.5 text-[12px] font-semibold text-olympus-bg"
                >
                  <ExternalLink size={13} /> {t('m.preview', language)}
                </a>
              )}
              {!preview?.running && (
                <button
                  onClick={() => void previewAction('start')}
                  disabled={previewBusy}
                  className="flex items-center gap-1.5 rounded-xl bg-olympus-gold px-3 py-2.5 text-[12px] font-semibold text-olympus-bg disabled:opacity-40"
                >
                  <Play size={13} /> {t('m.startPreview', language)}
                </button>
              )}
              {preview?.running && preview.remote && !preview.tunnelUrl && (
                <button
                  onClick={() => void previewAction('start-tunnel')}
                  disabled={previewBusy || !preview.tunnelAvailable}
                  className="flex items-center gap-1.5 rounded-xl border border-olympus-gold/30 px-3 py-2.5 text-[12px] text-olympus-gold disabled:opacity-40"
                >
                  <Radio size={13} /> {t('m.openTunnel', language)}
                </button>
              )}
              {preview?.tunnelUrl && (
                <button
                  onClick={() => void previewAction('stop-tunnel')}
                  disabled={previewBusy}
                  className="rounded-xl border border-olympus-gold/20 px-3 py-2.5 text-[11px] text-olympus-text-dim disabled:opacity-40"
                >
                  {t('m.closeTunnel', language)}
                </button>
              )}
              {preview?.running && (
                <button
                  onClick={() => void previewAction('stop')}
                  disabled={previewBusy}
                  className="flex items-center gap-1.5 rounded-xl border border-olympus-red/30 px-3 py-2.5 text-[11px] text-olympus-red disabled:opacity-40"
                >
                  <Square size={12} /> {t('m.stopPreview', language)}
                </button>
              )}
            </div>
            {preview?.running && preview.remote && !preview.tunnelUrl && (
              <p className="mt-2 text-[10px] leading-relaxed text-olympus-gold/80">{t('m.previewRemoteHint', language)}</p>
            )}
            {preview?.tunnelUrl && (
              <p className="mt-2 text-[10px] leading-relaxed text-olympus-text-dim">{t('m.previewPublic', language)}</p>
            )}
          </div>
        )}

        {git && (
          <div className="rounded-2xl border border-olympus-gold/10 bg-olympus-card p-3">
            <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-olympus-text-dim">
              <span>{t('m.git', language)}</span>
              <span>{git.branch || '—'}</span>
            </div>
            {git.remote ? (
              <a href={git.remote.replace(/\.git$/, '')} target="_blank" rel="noreferrer" className="mt-1 block text-[10px] text-olympus-gold truncate">
                {git.remote}
              </a>
            ) : (
              <p className="mt-1 text-[10px] text-olympus-text-dim">{t('m.noRemote', language)}</p>
            )}
            {(git.commits || []).slice(0, 3).map((c) => (
              <div key={c.hash} className="mt-1.5 flex items-start gap-2 text-[10px]">
                <span className="font-mono text-olympus-text-dim shrink-0">{String(c.hash).slice(0, 7)}</span>
                <span className="min-w-0 flex-1 truncate text-olympus-text">{c.subject}</span>
                <span className="text-olympus-text-dim shrink-0">{c.relative}</span>
              </div>
            ))}
          </div>
        )}

        <div className="rounded-2xl border border-olympus-gold/15 bg-olympus-panel p-3">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            placeholder={t('m.askPlaceholder', language)}
            aria-label={t('m.askPlaceholder', language)}
            className="w-full resize-none bg-transparent text-base leading-relaxed outline-none placeholder:text-olympus-text-dim"
          />
          <div className="mt-2 flex items-center gap-2">
            <button
              onClick={mic}
              aria-label={t('m.voiceInput', language)}
              className={`h-11 w-11 rounded-full border flex items-center justify-center ${listening ? 'border-olympus-green text-olympus-green animate-pulse' : 'border-olympus-gold/25 text-olympus-gold'}`}
            >
              <Mic size={16} />
            </button>
            <button
              onClick={() => setUnattended((v) => !v)}
              className={`text-[11px] rounded-full px-3 py-2 border ${unattended ? 'border-olympus-green/50 text-olympus-green bg-olympus-green/10' : 'border-olympus-gold/15 text-olympus-text-dim'}`}
            >
              {t('m.autoApprove', language)}
            </button>
            {busy ? (
              <button onClick={stop} className="ml-auto rounded-xl bg-olympus-card px-4 py-2.5 text-[12px] text-olympus-text">
                {t('m.stop', language)}
              </button>
            ) : (
              <button
                onClick={() => void send()}
                disabled={!text.trim()}
                className="ml-auto flex items-center gap-1.5 rounded-xl bg-olympus-gold px-4 py-2.5 text-[12px] font-semibold text-olympus-bg disabled:opacity-40"
              >
                <Send size={13} /> {t('m.send', language)}
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-olympus-red/40 bg-olympus-red/10 px-3 py-2 text-[11px] text-olympus-red break-words">
            {error}
          </div>
        )}

        {log.length > 0 && (
          <div ref={logRef} className="rounded-2xl border border-olympus-gold/10 bg-olympus-card p-3 max-h-52 overflow-y-auto space-y-1">
            {log.map((line, i) => (
              <p key={i} className="text-[11px] leading-relaxed text-olympus-text-dim break-words">{line}</p>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between text-[10px] text-olympus-text-dim px-1 pb-[calc(env(safe-area-inset-bottom)+16px)]">
          <span>{cost ? `${t('m.cost24h', language)} · $${(cost.spend ?? 0).toFixed(2)}` : '—'}</span>
          <span className="truncate">{activeProject?.name || active || '—'}</span>
        </div>
      </section>

      {themeOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end bg-black/60"
          onClick={() => setThemeOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label={t('m.themeTitle', language)}
        >
          <div
            className="w-full max-h-[85dvh] overflow-y-auto rounded-t-2xl border-t border-olympus-gold/20 bg-olympus-panel p-4 pb-[calc(env(safe-area-inset-bottom)+16px)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 mb-1">
              <Palette size={14} className="text-olympus-gold" />
              <span className="text-[12px] font-semibold tracking-wide">{t('m.themeTitle', language)}</span>
              {themeBusy && <Loader2 size={11} className="animate-spin text-olympus-gold" />}
              <button onClick={() => setThemeOpen(false)} aria-label={t('m.close', language)} className="ml-auto text-olympus-text-dim p-2">
                <X size={16} />
              </button>
            </div>
            <p className="text-[10px] text-olympus-text-dim mb-3 leading-relaxed">
              {t('m.themeHint', language)}
            </p>
            <div className="grid grid-cols-2 gap-2">
              {THEME_PRESETS.map((preset) => {
                const isActive = theme?.presetId === preset.id;
                return (
                  <button
                    key={preset.id}
                    onClick={() => void saveTheme(normalizeThemeState({ ...(theme ?? {}), presetId: preset.id, accent: null, custom: undefined }))}
                    className={`rounded-xl border p-2.5 text-left transition-colors ${isActive ? 'border-olympus-gold/60 bg-olympus-gold/10' : 'border-olympus-gold/10 bg-olympus-bg/40'}`}
                  >
                    <span className="flex items-center gap-1 mb-1.5">
                      <span className="h-3.5 w-3.5 rounded-full border border-black/20" style={{ background: preset.colors.bg }} />
                      <span className="h-3.5 w-3.5 rounded-full border border-black/20" style={{ background: preset.colors.panel }} />
                      <span className="h-3.5 w-3.5 rounded-full border border-black/20" style={{ background: preset.colors.gold }} />
                      {isActive && <Check size={11} className="ml-auto text-olympus-green" />}
                    </span>
                    <span className="text-[10px] font-medium block truncate">{preset.name}</span>
                    <span className="text-[8px] uppercase tracking-wider text-olympus-text-dim">{preset.mode}</span>
                  </button>
                );
              })}
            </div>
            <div className="mt-3 flex items-center gap-2">
              <button
                onClick={() => void saveTheme(normalizeThemeState({ ...(theme ?? {}), motion: 'full' }))}
                className={`flex-1 rounded-lg border px-2 py-2 text-[10px] ${theme?.motion !== 'stable' ? 'border-olympus-gold/50 text-olympus-gold bg-olympus-gold/10' : 'border-olympus-gold/10 text-olympus-text-dim'}`}
              >
                {t('m.fullMotion', language)}
              </button>
              <button
                onClick={() => void saveTheme(normalizeThemeState({ ...(theme ?? {}), motion: 'stable' }))}
                className={`flex-1 rounded-lg border px-2 py-2 text-[10px] ${theme?.motion === 'stable' ? 'border-olympus-gold/50 text-olympus-gold bg-olympus-gold/10' : 'border-olympus-gold/10 text-olympus-text-dim'}`}
              >
                {t('m.stableMotion', language)}
              </button>
            </div>
            {/* The phone follows the desktop by default; an explicit choice here
                is the one action allowed to change the shared language. */}
            <div className="mt-3 flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-wider text-olympus-text-dim">{t('settings.language', language)}</span>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value as Language)}
                aria-label={t('settings.language', language)}
                className="ml-auto rounded-lg bg-olympus-bg border border-olympus-gold/20 px-2 py-1.5 text-[11px] outline-none"
              >
                {LANGUAGES.map((l) => (
                  <option key={l.id} value={l.id}>{l.native}</option>
                ))}
              </select>
            </div>
            <button
              onClick={() => void pullTheme()}
              className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-olympus-gold/15 px-2 py-2 text-[10px] text-olympus-text-dim"
            >
              <RefreshCw size={10} /> {t('m.reloadTheme', language)}
            </button>
            <button
              onClick={() => {
                try { localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
                setToken(null);
              }}
              className="mt-2 w-full rounded-lg border border-olympus-red/25 px-2 py-2 text-[10px] text-olympus-red"
            >
              {t('m.lock', language)}
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
