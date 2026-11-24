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
import OlympusLoader from './olympus-loader';
import { Eye, EyeOff, RefreshCw, MousePointerClick, Send, Loader2, ChevronLeft, ChevronRight, Share2, Copy, X, MonitorUp, Zap, Maximize2, Minimize2, Smartphone, Tablet, Monitor } from 'lucide-react';
import { toast } from 'sonner';
import { useOlympus } from '@/lib/olympus-store';
import { cn } from '@/lib/utils';
import OlympusTooltip from './olympus-tooltip'; // P9 — replaces native title=
import { normalizePreviewUrl } from '@/lib/live-preview-url';
import { useDocVisible } from '@/lib/use-doc-visible';
import PreviewSurface from './preview-surface';
import { useHopParts } from '@/lib/hop-stream';

const DEFAULT_PORT = 3000;
const PROBE_INTERVAL_MS = 3000;

interface ProbeStatus { running: boolean; port: number; url: string; lanUrl?: string | null; host?: 'ipv4' | 'ipv6' | null; responseTimeMs: number; path?: string | null; pathSource?: string | null; demoLogin?: string | null; manager?: { running: boolean; port: number | null; url: string | null; slug: string; startedAt: string | null; responseTimeMs: number | null; rssMB?: number | null; note: string } | null; }

/** v0.0.99 — a probe that only changed its latency must not re-render the
 *  preview tree every 3s (the iframe/webview is heavy). Compare the fields a
 *  user can actually see. */
function sameProbe(a: ProbeStatus | null, b: ProbeStatus): boolean {
  if (!a) return false;
  return a.running === b.running
    && a.port === b.port
    && a.url === b.url
    && a.lanUrl === b.lanUrl
    && a.host === b.host
    && a.path === b.path
    && a.pathSource === b.pathSource
    && a.demoLogin === b.demoLogin
    && a.manager?.running === b.manager?.running
    && a.manager?.port === b.manager?.port
    && a.manager?.note === b.manager?.note
    && Math.round(a.responseTimeMs / 100) === Math.round(b.responseTimeMs / 100);
}

function isLoopbackHost(host: string): boolean {
  return host === '127.0.0.1' || host === 'localhost' || host === '::1' || host === '[::1]';
}

