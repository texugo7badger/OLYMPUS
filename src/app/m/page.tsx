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
  const abortRef = useRef<AbortController | null>(null);
  const logRef = useRef<HTMLDivElement | null>(null);

  // Boot: token from the QR fragment, then localStorage.
  useEffect(() => {
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
    rec.lang = navigator.language || 'en-US';
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
      <main className="min-h-dvh bg-[#0b0b0f] text-[#f5efe6] flex flex-col items-center justify-center px-6">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <div className="mx-auto mb-4 h-14 w-14 rounded-full border border-[#d4a574]/40 flex items-center justify-center text-[#d4a574] text-xl font-semibold tracking-[0.2em]">
              O
            </div>
            <h1 className="text-xl font-semibold tracking-[0.18em]">OLYMPUS</h1>
            <p className="mt-2 text-xs text-[#9c9388] leading-relaxed">
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
            className="w-full rounded-xl bg-[#15151c] border border-[#d4a574]/20 px-4 py-3 text-sm outline-none focus:border-[#d4a574]/60"
          />
          <button
            onClick={() => {
              const v = tokenDraft.trim();
              if (!v) return;
              try { localStorage.setItem(TOKEN_KEY, v); } catch { /* ignore */ }
              setToken(v);
            }}
            className="mt-3 w-full rounded-xl bg-[#d4a574] text-[#0b0b0f] font-semibold py-3 text-sm active:scale-[0.99] transition-transform"
          >
            Connect
          </button>
          <p className="mt-4 text-[10px] text-[#6e675f] text-center leading-relaxed">
            The token never leaves this phone except as an <code>x-olympus-token</code> header.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-dvh bg-[#0b0b0f] text-[#f5efe6] pb-[env(safe-area-inset-bottom)]">
      <header className="sticky top-0 z-20 border-b border-[#d4a574]/10 bg-[#0b0b0f]/95 backdrop-blur px-4 py-3 flex items-center gap-3">
        <span className="h-2 w-2 rounded-full bg-[#5ea684] shadow-[0_0_8px_#5ea684]" />
        <div className="min-w-0">
          <div className="text-[11px] tracking-[0.22em] font-semibold">OLYMPUS</div>
          <div className="text-[10px] text-[#9c9388] truncate">{active || 'no project'} · {campaign}</div>
        </div>
        <button
          onClick={() => {
            try {
              const said = `${campaign}. ${run?.line || ''}`;
              if (window.speechSynthesis) {
                window.speechSynthesis.cancel();
                window.speechSynthesis.speak(new SpeechSynthesisUtterance(said));
              }
            } catch { /* no voice */ }
          }}
          aria-label="Read the campaign aloud"
          className="ml-auto text-[12px] text-[#d4a574] border border-[#d4a574]/15 rounded-full px-2.5 py-1"
        >
          ♪
        </button>
        <button
          onClick={() => { try { localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ } setToken(null); }}
          className="text-[10px] text-[#9c9388] border border-[#d4a574]/15 rounded-full px-2.5 py-1"
        >
          lock
        </button>
      </header>

      <section className="px-4 pt-4 space-y-3">
        <div className="rounded-2xl border border-[#d4a574]/15 bg-[#13131a] p-4">
          <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-[#9c9388]">
            <span>campaign</span>
            <span className={campaign === 'running' ? 'text-[#5ea684]' : campaign === 'parked' ? 'text-[#d4a574]' : 'text-[#9c9388]'}>{campaign}</span>
          </div>
          <div className="mt-2 text-sm leading-snug">{run?.line || 'waiting for the walker'}</div>
          <div className="mt-3 h-1.5 rounded-full bg-[#24242e] overflow-hidden">
            <div className="h-full rounded-full bg-[#d4a574] transition-[width] duration-500" style={{ width: `${pct}%` }} />
          </div>
          <div className="mt-2 flex items-center justify-between text-[10px] text-[#9c9388]">
            <span>{completed}/{total} hops</span>
            <span>{run?.hops?.inFlight ?? inFlight.length} in flight</span>
          </div>
          {inFlight.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {inFlight.map((h) => (
                <span key={h.hopId} className="text-[10px] rounded-full border border-[#d4a574]/20 px-2 py-0.5 text-[#d4a574]">
                  {h.hopId}{h.god ? ` · ${h.god}` : ''}
                </span>
              ))}
            </div>
          )}
          {run?.hops?.parked?.hopId && (
            <div className="mt-3 rounded-lg border border-[#d4a574]/25 bg-[#d4a574]/5 px-2.5 py-2 text-[10px] text-[#d4a574]">
              parked at {run.hops.parked.hopId}{run.hops.parked.reason ? ` — ${run.hops.parked.reason}` : ''}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <select
            value={active}
            onChange={(e) => void switchProject(e.target.value)}
            className="flex-1 min-w-0 rounded-xl bg-[#13131a] border border-[#d4a574]/15 px-3 py-2.5 text-xs outline-none"
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
              className="rounded-xl border border-[#d4a574]/25 px-3 py-2.5 text-[10px] text-[#d4a574]"
            >
              preview
            </a>
          )}
        </div>

        {git && (
          <div className="rounded-2xl border border-[#d4a574]/10 bg-[#0f0f15] p-3">
            <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-[#9c9388]">
              <span>git</span>
              <span>{git.branch || '—'}</span>
            </div>
            {git.remote ? (
              <a href={git.remote.replace(/\.git$/, '')} target="_blank" rel="noreferrer" className="mt-1 block text-[10px] text-[#d4a574] truncate">
                {git.remote}
              </a>
            ) : (
              <p className="mt-1 text-[10px] text-[#6e675f]">no remote yet — connect one from the desktop</p>
            )}
            {(git.commits || []).slice(0, 3).map((c) => (
              <div key={c.hash} className="mt-1.5 flex items-start gap-2 text-[10px]">
                <span className="font-mono text-[#6e675f] shrink-0">{String(c.hash).slice(0, 7)}</span>
                <span className="min-w-0 flex-1 truncate text-[#c9c0b4]">{c.subject}</span>
                <span className="text-[#6e675f] shrink-0">{c.relative}</span>
              </div>
            ))}
          </div>
        )}

        <div className="rounded-2xl border border-[#d4a574]/15 bg-[#13131a] p-3">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            placeholder="Ask the gods — continue the project, fix a hop, review the UI…"
            className="w-full resize-none bg-transparent text-sm outline-none placeholder:text-[#6e675f]"
          />
          <div className="mt-2 flex items-center gap-2">
            <button
              onClick={mic}
              aria-label="Voice input"
              className={`h-9 w-9 rounded-full border flex items-center justify-center text-sm ${listening ? 'border-[#5ea684] text-[#5ea684] animate-pulse' : 'border-[#d4a574]/25 text-[#d4a574]'}`}
            >
              ◉
            </button>
            <button
              onClick={() => setUnattended((v) => !v)}
              className={`text-[10px] rounded-full px-2.5 py-1.5 border ${unattended ? 'border-[#5ea684]/50 text-[#5ea684] bg-[#5ea684]/10' : 'border-[#d4a574]/15 text-[#9c9388]'}`}
            >
              auto-approve
            </button>
            {busy ? (
              <button onClick={stop} className="ml-auto rounded-xl bg-[#24242e] px-4 py-2 text-xs text-[#f5efe6]">
                stop
              </button>
            ) : (
              <button
                onClick={() => void send()}
                disabled={!text.trim()}
                className="ml-auto rounded-xl bg-[#d4a574] px-4 py-2 text-xs font-semibold text-[#0b0b0f] disabled:opacity-40"
              >
                send
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-[#a6554f]/40 bg-[#a6554f]/10 px-3 py-2 text-[11px] text-[#e2a49f]">
            {error}
          </div>
        )}

        {log.length > 0 && (
          <div ref={logRef} className="rounded-2xl border border-[#d4a574]/10 bg-[#0f0f15] p-3 max-h-52 overflow-y-auto space-y-1">
            {log.map((line, i) => (
              <p key={i} className="text-[10px] leading-relaxed text-[#9c9388] break-words">{line}</p>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between text-[10px] text-[#6e675f] px-1 pb-6">
          <span>{cost ? `24h · $${(cost.spend ?? 0).toFixed(2)}` : 'cost —'}</span>
          <span>campaign · {campaign}</span>
        </div>
      </section>
    </main>
  );
}
