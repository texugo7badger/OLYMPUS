/**
 * artcraft-style-board.tsx — v0.0.32 (Epic Q): the style contract UI.
 *
 * One board: pick the palette/type/density/radius/motion, tick the references
 * that carry the intent, read the generated prompt, copy it, and enqueue the
 * direction with a named priority. The board never invents a color: every
 * token is visible and editable.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Layers, Loader2, Palette, RefreshCw, Send, Sparkles } from 'lucide-react';
import { generateLogos, generatePalettes } from '@/lib/design-generator';
import { cn } from '@/lib/utils';
import { useOlympus } from '@/lib/olympus-store';
import {
  DEFAULT_TOKENS,
  PROJECT_NEUTRAL,
  buildStylePrompt,
  normalizeStyleTokens,
  resolveColors,
  type PaletteId,
  type StyleReference,
  type StyleTokens,
} from '@/lib/artcraft';

type Priority = 'now' | 'high' | 'normal';

interface QueueItem {
  id: string;
  ts: string;
  title: string;
  priority: Priority;
  status: string;
}

export default function ArtcraftStyleBoard({
  references = [],
  pendingRef = null,
  onPendingConsumed,
}: {
  references?: StyleReference[];
  pendingRef?: StyleReference | null;
  onPendingConsumed?: () => void;
}) {
  const projectSlug = useOlympus((s) => s.activeProject?.slug ?? 'project');
  const projectName = useOlympus((s) => s.activeProject?.name ?? 'the project');
  const projectStacks = useOlympus((s) => s.activeProject?.stacks ?? []);
  const [tokens, setTokens] = useState<StyleTokens>({ ...DEFAULT_TOKENS, custom: PROJECT_NEUTRAL });
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [queueing, setQueueing] = useState(false);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [note, setNote] = useState<string | null>(null);
  // v0.0.32 — the identity generator (palettes + logo marks from the name).
  const [genSalt, setGenSalt] = useState(0);
  const [chosenLogo, setChosenLogo] = useState<string | null>(null);
  const logoRef = useRef<string | null>(null);
  // v0.0.32 — web references (Brave, link-only, provenance kept).
  const [webQuery, setWebQuery] = useState('');
  const [webBusy, setWebBusy] = useState(false);
  const [webResults, setWebResults] = useState<Array<StyleReference & { imageUrl?: string | null }>>([]);
  const [webError, setWebError] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const allRefs = useMemo(() => {
    const seen = new Set<string>();
    return [...references, ...webResults].filter((r) => {
      if (!r.demoUrl || seen.has(r.demoUrl)) return false;
      seen.add(r.demoUrl);
      return true;
    });
  }, [references, webResults]);
  const selectedRefs = useMemo(
    () => allRefs.filter((r) => picked.has(r.demoUrl)),
    [allRefs, picked],
  );
  const colors = resolveColors(tokens);
  const prompt = useMemo(
    () => buildStylePrompt({ project: projectName, tokens, references: selectedRefs }),
    [projectName, tokens, selectedRefs],
  );
  const [palettes, setPalettes] = useState<ReturnType<typeof generatePalettes>>([]);
  const [logos, setLogos] = useState<ReturnType<typeof generateLogos>>([]);
  const [editing, setEditing] = useState(false);
  // Athena's read: deterministic suggestions from the project seed, always
  // available (no LLM cost) and explained by the project's own stacks.
  const athenaSuggestions = useMemo(() => generatePalettes(`${projectSlug}-athena`, 3), [projectSlug]);
  const generateIdentity = useCallback(() => {
    const nextSalt = genSalt + 1;
    setGenSalt(nextSalt);
    setPalettes(generatePalettes(`${projectSlug}-${nextSalt}`, 6));
    setLogos(generateLogos({ name: projectName, accent: colors.accent, bg: colors.bg, text: colors.text }));
  }, [genSalt, projectSlug, projectName, colors.accent, colors.bg, colors.text]);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/olympus/artcraft?project=${encodeURIComponent(projectSlug)}`, { cache: 'no-store' });
      const d = await r.json();
      if (d?.ok) {
        setTokens(normalizeStyleTokens({ ...(d.tokens ?? {}), custom: d.tokens?.custom ?? PROJECT_NEUTRAL }));
        const urls: string[] = Array.isArray(d.references) ? d.references.map((x: any) => String(x?.demoUrl ?? '')) : [];
        setPicked(new Set(urls.filter(Boolean)));
        setSavedAt(d.updatedAt ?? null);
        if (typeof d.logo === 'string') { setChosenLogo(d.logo); logoRef.current = d.logo; }
      }
      const q = await fetch(`/api/olympus/artcraft/queue?project=${encodeURIComponent(projectSlug)}`, { cache: 'no-store' });
      const qd = await q.json();
      if (qd?.ok && Array.isArray(qd.items)) setQueue(qd.items.slice(0, 5));
    } catch {
      /* the board still works offline; save will narrate the failure */
    }
  }, [projectSlug]);

  useEffect(() => { void load(); }, [load]);

  // A reference carried from the catalog ("use") lands here: selected and
  // persisted with the direction.
  useEffect(() => {
    if (!pendingRef) return;
    setPicked((prev) => new Set(prev).add(pendingRef.demoUrl));
    setNote(`${pendingRef.name} added to the direction`);
    onPendingConsumed?.();
  }, [pendingRef, onPendingConsumed]);

  const persist = useCallback(async (nextTokens: StyleTokens, nextRefs: StyleReference[], nextLogo?: string | null) => {
    setSaving(true);
    try {
      const r = await fetch('/api/olympus/artcraft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project: projectSlug, tokens: nextTokens, references: nextRefs, ...(nextLogo ?? logoRef.current ? { logo: nextLogo ?? logoRef.current } : {}) }),
      });
      const d = await r.json();
      if (d?.ok) {
        setSavedAt(d.updatedAt ?? new Date().toISOString());
        setNote(null);
      } else {
        setNote(d?.error ?? 'save failed');
      }
    } catch (e: any) {
      setNote(e?.message || 'save failed');
    } finally {
      setSaving(false);
    }
  }, [projectSlug]);

  const chooseLogo = useCallback((svg: string) => {
    setChosenLogo(svg);
    logoRef.current = svg;
    void persist(tokens, selectedRefs, svg);
  }, [persist, tokens, selectedRefs]);

  const update = useCallback((patch: Partial<StyleTokens>) => {
    setTokens((prev) => {
      const next = normalizeStyleTokens({ ...prev, ...patch });
      const refs = allRefs.filter((ref) => picked.has(ref.demoUrl));
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => { void persist(next, refs); }, 700);
      return next;
    });
  }, [persist, picked, allRefs]);

  const toggleRef = useCallback((ref: StyleReference) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(ref.demoUrl)) next.delete(ref.demoUrl);
      else next.add(ref.demoUrl);
      const chosen = allRefs.filter((r) => next.has(r.demoUrl));
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => { void persist(tokens, chosen); }, 400);
      return next;
    });
  }, [persist, allRefs, tokens]);

  const searchWeb = useCallback(async () => {
    const q = webQuery.trim();
    if (q.length < 2) return;
    setWebBusy(true);
    setWebError(null);
    try {
      const r = await fetch(`/api/olympus/artcraft/web?q=${encodeURIComponent(q)}`, { cache: 'no-store' });
      const d = await r.json();
      if (d?.ok) {
        setWebResults(Array.isArray(d.results) ? d.results : []);
        if ((d.results ?? []).length === 0) setWebError('no results');
      } else {
        setWebError(d?.needsKey ? 'BRAVE_API_KEY missing — add it in API Keys' : (d?.error ?? 'search failed'));
      }
    } catch (e: any) {
      setWebError(e?.message || 'search failed');
    } finally {
      setWebBusy(false);
    }
  }, [webQuery]);

  const enqueue = useCallback(async () => {
    setQueueing(true);
    try {
      const r = await fetch('/api/olympus/artcraft/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project: projectSlug,
          title: `${projectName} — design direction`,
          prompt,
          tokens,
          references: selectedRefs,
          priority: 'now',
        }),
      });
      const d = await r.json();
      if (d?.ok) {
        setQueue((prev) => [d.item, ...prev].slice(0, 5));
        setNote("sent to the gods (priority now)");
      } else {
        setNote(d?.error ?? 'queue failed');
      }
    } catch (e: any) {
      setNote(e?.message || 'queue failed');
    } finally {
      setQueueing(false);
    }
  }, [projectName, projectSlug, prompt, tokens, selectedRefs]);

  const field = 'bg-olympus-bg border border-olympus-gold/20 rounded px-1.5 py-1 text-[10px] font-mono text-olympus-text outline-none focus:border-olympus-gold/50';

  return (
    <div className="absolute inset-0 overflow-auto">
      <div className="p-3 grid gap-3 lg:grid-cols-[1fr_1fr]">
        {/* direction */}
        <section className="rounded border border-olympus-gold/15 bg-olympus-panel/60 p-2.5">
          <header className="flex items-center gap-1.5 mb-2">
            <Palette size={12} className="text-olympus-gold" />
            <span className="text-[10px] font-mono font-semibold text-olympus-gold uppercase">style board</span>
            <span className="text-[8px] font-mono text-olympus-text-dim truncate">{projectSlug}</span>
            {picked.size > 0 && <span className="text-[8px] font-mono text-olympus-cyan">· {picked.size} ref</span>}
            {saving ? <Loader2 size={10} className="animate-spin text-olympus-gold ml-auto" /> : savedAt ? <span className="ml-auto text-[8px] font-mono text-olympus-text-dim">saved</span> : null}
          </header>

          {/* v0.0.32 — the PROJECT palette: neutral by default, generated or edited by the user. No OLYMPUS branding here. */}
          <div className="rounded border border-olympus-gold/15 bg-olympus-bg/40 p-2 mb-2">
            <div className="flex items-center gap-1.5 mb-1.5">
              <span className="text-[9px] font-mono uppercase tracking-wide text-olympus-text-dim">project palette</span>
              <button onClick={() => setEditing((v) => !v)} className="ml-auto text-[8px] font-mono px-1.5 py-0.5 rounded border border-olympus-gold/25 text-olympus-text-dim hover:text-olympus-text">
                {editing ? 'done' : 'edit'}
              </button>
            </div>
            <div className="flex items-center gap-1.5">
              {(['bg', 'surface', 'accent', 'text', 'muted'] as const).map((key) => (
                <label key={key} className="flex flex-col items-center gap-0.5">
                  <input
                    type="color"
                    value={colors[key]}
                    disabled={!editing}
                    onChange={(e) => update({ custom: { ...colors, [key]: e.target.value } })}
                    className={cn('w-7 h-7 rounded border border-olympus-gold/20 bg-transparent', editing ? 'cursor-pointer' : 'cursor-default opacity-90')}
                    aria-label={`${key} color`}
                  />
                  <span className="text-[7px] font-mono uppercase text-olympus-text-dim">{key}</span>
                </label>
              ))}
            </div>
            {editing && <p className="mt-1 text-[8px] font-mono text-olympus-text-dim">These colors drive the prompt, the logo variants and the generated pages.</p>}
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            <label className="text-[8px] font-mono text-olympus-text-dim uppercase">typography
              <select className={cn(field, 'w-full mt-0.5')} value={tokens.typography} onChange={(e) => update({ typography: e.target.value as any })}>
                <option value="geometric-sans">geometric sans</option>
                <option value="humanist-sans">humanist sans</option>
                <option value="serif-display">serif display</option>
                <option value="mono-technical">mono technical</option>
              </select>
            </label>
            <label className="text-[8px] font-mono text-olympus-text-dim uppercase">density
              <select className={cn(field, 'w-full mt-0.5')} value={tokens.density} onChange={(e) => update({ density: e.target.value as any })}>
                <option value="compact">compact</option>
                <option value="comfortable">comfortable</option>
                <option value="spacious">spacious</option>
              </select>
            </label>
            <label className="text-[8px] font-mono text-olympus-text-dim uppercase">radius
              <select className={cn(field, 'w-full mt-0.5')} value={tokens.radius} onChange={(e) => update({ radius: e.target.value as any })}>
                <option value="sharp">sharp</option>
                <option value="soft">soft</option>
                <option value="pill">pill</option>
              </select>
            </label>
            <label className="text-[8px] font-mono text-olympus-text-dim uppercase">motion
              <select className={cn(field, 'w-full mt-0.5')} value={tokens.motion} onChange={(e) => update({ motion: e.target.value as any })}>
                <option value="none">none</option>
                <option value="subtle">subtle</option>
                <option value="expressive">expressive</option>
              </select>
            </label>
          </div>

          <div className="flex items-center gap-2 mt-2">
            <label className="text-[8px] font-mono text-olympus-text-dim uppercase">accent</label>
            <input
              type="color"
              value={colors.accent}
              onChange={(e) => update({ accent: e.target.value })}
              className="w-7 h-6 bg-transparent border border-olympus-gold/20 rounded cursor-pointer"
              aria-label="accent color"
            />
            <span className="text-[9px] font-mono text-olympus-text-dim">{colors.accent}</span>
            {tokens.accent && <button onClick={() => update({ accent: undefined })} className="text-[8px] font-mono text-olympus-cyan hover:underline">preset</button>}
          </div>
        </section>

        {/* v0.0.32 — LIVE PREVIEW + accept. No prompt to copy: the direction
            is the object, the preview proves it, and "send" enqueues it with
            maximum priority for the gods. */}
        <section className="rounded border border-olympus-gold/15 bg-olympus-panel/60 p-2.5 flex flex-col min-h-0">
          <header className="flex items-center gap-1.5 mb-1.5">
            <Layers size={12} className="text-olympus-gold" />
            <span className="text-[10px] font-mono font-semibold text-olympus-gold uppercase">live preview</span>
            <span className="text-[8px] font-mono text-olympus-text-dim truncate">{projectName} — updates as you edit</span>
          </header>

          <div className="flex-1 min-h-[190px] rounded-lg overflow-hidden border border-olympus-gold/15" style={{ background: colors.bg }}>
            <div className="flex items-center gap-1.5 px-2 py-1" style={{ background: colors.surface, borderBottom: `1px solid ${colors.accent}22` }}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: colors.accent }} />
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: colors.muted }} />
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: colors.muted }} />
              <span className="ml-2 text-[7px] font-mono truncate" style={{ color: colors.muted }}>{projectSlug}.local</span>
            </div>
            <div className="p-3" style={{ color: colors.text }}>
              <div className="flex items-center gap-1.5">
                {chosenLogo
                  ? <img src={`data:image/svg+xml;utf8,${encodeURIComponent(chosenLogo)}`} alt="" width={26} height={26} className="rounded" />
                  : <span className="w-6 h-6 rounded flex items-center justify-center text-[9px] font-mono font-bold" style={{ background: colors.accent, color: colors.bg }}>{projectName.slice(0, 2).toUpperCase()}</span>}
                <span className="text-[10px] font-mono font-semibold truncate" style={{ color: colors.text }}>{projectName}</span>
                <span className="ml-auto text-[7px] font-mono px-1.5 py-0.5 rounded-full" style={{ background: `${colors.accent}22`, color: colors.accent }}>preview</span>
              </div>
              <h3 className="mt-3 text-[16px] font-semibold leading-tight" style={{ color: colors.text }}>Build something precise.</h3>
              <p className="mt-1 text-[9px] leading-relaxed" style={{ color: colors.muted }}>This page uses the project&apos;s palette, type and spacing — not the OLYMPUS chrome.</p>
              <div className="mt-2 flex items-center gap-1.5">
                <span className="text-[8px] font-mono px-2 py-1 rounded" style={{ background: colors.accent, color: colors.bg }}>get started</span>
                <span className="text-[8px] font-mono px-2 py-1 rounded border" style={{ borderColor: `${colors.accent}66`, color: colors.accent }}>learn more</span>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-1.5">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="rounded p-1.5" style={{ background: colors.surface }}>
                    <span className="block h-1 w-8 rounded-full mb-1" style={{ background: colors.accent }} />
                    <span className="block h-1 w-12 rounded-full" style={{ background: colors.muted, opacity: 0.5 }} />
                    <span className="block h-1 w-9 rounded-full mt-1" style={{ background: colors.muted, opacity: 0.35 }} />
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 mt-2">
            <button
              onClick={() => void enqueue()}
              disabled={queueing}
              className="flex-1 flex items-center justify-center gap-1 text-[9px] font-mono px-2 py-1.5 rounded bg-olympus-gold/15 text-olympus-gold ring-1 ring-olympus-gold/35 hover:bg-olympus-gold/25 disabled:opacity-50"
            >
              {queueing ? <Loader2 size={10} className="animate-spin" /> : <Send size={10} />} send to the gods · priority now
            </button>
            <button
              onClick={async () => {
                setQueueing(true);
                try {
                  const r = await fetch('/api/olympus/artcraft/queue', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      project: projectSlug,
                      title: `${projectName} — Athena, refine this direction`,
                      priority: 'now',
                      tokens,
                      references: selectedRefs,
                      prompt: `Refine this project's design direction WITH me. The project is ${projectName} (${projectStacks.join(', ') || 'no stacks declared'}). Read the intent, name what works and what does not, ask the three decisive questions, then propose the narrowed direction.\n\n${prompt}`,
                    }),
                  });
                  const d = await r.json();
                  if (d?.ok) setNote('Athena will refine this direction (priority now)');
                  else setNote(d?.error ?? 'queue failed');
                } catch (e: any) { setNote(e?.message || 'queue failed'); }
                finally { setQueueing(false); }
              }}
              className="flex items-center gap-1 text-[9px] font-mono px-2 py-1.5 rounded bg-olympus-purple/15 text-olympus-purple ring-1 ring-olympus-purple/30 hover:bg-olympus-purple/25"
            >
              <Sparkles size={10} /> Athena
            </button>
          </div>
          {note && <p className="text-[8px] font-mono text-olympus-amber-soft mt-1">{note}</p>}
          {queue.length > 0 && (
            <div className="mt-1.5 border-t border-olympus-gold/10 pt-1">
              {queue.slice(0, 3).map((q) => (
                <p key={q.id} className="text-[8px] font-mono text-olympus-text-dim truncate">
                  <span className="text-olympus-gold">{q.priority}</span> · {q.title}
                </p>
              ))}
            </div>
          )}

          <div className="mt-2 border-t border-olympus-gold/10 pt-1.5">
            <div className="flex items-center gap-1 mb-1">
              <Sparkles size={9} className="text-olympus-purple" />
              <span className="text-[8px] font-mono uppercase tracking-wide text-olympus-purple">Athena suggests</span>
              <span className="text-[7px] font-mono text-olympus-text-dim truncate">based on {projectStacks.join(' · ') || 'the project brief'}</span>
            </div>
            <div className="grid grid-cols-3 gap-1">
              {athenaSuggestions.map((p) => (
                <button key={p.id} onClick={() => update({ custom: p.colors })} className="group rounded-lg border border-olympus-gold/10 overflow-hidden text-left hover:border-olympus-purple/50 hover:-translate-y-0.5 transition-transform">
                  <span className="block h-12 p-1.5" style={{ background: p.colors.bg }}>
                    <span className="block h-1 w-8 rounded-full mb-1" style={{ background: p.colors.accent }} />
                    <span className="block h-1 w-12 rounded-full mb-1" style={{ background: p.colors.text, opacity: 0.7 }} />
                    <span className="block h-4 rounded" style={{ background: p.colors.surface }} />
                  </span>
                  <span className="flex items-center gap-1 px-1.5 py-1">
                    <span className="text-[8px] font-mono text-olympus-text-dim truncate">{p.name}</span>
                    <span className="ml-auto text-[7px] font-mono text-olympus-purple uppercase">apply</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* v0.0.32 — IDENTITY: generated palettes + logo marks from the name. */}
        <section className="rounded border border-olympus-gold/15 bg-olympus-panel/60 p-2.5 lg:col-span-2">
          <header className="flex items-center gap-1.5 mb-1.5">
            <Sparkles size={11} className="text-olympus-gold" />
            <span className="text-[10px] font-mono font-semibold text-olympus-gold uppercase">identity — {projectName}</span>
            <span className="text-[8px] font-mono text-olympus-text-dim">palettes + logo marks for THIS project</span>
            <button onClick={generateIdentity} className="ml-auto flex items-center gap-1 text-[8px] font-mono px-1.5 py-0.5 rounded bg-olympus-gold/10 text-olympus-gold ring-1 ring-olympus-gold/25 hover:bg-olympus-gold/20">
              <RefreshCw size={9} /> {palettes.length ? 'regenerate' : 'generate'}
            </button>
          </header>
          {palettes.length === 0 && (
            <div className="py-4 text-center">
              <p className="text-[9px] font-mono text-olympus-text-dim">Generate a palette and a logo family from the project name — nothing is generated until you ask.</p>
            </div>
          )}
          {palettes.length > 0 && (
          <div className="grid gap-2 lg:grid-cols-2">
            <div>
              <div className="text-[8px] font-mono text-olympus-text-dim uppercase mb-1">palettes</div>
              <div className="grid grid-cols-2 gap-1.5">
                {palettes.map((p) => {
                  const active = tokens.custom?.bg === p.colors.bg && tokens.custom?.accent === p.colors.accent;
                  return (
                    <button
                      key={p.id}
                      onClick={() => update({ custom: p.colors })}
                      className={cn('rounded border px-2 py-1.5 text-left transition-colors', active ? 'border-olympus-gold/60 bg-olympus-gold/10' : 'border-olympus-gold/10 hover:border-olympus-gold/35')}
                      aria-pressed={active}
                    >
                      <span className="flex gap-1">
                        {[p.colors.bg, p.colors.surface, p.colors.accent].map((c) => (
                          <span key={c} className="w-4 h-4 rounded-sm ring-1 ring-black/30" style={{ background: c }} />
                        ))}
                      </span>
                      <span className="block text-[9px] font-mono text-olympus-text mt-1 truncate">{p.name} <span className="text-[7px] text-olympus-text-dim">{p.dark ? 'dark' : 'light'}</span></span>
                    </button>
                  );
                })}
              </div>
              {tokens.custom && (
                <button onClick={() => update({ custom: undefined })} className="mt-1 text-[8px] font-mono text-olympus-cyan hover:underline">back to presets</button>
              )}
            </div>
            <div>
              <div className="text-[8px] font-mono text-olympus-text-dim uppercase mb-1">logo marks</div>
              <div className="grid grid-cols-3 gap-1.5">
                {logos.map((l) => {
                  const src = `data:image/svg+xml;utf8,${encodeURIComponent(l.svg)}`;
                  const active = chosenLogo === l.svg;
                  return (
                    <button
                      key={l.id}
                      onClick={() => chooseLogo(l.svg)}
                      data-tip={l.name}
                      aria-pressed={active}
                      className={cn('rounded border p-1 flex flex-col items-center gap-0.5 transition-colors', active ? 'border-olympus-gold/60 bg-olympus-gold/10' : 'border-olympus-gold/10 hover:border-olympus-gold/35')}
                    >
                      <img src={src} alt={l.name} width={56} height={56} className="rounded" />
                      <span className="text-[8px] font-mono text-olympus-text-dim uppercase truncate max-w-full">{l.name}</span>
                    </button>
                  );
                })}
              </div>
              {chosenLogo && (
                <div className="mt-1 flex items-center gap-1.5">
                  <img src={`data:image/svg+xml;utf8,${encodeURIComponent(chosenLogo)}`} alt="chosen logo" width={40} height={40} />
                  <button onClick={() => { try { void navigator.clipboard.writeText(chosenLogo); setNote('logo SVG copied'); } catch { setNote('clipboard blocked'); } }} className="text-[8px] font-mono px-1.5 py-0.5 rounded bg-olympus-cyan/10 text-olympus-cyan ring-1 ring-olympus-cyan/25">copy SVG</button>
                  <span className="text-[8px] font-mono text-olympus-text-dim">saved with the style</span>
                </div>
              )}
            </div>
          </div>
          )}
        </section>


      </div>
    </div>
  );
}