export default function LivePreview() {
  // #231 — the preview probe pauses when the window is hidden.
  const docVisible = useDocVisible();

  const activeProject = useOlympus(s => s.activeProject);
  const pushEvent = useOlympus(s => s.pushEvent);
  const [status, setStatus] = useState<ProbeStatus | null>(null);
  const [probing, setProbing] = useState(true);
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [markMode, setMarkMode] = useState(false);
  // v0.0.79 — a scoped, expiring share link for the running preview.
  const [shareOpen, setShareOpen] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareId, setShareId] = useState<string | null>(null);
  const [shareExpires, setShareExpires] = useState<string | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);
  const [shareCopied, setShareCopied] = useState(false);
  const [dMode, setDMode] = useState<'live-tunnel' | 'proxy' | null>(null);
  const [pendingMark, setPendingMark] = useState<{ x: number; y: number } | null>(null);
  const [instruction, setInstruction] = useState('');
  // v0.0.91 — the fast lane: patch directly (<=3 files, <=200 lines) with
  // typecheck/lint and deterministic undo, instead of planning a hop.
  const [quickEdit, setQuickEdit] = useState(false);
  const [sending, setSending] = useState(false);
  // v0.0.91 — the last quick edit stays visible with a deterministic undo.
  const [lastQuickEdit, setLastQuickEdit] = useState<null | { backupRoot: string; files: number; lines: number }>(null);
  const [quickUndoBusy, setQuickUndoBusy] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  // v0.0.99 — the SURFACE wrapper: the iframe/webview fills it and the mark
  // coordinates come from ITS rect (not the outer container, which may be
  // wider than a phone/tablet preset).
  const surfaceRef = useRef<HTMLDivElement>(null);
  // #202: the editable URL bar. `customUrl` is a user-pinned origin/path for
  // debugging another port; null means "follow the probed dev server". The
  // choice persists per project lane.
  const [customUrl, setCustomUrl] = useState<string | null>(null);
  const [urlDraft, setUrlDraft] = useState('');
  const [urlError, setUrlError] = useState<string | null>(null);
  const urlFocusedRef = useRef(false);
  // v0.0.34 — browser-grade history: back/forward through the URLs the user
  // navigated to, a reload key for the surface, and a visible position.
  const [historyStack, setHistoryStack] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [reloadKey, setReloadKey] = useState(0);
  // v0.0.99 — the viewport presets: inspect the phone/tablet layout without
  // leaving the pane. 'fit' is the normal full-width surface.
  const [device, setDevice] = useState<'fit' | 'phone' | 'tablet'>('fit');
  const [fullscreen, setFullscreen] = useState(false);
  const [surfaceError, setSurfaceError] = useState<string | null>(null);
  // v0.0.38 — PARTS IN THE PREVIEW. Each finished hop is a part of the
  // project; a landed part is offered, never forced. Auto-follow only fires
  // when the user has not touched the preview for a while; otherwise the
  // footer shows "part ready · refresh".
  const [autoFollow, setAutoFollow] = useState<boolean>(() => {
    try { return window.localStorage.getItem('olympus:preview-follow') !== '0'; } catch { return true; }
  });
  const [lastPart, setLastPart] = useState<string | null>(null);
  const [partReady, setPartReady] = useState<string | null>(null);
  const lastInteractionRef = useRef(0);
  const reloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    try { window.localStorage.setItem('olympus:preview-follow', autoFollow ? '1' : '0'); } catch { /* private */ }
  }, [autoFollow]);

  const noteInteraction = useCallback(() => {
    lastInteractionRef.current = Date.now();
    // A pending automatic reload is cancelled the moment the user touches
    // the preview: their work-in-progress must never be yanked away.
    if (reloadTimerRef.current) {
      clearTimeout(reloadTimerRef.current);
      reloadTimerRef.current = null;
    }
  }, []);

  const reloadNow = useCallback((nextPart?: string | null) => {
    if (reloadTimerRef.current) { clearTimeout(reloadTimerRef.current); reloadTimerRef.current = null; }
    setIframeLoaded(false);
    setSurfaceError(null);
    setReloadKey((k) => k + 1);
    if (nextPart !== undefined) setPartReady(nextPart);
  }, []);

  const handleHopDone = useCallback((hop: string) => {
    setLastPart(hop);
    const idleFor = Date.now() - lastInteractionRef.current;
    const canAuto = autoFollow && docVisible && idleFor > 15_000;
    setPartReady(hop);
    if (!canAuto) return;
    if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current);
    reloadTimerRef.current = setTimeout(() => {
      reloadTimerRef.current = null;
      // Re-check idle: the user may have started interacting during the wait.
      if (Date.now() - lastInteractionRef.current < 15_000) return;
      setIframeLoaded(false);
      setSurfaceError(null);
      setReloadKey((k) => k + 1);
      setPartReady(null);
    }, 2500);
  }, [autoFollow, docVisible]);

  useHopParts({ projectSlug: activeProject?.slug || null, enabled: docVisible, onHopDone: handleHopDone });

  useEffect(() => () => {
    if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current);
  }, []);

  useEffect(() => {
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const port = activeProject?.livePreviewPort || DEFAULT_PORT;
  // #102: the pre-first-probe guess ONLY — once a probe settles, effectiveUrl
  // below is the server-verified REACHABLE url (dual-stack, bracketed for IPv6).
  const previewUrl = `http://127.0.0.1:${port}`;
  // v0.0.99 — when the OLYMPUS shell is opened from another PC on the LAN, a
  // 127.0.0.1 preview would point at that PC, not the desktop running the
  // dev server. The route supplies the LAN origin; the desktop keeps loopback.
  const shellHost = typeof window !== 'undefined' ? window.location.hostname : '127.0.0.1';
  const shellLoopback = isLoopbackHost(shellHost);
  const preferredUrl = shellLoopback
    ? (status?.url ?? previewUrl)
    : (status?.lanUrl ?? status?.url ?? previewUrl);
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
      const next: ProbeStatus = { running: d.running, port: d.port, url: d.url, lanUrl: d.lanUrl ?? null, host: d.host ?? null, responseTimeMs: d.responseTimeMs, path: d.path ?? null, pathSource: d.pathSource ?? null, demoLogin: d.demoLogin ?? null, manager: d.manager ?? null };
      // v0.0.99 — latency jitter alone must not re-render the surface tree.
      setStatus((prev) => (prev && sameProbe(prev, next) ? prev : next));
      setProbing(false);
    } catch { setStatus((prev) => prev ?? { running: false, port, url: previewUrl, host: null, responseTimeMs: 0 }); setProbing(false); }
  }, [projectSlug, port, previewUrl]);

  useEffect(() => {
    if (!docVisible) return;
    setIframeLoaded(false); setProbing(true); setSurfaceError(null); probe();
    const iv = setInterval(probe, PROBE_INTERVAL_MS);
    return () => clearInterval(iv);
  }, [probe, docVisible]);

  const handleContainerClick = useCallback((e: React.MouseEvent) => {
    if (!markMode) return;
    noteInteraction();
    // v0.0.90 — the pixel is the PREVIEW SURFACE's CSS pixel, not the app
    // container's: a phone/tablet preset can be narrower than the pane. Both
    // the mark and the viewport Athena receives come from the same rect.
    const rect = (surfaceRef.current ?? containerRef.current)?.getBoundingClientRect();
    if (!rect) return;
    setPendingMark({ x: Math.round(e.clientX - rect.left), y: Math.round(e.clientY - rect.top) });
    setMarkMode(false);
  }, [markMode]);

  const sendToAthena = async () => {
    if (!pendingMark || !instruction.trim()) return;
    setSending(true);
    try {
      const surfaceRect = surfaceRef.current?.getBoundingClientRect();
      const viewport = {
        width: Math.round(surfaceRect?.width || containerRef.current?.getBoundingClientRect().width || window.innerWidth),
        height: Math.round(surfaceRect?.height || containerRef.current?.getBoundingClientRect().height || window.innerHeight),
        devicePixelRatio: typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1,
      };
      const previewTarget = customUrl ?? preferredUrl;
      const previewPath = (() => { try { return new URL(previewTarget).pathname || '/'; } catch { return '/'; } })();
      // v0.0.94 — EVERY mark is durable before the god turn. A closed panel,
      // a failed turn or a slow preview can no longer erase it.
      if (!quickEdit && activeProject?.slug) {
        try {
          await fetch('/api/olympus/marks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              slug: activeProject.slug,
              mark: {
                id: `mark-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                x: pendingMark.x, y: pendingMark.y, page: previewPath,
                instruction: instruction.trim(), viewport: { width: viewport.width, height: viewport.height },
                url: previewTarget, createdAt: new Date().toISOString(),
              },
            }),
          });
        } catch { /* the in-memory mark still goes to Athena */ }
      }
      if (quickEdit && !activeProject?.slug) {
        throw new Error('Quick edit needs an active project — open the mark from a project lane.');
      }
      const endpoint = quickEdit ? '/api/olympus/quick-edit' : '/api/olympus/athena/edit';
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(quickEdit ? {
          slug: activeProject?.slug,
          instruction: instruction.trim(),
          mark: { x: pendingMark.x, y: pendingMark.y },
          viewport,
          previewUrl: previewTarget,
          route: previewPath,
        } : {
          x: pendingMark.x,
          y: pendingMark.y,
          instruction: instruction.trim(),
          projectSlug: activeProject?.slug || null,
          viewport,
          previewUrl: previewTarget,
          route: previewPath,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.ok) throw new Error(data?.error || `HTTP ${response.status}`);
      if (quickEdit) {
        pushEvent({
          type: 'live_preview_mark',
          msg: `Quick edit applied: ${data.changedFiles?.length || 0} file(s), ${data.changedLines || 0} line(s) in ${Math.round((data.durationMs || 0) / 1000)}s`,
          x: pendingMark.x, y: pendingMark.y,
          project: activeProject?.slug || null,
          ts: new Date().toISOString(),
        });
        setLastQuickEdit({
          backupRoot: String(data.backupRoot || ''),
          files: (data.changedFiles?.length || 0) + (data.addedFiles?.length || 0),
          lines: Number(data.changedLines || 0),
        });
        reloadNow(null);
        toast.success('Quick edit applied', {
          description: `${data.message || 'The preview hot-reloads.'} Undo is in the backup: ${data.backupRoot || 'n/a'}`,
        });
      } else {
        pushEvent({
          type: 'live_preview_mark',
          msg: `Athena is planning the mark: "${instruction.trim().slice(0, 80)}" at (${pendingMark.x}, ${pendingMark.y}) in ${viewport.width}x${viewport.height}`,
          x: pendingMark.x, y: pendingMark.y,
          project: activeProject?.slug || null,
          ts: new Date().toISOString(),
        });
        // v0.0.90 — the mark lands in HER chat, in front of the user.
        window.dispatchEvent(new CustomEvent('olympus:open-god-chat', { detail: { god: 'athena' } }));
        toast.success('Mark sent to Athena', { description: 'She will plan it in her chat; approve to hand Apollo + Atlas the implementation.' });
      }
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
  };

  const sendToApollo = async () => {
    if (!pendingMark || !instruction.trim() || !activeProject?.slug) {
      toast.error('Open a project mark first — Apollo needs a project lane.');
      return;
    }
    setSending(true);
    try {
      const surfaceRect = surfaceRef.current?.getBoundingClientRect();
      const viewport = {
        width: Math.round(surfaceRect?.width || containerRef.current?.getBoundingClientRect().width || window.innerWidth),
        height: Math.round(surfaceRect?.height || containerRef.current?.getBoundingClientRect().height || window.innerHeight),
      };
      const previewTarget = customUrl ?? preferredUrl;
      const previewPath = (() => { try { return new URL(previewTarget).pathname || '/'; } catch { return '/'; } })();
      const mark = {
        id: `mark-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        x: pendingMark.x, y: pendingMark.y, page: previewPath,
        instruction: instruction.trim(), viewport,
        url: previewTarget, createdAt: new Date().toISOString(),
      };
      const saved = await fetch('/api/olympus/marks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: activeProject.slug, mark }),
      });
      if (!saved.ok) throw new Error(`could not save the mark (HTTP ${saved.status})`);
      const r = await fetch('/api/olympus/marks/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: activeProject.slug, target: 'apollo', marks: [mark], previewUrl: previewTarget }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d?.ok) throw new Error(d?.error || `HTTP ${r.status}`);
      pushEvent({
        type: 'live_preview_mark',
        msg: `Mark saved for Apollo (${d.inboxId || 'queued'}): "${instruction.trim().slice(0, 80)}"`,
        x: pendingMark.x, y: pendingMark.y,
        project: activeProject.slug,
        ts: new Date().toISOString(),
      });
      toast.success('Mark saved — Apollo is planning in the background', {
        description: 'Open the preview window to read the plan. The batch is durable even if you close this panel.',
      });
      setPendingMark(null);
      setInstruction('');
    } catch (err) {
      toast.error('Apollo did not receive the mark', { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setSending(false);
    }
  };

  const undoQuickEdit = useCallback(async () => {
    if (!lastQuickEdit?.backupRoot || !activeProject?.slug) return;
    setQuickUndoBusy(true);
    try {
      const r = await fetch('/api/olympus/quick-edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: activeProject.slug, undo: true, backupRoot: lastQuickEdit.backupRoot }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d?.ok) throw new Error(d?.error || `HTTP ${r.status}`);
      toast.success('Quick edit reverted', { description: `${d.restored?.length || 0} file(s) restored from the snapshot` });
      setLastQuickEdit(null);
      reloadNow(null);
    } catch (e: any) {
      toast.error('Quick edit undo failed', { description: e?.message || String(e) });
    } finally {
      setQuickUndoBusy(false);
    }
  }, [lastQuickEdit, activeProject]);

  // v0.0.30 — the manager is a second source of truth. The 20:12 specimen
  // showed "Code in progress" while the probe/manager were green; the panel
  // only trusted its own probe. Either green means the server is up.
  const isRunning = Boolean(status?.running || status?.manager?.running);
  // #102: the server-verified REACHABLE url once probing settles; the local
  // guess is only the pre-first-probe fallback.
  const effectiveUrl = preferredUrl;
  // #202: a user-pinned URL wins over the probe; the frame follows it even
  // when the default port is down (that is the whole point of the bar).
  const frameUrl = customUrl ?? effectiveUrl;
  // v0.0.99 — the surface loads the REAL origin (127.0.0.1 or the LAN host),
  // never the old loopback alias: cookies and localStorage belong to the
  // host, so the alias showed a logged-out mirror. Electron's <webview>
  // supplies the separate renderer the alias stood in for.
  const frameSrc = frameUrl;
  useEffect(() => { setIframeLoaded(false); setSurfaceError(null); }, [frameSrc]);
  const mixedContent = typeof window !== 'undefined'
    && window.location.protocol === 'https:'
    && frameSrc.startsWith('http://');
  // #103: the RESOLVED project path (note/lane reconciliation) for the tip —
  // the raw note path only as the pre-first-probe fallback.
  const resolvedPath = status?.path ?? activeProject?.path;
  const createShare = useCallback(async () => {
    if (!activeProject?.slug) { setShareError('Open a project first.'); return; }
    setShareBusy(true); setShareError(null);
    try {
      const r = await fetch('/api/olympus/preview/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project: activeProject.slug, ttlHours: 24 }),
      });
      const d = await r.json();
      if (!d?.ok) throw new Error(d?.error || `HTTP ${r.status}`);
      setShareUrl(d.url); setShareId(d.id); setShareExpires(d.expiresAt); setShareCopied(false); setDMode(d.mode ?? null);
    } catch (e: any) { setShareError(e?.message || String(e)); }
    finally { setShareBusy(false); }
  }, [activeProject]);

  const revokeShare = useCallback(async () => {
    if (!shareId) return;
    try {
      await fetch('/api/olympus/preview/share', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: shareId }),
      });
    } catch { /* the link expires anyway */ }
    setShareUrl(null); setShareId(null); setShareExpires(null); setShareCopied(false);
  }, [shareId]);

  const copyShare = useCallback(async () => {
    if (!shareUrl) return;
    try { await navigator.clipboard.writeText(shareUrl); setShareCopied(true); } catch { setShareError('Could not copy — select the link.'); }
  }, [shareUrl]);

  const showOverlay = Boolean(surfaceError) || (customUrl ? !iframeLoaded : (!isRunning || probing || !iframeLoaded));

  // v0.0.99 — the webview can finish loading BEFORE React attaches its
  // dom-ready listener (a fast local page), exactly like the preview window.
  // The load event is the fast path; this fallback guarantees the pane can
  // never sit on the branded loader forever.
  useEffect(() => {
    if (!(isRunning || customUrl) || surfaceError) return;
    const t = setTimeout(() => setIframeLoaded(true), 3000);
    return () => clearTimeout(t);
  }, [isRunning, customUrl, frameSrc, reloadKey, surfaceError]);

  // #202: hydrate the pinned URL for this project lane, and keep the draft
  // synced with the probe while the user is not editing it.
  useEffect(() => {
    let stored: string | null = null;
    try { stored = localStorage.getItem(urlStorageKey); } catch { /* storage unavailable */ }
    // v0.0.99 — a URL pinned by the previous release may carry the loopback
    // alias (which loses the session). Repoint it at the real host once.
    const cleaned = stored ? stored.replace(/\/\/(127\.0\.0\.2|localhost)(?=[:/])/i, '//127.0.0.1') : null;
    if (cleaned && stored && cleaned !== stored) {
      try { localStorage.setItem(urlStorageKey, cleaned); } catch { /* storage unavailable */ }
    }
    const pinned = cleaned && /^https?:\/\//i.test(cleaned) ? cleaned : null;
    setCustomUrl(pinned);
    setUrlError(null);
    setUrlDraft(pinned ?? previewUrl);
    setIframeLoaded(false);
  }, [urlStorageKey, previewUrl]);
  useEffect(() => {
    if (!urlFocusedRef.current) setUrlDraft(customUrl ?? effectiveUrl);
  }, [effectiveUrl, customUrl]);
  useEffect(() => {
    if (historyStack.length === 0) {
      setHistoryStack([effectiveUrl]);
      setHistoryIndex(0);
    }
  }, [effectiveUrl, historyStack.length]);

  const pushHistory = useCallback((url: string) => {
    setHistoryStack((prev) => {
      const base = prev.slice(0, historyIndex + 1);
      if (base[base.length - 1] !== url) base.push(url);
      setHistoryIndex(base.length - 1);
      return base;
    });
  }, [historyIndex]);

  const goHistory = useCallback((dir: -1 | 1) => {
    const next = historyIndex + dir;
    if (next < 0 || next >= historyStack.length) return;
    const url = historyStack[next];
    let probed: string | null = null;
    try { probed = new URL(effectiveUrl).toString(); } catch { /* malformed */ }
    setHistoryIndex(next);
    setUrlError(null);
    setIframeLoaded(false);
    reloadNow(null);
    setUrlDraft(url);
    if (url === probed) {
      setCustomUrl(null);
      try { localStorage.removeItem(urlStorageKey); } catch { /* storage unavailable */ }
    } else {
      setCustomUrl(url);
      try { localStorage.setItem(urlStorageKey, url); } catch { /* storage unavailable */ }
    }
  }, [historyIndex, historyStack, effectiveUrl, urlStorageKey]);

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
    reloadNow(null);
    pushHistory(result.url);
    if (result.url === probed) {
      setCustomUrl(null);
      try { localStorage.removeItem(urlStorageKey); } catch { /* storage unavailable */ }
    } else {
      setCustomUrl(result.url);
      try { localStorage.setItem(urlStorageKey, result.url); } catch { /* storage unavailable */ }
    }
  }, [urlDraft, effectiveUrl, urlStorageKey, pushHistory]);

  const resetUrl = useCallback(() => {
    setCustomUrl(null);
    setUrlError(null);
    setUrlDraft(effectiveUrl);
    setIframeLoaded(false);
    try { localStorage.removeItem(urlStorageKey); } catch { /* storage unavailable */ }
  }, [effectiveUrl, urlStorageKey]);

  return (
    <div className="w-full h-full flex flex-col bg-olympus-bg">
      <div className="min-h-9 shrink-0 flex flex-wrap items-center justify-between gap-x-2 gap-y-1 px-3 py-1 border-b border-olympus-gold/10 bg-olympus-panel">
        <div className="flex items-center gap-2 text-[11px] font-mono min-w-0">
          <Eye size={13} className="text-olympus-gold shrink-0" />
          <span className="text-olympus-gold font-semibold shrink-0">Live Preview</span>
          {activeProject && <span className="hidden md:inline text-olympus-text-dim truncate">· {activeProject.name}</span>}
          <span className="text-olympus-text-dim text-[10px]">:{port}</span>
          {isRunning && !probing && <span className="text-olympus-green text-[10px] flex items-center gap-0.5"><span className="w-1.5 h-1.5 rounded-full bg-olympus-green animate-pulse" /> live</span>}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="hidden sm:flex items-center gap-0.5 rounded border border-olympus-gold/10 p-0.5" role="group" aria-label="Preview viewport">
            {([
              ['fit', Monitor, 'Desktop width'],
              ['tablet', Tablet, 'Tablet width'],
              ['phone', Smartphone, 'Phone width'],
            ] as const).map(([id, Icon, label]) => (
              <button
                key={id}
                onClick={() => setDevice(id)}
                aria-pressed={device === id}
                aria-label={label}
                data-tip={label}
                className={cn('p-1 rounded transition-colors', device === id ? 'bg-olympus-gold/20 text-olympus-gold' : 'text-olympus-text-dim hover:text-olympus-gold')}
              >
                <Icon size={11} />
              </button>
            ))}
          </div>
          <OlympusTooltip content={fullscreen ? 'Leave fullscreen' : 'Fullscreen preview'} side="bottom">
            <button
              onClick={() => {
                if (typeof document === 'undefined') return;
                if (document.fullscreenElement) void document.exitFullscreen?.();
                else void containerRef.current?.requestFullscreen?.();
              }}
              aria-label={fullscreen ? 'Leave fullscreen' : 'Fullscreen preview'}
              className="p-1 rounded text-olympus-text-dim hover:text-olympus-gold transition-colors"
            >
              {fullscreen ? <Minimize2 size={11} /> : <Maximize2 size={11} />}
            </button>
          </OlympusTooltip>
          {/* #100 (v0.0.6): THE DURABLE HOST CONTROLS — the #86 manager is
              the host (probe-verified truth, deps-first spawn, patience
              windows). Start when nothing runs; stop when the manager owns
              the server (an unmanaged ephemeral server stops with its
              owner — the button honestly hides). */}
          <DevServerControls status={status} onDone={() => { reloadNow(null); probe(); }} />
          <OlympusTooltip content="Mark an element for editing" side="bottom">
            <button onClick={() => setMarkMode(!markMode)} className={cn('flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono transition-all', markMode ? 'bg-olympus-gold/20 text-olympus-gold ring-1 ring-olympus-gold/40' : 'text-olympus-text-dim hover:text-olympus-gold hover:bg-olympus-gold/10')}>
              <MousePointerClick size={11} /> {markMode ? 'click preview…' : 'Mark'}
            </button>
          </OlympusTooltip>
          <div className="relative">
            <OlympusTooltip content="Share this preview (scoped, expiring link)" side="bottom">
              <button
                onClick={() => setShareOpen((v) => !v)}
                aria-expanded={shareOpen}
                className={cn('flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono transition-all', shareOpen ? 'bg-olympus-cyan/20 text-olympus-cyan ring-1 ring-olympus-cyan/40' : 'text-olympus-text-dim hover:text-olympus-cyan hover:bg-olympus-cyan/10')}
              >
                <Share2 size={11} /> Share
              </button>
            </OlympusTooltip>
            {shareOpen && (
              <div className="absolute right-0 top-full z-30 mt-1 w-[320px] rounded-lg border border-olympus-cyan/30 bg-olympus-panel p-2.5 shadow-2xl">
                <div className="mb-1.5 flex items-center gap-1.5">
                  <Share2 size={11} className="text-olympus-cyan" />
                  <span className="text-[10px] font-mono font-semibold text-olympus-cyan">Share preview</span>
                  <button onClick={() => setShareOpen(false)} aria-label="Close share" className="ml-auto text-olympus-text-dim hover:text-olympus-text"><X size={11} /></button>
                </div>
                {!shareUrl && (
                  <>
                    <p className="mb-2 text-[9px] font-mono leading-relaxed text-olympus-text-dim">
                      A READ-ONLY live view of THIS preview through an unguessable tunnel. Expires in 24h, revocable — it never carries your OLYMPUS session or vault. Interactive login/forms stay inside OLYMPUS.
                    </p>
                    <button
                      onClick={() => void createShare()}
                      disabled={shareBusy || !isRunning}
                      className="w-full rounded bg-olympus-cyan/15 px-2 py-1.5 text-[10px] font-mono text-olympus-cyan ring-1 ring-olympus-cyan/30 disabled:opacity-40"
                    >
                      {shareBusy ? 'creating…' : isRunning ? 'create link' : 'start the preview first'}
                    </button>
                  </>
                )}
                {shareUrl && (
                  <>
                    <div className="mb-1.5 flex items-center gap-1 rounded border border-olympus-gold/20 bg-olympus-bg px-1.5 py-1">
                      <span className="min-w-0 flex-1 truncate text-[9px] font-mono text-olympus-text" data-tip={shareUrl}>{shareUrl}</span>
                      <button onClick={() => void copyShare()} aria-label="Copy link" className="shrink-0 text-olympus-gold hover:text-olympus-gold/80"><Copy size={10} /></button>
                    </div>
                    <div className="mb-1.5 flex items-center gap-1.5">
                      <a href={`https://wa.me/?text=${encodeURIComponent(`OLYMPUS preview: ${shareUrl}`)}`} target="_blank" rel="noreferrer" className="flex-1 rounded bg-olympus-green/10 px-1.5 py-1 text-center text-[9px] font-mono text-olympus-green ring-1 ring-olympus-green/25">WhatsApp</a>
                      <a href={`https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent('OLYMPUS preview')}`} target="_blank" rel="noreferrer" className="flex-1 rounded bg-olympus-cyan/10 px-1.5 py-1 text-center text-[9px] font-mono text-olympus-cyan ring-1 ring-olympus-cyan/25">Telegram</a>
                      <button onClick={() => void revokeShare()} className="rounded bg-olympus-red/10 px-1.5 py-1 text-[9px] font-mono text-olympus-red ring-1 ring-olympus-red/25">revoke</button>
                    </div>
                    <p className="text-[8px] font-mono text-olympus-text-dim">
                      {shareCopied ? 'copied ✓ · ' : ''}{dMode === 'live-tunnel' ? 'live view · ' : 'proxy fallback · '}expires {shareExpires ? new Date(shareExpires).toLocaleString() : '—'}
                    </p>
                  </>
                )}
                {shareError && <p className="mt-1 text-[9px] font-mono text-olympus-red">{shareError}</p>}
              </div>
            )}
          </div>
          <OlympusTooltip content="Refresh probe" side="bottom">
            <button onClick={() => { reloadNow(null); probe(); }} className="text-olympus-text-dim hover:text-olympus-gold transition-colors p-1"><RefreshCw size={11} /></button>
          </OlympusTooltip>
          <OlympusTooltip content="Open the preview in its own desktop window (OLYMPUS loader until the project is ready)" side="bottom">
            <button
              onClick={() => {
                if (!activeProject?.slug) return;
                const w = Math.min(1600, Math.max(900, Math.round(window.screen?.availWidth || 1280)));
                const h = Math.min(1000, Math.max(600, Math.round(window.screen?.availHeight || 900)));
                window.open(
                  `/preview-window?slug=${encodeURIComponent(activeProject.slug)}`,
                  `olympus-preview-${activeProject.slug}`,
                  `width=${w},height=${h},menubar=no,toolbar=no,location=no,status=no`,
                );
              }}
              disabled={!activeProject?.slug}
              className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono text-olympus-text-dim hover:text-olympus-cyan hover:bg-olympus-cyan/10 disabled:opacity-30"
              data-tip="A real OS window — Alt+Tab friendly"
            >
              <MonitorUp size={11} /> window
            </button>
          </OlympusTooltip>
          <a href={frameUrl} target="_blank" rel="noopener noreferrer" className="text-olympus-gold hover:text-olympus-gold/80 text-[10px] font-mono px-1.5">open ↗</a>
        </div>
      </div>

      {/* #202: editable URL bar — Enter navigates the frame, invalid URLs are
          refused inline (never a silent fallback), the pin persists per
          project lane, and "reset" returns to the probed origin. */}
      <div className="shrink-0 border-b border-olympus-gold/10 bg-olympus-bg/60 px-3 py-1">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-0.5 shrink-0">
            <button
              onClick={() => goHistory(-1)}
              disabled={historyIndex <= 0}
              aria-label="Back"
              data-tip="Back"
              className="p-1 rounded text-olympus-text-dim hover:text-olympus-gold hover:bg-olympus-gold/10 disabled:opacity-30 disabled:hover:bg-transparent"
            ><ChevronLeft size={12} /></button>
            <button
              onClick={() => goHistory(1)}
              disabled={historyIndex >= historyStack.length - 1}
              aria-label="Forward"
              data-tip="Forward"
              className="p-1 rounded text-olympus-text-dim hover:text-olympus-gold hover:bg-olympus-gold/10 disabled:opacity-30 disabled:hover:bg-transparent"
            ><ChevronRight size={12} /></button>
            <button
              onClick={() => reloadNow(null)}
              aria-label="Reload preview"
              data-tip="Reload"
              className="p-1 rounded text-olympus-text-dim hover:text-olympus-gold hover:bg-olympus-gold/10"
            ><RefreshCw size={11} /></button>
          </div>
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
            <span className="text-olympus-gold flex items-center gap-1.5"><MousePointerClick size={11} />Marked ({pendingMark.x}, {pendingMark.y}) — describe the change for Athena or Apollo:</span>
            <span className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setQuickEdit(v => !v)}
                aria-pressed={quickEdit}
                data-tip="Quick edit: patch directly (≤3 files / 200 lines), typecheck + lint, undo available. Off = Athena plans a hop first."
                className={cn(
                  'flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-mono ring-1 transition-colors',
                  quickEdit
                    ? 'bg-olympus-cyan/15 text-olympus-cyan ring-olympus-cyan/35'
                    : 'text-olympus-text-dim ring-olympus-gold/15 hover:text-olympus-cyan',
                )}
              >
                <Zap size={9} /> quick
              </button>
              <button onClick={() => { setPendingMark(null); setInstruction(''); }} className="text-olympus-text-dim hover:text-olympus-text px-1.5">cancel</button>
            </span>
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
              Athena
            </button>
            <button
              onClick={sendToApollo}
              disabled={sending || !instruction.trim()}
              className="flex items-center gap-1 px-2 py-1 rounded bg-olympus-green/15 text-olympus-green hover:bg-olympus-green/25 ring-1 ring-olympus-green/30 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {sending ? <Loader2 size={10} className="animate-spin" /> : <Send size={10} />}
              Apollo
            </button>
          </div>
        </div>
      )}

      {lastQuickEdit && !pendingMark && (
        <div className="shrink-0 flex items-center gap-2 px-3 py-1.5 bg-olympus-cyan/10 border-b border-olympus-cyan/20 text-[9px] font-mono">
          <Zap size={10} className="text-olympus-cyan shrink-0" />
          <span className="text-olympus-cyan whitespace-nowrap">quick edit · {lastQuickEdit.files} file(s) · {lastQuickEdit.lines} line(s)</span>
          <span className="ml-auto flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => void undoQuickEdit()}
              disabled={quickUndoBusy || !lastQuickEdit.backupRoot}
              className="rounded border border-olympus-cyan/30 px-1.5 py-0.5 text-olympus-cyan hover:bg-olympus-cyan/15 disabled:opacity-40"
            >
              {quickUndoBusy ? 'undoing…' : 'undo'}
            </button>
            <button type="button" onClick={() => setLastQuickEdit(null)} className="text-olympus-text-dim hover:text-olympus-text">dismiss</button>
          </span>
        </div>
      )}

      {mixedContent && (
        <div className="shrink-0 px-3 py-1.5 border-b border-olympus-amber-soft/25 bg-olympus-amber-soft/10 text-[9px] font-mono text-olympus-amber-soft leading-relaxed">
          This shell is HTTPS, so the browser blocks an HTTP preview. Open the phone preview (it uses its own HTTPS tunnel) or start the project preview tunnel.
        </div>
      )}

      <div
        ref={containerRef}
        className="flex-1 min-h-0 relative flex justify-center overflow-hidden"
        onPointerDownCapture={noteInteraction}
        onKeyDownCapture={noteInteraction}
        onWheelCapture={noteInteraction}
      >
        <div
          ref={surfaceRef}
          className={cn('relative h-full', device === 'fit' ? 'w-full' : 'shrink-0 border-x border-olympus-gold/10 shadow-xl')}
          style={device === 'fit' ? undefined : { width: device === 'phone' ? '390px' : '834px', maxWidth: '100%' }}
        >
          {(isRunning || customUrl) && (
            <PreviewSurface
              src={frameSrc}
              title="Live Preview"
              reloadKey={reloadKey}
              onLoad={() => { setIframeLoaded(true); setSurfaceError(null); }}
              onFail={(message) => { setSurfaceError(message); setIframeLoaded(false); }}
            />
          )}
          {showOverlay && (
            <div className={cn(
              'absolute inset-0 flex flex-col items-center justify-center px-4 text-center',
              // v0.0.99 — the app is visible and interactive BEHIND the
              // loader (a display:none surface could defer its load event
              // forever and read as a static mirror).
              !surfaceError && (customUrl || isRunning) ? 'bg-olympus-bg/85 pointer-events-none' : 'bg-olympus-bg',
            )}>
              <div className="relative w-24 h-24 mb-6">
                <div className="absolute inset-0 rounded-full border-2 border-olympus-gold/20 animate-ping" style={{ animationDuration: '2s' }} />
                <div className="absolute inset-2 rounded-full border-2 border-olympus-gold/30 animate-ping" style={{ animationDuration: '2.5s', animationDelay: '0.3s' }} />
                <div className="absolute inset-4 rounded-full border-2 border-olympus-gold/40 animate-ping" style={{ animationDuration: '3s', animationDelay: '0.6s' }} />
                <div className="absolute inset-0 flex items-center justify-center">{probing ? <Loader2 size={28} className="text-olympus-gold animate-spin" /> : <EyeOff size={28} className="text-olympus-gold/60" />}</div>
              </div>
              <h3 className="text-sm font-mono font-semibold text-olympus-gold mb-2">{surfaceError ? 'Preview failed to load' : customUrl ? 'Loading pinned URL…' : probing ? 'Probing dev server…' : 'Code in progress…'}</h3>
              {surfaceError ? (
                <>
                  <p className="text-[10px] font-mono text-olympus-red text-center max-w-xs leading-relaxed mb-3 break-words">{surfaceError}</p>
                  <button onClick={() => reloadNow(null)} className="rounded-lg border border-olympus-gold/30 bg-olympus-gold/10 px-3 py-1.5 text-[10px] font-mono text-olympus-gold">retry</button>
                </>
              ) : (
                <>
                  <p className="text-[11px] font-mono text-olympus-text-dim text-center max-w-xs leading-relaxed mb-4">
                    {customUrl
                      ? `Pinned to ${frameUrl} — the dev-server probe is bypassed.`
                      : activeProject ? `Waiting for ${activeProject.name}'s dev server at :${port}. Start it with \`npm run dev\` in the project folder.` : `No active project. Select one from the Project Switcher, or the preview defaults to :${port}.`}
                  </p>
                  {!customUrl && !probing && !isRunning && (
                    <div className="text-[10px] font-mono text-olympus-text-dim bg-olympus-card px-3 py-1.5 rounded-md border border-olympus-gold/10">
                      <span className="text-olympus-gold">tip:</span> run <code className="text-olympus-green">cd "{resolvedPath ?? '<project>'}" && npm run dev</code>
                    </div>
                  )}
                  {!customUrl && !probing && !isRunning && status?.pathSource === 'note-stale' && (
                    <p className="text-[10px] font-mono text-olympus-text-dim">note path is stale — the project lives at {status?.path}</p>
                  )}
                  {!iframeLoaded && !probing && (customUrl || isRunning) && <p className="text-[10px] font-mono text-olympus-text-dim">{customUrl ? 'Pinned URL' : 'Dev server is up'} — loading preview…</p>}
                </>
              )}
            </div>
          )}
          {markMode && <div className="absolute top-2 left-1/2 -translate-x-1/2 z-30 px-3 py-1 rounded-full bg-olympus-gold/20 text-olympus-gold text-[10px] font-mono ring-1 ring-olympus-gold/30 pointer-events-none whitespace-nowrap">{device === 'fit' ? 'Click anywhere on the preview to mark for editing' : `Tap the ${device} preview to mark`}</div>}
          {/* v0.0.68 — THE MARK OVERLAY. Clicks inside a cross-origin surface
              never bubble to the parent, so a transparent overlay above it
              captures the click and the coordinates. It exists ONLY in mark
              mode; everywhere else the app is fully interactive. */}
          {markMode && (
            <div className="absolute inset-0 z-20 cursor-crosshair" onClick={handleContainerClick} aria-label="Mark the preview for editing" role="button" />
          )}
        </div>
      </div>

      <div className="h-6 shrink-0 flex items-center justify-between gap-2 px-3 border-t border-olympus-gold/10 bg-olympus-panel text-[9px] font-mono text-olympus-text-dim overflow-hidden">
        <span className="truncate">
          {customUrl
            ? `custom · ${frameUrl}`
            : isRunning ? `:${port} · ${status?.responseTimeMs ?? 0}ms` : `:${port} · offline`}
          {status?.manager?.running ? ' · durable host' : ''}
          {device !== 'fit' ? ` · ${device}` : ''}
        </span>
        <span className="flex items-center gap-2 shrink-0">
          {partReady
            ? <button onClick={() => reloadNow(null)} className="text-olympus-cyan hover:text-olympus-gold transition-colors">part {partReady} ready · refresh</button>
            : lastPart ? <span className="text-olympus-green">part {lastPart} ✓</span> : null}
          <button
            onClick={() => setAutoFollow((v) => !v)}
            aria-pressed={autoFollow}
            data-tip="Offer the new part after a hop; never reload while you are interacting"
            className={cn('hover:text-olympus-gold transition-colors', autoFollow ? 'text-olympus-cyan' : 'text-olympus-text-dim')}
          >
            {autoFollow ? 'auto-follow parts' : 'manual refresh'}
          </button>
          <span className="hidden sm:inline text-olympus-text-dim">· interactive</span>
        </span>
      </div>
    </div>
  );
}

