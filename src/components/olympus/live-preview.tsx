/**
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

'use client';

/**
 * Live Preview — real-time preview of the active project's dev server.
 * Phase 2 new feature. Left-pane view with Eye icon in ActivityBar.
 * Embeds the project dev server (default :3000). Shows "Code in progress..."
 * overlay when down. "Mark for editing" captures click position → Terminal queue.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { Eye, EyeOff, RefreshCw, MousePointerClick, Send, Loader2 } from 'lucide-react';
import { useOlympus } from '@/lib/olympus-store';
import { cn } from '@/lib/utils';
import OlympusTooltip from './olympus-tooltip'; // P9 — replaces native title=
import { normalizePreviewUrl } from '@/lib/live-preview-url';

const DEFAULT_PORT = 3000;
const PROBE_INTERVAL_MS = 3000;

interface ProbeStatus { running: boolean; port: number; url: string; host?: 'ipv4' | 'ipv6' | null; responseTimeMs: number; path?: string | null; pathSource?: string | null; demoLogin?: string | null; manager?: { running: boolean; port: number | null; url: string | null; slug: string; startedAt: string | null; responseTimeMs: number | null; note: string } | null; }

export default function LivePreview() {
  const activeProject = useOlympus(s => s.activeProject);
  const pushEvent = useOlympus(s => s.pushEvent);
  const [status, setStatus] = useState<ProbeStatus | null>(null);
  const [probing, setProbing] = useState(true);
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [markMode, setMarkMode] = useState(false);
  const [pendingMark, setPendingMark] = useState<{ x: number; y: number } | null>(null);
  const [instruction, setInstruction] = useState('');
  const [sending, setSending] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  // #202: the editable URL bar. `customUrl` is a user-pinned origin/path for
  // debugging another port; null means "follow the probed dev server". The
  // choice persists per project lane.
  const [customUrl, setCustomUrl] = useState<string | null>(null);
  const [urlDraft, setUrlDraft] = useState('');
  const [urlError, setUrlError] = useState<string | null>(null);
  const urlFocusedRef = useRef(false);

  const port = activeProject?.livePreviewPort || DEFAULT_PORT;
  // #102: the pre-first-probe guess ONLY — once a probe settles, effectiveUrl
  // below is the server-verified REACHABLE url (dual-stack, bracketed for IPv6).
  const previewUrl = `http://127.0.0.1:${port}`;
  const projectSlug = activeProject?.slug || null;
  const urlStorageKey = `olympus-live-preview-url:${projectSlug || 'default'}`;

  const probe = useCallback(async () => {
    try {
      const params = projectSlug ? `?project=${encodeURIComponent(projectSlug)}` : '';
      // #102: the route serves /api/olympus/live-preview — the old /status
      // suffix 404'd (no route, no rewrites), r.json() threw on the HTML
      // error page, and the catch set offline forever. The dead call was
      // the panel's real defect; no client-side workaround could fix it.
      const r = await fetch(`/api/olympus/live-preview${params}`);
      const d = await r.json();
      setStatus({ running: d.running, port: d.port, url: d.url, host: d.host ?? null, responseTimeMs: d.responseTimeMs, path: d.path ?? null, pathSource: d.pathSource ?? null, demoLogin: d.demoLogin ?? null, manager: d.manager ?? null });
      setProbing(false);
    } catch { setStatus({ running: false, port, url: previewUrl, host: null, responseTimeMs: 0 }); setProbing(false); }
  }, [projectSlug, port, previewUrl]);

  useEffect(() => { setIframeLoaded(false); setProbing(true); probe(); const iv = setInterval(probe, PROBE_INTERVAL_MS); return () => clearInterval(iv); }, [probe]);

  const handleContainerClick = useCallback((e: React.MouseEvent) => {
    if (!markMode) return;
    const rect = containerRef.current?.getBoundingClientRect(); if (!rect) return;
    setPendingMark({ x: Math.round(e.clientX - rect.left), y: Math.round(e.clientY - rect.top) });
    setMarkMode(false);
  }, [markMode]);

  const sendToAthena = useCallback(async () => {
    if (!pendingMark || !instruction.trim()) return;
    setSending(true);
    try {
      const response = await fetch('/api/olympus/athena/edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          x: pendingMark.x,
          y: pendingMark.y,
          instruction: instruction.trim(),
          projectSlug: activeProject?.slug || null,
          viewport: { width: window.innerWidth, height: window.innerHeight, devicePixelRatio: window.devicePixelRatio },
          route: typeof window !== 'undefined' ? window.location.pathname : '/',
        }),
      });
      const data = await response.json();
      pushEvent({
        type: 'live_preview_mark',
        msg: `Athena dispatched: "${instruction.trim().slice(0, 80)}" at (${pendingMark.x}, ${pendingMark.y})`,
        x: pendingMark.x, y: pendingMark.y,
        project: activeProject?.slug || null,
        ts: new Date().toISOString(),
      });
      setPendingMark(null);
      setInstruction('');
    } catch (err) {
      pushEvent({
        type: 'live_preview_mark',
        msg: `Athena dispatch failed: ${err instanceof Error ? err.message : 'unknown error'}`,
        x: pendingMark.x, y: pendingMark.y,
        project: activeProject?.slug || null,
        ts: new Date().toISOString(),
      });
    } finally {
      setSending(false);
    }
  }, [pendingMark, instruction, pushEvent, activeProject]);

  const isRunning = status?.running ?? false;
  // #102: the server-verified REACHABLE url once probing settles; the local
  // guess is only the pre-first-probe fallback.
  const effectiveUrl = status?.url ?? previewUrl;
  // #202: a user-pinned URL wins over the probe; the frame follows it even
  // when the default port is down (that is the whole point of the bar).
  const frameUrl = customUrl ?? effectiveUrl;
  // #103: the RESOLVED project path (note/lane reconciliation) for the tip —
  // the raw note path only as the pre-first-probe fallback.
  const resolvedPath = status?.path ?? activeProject?.path;
  const showOverlay = customUrl ? !iframeLoaded : (!isRunning || probing || !iframeLoaded);

  // #202: hydrate the pinned URL for this project lane, and keep the draft
  // synced with the probe while the user is not editing it.
  useEffect(() => {
    let stored: string | null = null;
    try { stored = localStorage.getItem(urlStorageKey); } catch { /* storage unavailable */ }
    const pinned = stored && /^https?:\/\//i.test(stored) ? stored : null;
    setCustomUrl(pinned);
    setUrlError(null);
    setUrlDraft(pinned ?? previewUrl);
    setIframeLoaded(false);
  }, [urlStorageKey, previewUrl]);
  useEffect(() => {
    if (!urlFocusedRef.current) setUrlDraft(customUrl ?? effectiveUrl);
  }, [effectiveUrl, customUrl]);

  const commitUrl = useCallback(() => {
    const result = normalizePreviewUrl(urlDraft);
    if (!result.ok) {
      setUrlError(result.error);
      return;
    }
    let probed: string | null = null;
    try { probed = new URL(effectiveUrl).toString(); } catch { /* probe url malformed */ }
    setUrlError(null);
    setIframeLoaded(false);
    if (result.url === probed) {
      setCustomUrl(null);
      try { localStorage.removeItem(urlStorageKey); } catch { /* storage unavailable */ }
    } else {
      setCustomUrl(result.url);
      try { localStorage.setItem(urlStorageKey, result.url); } catch { /* storage unavailable */ }
    }
  }, [urlDraft, effectiveUrl, urlStorageKey]);

  const resetUrl = useCallback(() => {
    setCustomUrl(null);
    setUrlError(null);
    setUrlDraft(effectiveUrl);
    setIframeLoaded(false);
    try { localStorage.removeItem(urlStorageKey); } catch { /* storage unavailable */ }
  }, [effectiveUrl, urlStorageKey]);

  return (
    <div className="w-full h-full flex flex-col bg-olympus-bg">
      <div className="h-9 shrink-0 flex items-center justify-between px-3 border-b border-olympus-gold/10 bg-olympus-panel">
        <div className="flex items-center gap-2 text-[11px] font-mono">
          <Eye size={13} className="text-olympus-gold" />
          <span className="text-olympus-gold font-semibold">Live Preview</span>
          {activeProject && <span className="text-olympus-text-dim">· {activeProject.name}</span>}
          <span className="text-olympus-text-dim text-[10px]">:{port}</span>
          {isRunning && !probing && <span className="text-olympus-green text-[10px] flex items-center gap-0.5"><span className="w-1.5 h-1.5 rounded-full bg-olympus-green animate-pulse" /> live</span>}
        </div>
        <div className="flex items-center gap-1.5">
          {/* #100 (v0.0.6): THE DURABLE HOST CONTROLS — the #86 manager is
              the host (probe-verified truth, deps-first spawn, patience
              windows). Start when nothing runs; stop when the manager owns
              the server (an unmanaged ephemeral server stops with its
              owner — the button honestly hides). */}
          <DevServerControls status={status} onDone={() => { setIframeLoaded(false); probe(); }} />
          <OlympusTooltip content="Mark an element for editing" side="bottom">
            <button onClick={() => setMarkMode(!markMode)} className={cn('flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono transition-all', markMode ? 'bg-olympus-gold/20 text-olympus-gold ring-1 ring-olympus-gold/40' : 'text-olympus-text-dim hover:text-olympus-gold hover:bg-olympus-gold/10')}>
              <MousePointerClick size={11} /> {markMode ? 'click preview…' : 'Mark'}
            </button>
          </OlympusTooltip>
          <OlympusTooltip content="Refresh probe" side="bottom">
            <button onClick={() => { setIframeLoaded(false); probe(); }} className="text-olympus-text-dim hover:text-olympus-gold transition-colors p-1"><RefreshCw size={11} /></button>
          </OlympusTooltip>
          <a href={frameUrl} target="_blank" rel="noopener noreferrer" className="text-olympus-gold hover:text-olympus-gold/80 text-[10px] font-mono px-1.5">open ↗</a>
        </div>
      </div>

      {/* #202: editable URL bar — Enter navigates the frame, invalid URLs are
          refused inline (never a silent fallback), the pin persists per
          project lane, and "reset" returns to the probed origin. */}
      <div className="shrink-0 border-b border-olympus-gold/10 bg-olympus-bg/60 px-3 py-1">
        <div className="flex items-center gap-2">
          <span className="text-[9px] font-mono text-olympus-text-dim shrink-0">url</span>
          <input
            type="text"
            value={urlDraft}
            onChange={(e) => { setUrlDraft(e.target.value); if (urlError) setUrlError(null); }}
            onFocus={() => { urlFocusedRef.current = true; }}
            onBlur={() => { urlFocusedRef.current = false; }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); commitUrl(); }
              if (e.key === 'Escape') { e.preventDefault(); resetUrl(); }
            }}
            spellCheck={false}
            placeholder={effectiveUrl}
            aria-label="Preview URL"
            className={cn(
              'flex-1 min-w-0 bg-olympus-panel/60 text-olympus-text px-2 py-0.5 rounded border font-mono text-[10px] focus:outline-none focus:ring-1',
              urlError ? 'border-olympus-red/50 focus:ring-olympus-red/40' : 'border-olympus-gold/15 focus:ring-olympus-gold/40',
            )}
          />
          {customUrl && (
            <button onClick={resetUrl} data-tip="Return to the probed dev server" className="text-[9px] font-mono text-olympus-text-dim hover:text-olympus-gold shrink-0">reset</button>
          )}
        </div>
        {urlError && <div className="mt-0.5 pl-7 text-[9px] font-mono text-olympus-red">{urlError}</div>}
      </div>

      {isRunning && status?.demoLogin && (
        <div className="shrink-0 flex items-center gap-1.5 px-3 py-1 bg-olympus-gold/5 border-b border-olympus-gold/10 text-[10px] font-mono overflow-hidden">
          <span className="text-olympus-gold shrink-0">demo login:</span>
          <code className="text-olympus-text/80 truncate" data-tip={status.demoLogin}>{status.demoLogin}</code>
        </div>
      )}

      {pendingMark && (
        <div className="shrink-0 flex flex-col gap-1.5 px-3 py-2 bg-olympus-gold/10 border-b border-olympus-gold/20 text-[10px] font-mono">
          <div className="flex items-center justify-between">
            <span className="text-olympus-gold flex items-center gap-1.5"><MousePointerClick size={11} />Marked ({pendingMark.x}, {pendingMark.y}) — describe the change for Athena:</span>
            <button onClick={() => { setPendingMark(null); setInstruction(''); }} className="text-olympus-text-dim hover:text-olympus-text px-1.5">cancel</button>
          </div>
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !sending) sendToAthena(); }}
              placeholder="e.g., make this button bigger and blue"
              className="flex-1 bg-olympus-bg/50 text-olympus-text px-2 py-1 rounded border border-olympus-gold/20 focus:outline-none focus:ring-1 focus:ring-olympus-gold/40 text-[11px]"
              autoFocus
              disabled={sending}
            />
            <button
              onClick={sendToAthena}
              disabled={sending || !instruction.trim()}
              className="flex items-center gap-1 px-2 py-1 rounded bg-olympus-gold/20 text-olympus-gold hover:bg-olympus-gold/30 ring-1 ring-olympus-gold/30 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {sending ? <Loader2 size={10} className="animate-spin" /> : <Send size={10} />}
              {sending ? 'sending…' : 'send to Athena'}
            </button>
          </div>
        </div>
      )}

      <div ref={containerRef} className={cn('flex-1 min-h-0 relative', markMode && 'cursor-crosshair')} onClick={handleContainerClick}>
        {(isRunning || customUrl) && (
          <iframe src={frameUrl} className="w-full h-full border-0" sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-downloads allow-modals allow-presentation" allow="clipboard-read; clipboard-write; fullscreen; encrypted-media; picture-in-picture; autoplay" title="Live Preview" data-tip="Live Preview" onLoad={() => setIframeLoaded(true)} style={{ display: showOverlay ? 'none' : 'block' }} />
        )}
        {showOverlay && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-olympus-bg">
            <div className="relative w-24 h-24 mb-6">
              <div className="absolute inset-0 rounded-full border-2 border-olympus-gold/20 animate-ping" style={{ animationDuration: '2s' }} />
              <div className="absolute inset-2 rounded-full border-2 border-olympus-gold/30 animate-ping" style={{ animationDuration: '2.5s', animationDelay: '0.3s' }} />
              <div className="absolute inset-4 rounded-full border-2 border-olympus-gold/40 animate-ping" style={{ animationDuration: '3s', animationDelay: '0.6s' }} />
              <div className="absolute inset-0 flex items-center justify-center">{probing ? <Loader2 size={28} className="text-olympus-gold animate-spin" /> : <EyeOff size={28} className="text-olympus-gold/60" />}</div>
            </div>
            <h3 className="text-sm font-mono font-semibold text-olympus-gold mb-2">{customUrl ? 'Loading pinned URL…' : probing ? 'Probing dev server…' : 'Code in progress…'}</h3>
            <p className="text-[11px] font-mono text-olympus-text-dim text-center max-w-xs leading-relaxed mb-4">
              {customUrl
                ? `Pinned to ${frameUrl} — the dev-server probe is bypassed.`
                : activeProject ? `Waiting for ${activeProject.name}'s dev server at :${port}. Start it with \`npm run dev\` in the project folder.` : `No active project. Select one from the Project Switcher, or the preview defaults to :${port}.`}
            </p>
            {!customUrl && !probing && !isRunning && (
              <div className="text-[10px] font-mono text-[#5A5A5A] bg-olympus-card px-3 py-1.5 rounded-md border border-olympus-gold/10">
                <span className="text-olympus-gold">tip:</span> run <code className="text-olympus-green">cd "{resolvedPath ?? '<project>'}" && npm run dev</code>
              </div>
            )}
            {!customUrl && !probing && !isRunning && status?.pathSource === 'note-stale' && (
              <p className="text-[10px] font-mono text-[#5A5A5A]">note path is stale — the project lives at {status?.path}</p>
            )}
            {!iframeLoaded && !probing && (customUrl || isRunning) && <p className="text-[10px] font-mono text-olympus-text-dim">{customUrl ? 'Pinned URL' : 'Dev server is up'} — loading preview…</p>}
          </div>
        )}
        {markMode && <div className="absolute top-2 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-olympus-gold/20 text-olympus-gold text-[10px] font-mono ring-1 ring-olympus-gold/30 pointer-events-none">Click anywhere on the preview to mark for editing</div>}
      </div>

      <div className="h-6 shrink-0 flex items-center justify-between px-3 border-t border-olympus-gold/10 bg-olympus-panel text-[9px] font-mono text-olympus-text-dim">
        <span>
          {customUrl
            ? `custom · ${frameUrl}`
            : isRunning ? `:${port} · ${status?.responseTimeMs ?? 0}ms` : `:${port} · offline`}
          {status?.manager?.running ? ' · durable host' : ''}
        </span>
        <span className="text-[#5A5A5A]">live · no auto-refresh · interactive</span>
      </div>
    </div>
  );
}

