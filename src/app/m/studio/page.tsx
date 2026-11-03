'use client';

/**
 * /m/studio — v0.0.63: creativity, sized for the hand.
 *
 * The desktop's ImmersivePanel is a three-column surface (gods, constellation,
 * orb). A phone cannot host that grid, so this page keeps the SAME visual
 * language and the SAME machinery — MobileAmbient particles, PlasmaOrb, the
 * per-god voice (`speakAs`), the live run-state and the studio chat — stacked
 * in one column with 44px targets.
 *
 * No new theme, no new reference, no new panel: this is the existing studio
 * adapted to the phone (the v0.0.63 surface freeze).
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2, Mic, Send, Sparkles, Volume2, VolumeX } from 'lucide-react';
import MobileAmbient from '@/components/olympus/mobile-ambient';
import PlasmaOrb from '@/components/olympus/plasma-orb';
import { normalizeThemeState, resolvePalette, type ThemeState } from '@/lib/theme';
import { speechLocale, t, useLanguage } from '@/lib/i18n';
import { godPersona } from '@/lib/god-personas';
import { godName } from '@/lib/i18n';
import { GOD_VOICE, setVoiceEnabled, speakAs, voiceEnabled } from '@/lib/voice';

const GOD_IDS = ['apollo', 'atlas', 'artemis', 'athena', 'dionysus', 'hephaestus', 'hermes', 'persephone', 'prometheus', 'callimachus'];

const TOKEN_KEY = 'olympus:mobile-token';
const THEME_KEY = 'olympus:mobile-theme';
const AMBIENT_KEY = 'olympus:mobile-ambient';

type RunState = {
  line?: string;
  campaign?: { state?: string };
  hops?: {
    completed?: number;
    total?: number;
    inFlightList?: Array<{ hopId: string; god?: string }>;
    parked?: { hopId?: string; reason?: string } | null;
  };
};

type ChatMsg = { role: 'user' | 'god'; text: string; god?: string };

function godTint(palette: ReturnType<typeof resolvePalette>, god: string): string {
  const map: Record<string, string> = {
    apollo: palette.gold, atlas: palette.amberSoft, artemis: palette.red, athena: palette.purple,
    dionysus: palette.green, hephaestus: palette.blue, hermes: palette.cyan,
    persephone: palette.amber, prometheus: palette.teal, callimachus: palette.amberSoft,
  };
  return map[god] ?? palette.cyan;
}

export default function MobileStudio() {
  const language = useLanguage();
  const [token, setToken] = useState<string | null>(null);
  const [theme, setTheme] = useState<ThemeState | null>(null);
  const [ambient, setAmbient] = useState(true);
  const [god, setGod] = useState('apollo');
  const [run, setRun] = useState<RunState | null>(null);
  const [voice, setVoice] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [level, setLevel] = useState(0);
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const levelGate = useRef(0);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    try { setToken(localStorage.getItem(TOKEN_KEY)); } catch { /* private */ }
    try { setAmbient(localStorage.getItem(AMBIENT_KEY) !== 'off'); } catch { /* default on */ }
    setVoice(voiceEnabled());
    try {
      const cached = localStorage.getItem(THEME_KEY);
      if (cached) setTheme(JSON.parse(cached));
    } catch { /* private */ }
    fetch('/api/olympus/theme', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.ok && d.state) setTheme(d.state); })
      .catch(() => { /* offline */ });
  }, []);

  const headers = useMemo<Record<string, string>>(() => {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) h['x-olympus-token'] = token;
    return h;
  }, [token]);

  useEffect(() => {
    if (!token) return;
    const load = () => {
      if (document.visibilityState === 'hidden') return;
      fetch('/api/olympus/run-state', { cache: 'no-store', headers })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => { if (d) setRun(d); })
        .catch(() => { /* offline */ });
    };
    load();
    const timer = setInterval(load, 5000);
    return () => clearInterval(timer);
  }, [token, headers]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ block: 'end' });
  }, [chat, busy]);

  const palette = useMemo(() => resolvePalette(normalizeThemeState(theme)), [theme]);
  const tint = godTint(palette, god);
  const persona = godPersona(god, language);
  const voiceProfile = GOD_VOICE[god] ?? GOD_VOICE.apollo;

  const onLevel = useCallback((v: number) => {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (now - levelGate.current < 90) return;
    levelGate.current = now;
    setLevel(v);
  }, []);

  const speak = useCallback((text: string) => {
    void speakAs(text, god, language, setSpeaking, onLevel);
  }, [god, language, onLevel]);

  const toggleVoice = () => {
    setVoice((v) => {
      const next = !v;
      setVoiceEnabled(next);
      if (!next && typeof window !== 'undefined') window.speechSynthesis?.cancel();
      return next;
    });
  };

  const ask = useCallback(async (override?: string) => {
    const question = (override ?? input).trim();
    if (!question || busy) return;
    setInput('');
    setChat((prev) => [...prev, { role: 'user' as const, text: question }].slice(-10));
    setBusy(true);
    setError(null);
    try {
      let answer = '';
      try {
        const r = await fetch('/api/olympus/studio/converse', {
          method: 'POST',
          headers: { ...headers, 'x-olympus-language': language },
          body: JSON.stringify({ message: question, god, language }),
        });
        if (r.ok) {
          const d = await r.json();
          if (d?.ok && d.answer) answer = String(d.answer);
        }
      } catch { /* fall through */ }
      if (!answer) {
        const r = await fetch('/api/olympus/studio/chat', {
          method: 'POST',
          headers: { ...headers, 'x-olympus-language': language },
          body: JSON.stringify({ question, god, language }),
        });
        const d = await r.json().catch(() => null);
        answer = String(d?.answer || t('m.studioIdle', language));
      }
      setChat((prev) => [...prev, { role: 'god' as const, text: answer, god }].slice(-10));
      if (voice) speak(answer);
    } catch {
      setError(t('m.connectionFailed', language));
    } finally {
      setBusy(false);
    }
  }, [input, busy, headers, language, god, voice, speak]);

  const mic = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { setError(t('m.voiceUnsupported', language)); return; }
    const rec = new SR();
    rec.lang = speechLocale(language);
    rec.interimResults = true;
    rec.continuous = false;
    rec.onresult = (ev: any) => {
      let heard = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) heard += ev.results[i][0].transcript;
      setInput((prev) => `${prev} ${heard}`.trim());
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    setListening(true);
    rec.start();
  };

  const inFlight = run?.hops?.inFlightList ?? [];
  const completed = Number(run?.hops?.completed ?? 0);
  const total = Number(run?.hops?.total ?? 0);
  const pct = total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0;

  return (
    <main className="relative min-h-dvh bg-olympus-bg text-olympus-text pb-[env(safe-area-inset-bottom)]">
      <MobileAmbient theme={theme} enabled={ambient} />
      <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-olympus-gold/10 bg-olympus-bg/95 px-3 pt-[calc(env(safe-area-inset-top)+8px)] pb-2.5 backdrop-blur">
        <Link
          href="/m"
          aria-label={t('m.studioBack', language)}
          className="flex h-11 w-11 items-center justify-center rounded-full border border-olympus-gold/20 text-olympus-gold"
        >
          <ArrowLeft size={17} />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-olympus-gold">{t('m.studioTitle', language)}</div>
          <div className="truncate text-[10px] text-olympus-text-dim">{t('m.studioHint', language)}</div>
        </div>
        <button
          onClick={toggleVoice}
          aria-pressed={voice}
          aria-label={t('m.studioSpeak', language)}
          className={`flex h-11 w-11 items-center justify-center rounded-full border ${voice ? 'border-olympus-green/50 text-olympus-green' : 'border-olympus-gold/20 text-olympus-text-dim'}`}
        >
          {voice ? <Volume2 size={17} /> : <VolumeX size={17} />}
        </button>
      </header>

      <section className="relative z-10 mx-auto w-full max-w-lg px-3 pt-3 space-y-3">
        {/* the god + the orb */}
        <div className="rounded-2xl border border-olympus-gold/15 bg-olympus-panel p-4">
          <div className="flex items-center gap-2">
            <Sparkles size={13} style={{ color: tint }} />
            <span className="text-[11px] font-semibold" style={{ color: tint }}>{persona.name}</span>
            <span className="truncate text-[10px] text-olympus-text-dim">{persona.epithet}</span>
          </div>
          <div className="mt-3 flex flex-col items-center">
            <button
              onClick={() => { const intro = `${persona.name} — ${persona.epithet}. ${persona.domain}. ${persona.tone}.`; setChat((p) => [...p, { role: 'god' as const, text: intro, god }].slice(-10)); if (voice) speak(intro); }}
              aria-label={`${t('m.studioSpeak', language)} · ${persona.name}`}
              className="relative flex h-44 w-44 items-center justify-center rounded-full"
              style={{
                background: 'radial-gradient(circle at 50% 45%, #0B0B16 0%, #06060C 56%, rgba(6,6,12,0.55) 72%, transparent 80%)',
                boxShadow: `0 0 ${speaking ? 64 : 34}px ${tint}55, inset 0 0 0 1px ${tint}33`,
              }}
            >
              <span className="absolute inset-0 rounded-full" style={{ background: `radial-gradient(circle at 50% 45%, ${tint}18, transparent 72%)` }} />
              <PlasmaOrb tint={tint} speaking={speaking && voice} level={level} size={176} />
            </button>
            <div className="mt-2 grid w-full grid-cols-2 gap-x-3 gap-y-1 text-[10px]">
              <span className="text-olympus-text-dim">{t('m.domain', language)}</span>
              <span className="truncate text-olympus-text">{persona.domain}</span>
              <span className="text-olympus-text-dim">{t('m.tone', language)}</span>
              <span className="text-olympus-text">{persona.tone}</span>
            </div>
            <select
              value={god}
              onChange={(e) => setGod(e.target.value)}
              aria-label={t('m.studioGods', language)}
              className="mt-3 w-full rounded-xl border border-olympus-gold/20 bg-olympus-bg px-3 py-2.5 text-sm outline-none"
              style={{ borderColor: `${tint}44` }}
            >
              {GOD_IDS.map((g) => (
                <option key={g} value={g}>{godName(g, language)}</option>
              ))}
            </select>
            <p className="mt-2 text-center text-[10px] text-olympus-text-dim">
              {voice ? t('m.studioSpeak', language) : t('m.studioHint', language)} · {voiceProfile.rate.toFixed(2)}× / {voiceProfile.pitch.toFixed(2)}
            </p>
          </div>
        </div>

        {/* the campaign, live */}
        <div className="rounded-2xl border border-olympus-gold/10 bg-olympus-card p-3">
          <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-olympus-text-dim">
            <span>{t('m.studioGods', language)}</span>
            <span>{completed}/{total} {t('m.hops', language)}</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-olympus-bg">
            <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${pct}%`, background: tint }} />
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-olympus-text-dim break-words">
            {run?.line || t('m.studioIdle', language)}
          </p>
          {inFlight.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {inFlight.map((h) => (
                <span key={h.hopId} className="rounded-full border px-2 py-0.5 text-[10px]" style={{ borderColor: `${godTint(palette, h.god || 'apollo')}44`, color: godTint(palette, h.god || 'apollo') }}>
                  {h.hopId}{h.god ? ` · ${h.god}` : ''}
                </span>
              ))}
            </div>
          )}
          {run?.hops?.parked?.hopId && (
            <p className="mt-2 text-[10px] text-olympus-gold">
              {t('m.parkedAt', language)} {run.hops.parked.hopId}{run.hops.parked.reason ? ` — ${run.hops.parked.reason}` : ''}
            </p>
          )}
        </div>

        {/* the conversation */}
        <div className="rounded-2xl border border-olympus-gold/15 bg-olympus-panel p-3">
          <div className="max-h-[38dvh] space-y-1.5 overflow-y-auto pr-0.5">
            {chat.length === 0 ? (
              <p className="text-[11px] leading-relaxed text-olympus-text-dim">{t('m.studioHint', language)}</p>
            ) : chat.map((m, i) => (
              <div key={`${m.role}:${i}`} className={m.role === 'user' ? 'text-right' : 'text-left'}>
                <span
                  className="inline-block max-w-full whitespace-pre-wrap rounded-xl px-2.5 py-2 text-left text-[12px] leading-relaxed"
                  style={{
                    background: m.role === 'user' ? `${palette.gold}18` : `${godTint(palette, m.god || god)}14`,
                    border: `1px solid ${m.role === 'user' ? palette.gold : godTint(palette, m.god || god)}33`,
                  }}
                >{m.text.replace(/\*\*/g, '')}</span>
              </div>
            ))}
            {busy && (
              <p className="flex items-center gap-1.5 text-[10px] text-olympus-text-dim">
                <Loader2 size={11} className="animate-spin" /> {t('m.studioThinking', language)}
              </p>
            )}
            <div ref={chatEndRef} />
          </div>
          <div className="mt-2 flex items-center gap-2">
            <button
              onClick={mic}
              aria-label={t('m.voiceInput', language)}
              className={`flex h-11 w-11 items-center justify-center rounded-full border ${listening ? 'border-olympus-green text-olympus-green animate-pulse' : 'border-olympus-gold/25 text-olympus-gold'}`}
            >
              <Mic size={16} />
            </button>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void ask(); } }}
              placeholder={t('m.studioSay', language)}
              aria-label={t('m.studioSay', language)}
              className="min-w-0 flex-1 rounded-xl border border-olympus-gold/20 bg-olympus-bg px-3 py-2.5 text-base outline-none placeholder:text-olympus-text-dim"
            />
            <button
              onClick={() => void ask()}
              disabled={busy || !input.trim()}
              aria-label={t('m.studioSpeak', language)}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-olympus-gold text-olympus-bg disabled:opacity-40"
            >
              <Send size={16} />
            </button>
          </div>
          {error && <p className="mt-2 text-[10px] text-olympus-red">{error}</p>}
        </div>

        <div className="h-4" />
      </section>
    </main>
  );
}
