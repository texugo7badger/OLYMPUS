'use client';

/**
 * CompanionBriefing — v0.0.85: the readable project document on the phone.
 *
 * It renders the structured briefing from `/api/olympus/briefing` with the
 * same sentences Apollo speaks. Every card has a speaker that uses the
 * responsible god's voice; the parked card sends the investigation to Apollo
 * (the terminal), never silently retries anything.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { AlertTriangle, ArrowRight, CheckCircle2, ClipboardList, Loader2, Radio, RefreshCw, Volume2 } from 'lucide-react';
import { t, type Language } from '@/lib/i18n';
import type { OlympusPalette } from '@/lib/theme';
import type { BriefHop, ProjectBriefing } from '@/lib/project-briefing';
import { currentLine, nextLine, parkedLine, recentLine, relativeTime, summaryLine } from '@/lib/companion-text';

export interface CompanionBriefingProps {
  briefing: ProjectBriefing | null;
  language: Language;
  palette: OlympusPalette;
  busy?: boolean;
  onSpeak: (text: string, god?: string) => void;
  onInvestigate: (text: string) => void;
  onRefresh?: () => void;
}

function GodChip({ god, language, palette }: { god: string; language: Language; palette: OlympusPalette }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[8px] font-mono uppercase tracking-wide" style={{ border: `1px solid ${palette.gold}33`, color: palette.gold }}>
      {god}
    </span>
  );
}

export default function CompanionBriefing({ briefing, language, palette, busy, onSpeak, onInvestigate, onRefresh }: CompanionBriefingProps) {
  const card = { border: `1px solid ${palette.gold}22`, background: `linear-gradient(160deg, ${palette.card}ee, ${palette.panel}aa)` } as const;
  const dim = { color: palette.textDim } as const;

  if (!briefing) {
    return (
      <section className="olympus-rise rounded-2xl p-4" style={card}>
        <div className="flex items-center gap-2 text-[9px] font-mono uppercase tracking-[0.26em]" style={{ color: palette.gold }}>
          <ClipboardList size={12} /> {t('w.briefing', language)}
          <Loader2 size={11} className="ml-auto animate-spin" style={dim} />
        </div>
        <p className="mt-3 text-[11px]" style={dim}>{t('w.captureHint', language)}</p>
      </section>
    );
  }

  if (!briefing.ok) {
    return (
      <section className="olympus-rise rounded-2xl p-4" style={card}>
        <div className="flex items-center gap-2 text-[9px] font-mono uppercase tracking-[0.26em]" style={{ color: palette.gold }}>
          <ClipboardList size={12} /> {t('w.briefing', language)}
        </div>
        <p className="mt-2 text-[11px] leading-relaxed" style={{ color: palette.red }}>{briefing.error || 'briefing unavailable'}</p>
        {onRefresh && (
          <button onClick={onRefresh} className="mt-2 inline-flex items-center gap-1 rounded-full px-2 py-1 text-[9px] font-mono" style={{ border: `1px solid ${palette.gold}44`, color: palette.gold }}>
            <RefreshCw size={9} /> {t('w.refresh', language)}
          </button>
        )}
      </section>
    );
  }

  const overall = briefing.progress?.overall;
  const pct = overall?.pct ?? 0;
  const summary = summaryLine(briefing, language);
  const speakAll = () => onSpeak([summary, ...briefing.current.map((hop) => currentLine(hop, language)), briefing.parked ? parkedLine(briefing, language) : '', nextLine(briefing, language)].filter(Boolean).join(' '), 'apollo');

  return (
    <section className="olympus-rise rounded-2xl p-4" style={card}>
      <div className="flex items-center gap-2">
        <ClipboardList size={13} style={{ color: palette.gold }} />
        <span className="text-[9px] font-mono uppercase tracking-[0.26em]" style={{ color: palette.gold }}>{t('w.briefing', language)}</span>
        <span className="flex items-center gap-1 text-[8px] font-mono uppercase" style={{ color: palette.green }} aria-label="live">
          <Radio size={8} className="motion-safe:animate-pulse" />
        </span>
        <button onClick={speakAll} aria-label={t('w.listen', language)} className="ml-auto rounded-full p-1.5" style={{ border: `1px solid ${palette.gold}33`, color: palette.gold }}>
          <Volume2 size={11} />
        </button>
        {onRefresh && (
          <button onClick={onRefresh} aria-label="Refresh briefing" className="rounded-full p-1.5" style={{ color: palette.textDim }}>
            <RefreshCw size={11} className={busy ? 'animate-spin' : ''} />
          </button>
        )}
      </div>

      <p className="mt-3 text-[13px] leading-relaxed" style={{ color: palette.text }}>{summary}</p>

      {overall && overall.total > 0 && (
        <>
          <div className="mt-3 flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full" style={{ background: palette.bg }}>
              <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${palette.gold}, ${palette.cyan})` }} />
            </div>
            <span className="font-mono text-[10px] tabular-nums" style={{ color: palette.cyan }}>{pct}%</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5 text-[8px] font-mono" style={dim}>
            <span className="rounded-full px-2 py-0.5" style={{ background: `${palette.green}18`, color: palette.green }}>{overall.completed}/{overall.total}</span>
            {overall.running > 0 && <span className="rounded-full px-2 py-0.5" style={{ background: `${palette.cyan}18`, color: palette.cyan }}>{overall.running} {t('w.current', language)}</span>}
            {briefing.parked && <span className="rounded-full px-2 py-0.5" style={{ background: `${palette.gold}18`, color: palette.gold }}>{t('w.parked', language)}</span>}
            <span className="rounded-full px-2 py-0.5" style={{ background: `${palette.purple}18`, color: palette.purple }}>{briefing.progress?.size.artifacts ?? 0} {t('w.artifacts', language)}</span>
          </div>
        </>
      )}

      {briefing.current.length > 0 && (
        <div className="mt-4">
          <p className="text-[8px] font-mono uppercase tracking-[0.22em]" style={dim}>{t('w.current', language)}</p>
          {briefing.current.slice(0, 3).map((hop: BriefHop) => (
            <div key={hop.id} className="mt-1.5 flex items-start gap-2 rounded-xl px-2.5 py-2" style={{ background: `${palette.cyan}0d`, border: `1px solid ${palette.cyan}22` }}>
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full motion-safe:animate-pulse" style={{ background: hop.status === 'lost' ? palette.red : palette.cyan }} />
              <div className="min-w-0 flex-1">
                <p className="text-[11px] leading-snug">{currentLine(hop, language)}</p>
                <p className="mt-0.5 font-mono text-[8px]" style={{ color: hop.status === 'lost' ? palette.red : palette.cyan }}>{hop.id}{hop.status === 'lost' ? ' · lost' : ''}</p>
              </div>
              <button onClick={() => onSpeak(currentLine(hop, language), hop.god)} aria-label={t('w.listen', language)} className="rounded-full p-1" style={dim}><Volume2 size={10} /></button>
            </div>
          ))}
        </div>
      )}

      {briefing.parked && (
        <div className="mt-3 rounded-xl p-3" style={{ background: `${palette.gold}10`, border: `1px solid ${palette.gold}33` }}>
          <div className="flex items-start gap-2">
            <AlertTriangle size={12} className="mt-0.5 shrink-0" style={{ color: palette.gold }} />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] leading-snug" style={{ color: palette.text }}>{parkedLine(briefing, language)}</p>
              {briefing.parked.error && <p className="mt-1 line-clamp-2 font-mono text-[8px]" style={dim}>{briefing.parked.error}</p>}
            </div>
            <button onClick={() => onSpeak(parkedLine(briefing, language), 'apollo')} aria-label={t('w.listen', language)} className="rounded-full p-1" style={dim}><Volume2 size={10} /></button>
          </div>
          <button
            onClick={() => onInvestigate(`O hop ${briefing.parked!.hopId} está parked (${briefing.parked!.reason}). Investigue o bloqueio e retome o walk.`)}
            className="mt-2 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[9px] font-mono"
            style={{ border: `1px solid ${palette.gold}55`, color: palette.gold }}
          >
            <ArrowRight size={9} /> {t('w.investigate', language)}
          </button>
        </div>
      )}

      {briefing.recent.length > 0 && (
        <div className="mt-4">
          <p className="text-[8px] font-mono uppercase tracking-[0.22em]" style={dim}>{t('w.recent', language)}</p>
          <div className="mt-1.5 space-y-1">
            {briefing.recent.slice(0, 4).map((event) => (
              <div key={`${event.ts}-${event.hopId}`} className="flex items-center gap-2 text-[10px]">
                {event.status === 'completed'
                  ? <CheckCircle2 size={10} style={{ color: palette.green }} />
                  : <AlertTriangle size={10} style={{ color: palette.gold }} />}
                <span className="min-w-0 flex-1 truncate">{recentLine(event, language)}</span>
                <span className="shrink-0 font-mono text-[8px]" style={dim}>{relativeTime(event.ts, language)}</span>
                <button onClick={() => onSpeak(recentLine(event, language), event.god)} aria-label={t('w.listen', language)} className="rounded-full p-0.5" style={dim}><Volume2 size={9} /></button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4 flex items-start gap-2">
        <ArrowRight size={11} className="mt-0.5 shrink-0" style={{ color: palette.cyan }} />
        <div className="min-w-0 flex-1">
          <p className="text-[8px] font-mono uppercase tracking-[0.22em]" style={dim}>{t('w.nextUp', language)}</p>
          <p className="mt-0.5 text-[10px] leading-relaxed">{nextLine(briefing, language)}</p>
          {briefing.next.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {briefing.next.slice(0, 4).map((hop) => (
                <button key={hop.id} onClick={() => onSpeak(nextLine({ ...briefing, next: [hop] }, language), hop.god)} className="inline-flex items-center gap-1">
                  <GodChip god={hop.god} language={language} palette={palette} />
                  <span className="font-mono text-[8px]" style={dim}>{hop.id}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