/* #100 (v0.0.6): the durable host controls — the #86 manager IS the host.
 * START when nothing runs (the manager installs deps first, probes after,
 * answers honest); STOP only when the manager owns the running server (an
 * unmanaged ephemeral server stops with its owner — no fake control). */
function DevServerControls({ status, onDone }: { status: ProbeStatus | null; onDone: () => void }) {
  const [busy, setBusy] = useState<null | 'start' | 'stop'>(null);
  const [error, setError] = useState<string | null>(null);
  const managed = status?.manager?.running === true;
  const anythingRunning = status?.running === true;

  const call = async (action: 'start' | 'stop') => {
    setBusy(action);
    setError(null);
    try {
      const r = await fetch(action === 'start' ? '/api/olympus/dev-server/start' : '/api/olympus/dev-server/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ port: status?.port }),
      }).then((r) => r.json());
      if (!r?.ok) setError(String(r?.error || r?.result?.error || `${action} failed`));
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setBusy(null);
      // The poll picks up the new state; nudge it now for snappiness.
      onDone();
    }
  };

  if (busy === 'start' || busy === 'stop') {
    return (
      <span className="flex items-center gap-1 text-[9px] font-mono text-olympus-text-dim">
        <Loader2 size={10} className="animate-spin" />
        {busy === 'start' ? 'starting (deps + boot + probe)…' : 'stopping…'}
      </span>
    );
  }
  if (error) {
    return (
      <button onClick={() => setError(null)} className="text-[9px] font-mono text-olympus-red hover:underline" data-tip={error}>
        {error.slice(0, 40)}… ✕
      </button>
    );
  }
  if (managed) {
    return (
      <button
        onClick={() => call('stop')}
        data-tip={`Stop the durable dev server (${status?.manager?.note ?? 'the #86 manager'})`}
        className="text-[10px] font-mono text-olympus-text-dim hover:text-olympus-red transition-colors px-1.5"
      >
        stop
      </button>
    );
  }
  if (!anythingRunning) {
    return (
      <button
        onClick={() => call('start')}
        data-tip="Start the durable dev server via the #86 manager (deps-first, probe-verified)"
        className="text-[10px] font-mono text-olympus-text-dim hover:text-olympus-green transition-colors px-1.5"
      >
        start
      </button>
    );
  }
  // Running but NOT manager-owned: an ephemeral server (a shell, a trigger
  // lane) — no fake control over a process we don't host.
  return null;
}
