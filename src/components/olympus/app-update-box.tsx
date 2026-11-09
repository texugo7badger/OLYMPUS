'use client';

/**
 * app-update-box.tsx — v0.0.92: the startup update box.
 *
 * THE SPECIMEN: electron-updater was initialized in the main process, the
 * events (`olympus:update-available`, progress, downloaded, error) were sent
 * to the renderer — and nothing listened. The user asked for the box on
 * startup and never saw it.
 *
 * This component closes the loop:
 *   - subscribes to the main-process events;
 *   - also checks /api/olympus/version (the dev/source fallback) so the box
 *     appears even when Electron's updater is unavailable;
 *   - offers Update now / Later / Release notes, progress and restart;
 *   - persists the preference: check on startup (default ON) and download
 *     automatically (default OFF).
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, ExternalLink, RefreshCw, Sparkles, X } from 'lucide-react';
import {
  DEFAULT_UPDATE_PREFS,
  UPDATE_PREFS_KEY,
  isNewerVersion,
  readUpdatePrefs,
  releaseUrl,
  writeUpdatePrefs,
  type UpdatePrefs,
} from '@/lib/app-update';

type Stage = 'idle' | 'available' | 'downloading' | 'downloaded' | 'error';

interface ElectronUpdateInfo {
  version?: string;
  releaseDate?: string;
  releaseNotes?: unknown;
}

function plainNotes(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 400);
  if (Array.isArray(value)) {
    const text = value.map((v) => (typeof v === 'string' ? v : v?.note ?? '')).filter(Boolean).join(' ');
    return text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 400) || null;
  }
  return null;
}

export default function AppUpdateBox() {
  const [stage, setStage] = useState<Stage>('idle');
  const [latest, setLatest] = useState<string | null>(null);
  const [current, setCurrent] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    return String((window as any).__OLYMPUS_VERSION__ ?? '');
  });
  const [notes, setNotes] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<UpdatePrefs>(DEFAULT_UPDATE_PREFS);
  const [busy, setBusy] = useState(false);
  const seen = useRef<string | null>(null);

  const showAvailable = useCallback((version: string | null, releaseNotes?: unknown) => {
    if (!version) return;
    if (seen.current === version) return;
    seen.current = version;
    setLatest(version);
    setNotes(plainNotes(releaseNotes));
    setStage((prev) => (prev === 'downloading' || prev === 'downloaded' ? prev : 'available'));
  }, []);

  const download = useCallback(async () => {
    setBusy(true);
    setMessage(null);
    try {
      const api = (window as any).olympus;
      if (api?.autoUpdate) {
        // Packaged: electron-updater downloads the AppImage. Dev: it returns
        // ok:false (no app-update.yml), and we fall through to the release
        // page instead of pretending the download started.
        const r = await api.autoUpdate.downloadUpdate();
        if (r?.ok) {
          setStage('downloading');
          return;
        }
      }
      const url = releaseUrl(latest);
      window.open(url, '_blank', 'noopener,noreferrer');
      setMessage('Opened the release page — download the Linux asset for your install.');
    } catch (e: any) {
      setStage('error');
      setMessage(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }, [latest]);

  const install = useCallback(async () => {
    setBusy(true);
    try {
      const api = (window as any).olympus;
      if (api?.autoUpdate) {
        const r = await api.autoUpdate.quitAndInstall();
        if (!r?.ok) throw new Error(r?.error || 'install refused');
      }
    } catch (e: any) {
      setStage('error');
      setMessage(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }, []);

  const updatePref = useCallback((key: keyof UpdatePrefs, value: boolean) => {
    setPrefs((prev) => {
      const next = { ...prev, [key]: value };
      try { localStorage.setItem(UPDATE_PREFS_KEY, writeUpdatePrefs(next)); } catch { /* private mode */ }
      return next;
    });
  }, []);

  useEffect(() => {
    let alive = true;
    let stored: UpdatePrefs = { ...DEFAULT_UPDATE_PREFS };
    try {
      stored = readUpdatePrefs(JSON.parse(localStorage.getItem(UPDATE_PREFS_KEY) || 'null'));
    } catch { /* default */ }
    setPrefs(stored);

    const api = (window as any).olympus;

    // Packaged build: learn whether electron-updater can actually download.
    if (api?.autoUpdate?.getVersionInfo) {
      void api.autoUpdate.getVersionInfo().then((info: any) => {
        if (!alive) return;
        if (info?.version) setCurrent(String(info.version));
      }).catch(() => { /* browser */ });
    }

    const onAvailable = (info: ElectronUpdateInfo) => {
      if (!alive) return;
      showAvailable(info?.version ?? null, info?.releaseNotes);
      if (stored.autoDownload && api?.autoUpdate) void download();
    };
    const onProgress = (p: { percent?: number }) => {
      if (!alive) return;
      setProgress(Math.max(0, Math.min(100, Number(p?.percent ?? 0))));
      setStage('downloading');
    };
    const onDownloaded = (info: { version?: string }) => {
      if (!alive) return;
      if (info?.version) setLatest(String(info.version));
      setProgress(100);
      setStage('downloaded');
    };
    const onError = (e: { message?: string }) => {
      if (!alive) return;
      setStage('error');
      setMessage(e?.message || 'update failed');
    };
    const onNone = () => { /* the box stays hidden */ };

    if (api?.on) {
      api.on('olympus:update-available', onAvailable);
      api.on('olympus:update-download-progress', onProgress);
      api.on('olympus:update-downloaded', onDownloaded);
      api.on('olympus:update-error', onError);
      api.on('olympus:update-not-available', onNone);
    }

    // The main process checks 5s after launch; the source/dev fallback checks
    // the stable manifest immediately so the box can appear during loading.
    if (stored.checkOnStartup) {
      void fetch('/api/olympus/version', { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (!alive || !d?.ok) return;
          const cur = String(d.current ?? '');
          if (cur && !current) setCurrent(cur);
          const stable = d.stable;
          if (stable?.version && isNewerVersion(String(stable.version), cur || current)) {
            showAvailable(String(stable.version), stable.note);
          }
        })
        .catch(() => { /* offline: the main process event remains */ });
    }

    return () => {
      alive = false;
      if (api?.off) {
        for (const ch of ['olympus:update-available', 'olympus:update-download-progress', 'olympus:update-downloaded', 'olympus:update-error', 'olympus:update-not-available']) {
          try { api.off(ch); } catch { /* best effort */ }
        }
      }
    };
    // The subscription is intentionally once per mount; prefs are read above.
  }, []);

  if (stage === 'idle' || !latest) return null;

  const notesText = notes;
  const progressPct = Math.round(progress);

  return (
    <div
      role="dialog"
      aria-label="OLYMPUS update available"
      className="olympus-rise fixed bottom-3 right-3 z-[320] w-[min(92vw,380px)] overflow-hidden rounded-xl border border-olympus-gold/35 bg-olympus-panel shadow-2xl"
    >
      <div className="flex items-center gap-2 border-b border-olympus-gold/20 bg-olympus-gold/5 px-3 py-2">
        <Sparkles size={13} className="text-olympus-gold" />
        <span className="text-[11px] font-mono font-semibold uppercase tracking-wide text-olympus-gold">OLYMPUS update</span>
        <span className="ml-auto text-[9px] font-mono text-olympus-text-dim">v{latest}</span>
        <button
          type="button"
          onClick={() => setStage('idle')}
          aria-label="Dismiss the update for this session"
          data-tip="Later — this session only"
          className="p-0.5 text-olympus-text-dim hover:text-olympus-text"
        >
          <X size={12} />
        </button>
      </div>

      <div className="px-3 py-2.5">
        <p className="text-[11px] font-mono text-olympus-text">
          You are on <span className="text-olympus-text-dim">v{current || '—'}</span>. <span className="text-olympus-gold">v{latest}</span> is available.
        </p>
        {notesText && <p className="mt-1 line-clamp-3 text-[9px] leading-relaxed font-mono text-olympus-text-dim">{notesText}</p>}

        {stage === 'downloading' && (
          <div className="mt-2">
            <div className="h-1.5 overflow-hidden rounded bg-olympus-text-dim/15">
              <div className="h-full origin-left bg-olympus-gold transition-transform duration-200" style={{ transform: `scaleX(${progressPct / 100})` }} />
            </div>
            <p className="mt-1 text-[8px] font-mono text-olympus-text-dim">downloading {progressPct}%</p>
          </div>
        )}

        {message && (
          <p className={`mt-2 text-[9px] font-mono ${stage === 'error' ? 'text-olympus-red' : 'text-olympus-cyan'}`}>{message}</p>
        )}

        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {stage === 'downloaded' ? (
            <button
              type="button"
              onClick={() => void install()}
              disabled={busy}
              className="inline-flex min-h-[28px] items-center gap-1 rounded-md border border-olympus-green/40 bg-olympus-green/15 px-2.5 text-[9px] font-mono font-semibold text-olympus-green hover:bg-olympus-green/25 disabled:opacity-40"
            >
              <RefreshCw size={10} /> Restart and install
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void download()}
              disabled={busy || stage === 'downloading'}
              className="inline-flex min-h-[28px] items-center gap-1 rounded-md border border-olympus-gold/40 bg-olympus-gold/15 px-2.5 text-[9px] font-mono font-semibold text-olympus-gold hover:bg-olympus-gold/25 disabled:opacity-40"
            >
              <Download size={10} /> {stage === 'downloading' ? 'Downloading…' : 'Update now'}
            </button>
          )}
          <a
            href={releaseUrl(latest)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-[28px] items-center gap-1 rounded-md border border-olympus-gold/20 px-2 text-[9px] font-mono text-olympus-text-dim hover:text-olympus-gold"
          >
            <ExternalLink size={9} /> notes
          </a>
          <button
            type="button"
            onClick={() => setStage('idle')}
            className="ml-auto px-1 text-[9px] font-mono text-olympus-text-dim hover:text-olympus-text"
          >
            later
          </button>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-olympus-gold/10 pt-2 text-[8px] font-mono text-olympus-text-dim">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={prefs.checkOnStartup}
              onChange={(e) => updatePref('checkOnStartup', e.target.checked)}
              className="h-3 w-3 accent-[var(--olympus-gold,#D4A574)]"
            />
            check on startup
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={prefs.autoDownload}
              onChange={(e) => updatePref('autoDownload', e.target.checked)}
              className="h-3 w-3 accent-[var(--olympus-gold,#D4A574)]"
            />
            download automatically
          </label>
        </div>
      </div>
    </div>
  );
}
