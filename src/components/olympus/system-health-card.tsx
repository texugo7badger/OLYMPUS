/**
 * system-health-card.tsx — v0.1.6: the two release surfaces that used to live
 * in the Logs tab bar, where they did not belong.
 *
 * Logs is the runtime flight recorder. Boot health is system state; Hygiene is
 * the release gate (tsc, lint, docs, privacy, suite manifest, audit, battery).
 * Both are now one compact Settings card instead of two Logs tabs.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
'use client';

import { useEffect, useState } from 'react';
import { Activity, CircleCheck, CircleAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLanguage, t } from '@/lib/i18n';

interface BootHealth {
  app?: { health?: { ok?: boolean; status?: number | null; ms?: number | null }; port?: number };
  boot?: { nextPid?: number | null; nextExternal?: boolean };
}

interface Hygiene {
  version?: string;
  ok?: boolean;
  generatedAt?: string;
  gates?: Array<{ name: string; ok: boolean; ms: number }>;
  battery?: { pass?: number; fail?: number; skip?: number; suites?: number } | null;
}

export default function SystemHealthCard() {
  const language = useLanguage();
  const [boot, setBoot] = useState<BootHealth | null>(null);
  const [hygiene, setHygiene] = useState<Hygiene | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [b, h] = await Promise.allSettled([
        fetch('/api/olympus/boot-health', { cache: 'no-store' }).then((r) => r.json()),
        fetch('/api/olympus/hygiene', { cache: 'no-store' }).then((r) => r.json()),
      ]);
      if (cancelled) return;
      if (b.status === 'fulfilled') setBoot(b.value);
      if (h.status === 'fulfilled') setHygiene(h.value);
    })();
    return () => { cancelled = true; };
  }, []);

  const appOk = boot?.app?.health?.ok === true;
  const gatesOk = hygiene?.gates?.length ? hygiene.gates.every((g) => g.ok) : hygiene?.ok === true;
  const gates = hygiene?.gates ?? [];
  const battery = hygiene?.battery;

  return (
    <section>
      <div className="flex items-center gap-1.5 mb-2">
        <Activity size={11} className="text-olympus-gold" />
        <h3 className="text-[11px] font-semibold text-olympus-text uppercase tracking-wide">{t('settings.systemRelease', language)}</h3>
        <span className="ml-auto text-[9px] font-mono text-olympus-text-dim">not a runtime log</span>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="rounded-md border border-olympus-gold/10 bg-olympus-card/50 p-2.5">
          <div className="flex items-center gap-1.5 text-[10px] font-mono">
            <span className={cn('h-1.5 w-1.5 rounded-full', appOk ? 'bg-olympus-green' : 'bg-olympus-red')} />
            <span className="text-olympus-text">Server</span>
            <span className="ml-auto text-olympus-text-dim">{boot ? (appOk ? `HTTP ${boot.app?.health?.status ?? 200} · ${boot.app?.health?.ms ?? '—'}ms` : 'down') : 'probing…'}</span>
          </div>
          <div className="mt-1 text-[9px] font-mono text-olympus-text-dim">
            port {boot?.app?.port ?? '—'} · {boot?.boot?.nextExternal ? 'external server' : `pid ${boot?.boot?.nextPid ?? '—'}`}
          </div>
        </div>
        <div className="rounded-md border border-olympus-gold/10 bg-olympus-card/50 p-2.5">
          <div className="flex items-center gap-1.5 text-[10px] font-mono">
            {gatesOk ? <CircleCheck size={11} className="text-olympus-green" /> : <CircleAlert size={11} className="text-olympus-red" />}
            <span className="text-olympus-text">Release gate</span>
            <span className="ml-auto text-olympus-text-dim">{hygiene ? `v${hygiene.version ?? '—'}` : 'loading…'}</span>
          </div>
          <div className="mt-1 text-[9px] font-mono text-olympus-text-dim">
            {gates.length ? `${gates.filter((g) => g.ok).length}/${gates.length} gates` : 'no report yet'}
            {battery?.pass != null ? ` · ${battery.pass}/${battery.suites ?? gates.length} suites` : ''}
          </div>
        </div>
      </div>
      <p className="mt-1.5 text-[8.5px] font-mono text-olympus-text-dim leading-relaxed">
        Hygiene is the release gate, not a runtime feed. Run <code className="text-olympus-gold">npm run hygiene -- --battery</code> to refresh it.
      </p>
    </section>
  );
}
