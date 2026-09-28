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

const DEFAULT_PORT = 3000;
const PROBE_INTERVAL_MS = 3000;

interface ProbeStatus { running: boolean; port: number; url: string; responseTimeMs: number; }

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

  const port = activeProject?.livePreviewPort || DEFAULT_PORT;
  const previewUrl = `http://127.0.0.1:${port}`;
  const projectSlug = activeProject?.slug || null;

  const probe = useCallback(async () => {
    try {
      const params = projectSlug ? `?project=${encodeURIComponent(projectSlug)}` : '';
      const r = await fetch(`/api/olympus/live-preview/status${params}`);
      const d = await r.json();
      setStatus({ running: d.running, port: d.port, url: d.url, responseTimeMs: d.responseTimeMs });
      setProbing(false);
    } catch { setStatus({ running: false, port, url: previewUrl, responseTimeMs: 0 }); setProbing(false); }
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
  const showOverlay = !isRunning || probing || !iframeLoaded;

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
          <OlympusTooltip content="Mark an element for editing" side="bottom">
            <button onClick={() => setMarkMode(!markMode)} className={cn('flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono transition-all', markMode ? 'bg-olympus-gold/20 text-olympus-gold ring-1 ring-olympus-gold/40' : 'text-olympus-text-dim hover:text-olympus-gold hover:bg-olympus-gold/10')}>
              <MousePointerClick size={11} /> {markMode ? 'click preview…' : 'Mark'}
            </button>
          </OlympusTooltip>
          <OlympusTooltip content="Refresh probe" side="bottom">
            <button onClick={() => { setIframeLoaded(false); probe(); }} className="text-olympus-text-dim hover:text-olympus-gold transition-colors p-1"><RefreshCw size={11} /></button>
          </OlympusTooltip>
          <a href={previewUrl} target="_blank" rel="noopener noreferrer" className="text-olympus-gold hover:text-olympus-gold/80 text-[10px] font-mono px-1.5">open ↗</a>
        </div>
      </div>

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
        {isRunning && (
          <iframe src={previewUrl} className="w-full h-full border-0" sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-downloads allow-modals allow-presentation" allow="clipboard-read; clipboard-write; fullscreen; encrypted-media; picture-in-picture; autoplay" title="Live Preview" onLoad={() => setIframeLoaded(true)} style={{ display: showOverlay ? 'none' : 'block' }} />
        )}
        {showOverlay && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-olympus-bg">
            <div className="relative w-24 h-24 mb-6">
              <div className="absolute inset-0 rounded-full border-2 border-olympus-gold/20 animate-ping" style={{ animationDuration: '2s' }} />
              <div className="absolute inset-2 rounded-full border-2 border-olympus-gold/30 animate-ping" style={{ animationDuration: '2.5s', animationDelay: '0.3s' }} />
              <div className="absolute inset-4 rounded-full border-2 border-olympus-gold/40 animate-ping" style={{ animationDuration: '3s', animationDelay: '0.6s' }} />
              <div className="absolute inset-0 flex items-center justify-center">{probing ? <Loader2 size={28} className="text-olympus-gold animate-spin" /> : <EyeOff size={28} className="text-olympus-gold/60" />}</div>
            </div>
            <h3 className="text-sm font-mono font-semibold text-olympus-gold mb-2">{probing ? 'Probing dev server…' : 'Code in progress…'}</h3>
            <p className="text-[11px] font-mono text-olympus-text-dim text-center max-w-xs leading-relaxed mb-4">
              {activeProject ? `Waiting for ${activeProject.name}'s dev server at :${port}. Start it with \`npm run dev\` in the project folder.` : `No active project. Select one from the Project Switcher, or the preview defaults to :${port}.`}
            </p>
            {!probing && !isRunning && (
              <div className="text-[10px] font-mono text-[#5A5A5A] bg-olympus-card px-3 py-1.5 rounded-md border border-olympus-gold/10">
                <span className="text-olympus-gold">tip:</span> run <code className="text-olympus-green">cd "{activeProject?.path || '<project>'}" && npm run dev</code>
              </div>
            )}
            {isRunning && !iframeLoaded && !probing && <p className="text-[10px] font-mono text-olympus-text-dim">Dev server is up — loading preview…</p>}
          </div>
        )}
        {markMode && <div className="absolute top-2 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-olympus-gold/20 text-olympus-gold text-[10px] font-mono ring-1 ring-olympus-gold/30 pointer-events-none">Click anywhere on the preview to mark for editing</div>}
      </div>

      <div className="h-6 shrink-0 flex items-center justify-between px-3 border-t border-olympus-gold/10 bg-olympus-panel text-[9px] font-mono text-olympus-text-dim">
        <span>{isRunning ? `:${port} · ${status?.responseTimeMs ?? 0}ms` : `:${port} · offline`}</span>
        <span className="text-[#5A5A5A]">live · no auto-refresh · interactive</span>
      </div>
    </div>
  );
}
