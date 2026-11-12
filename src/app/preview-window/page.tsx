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
import { ExternalLink, Loader2, RefreshCw, X, MonitorUp, MousePointerClick, Send, Trash2 } from 'lucide-react';
import OlympusLoader from '@/components/olympus/olympus-loader';

interface PreviewState {
  ok: boolean;
  slug: string;
  name: string | null;
  port: number | null;
  running: boolean;
  localUrl: string;
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
  const esRef = useRef<EventSource | null>(null);
  // v0.0.91 — the large window's mark session: capture across pages, then
  // send the whole batch to Athena/Apollo in one planning turn.
  type Mark = { id: string; x: number; y: number; page: string; instruction: string; viewport: { width: number; height: number } };
  const [markMode, setMarkMode] = useState(false);
  const [draft, setDraft] = useState<{ x: number; y: number; page: string; viewport: { width: number; height: number } } | null>(null);
  const [markText, setMarkText] = useState('');
  const [pageText, setPageText] = useState('');
  const [marks, setMarks] = useState<Mark[]>([]);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<string | null>(null);

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

  // Follow the campaign: a settled hop is a new part; reload the frame so the
  // preview keeps up without the user touching it.
  useEffect(() => {
    if (!slug) return;
    try {
      const es = new EventSource('/api/olympus/hops/stream');
      esRef.current = es;
      es.onmessage = (e) => {
        try {
          const ev = JSON.parse(e.data);
          if (ev?.type !== 'hop_done') return;
          if (ev?.project && ev.project !== slug) return;
          setLoaded(false);
          setReloadKey((k) => k + 1);
        } catch { /* torn frame */ }
      };
    } catch { /* no stream: manual reload still works */ }
    return () => { esRef.current?.close(); esRef.current = null; };
  }, [slug]);

  const url = useMemo(() => {
    if (!state?.running) return '';
    return state.localUrl || state.recommendedUrl || '';
  }, [state?.running, state?.localUrl, state?.recommendedUrl]);

  // The frame can finish loading BEFORE React hydrates; in that case the load
  // event never reaches onLoad and the "Opening…" overlay covers the preview
  // forever. Keep onLoad as the fast path and clear the overlay on a short
  // fallback so the window can never sit on a stale loader.
  useEffect(() => {
    if (!url) return;
    const t = setTimeout(() => setLoaded(true), 3000);
    return () => clearTimeout(t);
  }, [url, reloadKey]);

