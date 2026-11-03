'use client';

/**
 * /m — the mobile companion.
 *
 * The same app, the same server, the same campaign: a phone-sized surface to
 * see what the gods are doing, switch the active project, send a prompt (by
 * typing or voice) and open the live preview.
 *
 * Auth: the pairing QR carries the session token in the URL FRAGMENT. The
 * token is stored in localStorage and sent as `x-olympus-token`, which is the
 * header `requireAuth` already trusts in lan/tunnel mode. The fragment never
 * reaches the server in a request line.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Loader2, Palette, RefreshCw, Sparkles, X } from 'lucide-react';
import MobileAmbient from '@/components/olympus/mobile-ambient';
import { THEME_PRESETS, applyTheme, normalizeThemeState, type ThemeState } from '@/lib/theme';
import { LANGUAGES } from '@/lib/i18n';

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

const TOKEN_KEY = 'olympus:mobile-token';
const THEME_KEY = 'olympus:mobile-theme';
const AMBIENT_KEY = 'olympus:mobile-ambient';

export default function MobileCompanion() {
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
  const [lang, setLang] = useState('en');
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
  useEffect(() => {
    try {
      const cached = localStorage.getItem(THEME_KEY);
      if (cached) applyLocalTheme(JSON.parse(cached));
    } catch { /* private */ }
    void pullTheme();
    // v0.0.61 — the phone speaks the desktop's language, not the browser's.
    fetch('/api/olympus/language', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.language) setLang(d.language); })
      .catch(() => { /* keep en */ });
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
      setError(e?.message || 'connection failed');
    }
  }, [token, headers]);

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
    try {
      await fetch('/api/olympus/projects/active', {
        method: 'PUT',
        headers,
        body: JSON.stringify({ slug }),
      });
      void load();
    } catch { /* the poll corrects it */ }
  };

  const send = async () => {
    const prompt = text.trim();
    if (!prompt || busy || !token) return;
    setBusy(true);
    setError(null);
    setLog([`you: ${prompt.slice(0, 160)}`]);
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
    } catch (e: any) {
      if (e?.name === 'AbortError') setLog((l) => [...l, 'stopped']);
      else {
        setError(e?.message || 'send failed');
        setLog((l) => [...l, `error: ${e?.message || 'send failed'}`]);
      }
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  };

  const mic = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      setError('This browser has no speech recognition.');
      return;
    }
    const rec = new SR();
    const speech = LANGUAGES.find((l) => l.id === lang)?.speech || navigator.language || 'en-US';
    rec.lang = speech;
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
  const previewUrl = activeProject?.livePreviewPort
    ? `http://${typeof window !== 'undefined' ? window.location.hostname : '127.0.0.1'}:${activeProject.livePreviewPort}`
    : null;

  if (!token) {
    return (
      <main className="relative min-h-dvh bg-olympus-bg text-olympus-text flex flex-col items-center justify-center px-6">
        <MobileAmbient theme={theme} enabled={ambient} />
        <div className="relative z-10 w-full max-w-sm">
          <div className="text-center mb-8">
            <div className="mx-auto mb-4 h-14 w-14 rounded-full border border-olympus-gold/40 flex items-center justify-center text-olympus-gold text-xl font-semibold tracking-[0.2em]">
              O
            </div>
            <h1 className="text-xl font-semibold tracking-[0.18em]">OLYMPUS</h1>
            <p className="mt-2 text-xs text-olympus-text-dim leading-relaxed">
              Open the pairing QR on the desktop, or paste the session token to connect.
            </p>
          </div>
          <input
            value={tokenDraft}
            onChange={(e) => setTokenDraft(e.target.value)}
            placeholder="session token"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className="w-full rounded-xl bg-olympus-panel border border-olympus-gold/20 px-4 py-3 text-sm outline-none focus:border-olympus-gold/60"
          />
          <button
            onClick={() => {
              const v = tokenDraft.trim();
              if (!v) return;
              try { localStorage.setItem(TOKEN_KEY, v); } catch { /* ignore */ }
              setToken(v);
            }}
            className="mt-3 w-full rounded-xl bg-olympus-gold text-olympus-bg font-semibold py-3 text-sm active:scale-[0.99] transition-transform"
          >
            Connect
          </button>
          <p className="mt-4 text-[10px] text-olympus-text-dim text-center leading-relaxed">
            The token never leaves this phone except as an <code>x-olympus-token</code> header.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="relative min-h-dvh bg-olympus-bg text-olympus-text pb-[env(safe-area-inset-bottom)]">
      <MobileAmbient theme={theme} enabled={ambient} />
      <header className="sticky top-0 z-20 border-b border-olympus-gold/10 bg-olympus-bg/95 backdrop-blur px-4 py-3 flex items-center gap-3">
        <span className="h-2 w-2 rounded-full bg-olympus-green shadow-[0_0_8px_var(--olympus-green)]" />
        <div className="min-w-0">
          <div className="text-[11px] tracking-[0.22em] font-semibold">OLYMPUS</div>
          <div className="text-[10px] text-olympus-text-dim truncate">{active || 'no project'} · {campaign}</div>
        </div>
        <button
          onClick={() => {
            setAmbient((v) => {
              const next = !v;
              try { localStorage.setItem(AMBIENT_KEY, next ? 'on' : 'off'); } catch { /* private */ }
              return next;
            });
          }}
          aria-label="Ambient particles"
          className={`flex items-center justify-center h-7 w-7 rounded-full border ${ambient ? 'text-olympus-cyan border-olympus-cyan/30' : 'text-olympus-text-dim border-olympus-gold/15'}`}
        >
          <Sparkles size={12} />
        </button>
        <button
          onClick={() => setThemeOpen(true)}
          aria-label="Theme — follows the desktop"
          className="ml-auto flex items-center justify-center h-7 w-7 text-olympus-gold border border-olympus-gold/15 rounded-full"
        >
          <Palette size={12} />
        </button>
        <button
          onClick={() => {
            try {
              const said = `${campaign}. ${run?.line || ''}`;
              if (window.speechSynthesis) {
                const speech = LANGUAGES.find((l) => l.id === lang)?.speech || navigator.language || 'en-US';
                window.speechSynthesis.cancel();
                const utter = new SpeechSynthesisUtterance(said);
                utter.lang = speech;
                window.speechSynthesis.speak(utter);
              }
            } catch { /* no voice */ }
          }}
          aria-label="Read the campaign aloud"
          className="text-[12px] text-olympus-gold border border-olympus-gold/15 rounded-full px-2.5 py-1"
        >
          ♪
        </button>
        <button
          onClick={() => { try { localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ } setToken(null); }}
          className="text-[10px] text-olympus-text-dim border border-olympus-gold/15 rounded-full px-2.5 py-1"
        >
          lock
        </button>
      </header>

      <section className="relative z-10 px-4 pt-4 space-y-3">
        <div className="rounded-2xl border border-olympus-gold/15 bg-olympus-panel p-4">
          <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-olympus-text-dim">
            <span>campaign</span>
            <span className={campaign === 'running' ? 'text-olympus-green' : campaign === 'parked' ? 'text-olympus-gold' : 'text-olympus-text-dim'}>{campaign}</span>
          </div>
          <div className="mt-2 text-sm leading-snug">{run?.line || 'waiting for the walker'}</div>
          <div className="mt-3 h-1.5 rounded-full bg-olympus-card overflow-hidden">
            <div className="h-full rounded-full bg-olympus-gold transition-[width] duration-500" style={{ width: `${pct}%` }} />
          </div>
          <div className="mt-2 flex items-center justify-between text-[10px] text-olympus-text-dim">
            <span>{completed}/{total} hops</span>
            <span>{run?.hops?.inFlight ?? inFlight.length} in flight</span>
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
            <div className="mt-3 rounded-lg border border-olympus-gold/25 bg-olympus-gold/5 px-2.5 py-2 text-[10px] text-olympus-gold">
              parked at {run.hops.parked.hopId}{run.hops.parked.reason ? ` — ${run.hops.parked.reason}` : ''}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <select
            value={active}
            onChange={(e) => void switchProject(e.target.value)}
            className="flex-1 min-w-0 rounded-xl bg-olympus-panel border border-olympus-gold/15 px-3 py-2.5 text-xs outline-none"
            aria-label="Active project"
          >
            {projects.length === 0 && <option value="">no projects</option>}
            {projects.map((p) => (
              <option key={p.slug} value={p.slug}>{p.name || p.slug}</option>
            ))}
          </select>
          {previewUrl && (
            <a
              href={previewUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-xl border border-olympus-gold/25 px-3 py-2.5 text-[10px] text-olympus-gold"
            >
              preview
            </a>
          )}
        </div>

        {git && (
          <div className="rounded-2xl border border-olympus-gold/10 bg-olympus-card p-3">
            <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-olympus-text-dim">
              <span>git</span>
              <span>{git.branch || '—'}</span>
            </div>
            {git.remote ? (
              <a href={git.remote.replace(/\.git$/, '')} target="_blank" rel="noreferrer" className="mt-1 block text-[10px] text-olympus-gold truncate">
                {git.remote}
              </a>
            ) : (
              <p className="mt-1 text-[10px] text-olympus-text-dim">no remote yet — connect one from the desktop</p>
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
            placeholder="Ask the gods — continue the project, fix a hop, review the UI…"
            className="w-full resize-none bg-transparent text-sm outline-none placeholder:text-olympus-text-dim"
          />
          <div className="mt-2 flex items-center gap-2">
            <button
              onClick={mic}
              aria-label="Voice input"
              className={`h-9 w-9 rounded-full border flex items-center justify-center text-sm ${listening ? 'border-olympus-green text-olympus-green animate-pulse' : 'border-olympus-gold/25 text-olympus-gold'}`}
            >
              ◉
            </button>
            <button
              onClick={() => setUnattended((v) => !v)}
              className={`text-[10px] rounded-full px-2.5 py-1.5 border ${unattended ? 'border-olympus-green/50 text-olympus-green bg-olympus-green/10' : 'border-olympus-gold/15 text-olympus-text-dim'}`}
            >
              auto-approve
            </button>
            {busy ? (
              <button onClick={stop} className="ml-auto rounded-xl bg-olympus-card px-4 py-2 text-xs text-olympus-text">
                stop
              </button>
            ) : (
              <button
                onClick={() => void send()}
                disabled={!text.trim()}
                className="ml-auto rounded-xl bg-olympus-gold px-4 py-2 text-xs font-semibold text-olympus-bg disabled:opacity-40"
              >
                send
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-olympus-red/40 bg-olympus-red/10 px-3 py-2 text-[11px] text-olympus-red">
            {error}
          </div>
        )}

        {log.length > 0 && (
          <div ref={logRef} className="rounded-2xl border border-olympus-gold/10 bg-olympus-card p-3 max-h-52 overflow-y-auto space-y-1">
            {log.map((line, i) => (
              <p key={i} className="text-[10px] leading-relaxed text-olympus-text-dim break-words">{line}</p>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between text-[10px] text-olympus-text-dim px-1 pb-6">
          <span>{cost ? `24h · $${(cost.spend ?? 0).toFixed(2)}` : 'cost —'}</span>
          <span>campaign · {campaign}</span>
        </div>
      </section>


      {themeOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end bg-black/60"
          onClick={() => setThemeOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Theme"
        >
          <div
            className="w-full max-h-[82dvh] overflow-y-auto rounded-t-2xl border-t border-olympus-gold/20 bg-olympus-panel p-4 pb-[calc(env(safe-area-inset-bottom)+16px)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 mb-1">
              <Palette size={14} className="text-olympus-gold" />
              <span className="text-[12px] font-semibold tracking-wide">Theme</span>
              {themeBusy && <Loader2 size={11} className="animate-spin text-olympus-gold" />}
              <button onClick={() => setThemeOpen(false)} aria-label="Close theme" className="ml-auto text-olympus-text-dim p-1">
                <X size={15} />
              </button>
            </div>
            <p className="text-[10px] text-olympus-text-dim mb-3 leading-relaxed">
              The same theme as the desktop. A choice here changes the PC too.
            </p>
            <div className="grid grid-cols-2 gap-2">
              {THEME_PRESETS.map((preset) => {
                const active = theme?.presetId === preset.id;
                return (
                  <button
                    key={preset.id}
                    onClick={() => void saveTheme(normalizeThemeState({ ...(theme ?? {}), presetId: preset.id, accent: null, custom: undefined }))}
                    className={`rounded-xl border p-2.5 text-left transition-colors ${active ? 'border-olympus-gold/60 bg-olympus-gold/10' : 'border-olympus-gold/10 bg-olympus-bg/40'}`}
                  >
                    <span className="flex items-center gap-1 mb-1.5">
                      <span className="h-3.5 w-3.5 rounded-full border border-black/20" style={{ background: preset.colors.bg }} />
                      <span className="h-3.5 w-3.5 rounded-full border border-black/20" style={{ background: preset.colors.panel }} />
                      <span className="h-3.5 w-3.5 rounded-full border border-black/20" style={{ background: preset.colors.gold }} />
                      {active && <Check size={11} className="ml-auto text-olympus-green" />}
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
                className={`flex-1 rounded-lg border px-2 py-1.5 text-[10px] ${theme?.motion !== 'stable' ? 'border-olympus-gold/50 text-olympus-gold bg-olympus-gold/10' : 'border-olympus-gold/10 text-olympus-text-dim'}`}
              >
                full motion
              </button>
              <button
                onClick={() => void saveTheme(normalizeThemeState({ ...(theme ?? {}), motion: 'stable' }))}
                className={`flex-1 rounded-lg border px-2 py-1.5 text-[10px] ${theme?.motion === 'stable' ? 'border-olympus-gold/50 text-olympus-gold bg-olympus-gold/10' : 'border-olympus-gold/10 text-olympus-text-dim'}`}
              >
                stable motion
              </button>
            </div>
            <button
              onClick={() => void pullTheme()}
              className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-olympus-gold/15 px-2 py-1.5 text-[10px] text-olympus-text-dim"
            >
              <RefreshCw size={10} /> reload from the desktop
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
