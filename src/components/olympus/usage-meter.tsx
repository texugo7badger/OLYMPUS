'use client';

/**
 * usage-meter.tsx — v0.0.98: the terminal's always-visible GO limit.
 *
 * Shows the 5-hour rolling window by default; the button beside it cycles
 * 5h → weekly → monthly. The value is the console anchor's own number (no
 * local-delta adjustment, no invented 0%). A stale anchor (>5 min) is
 * labelled; a 100% window becomes the quota-hit red with the resume time.
 *
 * The route is cheap by design (no ledger scan), so this can poll every 10s
 * while the terminal is open without competing with the Cost panel.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeftRight } from 'lucide-react';
import { useOlympus } from '@/lib/olympus-store';
import { cn } from '@/lib/utils';
import OlympusTooltip from './olympus-tooltip';

type UsageWindow = 'h5' | 'weekly' | 'monthly';
const STORAGE_KEY = 'olympus:usage-window';
const LABELS: Record<UsageWindow, string> = { h5: '5h', weekly: 'W', monthly: 'M' };
const FULL: Record<UsageWindow, string> = { h5: '5-hour', weekly: 'weekly', monthly: 'monthly' };

interface MeterWindow { pct: number | null; resetAt: string | null }
interface MeterData {
  ok: boolean;
  exact: boolean;
  source: 'console' | 'mixed' | 'local';
  anchorAt: string | null;
  anchorAgeMs: number | null;
  windows: { h5: MeterWindow; weekly: MeterWindow; monthly: MeterWindow };
  spend: { monthUsd: number; h5Usd: number; weekUsd: number; capUsd: number | null } | null;
  quota: { hit: boolean; resumeAt: string | null };
}

function readWindow(): UsageWindow {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'weekly' || v === 'monthly' ? v : 'h5';
  } catch { return 'h5'; }
}

function pctText(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  if (n === 0) return '0%';
  return `${n >= 100 ? Math.round(n) : n.toFixed(n < 10 ? 1 : 0)}%`;
}

function resetText(iso: string | null | undefined, now = Date.now()): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const left = t - now;
  if (left <= 0) return 'reset now';
  const mins = Math.round(left / 60_000);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  return `${h}h${String(mins % 60).padStart(2, '0')}m`;
}

export default function UsageMeter() {
  const setLeftPane = useOlympus((s) => s.setLeftPane);
  const [win, setWin] = useState<UsageWindow>('h5');
  const [data, setData] = useState<MeterData | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => { setWin(readWindow()); }, []);

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/olympus/go-usage/meter', { cache: 'no-store' });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d?.ok) { setFailed(true); return; }
      setData(d as MeterData);
      setFailed(false);
    } catch { setFailed(true); }
  }, []);

  useEffect(() => {
    void load();
    const iv = setInterval(() => { if (document.visibilityState !== 'hidden') void load(); }, 10_000);
    const onSync = () => { void load(); };
    window.addEventListener('olympus:go-console-synced', onSync);
    return () => {
      clearInterval(iv);
      window.removeEventListener('olympus:go-console-synced', onSync);
    };
  }, [load]);

  const cycle = useCallback(() => {
    setWin((prev) => {
      const next: UsageWindow = prev === 'h5' ? 'weekly' : prev === 'weekly' ? 'monthly' : 'h5';
      try { localStorage.setItem(STORAGE_KEY, next); } catch { /* private */ }
      return next;
    });
  }, []);

  const view = data?.windows?.[win] ?? null;
  const pct = view?.pct ?? null;
  const stale = data?.anchorAgeMs != null && data.anchorAgeMs > 5 * 60_000;
  const hit = Boolean(data?.quota?.hit) || (pct ?? 0) >= 100;
  const tone = hit ? 'red' : pct != null && pct >= 80 ? 'red' : pct != null && pct >= 65 ? 'amber' : 'green';
  const width = Math.max(0, Math.min(100, pct ?? 0));

  const tip = useMemo(() => {
    if (failed || !data) return 'GO usage unavailable — the console anchor has not synced yet';
    if (!data.exact) return 'No console anchor yet — keep Frames → OpenCode open or use Sync GO console';
    const reset = resetText(view?.resetAt ?? null);
    const spend = data.spend
      ? ` · step $${data.spend.h5Usd.toFixed(2)} · list ${data.spend.monthUsd > 0 ? 'see Economy' : 'unknown'} · invoice unknown`
      : ' · invoice unknown';
    return `${FULL[win]} ${pctText(pct)}${reset ? ` · resets in ${reset}` : ''}${stale ? ' · STALE anchor' : ''}${hit ? ' · GO limit hit' : ''}${spend}`;
  }, [failed, data, view, win, pct, stale, hit]);

  const aria = data?.exact
    ? `${FULL[win]} usage ${pctText(pct)}${view?.resetAt ? `, resets in ${resetText(view.resetAt)}` : ''}`
    : 'GO usage not synced';

  return (
    <div className="flex items-center gap-1" data-testid="usage-meter">
      <OlympusTooltip content={tip} side="bottom">
        <button
          type="button"
          onClick={() => setLeftPane('cost')}
          aria-label={aria}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 ring-1 ring-olympus-gold/15 hover:ring-olympus-gold/35 transition-colors"
        >
          <span className="text-[9px] font-mono text-olympus-text-dim">{LABELS[win]}</span>
          <span className={cn(
            'text-[9px] font-mono tabular-nums',
            !data?.exact ? 'text-olympus-text-dim'
              : tone === 'red' ? 'text-olympus-red'
                : tone === 'amber' ? 'text-olympus-amber-soft'
                  : 'text-olympus-green',
          )}>
            {data ? pctText(pct) : '—'}
          </span>
          <span className="h-1 w-9 overflow-hidden rounded-full bg-olympus-text-dim/15" aria-hidden>
            <span
              className={cn(
                'block h-full rounded-full transition-[width] duration-300',
                tone === 'red' ? 'bg-olympus-red' : tone === 'amber' ? 'bg-olympus-amber-soft' : 'bg-olympus-green',
              )}
              style={{ width: `${width}%` }}
            />
          </span>
          {stale && <span className="text-[8px] font-mono text-olympus-amber-soft">stale</span>}
          {hit && <span className="text-[8px] font-mono text-olympus-red">limit</span>}
        </button>
      </OlympusTooltip>
      <OlympusTooltip content="Toggle 5-hour / weekly / monthly" side="bottom">
        <button
          type="button"
          onClick={cycle}
          aria-label="Toggle usage window"
          className="text-olympus-text-dim hover:text-olympus-gold transition-colors"
        >
          <ArrowLeftRight size={9} />
        </button>
      </OlympusTooltip>
    </div>
  );
}