  // Persist the mark queue per project so a reload of the window does not
  // lose the batch the user just collected.
  useEffect(() => {
    if (!slug) return;
    try {
      const raw = JSON.parse(localStorage.getItem(`olympus:marks:${slug}`) || '[]');
      if (Array.isArray(raw)) setMarks(raw);
    } catch { /* ignore */ }
  }, [slug]);
  useEffect(() => {
    if (!slug) return;
    try { localStorage.setItem(`olympus:marks:${slug}`, JSON.stringify(marks)); } catch { /* private */ }
  }, [marks, slug]);

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
    }]);
    setDraft(null);
    setMarkText('');
    setPageText('');
  };

  const removeMark = (id: string) => setMarks((prev) => prev.filter((m) => m.id !== id));

  const sendMarks = async () => {
    if (!slug || marks.length === 0) return;
    setSending(true);
    setSent(null);
    try {
      const r = await fetch('/api/olympus/athena/edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          marks: marks.map((m) => ({ x: m.x, y: m.y, page: m.page, instruction: m.instruction, viewport: m.viewport })),
          projectSlug: slug,
          previewUrl: url,
          route: '/',
          batch: true,
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d?.ok) throw new Error(d?.error || `HTTP ${r.status}`);
      setSent(d.message || `${marks.length} marks sent to Athena`);
      setMarks([]);
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
          data-tip="Mark one element; the app stays navigable between marks"
          className={`flex h-8 items-center gap-1 rounded-lg border px-2 text-[9px] font-mono disabled:opacity-40 ${markMode ? 'border-olympus-red/40 bg-olympus-red/10 text-olympus-red' : 'border-olympus-cyan/30 text-olympus-cyan hover:bg-olympus-cyan/10'}`}
        >
          <MousePointerClick size={12} /> {markMode ? 'click…' : 'Mark'}
        </button>
        {marks.length > 0 && (
          <button
            type="button"
            onClick={() => void sendMarks()}
            disabled={sending}
            data-tip={`Send all ${marks.length} marks to Athena in one planning turn`}
            className="flex h-8 items-center gap-1 rounded-lg border border-olympus-gold/40 bg-olympus-gold/15 px-2 text-[9px] font-mono text-olympus-gold hover:bg-olympus-gold/25 disabled:opacity-40"
          >
            <Send size={11} /> {sending ? 'sending…' : `${marks.length} mark${marks.length === 1 ? '' : 's'}`}
          </button>
        )}
        {url && (
          <a href={url} target="_blank" rel="noreferrer" aria-label="Open in browser" className="flex h-8 w-8 items-center justify-center rounded-lg border border-olympus-gold/20 text-olympus-gold hover:bg-olympus-gold/10"><ExternalLink size={13} /></a>
        )}
        <button
          onClick={() => { setLoaded(false); setReloadKey((k) => k + 1); setRetry((r) => r + 1); }}
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

      {marks.length > 0 && !draft && (
        <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-olympus-gold/15 bg-[#0B0E13] px-3 py-1.5 text-[8px] font-mono">
          {marks.map((m, i) => (
            <span key={m.id} className="inline-flex max-w-full items-center gap-1 rounded border border-olympus-gold/20 bg-olympus-card/60 px-1.5 py-0.5">
              <span className="text-olympus-gold">{i + 1}.</span>
              <span className="max-w-[160px] truncate text-olympus-text-dim" data-tip={`${m.page} · (${m.x}, ${m.y})`}>{m.instruction}</span>
              <button type="button" onClick={() => removeMark(m.id)} aria-label={`Remove mark ${i + 1}`} className="text-olympus-text-dim hover:text-olympus-red"><Trash2 size={9} /></button>
            </span>
          ))}
          <button type="button" onClick={() => setMarks([])} className="ml-auto text-olympus-text-dim hover:text-olympus-red">clear</button>
        </div>
      )}

      {sent && (
        <div className="shrink-0 border-b border-olympus-gold/15 bg-olympus-green/10 px-3 py-1 text-[9px] font-mono text-olympus-green">{sent}</div>
      )}

      <div className="relative min-h-0 flex-1 bg-black">
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
              <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-[#080B12]">
                <OlympusLoader label={`Opening ${title}…`} size={120} />
              </div>
            )}
            <iframe
              key={`${url}-${reloadKey}`}
              src={url}
              title={`${title} live preview`}
              onLoad={() => setLoaded(true)}
              className="h-full w-full border-0"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-downloads allow-modals allow-presentation"
              allow="clipboard-read; clipboard-write; fullscreen; encrypted-media; picture-in-picture; autoplay"
            />
            {markMode && (
              <button
                type="button"
                aria-label="Place a mark on the preview"
                data-tip="Click the element to mark; the overlay closes so you can navigate to the next page"
                onClick={captureMark}
                className="absolute inset-0 z-20 cursor-crosshair bg-olympus-gold/5"
              />
            )}
          </>
        )}
      </div>

      <footer className="flex shrink-0 items-center gap-2 border-t border-olympus-gold/15 bg-[#0B0E13] px-3 py-1 text-[8px] font-mono text-olympus-text-dim">
        <span className="truncate">{state?.note || 'the window follows the project preview'}</span>
        <span className="ml-auto flex items-center gap-1">{loaded ? <span className="text-olympus-green">live</span> : <><Loader2 size={8} className="animate-spin" /> connecting</>}</span>
      </footer>
    </main>
  );
}
