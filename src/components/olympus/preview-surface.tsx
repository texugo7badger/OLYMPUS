'use client';

/**
 * preview-surface.tsx — v0.0.99: one preview surface, two runtimes.
 *
 * WHY: the old embedded preview used a 127.0.0.2 iframe to force Chromium to
 * give it its own renderer (OOPIF). That bought FPS and cost the SESSION:
 * cookies are scoped to the HOST, not the port, so an app logged in on
 * 127.0.0.1:3038 arrived at 127.0.0.2:3038 logged out — a static mirror the
 * user could not click through.
 *
 * Electron now uses a <webview>: its own process (the same isolation win) AND
 * the default session, so 127.0.0.1 cookies/localStorage are shared with the
 * shell. Browsers keep a plain iframe on the real origin (cookies are shared
 * by host across ports), which is fully interactive.
 *
 * The caller owns the wrapper and the mark overlay; this component only owns
 * the surface and its load/fail events.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { createElement, useEffect, useRef, useState } from 'react';
import { inElectron } from '@/lib/preview-isolation';

export interface PreviewSurfaceProps {
  src: string;
  title: string;
  /** Bump to reload the surface without losing the host page. */
  reloadKey?: number;
  className?: string;
  /** Hidden while the branded loader owns the pane. */
  hidden?: boolean;
  /**
   * v0.1.0 — a popup created by `window.open` does not inherit `webviewTag`;
   * a <webview> inside it renders black. The dedicated preview window opts
   * into the browser iframe (same host cookies, interactive, no black).
   */
  forceBrowser?: boolean;
  onLoad?: () => void;
  onFail?: (message: string) => void;
}

export default function PreviewSurface({
  src,
  title,
  reloadKey = 0,
  className = 'w-full h-full border-0',
  hidden = false,
  forceBrowser = false,
  onLoad,
  onFail,
}: PreviewSurfaceProps) {
  const electron = !forceBrowser && inElectron();
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [browserKey, setBrowserKey] = useState(0);
  const firstReload = useRef(true);
  const onLoadRef = useRef(onLoad);
  const onFailRef = useRef(onFail);

  useEffect(() => { onLoadRef.current = onLoad; }, [onLoad]);
  useEffect(() => { onFailRef.current = onFail; }, [onFail]);

  // Electron: a <webview> is a real guest process. It shares the default
  // session (cookies, localStorage) with the shell because it loads the SAME
  // 127.0.0.1 origin the user logged into.
  useEffect(() => {
    if (!electron) return;
    const el = wrapperRef.current?.querySelector('webview') as any;
    if (!el) return;
    const ready = () => onLoadRef.current?.();
    const fail = (event: any) => {
      // -3 is ERR_ABORTED (a navigation superseded by another one) — not a
      // failure the user should see.
      if (Number(event?.errorCode) === -3 || Number(event?.errorCode) === 0) return;
      const detail = event?.errorDescription ? String(event.errorDescription) : 'the preview did not load';
      onFailRef.current?.(detail);
    };
    el.addEventListener('dom-ready', ready);
    el.addEventListener('did-stop-loading', ready);
    el.addEventListener('did-fail-load', fail);
    return () => {
      try {
        el.removeEventListener('dom-ready', ready);
        el.removeEventListener('did-stop-loading', ready);
        el.removeEventListener('did-fail-load', fail);
      } catch { /* guest already gone */ }
    };
  }, [electron]);

  // Reload without remounting the host page. The first effect pass is the
  // initial load, not a reload request.
  useEffect(() => {
    if (firstReload.current) { firstReload.current = false; return; }
    if (!electron) { setBrowserKey((k) => k + 1); return; }
    const el = wrapperRef.current?.querySelector('webview') as any;
    if (!el) return;
    try { el.reload(); } catch { try { el.src = src; } catch { /* guest gone */ } }
  }, [reloadKey]);

  // A new URL means a fresh load. In the browser the iframe key includes the
  // URL, so React never reuses a stale document; Electron navigates the
  // existing guest through the src attribute.

  if (electron) {
    return (
      <div ref={wrapperRef} className={className} style={hidden ? { display: 'none' } : undefined}>
        {createElement('webview', {
          src,
          title,
          className: 'w-full h-full border-0',
          // Links may open a real window; the main process routes non-app
          // origins to the user's browser.
          allowpopups: 'true',
          webpreferences: 'contextIsolation=yes, sandbox=yes',
          style: { border: 'none' },
        })}
      </div>
    );
  }

  return (
    <iframe
      key={`${src}-${browserKey}`}
      src={src}
      title={title}
      className={className}
      sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads allow-modals allow-presentation"
      allow="clipboard-read; clipboard-write; fullscreen; encrypted-media; picture-in-picture; autoplay"
      onLoad={() => onLoadRef.current?.()}
      style={hidden ? { display: 'none' } : undefined}
    />
  );
}
