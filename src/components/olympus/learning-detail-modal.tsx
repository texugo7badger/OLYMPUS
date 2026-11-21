'use client';

/**
 * learning-detail-modal.tsx — v0.0.98: the learning box.
 *
 * Click a learning notification (or a Pattern Studio learning row) and the
 * box explains the teaching, its measured confidence/samples and exactly how
 * far it is from the 0.85 short-circuit gate. The same surface is used by the
 * bell and the studio.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { useEffect } from 'react';
import { X, Sparkles, Volume2, ScrollText, Brain, ArrowRight, CircleCheck, CircleAlert } from 'lucide-react';
import { useOlympus } from '@/lib/olympus-store';
import { useLanguage, getLanguage, godName } from '@/lib/i18n';
import { speakAs } from '@/lib/voice';
import { cn } from '@/lib/utils';
import type { LearningItem } from '@/lib/learning-types';
import { SHORT_CIRCUIT_THRESHOLD } from '@/lib/learning-types';

function pct(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return `${Math.round(n * 100)}%`;
}

export default function LearningDetailModal({
  item,
  onClose,
  onLogs,
  onCallimachus,
}: {
  item: LearningItem;
  onClose: () => void;
  onLogs?: () => void;
  onCallimachus?: () => void;
}) {
  const setLeftPane = useOlympus((s) => s.setLeftPane);
  const setSelectedNode = useOlympus((s) => s.setSelectedNode);
  const language = useLanguage();
  const current = item.confidence ?? item.rate ?? null;
  const threshold = item.threshold ?? SHORT_CIRCUIT_THRESHOLD;
  const gap = Math.max(0, threshold - (current ?? 0));
  const width = Math.max(0, Math.min(100, (current ?? 0) * 100));
  const isInstinct = item.type === 'instinct';
  const canShortCircuit = current != null && current >= threshold;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const openLogs = () => {
    onLogs?.();
    setLeftPane('logs');
    onClose();
  };
  const openCallimachus = () => {
    onCallimachus?.();
    setLeftPane('god-detail');
    setSelectedNode({ id: 'god:callimachus', type: 'god', god: 'callimachus' } as any);
    onClose();
  };
  const hear = () => {
    void speakAs(
      `${item.name}. ${item.summary}. ${canShortCircuit ? 'Pronto para o curto-circuito.' : `Faltam ${Math.round(gap * 100)} pontos para o curto-circuito.`}`,
      item.god,
      getLanguage(),
    );
  };

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/65 p-4" onClick={onClose} role="dialog" aria-modal="true" aria-label={`Learning: ${item.name}`}>
      <div className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-olympus-green/25 bg-olympus-bg shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <header className="flex shrink-0 items-center gap-2 border-b border-olympus-green/15 bg-olympus-panel px-4 py-3">
          <Sparkles size={15} className="text-olympus-green" />
          <span className="rounded bg-olympus-green/10 px-1.5 py-0.5 text-[9px] font-mono uppercase text-olympus-green ring-1 ring-olympus-green/25">{item.type}</span>
          <span className="truncate text-[14px] font-semibold text-olympus-text">{item.name}</span>
          <span className="shrink-0 text-[10px] font-mono text-olympus-text-dim">· {godName(item.god, language)}</span>
          <button onClick={onClose} aria-label="Close learning detail" className="ml-auto text-olympus-text-dim hover:text-olympus-red"><X size={14} /></button>
        </header>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
          <section className="rounded-lg border border-olympus-green/15 bg-olympus-card/50 p-3">
            <div className="text-[10px] font-mono uppercase tracking-wider text-olympus-text-dim">Resumo do ensinamento</div>
            <p className="mt-1 text-[12px] leading-relaxed text-olympus-text">{item.summary}</p>
            {item.recommendation && <p className="mt-2 text-[11px] font-mono text-olympus-green">{item.recommendation}</p>}
          </section>

          <section className="rounded-lg border border-olympus-gold/15 bg-olympus-card/50 p-3">
            <div className="flex items-center justify-between">
              <div className="text-[10px] font-mono uppercase tracking-wider text-olympus-gold">Caminho até o curto-circuito</div>
              <div className={cn('text-[11px] font-mono', canShortCircuit ? 'text-olympus-green' : 'text-olympus-amber-soft')}>
                {canShortCircuit ? 'pronto' : `faltam ${Math.round(gap * 100)} pts`}
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-[28px] font-semibold tabular-nums text-olympus-text">{pct(current)}</span>
              <span className="text-[10px] font-mono text-olympus-text-dim">de {Math.round(threshold * 100)}% para curto-circuitar</span>
            </div>
            <div className="relative mt-2 h-2 overflow-hidden rounded-full bg-olympus-text-dim/15">
              <div className={cn('h-full rounded-full transition-[width] duration-500', canShortCircuit ? 'bg-olympus-green' : 'bg-olympus-amber-soft')} style={{ width: `${width}%` }} />
              <span className="absolute top-0 h-full w-px bg-olympus-gold/80" style={{ left: `${threshold * 100}%` }} aria-hidden />
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2 text-[10px] font-mono">
              <div><span className="text-olympus-text-dim">amostras</span><div className="text-olympus-text">{item.samples ?? '—'}</div></div>
              <div><span className="text-olympus-text-dim">sucessos</span><div className="text-olympus-text">{item.successes ?? '—'}</div></div>
              <div><span className="text-olympus-text-dim">último</span><div className="truncate text-olympus-text">{item.lastUsed ? new Date(item.lastUsed).toLocaleString([], { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}</div></div>
            </div>
            {isInstinct && item.confidence == null && (
              <p className="mt-2 text-[10px] font-mono text-olympus-text-dim">este instinto ainda não declara confiança — o frontmatter é a fonte.</p>
            )}
            {!isInstinct && item.samples === 0 && (
              <p className="mt-2 text-[10px] font-mono text-olympus-text-dim">sem outcomes medidos: a próxima build/dispatch que usar este item começa a curva.</p>
            )}
          </section>

          <section className="rounded-lg border border-olympus-gold/15 bg-olympus-card/50 p-3">
            <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-olympus-text-dim">
              <CircleCheck size={10} /> Últimos resultados
            </div>
            {item.history?.length ? (
              <div className="space-y-1">
                {item.history.map((h, i) => (
                  <div key={`${h.ts}-${i}`} className="flex items-center gap-2 text-[10px] font-mono">
                    <span className="w-24 shrink-0 text-olympus-text-dim">{h.ts ? new Date(h.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}</span>
                    <span className={cn('w-20 shrink-0', h.outcome === 'completed' ? 'text-olympus-green' : 'text-olympus-red')}>{h.outcome}</span>
                    <span className="truncate text-olympus-text-dim">{h.hop ?? '—'} · {h.god ?? '—'}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-[10px] font-mono text-olympus-text-dim"><CircleAlert size={10} /> ainda sem outcomes registrados para este item.</div>
            )}
          </section>

          <section className="rounded-lg border border-olympus-cyan/15 bg-olympus-cyan/5 p-3 text-[11px] font-mono leading-relaxed text-olympus-text-dim">
            <span className="text-olympus-cyan">Como ler:</span> instintos entram no gate em <span className="text-olympus-gold">85%</span>; skills/MCPs medem a confiança do arsenal que alimenta as builds. Um item abaixo da linha ainda é útil — ele só não pula a deliberação.
          </section>
        </div>

        <footer className="flex shrink-0 flex-wrap items-center gap-2 border-t border-olympus-green/15 bg-olympus-panel px-4 py-2.5">
          <button onClick={hear} className="flex items-center gap-1 rounded border border-olympus-green/25 px-2 py-1 text-[10px] font-mono text-olympus-green hover:bg-olympus-green/10"><Volume2 size={10} /> ouvir</button>
          <button onClick={openLogs} className="flex items-center gap-1 rounded border border-olympus-gold/20 px-2 py-1 text-[10px] font-mono text-olympus-gold hover:bg-olympus-gold/10"><ScrollText size={10} /> abrir Logs</button>
          <button onClick={openCallimachus} className="flex items-center gap-1 rounded border border-olympus-purple/25 px-2 py-1 text-[10px] font-mono text-olympus-purple hover:bg-olympus-purple/10"><Brain size={10} /> Callimachus <ArrowRight size={9} /></button>
          <button onClick={onClose} className="ml-auto rounded px-2 py-1 text-[10px] font-mono text-olympus-text-dim hover:text-olympus-text">fechar</button>
        </footer>
      </div>
    </div>
  );
}
