/**
 * /preview-window — v0.0.90: the live preview as its own OS window.
 *
 * Opened from the Live Preview's "window" button. While the project's dev
 * server is not up, the OLYMPUS loader owns the window; the moment the preview
 * is ready it switches to the real app, and it follows the port/URL and the
 * hop stream (a delivered part reloads the frame). A new window, so the user
 * can Alt+Tab between OLYMPUS and the app being built.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, Loader2, RefreshCw, X, MonitorUp, MousePointerClick, Send, Trash2, Copy, Check, ClipboardList, Bot } from 'lucide-react';
import OlympusLoader from '@/components/olympus/olympus-loader';
import PreviewSurface from '@/components/olympus/preview-surface';
import { useHopParts } from '@/lib/hop-stream';
import { marksMarkdown, type PreviewMark } from '@/lib/marks-format';

interface PreviewState {
  ok: boolean;
  slug: string;
  name: string | null;
  port: number | null;
  running: boolean;
  localUrl: string;
  lanUrl?: string | null;
  tunnelUrl?: string | null;
  recommendedUrl: string | null;
  note: string;
  probeMs: number | null;
  error?: string;
}

export default function PreviewWindowPage() {
  const [slug, setSlug] = useState<string | null>(null);
  const [state, setState] = useState<PreviewState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [retry, setRetry] = useState(0);
  const [partReady, setPartReady] = useState<string | null>(null);
  const lastInteractionRef = useRef(0);
  const reloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // v0.0.92 — the large window's mark session: capture across pages, keep
  // the queue on disk (not just localStorage), then copy or send the whole
  // batch to Apollo in one planning turn.
  const [markMode, setMarkMode] = useState(false);
  const [draft, setDraft] = useState<{ x: number; y: number; page: string; viewport: { width: number; height: number } } | null>(null);
  const [markText, setMarkText] = useState('');
  const [pageText, setPageText] = useState('');
  const [marks, setMarks] = useState<PreviewMark[]>([]);
  const [marksLoaded, setMarksLoaded] = useState(false);
  const [marksOpen, setMarksOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  // Resolve the slug from the query; fall back to the active project.
  useEffect(() => {
    const fromQuery = (() => { try { return new URLSearchParams(window.location.search).get('slug') || ''; } catch { return ''; } })();
    if (fromQuery) { setSlug(fromQuery); return; }
    void fetch('/api/olympus/projects', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        const active = String(d?.active?.slug || '');
        if (active) {
          setSlug(active);
          try { window.history.replaceState({}, '', `/preview-window?slug=${encodeURIComponent(active)}`); } catch { /* non-DOM */ }
        } else {
          setError('No active project — open a project in OLYMPUS first.');
        }
      })
      .catch((e) => setError(String(e)));
  }, []);

  // Poll the measured preview status. The port can change when the manager
  // restarts the dev server; the iframe follows it.
  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    const load = async () => {
      try {
        const r = await fetch(`/api/olympus/projects/preview?slug=${encodeURIComponent(slug)}`, { cache: 'no-store' });
        const d = await r.json();
        if (!cancelled) { setState(d); setError(d?.ok === false ? (d.error || 'preview unavailable') : null); }
      } catch (e: any) { if (!cancelled) setError(e?.message || String(e)); }
    };
    void load();
    const iv = setInterval(() => { void load(); }, 3_000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [slug, retry]);

  // Follow the campaign: a settled hop is a new part. v0.0.99 — the replay
  // that every EventSource connection begins with is IGNORED (stream_ready
  // marks the boundary), and a landed part is offered rather than forced
  // while the user is interacting.
  const noteInteraction = () => {
    lastInteractionRef.current = Date.now();
    if (reloadTimerRef.current) { clearTimeout(reloadTimerRef.current); reloadTimerRef.current = null; }
  };
  useHopParts({
    projectSlug: slug,
    enabled: Boolean(slug),
    onHopDone: (hop) => {
      setPartReady(hop);
      const idleFor = Date.now() - lastInteractionRef.current;
      if (idleFor < 15_000) return;
      if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current);
      reloadTimerRef.current = setTimeout(() => {
        reloadTimerRef.current = null;
        if (Date.now() - lastInteractionRef.current < 15_000) return;
        setLoaded(false);
        setReloadKey((k) => k + 1);
        setPartReady(null);
      }, 2500);
    },
  });
  useEffect(() => () => { if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current); }, []);

  const url = useMemo(() => {
    if (!state?.running) return '';
    // v0.0.99 — the REAL origin, chosen for the machine showing the window:
    // loopback on the desktop, the LAN address from another PC, and the
    // HTTPS preview tunnel when the shell itself is HTTPS (mixed content).
    const shellHost = typeof window !== 'undefined' ? window.location.hostname : '127.0.0.1';
    const loopback = shellHost === '127.0.0.1' || shellHost === 'localhost' || shellHost === '::1' || shellHost === '[::1]';
    const httpsShell = typeof window !== 'undefined' && window.location.protocol === 'https:';
    if (httpsShell) return state.recommendedUrl || state.tunnelUrl || '';
    if (!loopback) return state.lanUrl || state.recommendedUrl || state.localUrl || '';
    return state.localUrl || state.recommendedUrl || '';
  }, [state?.running, state?.localUrl, state?.lanUrl, state?.recommendedUrl, state?.tunnelUrl]);
  const frameUrl = url;

  // The surface can finish loading BEFORE React hydrates; in that case the
  // load event never reaches onLoad and the "Opening…" overlay covers the
  // preview forever. Keep onLoad as the fast path and clear the overlay on a
  // short fallback so the window can never sit on a stale loader.
  useEffect(() => {
    if (!url) return;
    const t = setTimeout(() => setLoaded(true), 3000);
    return () => clearTimeout(t);
  }, [url, reloadKey]);

  // The durable queue lives on disk (one file per project). localStorage is
  // only the offline fallback; the window never loses a batch on reload.
  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    setMarksLoaded(false);
    const local = () => {
      try {
        const raw = JSON.parse(localStorage.getItem(`olympus:marks:${slug}`) || '[]');
        if (!cancelled && Array.isArray(raw)) setMarks(raw);
      } catch { /* ignore */ }
    };
    void fetch(`/api/olympus/marks?slug=${encodeURIComponent(slug)}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (d?.ok && Array.isArray(d.marks)) setMarks(d.marks);
        else local();
      })
      .catch(local)
      .finally(() => { if (!cancelled) setMarksLoaded(true); });
    return () => { cancelled = true; };
  }, [slug]);

  useEffect(() => {
    if (!slug || !marksLoaded) return;
    try { localStorage.setItem(`olympus:marks:${slug}`, JSON.stringify(marks)); } catch { /* private */ }
    const t = setTimeout(() => {
      void fetch('/api/olympus/marks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, marks }),
      }).catch(() => { /* offline: localStorage still has it */ });
    }, 300);
    return () => clearTimeout(t);
  }, [marks, slug, marksLoaded]);

  // Keyboard: M toggles mark mode, Esc cancels the draft/overlay.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement | null)?.isContentEditable;
      if (e.key === 'Escape') { setDraft(null); setMarkMode(false); setMarkText(''); setPageText(''); return; }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key.toLowerCase() === 'm') { e.preventDefault(); setMarkMode((v) => !v); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const captureMark = (e: React.MouseEvent<HTMLButtonElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const viewport = { width: Math.round(r.width), height: Math.round(r.height) };
    const page = url || '/';
    setDraft({
      x: Math.round(e.clientX - r.left),
      y: Math.round(e.clientY - r.top),
      page,
      viewport,
    });
    setPageText(page);
    setMarkText('');
    setMarkMode(false);
  };

  const addMark = () => {
    if (!draft || !markText.trim()) return;
    setMarks((prev) => [...prev, {
      id: `mark-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      x: draft.x,
      y: draft.y,
      page: pageText.trim() || draft.page,
      instruction: markText.trim(),
      viewport: draft.viewport,
      url: url || undefined,
      createdAt: new Date().toISOString(),
    }]);
    setDraft(null);
    setMarkText('');
    setPageText('');
    setMarksOpen(true);
  };

  const removeMark = (id: string) => setMarks((prev) => prev.filter((m) => m.id !== id));

  const copyText = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const el = document.createElement('textarea');
      el.value = text;
      el.style.position = 'fixed';
      el.style.opacity = '0';
      document.body.appendChild(el);
      el.select();
      try { document.execCommand('copy'); } finally { el.remove(); }
    }
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  };

  const copyMarks = () => {
    if (!slug || marks.length === 0) return;
    void copyText(marksMarkdown(slug, marks, url), 'marks');
  };

  const sendMarks = async () => {
    if (!slug || marks.length === 0) return;
    setSending(true);
    setSent(null);
    try {
      const r = await fetch('/api/olympus/marks/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, marks, previewUrl: url }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d?.ok) throw new Error(d?.error || `HTTP ${r.status}`);
      setSent(`${d.count} mark${d.count === 1 ? '' : 's'} sent to Apollo in the terminal${d.duplicate ? ' (already queued)' : ''}.`);
      setMarksOpen(true);
    } catch (e: any) {
      setSent(`failed: ${e?.message || String(e)}`);
    } finally {
      setSending(false);
    }
  };

  const title = state?.name || slug || 'preview';
  const status = state?.running ? (state?.probeMs ? `live · ${state.probeMs}ms` : 'live') : 'waiting for the dev server';

  return (
    <main className="flex h-dvh w-full flex-col overflow-hidden bg-[#080B12] text-olympus-text">
      <header className="flex shrink-0 items-center gap-2 border-b border-olympus-gold/20 bg-[#0B0E13] px-3 py-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-olympus-gold/25 text-olympus-gold"><MonitorUp size={15} /></span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[9px] font-mono uppercase tracking-[0.22em] text-olympus-gold">
            OLYMPUS · preview
            <span className={`h-1.5 w-1.5 rounded-full ${state?.running ? 'bg-olympus-green animate-pulse' : 'bg-olympus-gold/60'}`} />
            <span className="normal-case tracking-normal text-olympus-text-dim">{status}</span>
          </div>
          <div className="truncate text-[11px] font-semibold text-olympus-text">{title}{state?.port ? ` · :${state.port}` : ''}</div>
        </div>
        <button
          type="button"
          disabled={!url}
          onClick={() => setMarkMode((v) => !v)}
          aria-pressed={markMode}
          aria-keyshortcuts="m"
          data-tip="Mark one element (M). The app stays navigable between marks; the queue is saved on disk."
          className={`flex h-8 items-center gap-1 rounded-lg border px-2 text-[9px] font-mono disabled:opacity-40 ${markMode ? 'border-olympus-red/40 bg-olympus-red/10 text-olympus-red' : 'border-olympus-cyan/30 text-olympus-cyan hover:bg-olympus-cyan/10'}`}
        >
          <MousePointerClick size={12} /> {markMode ? 'click…' : 'Mark'}
        </button>
        <button
          type="button"
          onClick={() => setMarksOpen((v) => !v)}
          aria-expanded={marksOpen}
          data-tip="Marks are saved on disk for this project — open the panel, copy them or send the batch to Apollo"
          className={`flex h-8 items-center gap-1 rounded-lg border px-2 text-[9px] font-mono disabled:opacity-40 ${marksOpen ? 'border-olympus-gold/50 bg-olympus-gold/20 text-olympus-gold' : 'border-olympus-gold/30 text-olympus-gold hover:bg-olympus-gold/10'}`}
        >
          <ClipboardList size={11} /> {marks.length} mark{marks.length === 1 ? '' : 's'}
        </button>
        {url && (
          <a href={url} target="_blank" rel="noreferrer" aria-label="Open in browser" className="flex h-8 w-8 items-center justify-center rounded-lg border border-olympus-gold/20 text-olympus-gold hover:bg-olympus-gold/10"><ExternalLink size={13} /></a>
        )}
        <button
          onClick={() => { setLoaded(false); setReloadKey((k) => k + 1); setRetry((r) => r + 1); setPartReady(null); }}
          aria-label="Reload preview"
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-olympus-gold/20 text-olympus-gold hover:bg-olympus-gold/10"
        ><RefreshCw size={13} /></button>
        <button onClick={() => window.close()} aria-label="Close preview window" className="flex h-8 w-8 items-center justify-center rounded-lg border border-olympus-gold/20 text-olympus-text-dim hover:text-olympus-red"><X size={14} /></button>
      </header>

      {draft && (
        <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-olympus-gold/20 bg-olympus-gold/10 px-3 py-2 text-[9px] font-mono">
          <span className="text-olympus-gold whitespace-nowrap">Mark ({draft.x}, {draft.y})</span>
          <input
            value={pageText}
            onChange={(e) => setPageText(e.target.value)}
            aria-label="Page URL or route for this mark"
            data-tip="The page this mark belongs to — edit it if you navigated inside the preview"
            className="min-w-0 flex-1 rounded border border-olympus-gold/20 bg-olympus-bg px-2 py-1 text-[10px] text-olympus-text outline-none"
            placeholder="page URL or route"
          />
          <input
            value={markText}
            onChange={(e) => setMarkText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') addMark(); }}
            autoFocus
            aria-label="Describe this mark"
            className="min-w-0 flex-[2] rounded border border-olympus-gold/20 bg-olympus-bg px-2 py-1 text-[10px] text-olympus-text outline-none"
            placeholder="what should change here?"
          />
          <button type="button" onClick={addMark} disabled={!markText.trim()} className="rounded border border-olympus-green/40 bg-olympus-green/15 px-2 py-1 text-olympus-green disabled:opacity-40">add</button>
          <button type="button" onClick={() => { setDraft(null); setMarkText(''); setPageText(''); }} className="px-1 text-olympus-text-dim hover:text-olympus-text">cancel</button>
        </div>
      )}

      {marksOpen && !draft && (
        <section className="flex max-h-[46vh] shrink-0 flex-col border-b border-olympus-gold/20 bg-[#0B0E13]">
          <div className="flex flex-wrap items-center gap-1.5 border-b border-olympus-gold/10 px-3 py-2 text-[9px] font-mono">
            <span className="uppercase tracking-[0.18em] text-olympus-gold">Marks</span>
            <span className="text-olympus-text-dim">{marks.length} saved in this project</span>
            <button
              type="button"
              onClick={copyMarks}
              disabled={marks.length === 0}
              className="ml-auto flex items-center gap-1 rounded border border-olympus-cyan/30 px-2 py-1 text-olympus-cyan hover:bg-olympus-cyan/10 disabled:opacity-40"
            >
              {copied === 'marks' ? <Check size={10} /> : <Copy size={10} />} {copied === 'marks' ? 'copied' : 'copy all'}
            </button>
            <button
              type="button"
              onClick={() => void sendMarks()}
              disabled={marks.length === 0 || sending}
              className="flex items-center gap-1 rounded border border-olympus-gold/40 bg-olympus-gold/15 px-2 py-1 text-olympus-gold hover:bg-olympus-gold/25 disabled:opacity-40"
            >
              <Bot size={10} /> {sending ? 'sending…' : 'send to Apollo'}
            </button>
            <button type="button" onClick={() => setMarks([])} disabled={marks.length === 0} className="px-1 text-olympus-text-dim hover:text-olympus-red disabled:opacity-40">clear</button>
            <button type="button" onClick={() => setMarksOpen(false)} aria-label="Close marks panel" className="px-1 text-olympus-text-dim hover:text-olympus-text"><X size={11} /></button>
          </div>
          <div className="min-h-0 flex-1 overflow-auto px-3 py-2">
            {marks.length === 0 ? (
              <p className="text-[10px] leading-relaxed text-olympus-text-dim">
                No marks yet. Click <span className="text-olympus-gold">Mark</span> (or press <span className="text-olympus-gold">M</span>), click an element, describe the change, and add it. Navigate to another page and repeat; the queue is saved on disk.
              </p>
            ) : (
              <ul className="flex flex-col gap-1">
                {marks.map((m, i) => (
                  <li key={m.id} className="flex items-start gap-2 rounded border border-olympus-gold/15 bg-olympus-card/40 px-2 py-1.5 text-[9px] font-mono">
                    <span className="mt-0.5 text-olympus-gold">{i + 1}.</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[9px] text-olympus-gold" data-tip={m.page}>{m.page}</span>
                      <span className="block text-[10px] leading-relaxed text-olympus-text">{m.instruction}</span>
                      <span className="text-[8px] text-olympus-text-dim">({m.x}, {m.y}){m.viewport ? ` · ${m.viewport.width}×${m.viewport.height}` : ''}</span>
                    </span>
                    <button type="button" onClick={() => void copyText(marksMarkdown(slug || '', [m], url), m.id)} aria-label={`Copy mark ${i + 1}`} className="text-olympus-text-dim hover:text-olympus-cyan">
                      {copied === m.id ? <Check size={10} /> : <Copy size={10} />}
                    </button>
                    <button type="button" onClick={() => removeMark(m.id)} aria-label={`Remove mark ${i + 1}`} className="text-olympus-text-dim hover:text-olympus-red"><Trash2 size={10} /></button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

      {sent && (
        <div className="shrink-0 border-b border-olympus-gold/15 bg-olympus-green/10 px-3 py-1 text-[9px] font-mono text-olympus-green">{sent}</div>
      )}

      <div className="relative min-h-0 flex-1 bg-black" onPointerDownCapture={noteInteraction} onKeyDownCapture={noteInteraction} onWheelCapture={noteInteraction}>
        {!state && !error && <OlympusLoader label="Resolving the project…" size={150} />}
        {error && !state?.running && (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
            <p className="text-[12px] font-semibold text-olympus-gold">The preview is not ready.</p>
            <p className="max-w-md text-[10px] leading-relaxed text-olympus-text-dim">{error}</p>
            <button onClick={() => { setError(null); setRetry((r) => r + 1); }} className="mt-1 rounded-lg border border-olympus-gold/30 px-3 py-1.5 text-[10px] text-olympus-gold">Try again</button>
          </div>
        )}
        {state && !state.running && !error && (
          <div className="flex h-full flex-col items-center justify-center">
            <OlympusLoader label={`Waiting for ${title}`} size={170} />
            <p className="mt-2 max-w-lg px-6 text-center text-[10px] leading-relaxed text-olympus-text-dim">{state.note || 'The project preview will appear here the moment the dev server is ready.'}</p>
            {state.port && <p className="mt-1 text-[9px] font-mono text-olympus-text-dim">port :{state.port} · the window follows it</p>}
          </div>
        )}
        {url && (
          <>
            {!loaded && (
              <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-[#080B12]/80">
                <OlympusLoader label={`Opening ${title}…`} size={120} />
              </div>
            )}
            <PreviewSurface
              src={frameUrl}
              title={`${title} live preview`}
              reloadKey={reloadKey}
              forceBrowser
              onLoad={() => setLoaded(true)}
            />
            {draft && (
              <span
                className="pointer-events-none absolute z-30 -translate-x-1/2 -translate-y-1/2"
                style={{ left: draft.x, top: draft.y }}
                aria-hidden
              >
                <span className="block h-4 w-4 rounded-full border-2 border-olympus-gold bg-olympus-gold/30 shadow-[0_0_0_5px_rgba(212,165,116,0.16)]" />
              </span>
            )}
            {markMode && (
              <button
                type="button"
                aria-label="Place a mark on the preview"
                data-tip="Click the element to mark; the overlay closes so you can navigate to the next page"
                onClick={captureMark}
                className="absolute inset-0 z-20 cursor-crosshair bg-olympus-gold/5"
              >
                <span className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 rounded border border-olympus-gold/30 bg-[#0B0E13]/90 px-2 py-1 text-[9px] font-mono text-olympus-gold">
                  click the element · Esc to cancel
                </span>
              </button>
            )}
          </>
        )}
      </div>

      <footer className="flex shrink-0 items-center gap-2 border-t border-olympus-gold/15 bg-[#0B0E13] px-3 py-1 text-[8px] font-mono text-olympus-text-dim">
        <span className="truncate">{state?.note || 'the window follows the project preview'}</span>
        <span className="ml-auto flex items-center gap-2">
          {partReady && (
            <button onClick={() => { setLoaded(false); setReloadKey((k) => k + 1); setPartReady(null); }} className="text-olympus-cyan hover:text-olympus-gold">
              part {partReady} ready · refresh
            </button>
          )}
          {loaded ? <span className="text-olympus-green">live</span> : <><Loader2 size={8} className="animate-spin" /> connecting</>}
        </span>
      </footer>
    </main>
  );
}
