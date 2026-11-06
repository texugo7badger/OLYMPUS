'use client';

/**
 * CompanionCaptures — v0.0.85: the live app in the user's hands.
 *
 * Captures the project's own preview in a phone viewport and a desktop
 * viewport, then shows both. The user can type a critique right under the
 * image; it goes to Apollo in the terminal with the viewport named.
 *
 * The images are fetched with the session header and kept as blob URLs — a
 * bare <img src> cannot carry the token on LAN/tunnel. No capture is ever
 * faked: an unreachable preview says why.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Loader2, RefreshCw, Send, Smartphone, Monitor, X } from 'lucide-react';
import { t, type Language } from '@/lib/i18n';
import type { OlympusPalette } from '@/lib/theme';
import type { BriefScreenshot } from '@/lib/project-briefing';
import { mobileFetch } from '@/lib/mobile-fetch';
import { relativeTime } from '@/lib/companion-text';

export interface CompanionCapturesProps {
  slug: string;
  token: string;
  language: Language;
  palette: OlympusPalette;
  screenshots: BriefScreenshot[];
  onCritique: (text: string) => void;
}

type Viewport = 'mobile' | 'desktop';

const AUTO_KEY = 'olympus:companion-capture-at';

export default function CompanionCaptures({ slug, token, language, palette, screenshots, onCritique }: CompanionCapturesProps) {
  const [tab, setTab] = useState<Viewport>('mobile');
  const [meta, setMeta] = useState<BriefScreenshot[]>(screenshots);
  const [urls, setUrls] = useState<Partial<Record<Viewport, string>>>({});
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [critique, setCritique] = useState('');
  const [zoom, setZoom] = useState(false);
  const urlsRef = useRef<Partial<Record<Viewport, string>>>({});

  useEffect(() => { setMeta(screenshots); }, [screenshots]);

  const loadImage = useCallback(async (viewport: Viewport) => {
    try {
      const response = await mobileFetch(`/api/olympus/screenshots?slug=${encodeURIComponent(slug)}&viewport=${viewport}`, {
        cache: 'no-store',
        headers: { 'x-olympus-token': token },
      }, 25_000);
      if (!response.ok) return;
      const blob = await response.blob();
      if (!blob.size) return;
      const url = URL.createObjectURL(blob);
      setUrls((previous) => {
        const old = previous[viewport];
        if (old) URL.revokeObjectURL(old);
        urlsRef.current = { ...previous, [viewport]: url };
        return { ...previous, [viewport]: url };
      });
    } catch { /* the placeholder stays */ }
  }, [slug, token]);

  const loadAll = useCallback(async (current: BriefScreenshot[]) => {
    setLoading(true);
    const available = current.filter((shot) => shot.available).map((shot) => shot.viewport);
    await Promise.all(available.map(loadImage));
    if (available.length > 0 && !available.includes(tab)) setTab(available[0]);
    setLoading(false);
  }, [loadImage, tab]);

  useEffect(() => {
    void loadAll(meta);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, meta.map((shot) => `${shot.viewport}:${shot.capturedAt || ''}`).join('|')]);

  useEffect(() => () => {
    for (const url of Object.values(urlsRef.current)) { try { if (url) URL.revokeObjectURL(url); } catch { /* gone */ } }
  }, []);

  const capture = useCallback(async () => {
    if (busy || !slug || !token) return;
    setBusy(true);
    setError('');
    try {
      const response = await mobileFetch('/api/olympus/screenshots', {
        method: 'POST',
        headers: { 'x-olympus-token': token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug }),
      }, 90_000);
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok) {
        setError(String(data?.error || `capture failed (HTTP ${response.status})`));
        return;
      }
      const nextMeta: BriefScreenshot[] = (['mobile', 'desktop'] as const).map((viewport) => {
        const found = Array.isArray(data?.captures) ? data.captures.find((capture: any) => capture?.viewport === viewport && capture?.ok) : null;
        return found
          ? { viewport, available: true, capturedAt: found.capturedAt || new Date().toISOString(), bytes: Number(found.bytes) || null }
          : meta.find((shot) => shot.viewport === viewport) || { viewport, available: false, capturedAt: null, bytes: null };
      });
      setMeta(nextMeta);
      await loadAll(nextMeta);
      try { sessionStorage.setItem(AUTO_KEY, new Date().toISOString()); } catch { /* private */ }
    } catch (e: any) {
      setError(e?.message || 'capture failed');
    } finally {
      setBusy(false);
    }
  }, [busy, token, slug, meta, loadAll]);

  // One quiet auto-capture when the project has no images yet (or they are
  // older than 20 minutes). The preview route is the truth: if it is not
  // running, the error is shown, never an invented frame.
  useEffect(() => {
    if (!slug || !token) return;
    let last = '';
    try { last = sessionStorage.getItem(AUTO_KEY) || ''; } catch { /* private */ }
    const throttleStale = !last || Date.now() - Date.parse(last) > 20 * 60_000;
    if (!throttleStale) return;
    // Even when images exist, keep them fresh: a capture older than 20
    // minutes is stale for a live campaign.
    const newest = meta
      .filter((shot) => shot.available && shot.capturedAt)
      .map((shot) => Date.parse(shot.capturedAt!))
      .filter((ts) => Number.isFinite(ts))
      .sort((a, b) => b - a)[0];
    if (newest && Date.now() - newest < 20 * 60_000) return;
    const timer = setTimeout(() => { void capture(); }, 1_200);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, token]);

  const shot = meta.find((item) => item.viewport === tab);
  const url = urls[tab];
  const card = { border: `1px solid ${palette.gold}22`, background: `linear-gradient(160deg, ${palette.card}ee, ${palette.panel}aa)` } as const;
  const dim = { color: palette.textDim } as const;

  return (
    <section className="olympus-rise rounded-2xl p-3" style={card}>
      <div className="flex items-center gap-2">
        <Camera size={12} style={{ color: palette.gold }} />
        <span className="text-[9px] font-mono uppercase tracking-[0.24em]" style={{ color: palette.gold }}>{t('w.captures', language)}</span>
        <div className="ml-auto flex items-center gap-1">
          <button onClick={() => setTab('mobile')} aria-pressed={tab === 'mobile'} className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[8px] font-mono" style={tab === 'mobile' ? { background: `${palette.gold}22`, color: palette.gold, border: `1px solid ${palette.gold}44` } : { ...dim, border: `1px solid ${palette.gold}14` }}>
            <Smartphone size={9} /> {t('w.mobile', language)}
          </button>
          <button onClick={() => setTab('desktop')} aria-pressed={tab === 'desktop'} className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[8px] font-mono" style={tab === 'desktop' ? { background: `${palette.gold}22`, color: palette.gold, border: `1px solid ${palette.gold}44` } : { ...dim, border: `1px solid ${palette.gold}14` }}>
            <Monitor size={9} /> {t('w.desktop', language)}
          </button>
        </div>
      </div>

      <div className="relative mt-2 overflow-hidden rounded-xl" style={{ border: `1px solid ${palette.gold}18`, background: palette.bg }}>
        {url ? (
          <button onClick={() => setZoom(true)} className="block w-full" aria-label="Open the capture">
            <img src={url} alt={`${slug} ${tab}`} className="max-h-[520px] w-full object-contain" loading="eager" />
          </button>
        ) : (
          <div className="flex min-h-[160px] flex-col items-center justify-center gap-1.5 p-4 text-center">
            {loading || busy ? <Loader2 size={16} className="animate-spin" style={{ color: palette.gold }} /> : <Camera size={16} style={dim} />}
            <p className="text-[10px]" style={dim}>
              {busy ? t('w.capturing', language) : loading ? t('w.capturing', language) : t('w.captureUnavailable', language)}
            </p>
            <p className="text-[8px] font-mono" style={dim}>{t('w.captureHint', language)}</p>
          </div>
        )}
        {shot?.available && shot.capturedAt && (
          <span className="absolute bottom-1.5 left-2 rounded-full bg-black/45 px-1.5 py-0.5 text-[8px] font-mono text-white/80">
            {relativeTime(shot.capturedAt, language)}
          </span>
        )}
      </div>

      <div className="mt-2 flex items-center gap-2">
        <button onClick={() => void capture()} disabled={busy} className="inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[9px] font-mono disabled:opacity-40" style={{ border: `1px solid ${palette.gold}44`, color: palette.gold }}>
          {busy ? <Loader2 size={9} className="animate-spin" /> : <RefreshCw size={9} />} {busy ? t('w.capturing', language) : t('w.captureNow', language)}
        </button>
        {error && <p className="min-w-0 flex-1 truncate text-[8px] font-mono" style={{ color: palette.red }}>{error}</p>}
      </div>

      <div className="mt-2 flex items-center gap-1.5">
        <input
          value={critique}
          onChange={(event) => setCritique(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && critique.trim()) { onCritique(`Sobre a tela ${tab}: ${critique.trim()}`); setCritique(''); }
          }}
          placeholder={t('w.critique', language)}
          aria-label={t('w.critique', language)}
          className="min-w-0 flex-1 rounded-lg px-2 py-1.5 text-[11px] outline-none"
          style={{ background: palette.bg, border: `1px solid ${palette.gold}22`, color: palette.text }}
        />
        <button
          onClick={() => { if (critique.trim()) { onCritique(`Sobre a tela ${tab}: ${critique.trim()}`); setCritique(''); } }}
          disabled={!critique.trim()}
          className="rounded-lg px-2.5 py-1.5 text-[10px] font-mono disabled:opacity-40"
          style={{ background: `${palette.gold}22`, color: palette.gold, border: `1px solid ${palette.gold}44` }}
        >
          <Send size={10} />
        </button>
      </div>

      {zoom && url && (
        <div className="fixed inset-0 z-[400] flex flex-col bg-black/92 p-3" role="dialog" aria-modal="true" onClick={() => setZoom(false)}>
          <button onClick={() => setZoom(false)} aria-label="Close" className="ml-auto rounded-full p-2 text-white/80"><X size={18} /></button>
          <img src={url} alt={`${slug} ${tab} full`} className="min-h-0 flex-1 object-contain" onClick={(event) => event.stopPropagation()} />
        </div>
      )}
    </section>
  );
}
