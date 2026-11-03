'use client';

/**
 * progress-strip.tsx — v0.0.64: the project's honest progress, per god.
 *
 * One bar for the current plan (completed ÷ total), one bar per god (that
 * god's own hops), and the size line (delivered artifacts). Clicking a god
 * asks THAT god to explain its number; the answer is spoken by the caller.
 *
 * The % is of the CURRENT plan: a new prompt can lower it because the plan
 * grew — the label says so, and the size strip shows the growth.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { TrendingUp } from 'lucide-react';
import { resolvePalette } from '@/lib/theme';
import { useTheme } from '@/lib/theme-store';
import { godTintHex } from '@/lib/god-tint';
import { godName, t, type Language } from '@/lib/i18n';
import type { ProjectProgress } from '@/lib/project-progress';

export default function ProgressStrip({
  slug,
  god,
  language,
  onExplain,
  compact = false,
}: {
  slug: string;
  god: string;
  language: Language;
  onExplain?: (text: string, god: string) => void;
  compact?: boolean;
}) {
  const [theme] = useTheme();
  const palette = useMemo(() => resolvePalette(theme), [theme]);
  const [data, setData] = useState<ProjectProgress | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!slug) return;
    try {
      const r = await fetch(`/api/olympus/project-progress?slug=${encodeURIComponent(slug)}`, { cache: 'no-store' });
      const d = await r.json().catch(() => null);
      if (r.ok && d?.ok) { setData(d); setError(null); }
    } catch { /* the next poll retries */ }
  }, [slug]);

  useEffect(() => {
    if (!slug) return;
    void load();
    const timer = setInterval(() => {
      if (document.visibilityState !== 'hidden') void load();
    }, 5000);
    return () => clearInterval(timer);
  }, [slug, load]);

  const explain = useCallback(async (targetGod: string) => {
    if (!data || busy) return;
    setBusy(true);
    setError(null);
    const lines = [
      `overall ${data.overall.pct}% of the current plan (${data.overall.completed}/${data.overall.total} hops, ${data.overall.running} running, ${data.overall.parked} parked)`,
      ...data.perGod.map((g) => `${g.god} ${g.pct}% (${g.completed}/${g.total}${g.running ? `, ${g.running} running` : ''}${g.parked ? `, ${g.parked} parked` : ''})`),
      `size: ${data.size.artifacts}/${data.size.plannedArtifacts} delivered artifacts`,
    ];
    const prompt = `Explain the project progress in <=80 words, in the user's language. Cite these numbers exactly; do not invent. Overall: ${data.overall.pct}% (${data.overall.completed}/${data.overall.total} hops, ${data.overall.running} running, ${data.overall.parked} parked). Per god: ${data.perGod.map((g) => `${g.god} ${g.pct}% (${g.completed}/${g.total})`).join('; ')}. Size: ${data.size.artifacts}/${data.size.plannedArtifacts} artifacts delivered. What is done, what is missing, and what would move the number?`;
    try {
      const r = await fetch('/api/olympus/studio/converse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-olympus-language': language },
        body: JSON.stringify({ message: prompt, god: targetGod, language }),
      });
      const d = await r.json().catch(() => null);
      const answer = d?.ok && d.answer ? String(d.answer) : lines.join(' · ');
      onExplain?.(answer, targetGod);
    } catch {
      setError(t('m.connectionFailed', language));
      onExplain?.(lines.join(' · '), targetGod);
    } finally {
      setBusy(false);
    }
  }, [data, busy, language, onExplain]);

  if (!data) {
    return (
      <div className={`rounded-xl border border-olympus-gold/10 bg-olympus-card/50 ${compact ? 'p-2' : 'p-3'}`}>
        <div className="h-1.5 rounded-full bg-olympus-bg/60 overflow-hidden">
          <div className="h-full w-1/3 bg-olympus-gold/40 animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className={`w-full min-w-0 overflow-hidden rounded-xl border border-olympus-gold/10 bg-olympus-card/50 ${compact ? 'p-2' : 'p-3'}`}>
      <div className="flex min-w-0 items-center gap-1.5">
        <TrendingUp size={11} className="shrink-0 text-olympus-gold" />
        <span className="min-w-0 truncate text-[9px] font-mono uppercase tracking-wider text-olympus-text-dim">
          {t('m.progress', language)}
        </span>
        <span className="ml-auto text-[11px] font-mono font-semibold" style={{ color: palette.gold }}>
          {data.overall.pct}%
        </span>
        <span className="text-[8px] font-mono text-olympus-text-dim">
          {data.overall.completed}/{data.overall.total}
        </span>
        <button
          onClick={() => void explain(god)}
          disabled={busy}
          className="ml-1 rounded-full border border-olympus-gold/25 px-2 py-0.5 text-[8px] font-mono text-olympus-gold disabled:opacity-40"
          aria-label={t('m.explainProgress', language)}
        >
          {busy ? '…' : t('m.explain', language)}
        </button>
      </div>
      <div className="mt-1.5 h-1.5 w-full rounded-full bg-olympus-bg/70 overflow-hidden">
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{ width: `${Math.max(1, data.overall.pct)}%`, background: `linear-gradient(90deg, ${palette.gold}, ${palette.cyan})` }}
        />
      </div>
      <div className="mt-1 flex items-center gap-2 text-[8px] font-mono text-olympus-text-dim">
        <span>{t('m.ofPlan', language)}</span>
        {data.overall.running > 0 && <span style={{ color: palette.cyan }}>{data.overall.running} {t('m.inFlight', language)}</span>}
        {data.overall.interrupted > 0 && <span style={{ color: palette.red }}>{data.overall.interrupted} {t('m.interrupted', language)}</span>}
        {data.overall.parked > 0 && <span style={{ color: palette.red }}>{data.overall.parked} {t('m.stateParked', language)}</span>}
        <span className="ml-auto">{data.size.artifacts}/{data.size.plannedArtifacts} {t('m.artifacts', language)}</span>
      </div>

      {!compact && data.perGod.length > 0 && (
        <div className="olympus-progress-gods mt-2 flex w-full min-w-0 gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
          {data.perGod.map((g) => {
            const tint = godTintHex(palette, g.god);
            return (
              <button
                key={g.god}
                onClick={() => void explain(g.god)}
                disabled={busy}
                aria-label={`${godName(g.god, language)} ${g.pct}%`}
                className="min-w-[78px] flex-1 rounded-lg border border-olympus-gold/10 bg-olympus-bg/40 px-1.5 py-1 text-left disabled:opacity-60"
              >
                <span className="flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: tint }} />
                  <span className="truncate text-[8px] font-mono" style={{ color: tint }}>{godName(g.god, language)}</span>
                  <span className="ml-auto text-[8px] font-mono text-olympus-text-dim">{g.pct}%</span>
                </span>
                <span className="mt-1 block h-1 overflow-hidden rounded-full bg-olympus-bg/80">
                  <span className="block h-full rounded-full transition-[width] duration-500" style={{ width: `${Math.max(2, g.pct)}%`, background: tint }} />
                </span>
                <span className="mt-0.5 block text-[7px] font-mono text-olympus-text-dim">{g.completed}/{g.total}{g.running ? ` · ${g.running}↻` : ''}</span>
              </button>
            );
          })}
        </div>
      )}
      {error && <p className="mt-1 text-[8px] font-mono text-olympus-red">{error}</p>}
    </div>
  );
}
