/**
 * /m/widget — the live OLYMPUS status widget (v0.0.84 edit).
 *
 * A phone-sized, read-only view of the campaign: progress, the in-flight hop,
 * the GO Plus buckets and the money numbers. It is the screen the hibernation
 * HUD opens, and it can be added to the phone's home screen as a standalone
 * shortcut (`manifest-widget.webmanifest`). It never exposes the vault or the
 * session; the token in `#t=` is the same mobile capability token.
 *
 * Live: polls run-state + GO usage every 5s while visible. No ring, no particle
 * field, no full app — this is meant to be cheap enough to leave open.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Bell, Coins, Download, Gauge, Palette, Radio, RefreshCw, Send, Smartphone, Zap } from 'lucide-react';
import { applyTheme, normalizeThemeState, resolvePalette, THEME_PRESETS, type ThemeState } from '@/lib/theme';
import { mobileFetch } from '@/lib/mobile-fetch';
import { useMobilePwa } from '@/lib/use-mobile-pwa';
import { useLanguage, t } from '@/lib/i18n';
import { speakAs } from '@/lib/voice';
import { useCompanionNotifications } from '@/lib/use-companion-notifications';
import CompanionBriefing from '@/components/olympus/companion-briefing';
import CompanionCaptures from '@/components/olympus/companion-captures';
import { CompanionNotificationsSheet, CompanionToast } from '@/components/olympus/companion-notifications';
import type { ProjectBriefing } from '@/lib/project-briefing';
import { briefingSpeech, isBriefingIntent } from '@/lib/companion-text';

const TOKEN_KEY = 'olympus:mobile-token';
const THEME_KEY = 'olympus:mobile-theme';

type RunState = {
  line?: string;
  verdict?: string;
  campaign?: { state?: string; lane?: string };
  hops?: {
    completed?: number;
    total?: number;
    inFlight?: number;
    inFlightList?: Array<{ hopId: string; god?: string }>;
    parked?: { hopId?: string; reason?: string } | null;
  };
};

type UsageWindow = { pct?: number | null; model?: string | null };
type Usage = {
  plan?: string;
  source?: string;
  binding?: { model?: string; window?: string; pct?: number } | null;
  windows?: { h5?: UsageWindow; d7?: UsageWindow; month?: UsageWindow };
  models?: Array<{ model?: string; spend5h?: number; spend7d?: number; spendMonth?: number; limit?: number | null }>;
};

type Costs = { spend?: number; stepCost?: number; total?: number };
type QueueItem = { id: string; text: string; status: 'queued' | 'sent'; priority?: string; source?: string; createdAt?: string };

function pct(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : null;
}

function money(value: unknown): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return `$${n.toFixed(2)}`;
}

export default function LiveWidgetPage() {
  const [token, setToken] = useState<string | null>(null);
  const [theme, setTheme] = useState<ThemeState | null>(null);
  const [run, setRun] = useState<RunState | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [costs, setCosts] = useState<Costs | null>(null);
  const [project, setProject] = useState<string>('');
  const [updatedAt, setUpdatedAt] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [queueNote, setQueueNote] = useState('');
  const [answer, setAnswer] = useState('');
  const [briefing, setBriefing] = useState<ProjectBriefing | null>(null);
  const [briefingBusy, setBriefingBusy] = useState(false);
  const [notifyOpen, setNotifyOpen] = useState(false);
  const language = useLanguage();
  // v0.0.85 — one themed worker owns /m and /m/widget; install is shared.
  const pwa = useMobilePwa();
  const notifications = useCompanionNotifications({ token, language });

  useEffect(() => {
    try {
      const hash = window.location.hash || '';
      const fromHash = new URLSearchParams(hash.replace(/^#/, '')).get('t') || '';
      const stored = localStorage.getItem(TOKEN_KEY) || '';
      // The PWA start_url is /m/widget (no hash); persist the QR token so the
      // installed widget keeps its session without the fragment.
      if (fromHash) { try { localStorage.setItem(TOKEN_KEY, fromHash); } catch { /* private */ } }
      setToken(fromHash || stored || null);
      const raw = localStorage.getItem(THEME_KEY);
      if (raw) setTheme(normalizeThemeState(JSON.parse(raw)));
    } catch { /* private mode */ }
  }, []);

  const palette = useMemo(() => resolvePalette(normalizeThemeState(theme)), [theme]);

  useEffect(() => {
    if (!theme) return;
    try { applyTheme(theme, document.documentElement); } catch { /* non-DOM */ }
  }, [theme]);

  const headers = useMemo<Record<string, string>>(() => {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) h['x-olympus-token'] = token;
    return h;
  }, [token]);

  const load = useCallback(async () => {
    if (!token || busy) return;
    setBusy(true);
    try {
      const [pRes, rRes, gRes, cRes, tRes, qRes, bRes] = await Promise.all([
        mobileFetch('/api/olympus/projects', { cache: 'no-store', headers }, 20_000),
        mobileFetch('/api/olympus/run-state', { cache: 'no-store', headers }, 20_000),
        mobileFetch('/api/olympus/go-usage', { cache: 'no-store', headers }, 25_000),
        mobileFetch('/api/olympus/costs?window=24h', { cache: 'no-store', headers }, 20_000),
        mobileFetch('/api/olympus/theme', { cache: 'no-store', headers }, 15_000),
        mobileFetch('/api/olympus/prompt-queue', { cache: 'no-store', headers }, 15_000),
        mobileFetch('/api/olympus/briefing', { cache: 'no-store', headers }, 20_000),
      ]);
      if (pRes.ok) {
        const d = await pRes.json().catch(() => null);
        const active = String(d?.active?.slug || '');
        setProject(active || String(d?.projects?.[0]?.slug || ''));
      }
      if (rRes.ok) setRun(await rRes.json().catch(() => null));
      if (gRes.ok) setUsage(await gRes.json().catch(() => null));
      if (cRes.ok) setCosts(await cRes.json().catch(() => null));
      if (tRes.ok) {
        const d = await tRes.json().catch(() => null);
        if (d?.state) {
          const next = normalizeThemeState(d.state);
          setTheme(next);
          try { localStorage.setItem(THEME_KEY, JSON.stringify(next)); } catch { /* private */ }
        }
      }
      if (qRes.ok) {
        const d = await qRes.json().catch(() => null);
        setQueue(Array.isArray(d?.items) ? d.items.slice(-8).reverse() : []);
      }
      if (bRes.ok) setBriefing(await bRes.json().catch(() => null));
      setUpdatedAt(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      setError(null);
    } catch (e: any) {
      setError(e?.message || 'offline');
    } finally {
      setBusy(false);
    }
  }, [token, busy, headers]);

  useEffect(() => {
    if (!token) return;
    void load();
    const timer = setInterval(() => {
      if (document.visibilityState !== 'hidden') void load();
    }, 5_000);
    return () => clearInterval(timer);
  }, [token, load]);

  const refreshBriefing = useCallback(async () => {
    if (!token) return;
    setBriefingBusy(true);
    try {
      const response = await mobileFetch('/api/olympus/briefing', { cache: 'no-store', headers }, 20_000);
      if (response.ok) setBriefing(await response.json().catch(() => null));
    } catch { /* keep the last briefing */ }
    finally { setBriefingBusy(false); }
  }, [token, headers]);

  const speak = useCallback((text: string, god = 'apollo') => {
    if (!text) return;
    void speakAs(text, god, language);
  }, [language]);

  // The widget is also a theme remote: one tap cycles the preset and writes
  // the store the PC and the companion watch. The colors change immediately.
  const cycleTheme = useCallback(async () => {
    const current = normalizeThemeState(theme);
    const index = THEME_PRESETS.findIndex((preset) => preset.id === current.presetId);
    const preset = THEME_PRESETS[(index + 1) % THEME_PRESETS.length];
    const next = normalizeThemeState({ ...current, presetId: preset.id, accent: null, custom: undefined });
    setTheme(next);
    try { applyTheme(next, document.documentElement); } catch { /* non-DOM */ }
    try { localStorage.setItem(THEME_KEY, JSON.stringify(next)); } catch { /* private */ }
    try {
      await fetch('/api/olympus/theme', { method: 'POST', headers, body: JSON.stringify(next) });
      setQueueNote(`${t('w.theme', language)} · ${preset.name}`);
    } catch { /* local theme stands */ }
  }, [theme, headers, language]);

  const completed = Number(run?.hops?.completed ?? 0);
  const total = Number(run?.hops?.total ?? 0);
  const progress = total > 0 ? Math.round((completed / total) * 100) : 0;
  // The verdict is the honest word when no process holds the lock: a parked
  // walk has campaign.state 'none' but verdict PARKED. Use the verdict first.
  const state = String(run?.verdict || run?.campaign?.state || 'idle').toLowerCase();
  const inFlight = run?.hops?.inFlightList ?? [];
  const parked = run?.hops?.parked ?? null;
  const h5 = pct(usage?.windows?.h5?.pct);
  const d7 = pct(usage?.windows?.d7?.pct);
  const mo = pct(usage?.windows?.month?.pct);
  const binding = usage?.binding?.model ? `${usage.binding.model} · ${usage.binding.window || ''} ${pct(usage.binding.pct) ?? '—'}%` : 'no binding';
  const listValue = usage?.models?.find((m) => m.model === usage?.binding?.model)?.spendMonth;
  const step = costs?.stepCost ?? costs?.spend ?? costs?.total;

  const sendPrompt = useCallback(async (text: string) => {
    const q = text.trim();
    if (!q || sending) return;
    setSending(true);
    setQueueNote('');
    try {
      // "brief me" is a zero-token local answer: Apollo reads the project
      // document instead of spending a terminal turn. A real task still goes
      // to the terminal queue.
      if (isBriefingIntent(q)) {
        let data = briefing;
        if (!data?.ok) {
          const response = await mobileFetch('/api/olympus/briefing', { cache: 'no-store', headers }, 20_000);
          if (response.ok) {
            data = await response.json().catch(() => null);
            setBriefing(data);
          }
        }
        const speech = data ? briefingSpeech(data, language) : t('w.noNotifications', language);
        setAnswer(speech);
        setQueueNote('');
        setDraft('');
        speak(speech, 'apollo');
        return;
      }
      const r = await mobileFetch('/api/olympus/prompt-queue', {
        method: 'POST',
        headers,
        body: JSON.stringify({ project: project || 'aime', text: q, source: 'phone', priority: 'high' }),
      }, 20_000);
      const d = await r.json().catch(() => null);
      if (r.ok && d?.ok) {
        setQueueNote(t('w.sent', language));
        setDraft('');
        setAnswer('');
        setQueue(Array.isArray(d?.items) ? d.items.slice(-8).reverse() : []);
      } else setQueueNote(d?.error || t('w.offline', language));
    } catch (e: any) { setQueueNote(e?.message || t('w.offline', language)); }
    finally { setSending(false); }
  }, [sending, headers, project, briefing, language, speak]);

  const card = { border: `1px solid ${palette.gold}22`, background: `${palette.card}cc` } as const;
  const dim = { color: palette.textDim } as const;
  const mono = 'font-mono tabular-nums';

  if (!token) {
    return (
      <main className="flex min-h-dvh items-center justify-center p-6" style={{ background: palette.bg, color: palette.text }}>
        <div className="max-w-sm text-center">
          <div className="text-[11px] font-semibold uppercase tracking-[0.3em]" style={{ color: palette.gold }}>OLYMPUS</div>
          <p className="mt-3 text-sm" style={dim}>Escaneie o QR de widget no OLYMPUS do PC para herdar a sessão.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-3 p-4 pb-[calc(env(safe-area-inset-bottom)+16px)]" style={{ background: palette.bg, color: palette.text }}>
      <header className="flex items-center gap-2">
        <span className="text-[12px] font-semibold tracking-[0.28em]" style={{ color: palette.gold }}>OLYMPUS</span>
        <span className="flex items-center gap-1 text-[9px] font-mono uppercase" style={{ color: palette.green }}>
          <Radio size={9} className={busy ? 'animate-pulse' : ''} /> live
        </span>
        <span className="ml-auto text-[8px] font-mono" style={dim}>{updatedAt || '—'}</span>
        <button
          onClick={() => { setNotifyOpen(true); notifications.markRead(); }}
          aria-label={t('w.notifications', language)}
          className="relative rounded p-1"
          style={{ color: notifications.unread > 0 ? palette.gold : palette.textDim }}
        >
          <Bell size={12} />
          {notifications.unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-3 min-w-3 items-center justify-center rounded-full px-0.5 text-[7px] font-bold" style={{ background: palette.gold, color: palette.bg }}>
              {notifications.unread > 9 ? '9+' : notifications.unread}
            </span>
          )}
        </button>
        <button onClick={() => void cycleTheme()} aria-label={`${t('w.theme', language)} · ${normalizeThemeState(theme).presetId}`} className="rounded p-1" style={dim}>
          <Palette size={12} />
        </button>
        <Link href="/m" aria-label="Abrir o app mobile OLYMPUS" className="rounded p-1" style={dim}>
          <Smartphone size={12} />
        </Link>
        <button onClick={() => void load()} aria-label="Refresh widget" className="rounded p-1" style={dim}>
          <RefreshCw size={12} className={busy ? 'animate-spin' : ''} />
        </button>
      </header>

      <section className="rounded-xl p-3" style={card}>
        <div className="flex items-center justify-between text-[9px] font-mono uppercase tracking-wider" style={dim}>
          <span>{project || 'campaign'}</span>
          <span style={{ color: state === 'running' ? palette.green : state === 'parked' ? palette.gold : palette.textDim }}>{state}</span>
        </div>
        <div className="mt-1 flex items-end justify-between">
          <div className={`${mono} text-2xl font-semibold`}>{completed}<span className="text-sm" style={dim}>/{total || '—'}</span></div>
          <div className={`${mono} text-lg`} style={{ color: palette.cyan }}>{total ? `${progress}%` : '—'}</div>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full" style={{ background: palette.bg }}>
          <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${progress}%`, background: palette.gold }} />
        </div>
        <p className="mt-2 line-clamp-2 text-[10px] leading-relaxed" style={dim}>{run?.line || t('m.waitingWalker', language)}</p>
        {inFlight.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {inFlight.slice(0, 4).map((h) => (
              <span key={h.hopId} className="rounded-full px-1.5 py-0.5 text-[9px] font-mono" style={{ border: `1px solid ${palette.cyan}44`, color: palette.cyan }}>
                {h.hopId}{h.god ? ` · ${h.god}` : ''}
              </span>
            ))}
          </div>
        )}
        {parked?.hopId && (
          <div className="mt-2 flex items-center gap-2">
            <p className="min-w-0 flex-1 text-[9px] font-mono" style={{ color: palette.gold }}>
              {t('w.parked', language)}: {parked.hopId}{parked.reason ? ` · ${parked.reason}` : ''}
            </p>
            <button
              onClick={() => void sendPrompt(`O hop ${parked.hopId} está parked (${parked.reason || 'sem motivo'}). Investigue o bloqueio e retome o walk.`)}
              className="shrink-0 rounded-full px-2 py-0.5 text-[9px] font-mono"
              style={{ border: `1px solid ${palette.gold}55`, color: palette.gold }}
            >
              {t('w.investigate', language)}
            </button>
          </div>
        )}
      </section>

      <section className="rounded-xl p-3" style={card}>
        <div className="flex items-center gap-1.5 text-[9px] font-mono uppercase tracking-wider" style={dim}>
          <Gauge size={10} style={{ color: palette.cyan }} /> {usage?.plan === 'go-plus' ? 'GO Plus' : (usage?.plan || 'GO')}
          <span className="ml-auto truncate" style={{ color: palette.gold }}>{binding}</span>
        </div>
        {[
          ['5h', h5],
          ['week', d7],
          ['month', mo],
        ].map(([label, value]) => {
          const v = typeof value === 'number' ? value : null;
          return (
            <div key={String(label)} className="mt-2 flex items-center gap-2">
              <span className="w-9 text-[9px] font-mono uppercase" style={dim}>{label}</span>
              <div className="h-1 flex-1 overflow-hidden rounded-full" style={{ background: palette.bg }}>
                <div className="h-full rounded-full" style={{ width: `${v ?? 0}%`, background: (v ?? 0) >= 90 ? palette.red : (v ?? 0) >= 70 ? palette.gold : palette.green }} />
              </div>
              <span className={`${mono} w-8 text-right text-[9px]`} style={{ color: palette.text }}>{v == null ? '—' : `${v}%`}</span>
            </div>
          );
        })}
        <div className="mt-2 flex items-center gap-2 text-[9px] font-mono" style={dim}>
          <Coins size={9} style={{ color: palette.gold }} />
          <span>step {money(step)}</span>
          <span className="ml-auto">list {money(listValue)}</span>
          <span style={{ color: palette.amberSoft }}>invoice {usage?.source === 'local-ledger' ? 'unknown' : '—'}</span>
        </div>
      </section>

      <CompanionBriefing
        briefing={briefing}
        language={language}
        palette={palette}
        busy={briefingBusy}
        onSpeak={speak}
        onInvestigate={(text) => void sendPrompt(text)}
        onRefresh={() => void refreshBriefing()}
      />

      <CompanionCaptures
        slug={briefing?.slug || project}
        token={token}
        language={language}
        palette={palette}
        screenshots={briefing?.screenshots || []}
        onCritique={(text) => void sendPrompt(text)}
      />

      <section className="rounded-xl p-3" style={card}>
        <div className="flex items-center gap-1.5 text-[9px] font-mono uppercase tracking-wider" style={dim}>
          <Send size={10} style={{ color: palette.gold }} /> {t('w.chat', language)}
          {queueNote && <span className="ml-auto normal-case" style={{ color: palette.cyan }}>{queueNote}</span>}
        </div>
        {answer && (
          <div className="mt-2 rounded-xl px-2.5 py-2 text-[10px] leading-relaxed" style={{ background: `${palette.gold}0d`, border: `1px solid ${palette.gold}22` }}>
            <div className="mb-1 flex items-center gap-1 text-[8px] font-mono uppercase tracking-[0.2em]" style={{ color: palette.gold }}>
              <Radio size={8} /> Apollo
              <button onClick={() => speak(answer, 'apollo')} aria-label={t('w.listen', language)} className="ml-auto rounded-full p-0.5" style={dim}><Bell size={8} /></button>
            </div>
            {answer}
          </div>
        )}
        {queue.slice(0, 3).map((q) => (
          <div key={q.id} className="mt-1.5 flex items-start gap-1.5 text-[9px]">
            <span className="mt-0.5 h-1 w-1 shrink-0 rounded-full" style={{ background: q.status === 'sent' ? palette.green : palette.gold }} />
            <span className="min-w-0 flex-1 line-clamp-2" style={{ color: palette.text }}>{q.text}</span>
            <span className="shrink-0 font-mono" style={{ color: q.status === 'sent' ? palette.green : palette.textDim }}>{q.status}</span>
          </div>
        ))}
        <div className="mt-2 flex items-center gap-1.5">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && draft.trim()) void sendPrompt(draft); }}
            placeholder={t('m.typeRequest', language)}
            aria-label={t('m.typeRequest', language)}
            className="min-w-0 flex-1 rounded-lg px-2 py-1.5 text-[11px] outline-none"
            style={{ background: palette.bg, border: `1px solid ${palette.gold}22`, color: palette.text }}
          />
          <button
            onClick={() => void sendPrompt(draft)}
            disabled={!draft.trim() || sending}
            className="rounded-lg px-2.5 py-1.5 text-[10px] font-mono disabled:opacity-40"
            style={{ background: `${palette.gold}22`, color: palette.gold, border: `1px solid ${palette.gold}44` }}
          >
            {sending ? t('w.sending', language) : t('w.sendCritique', language)}
          </button>
        </div>
        <p className="mt-1 text-[8px] font-mono" style={dim}>{t('w.chatHint', language)}</p>
      </section>

      <div className="flex flex-wrap items-center gap-2 text-[9px] font-mono" style={dim}>
        <Zap size={9} style={{ color: palette.gold }} />
        <span>{error ? `${t('w.offline', language)} · ${error}` : `app ↔ widget · ${t('w.noPcScreen', language)}`}</span>
        <div className="ml-auto flex items-center gap-1.5">
          <Link href="/m" className="inline-flex items-center gap-1 rounded-full px-2 py-0.5" style={{ border: `1px solid ${palette.cyan}55`, color: palette.cyan }}>
            <Smartphone size={9} /> app
          </Link>
          {pwa.installEvent && (
            <button onClick={() => void pwa.install()} className="inline-flex items-center gap-1 rounded-full px-2 py-0.5" style={{ border: `1px solid ${palette.gold}55`, color: palette.gold }}>
              <Download size={9} /> {t('m.installApp', language)}
            </button>
          )}
        </div>
      </div>

      <p className="text-center text-[8px] font-mono" style={dim}>
        {pwa.installed ? `${t('m.installed', language)} · ${t('w.noPcScreen', language)}` : t('m.installHint', language)}
      </p>

      <CompanionNotificationsSheet
        open={notifyOpen}
        onClose={() => setNotifyOpen(false)}
        state={notifications}
        language={language}
        palette={palette}
      />
      <CompanionToast state={notifications} language={language} palette={palette} onOpen={() => { setNotifyOpen(true); notifications.markRead(); }} />
    </main>
  );
}