/* #100 (v0.0.6): the durable host controls — the #86 manager IS the host.
 * START when nothing runs (the manager installs deps first, probes after,
 * answers honest); STOP only when the manager owns the running server (an
 * unmanaged ephemeral server stops with its owner — no fake control). */
function DevServerControls({ status, onDone }: { status: ProbeStatus | null; onDone: () => void }) {
  const [busy, setBusy] = useState<null | 'start' | 'stop' | 'restart'>(null);
  const [error, setError] = useState<string | null>(null);
  const managed = status?.manager?.running === true;
  const anythingRunning = status?.running === true;

  const call = async (action: 'start' | 'stop' | 'restart') => {
    setBusy(action);
    setError(null);
    try {
      const post = (path: string) => fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ port: status?.port }),
      }).then((r) => r.json());
      if (action === 'restart') {
        const stopped = await post('/api/olympus/dev-server/stop');
        if (!stopped?.ok) throw new Error(stopped?.error || stopped?.result?.error || 'stop failed');
        const started = await post('/api/olympus/dev-server/start');
        if (!started?.ok) throw new Error(started?.error || started?.result?.error || 'start failed');
      } else {
        const r = await post(action === 'start' ? '/api/olympus/dev-server/start' : '/api/olympus/dev-server/stop');
        if (!r?.ok) throw new Error(r?.error || r?.result?.error || `${action} failed`);
      }
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setBusy(null);
      // The poll picks up the new state; nudge it now for snappiness.
      onDone();
    }
  };

  if (busy === 'start' || busy === 'stop' || busy === 'restart') {
    return (
      <span className="flex items-center gap-1 text-[9px] font-mono text-olympus-text-dim">
        <Loader2 size={10} className="animate-spin" />
        {busy === 'start' ? 'starting (deps + boot + probe)…' : busy === 'restart' ? 'restarting preview…' : 'stopping…'}
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
    const rss = status?.manager?.rssMB;
    const heavy = typeof rss === 'number' && rss > 2400;
    return (
      <span className="flex items-center gap-1">
        {typeof rss === 'number' && (
          <span className={heavy ? 'text-[9px] font-mono text-olympus-amber-soft' : 'text-[9px] font-mono text-olympus-text-dim'} data-tip={`Dev server RSS ${rss} MB`}>
            {rss > 1024 ? `${(rss / 1024).toFixed(1)}G` : `${Math.round(rss)}M`}
          </span>
        )}
        <button
          onClick={() => call('restart')}
          data-tip={heavy ? `Preview is heavy (${rss} MB) — restart to free memory and rebuild` : 'Restart the preview server (stop → deps/boot → probe)'}
          className={heavy ? 'text-[10px] font-mono text-olympus-amber-soft hover:text-olympus-gold px-1.5' : 'text-[10px] font-mono text-olympus-text-dim hover:text-olympus-gold px-1.5'}
        >
          restart
        </button>
        <button
          onClick={() => call('stop')}
          data-tip={`Stop the durable dev server (${status?.manager?.note ?? 'the #86 manager'})`}
          className="text-[10px] font-mono text-olympus-text-dim hover:text-olympus-red transition-colors px-1.5"
        >
          stop
        </button>
      </span>
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
