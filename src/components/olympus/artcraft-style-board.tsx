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
import { Check, Copy, Loader2, Palette, Send, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useOlympus } from '@/lib/olympus-store';
import {
  DEFAULT_TOKENS,
  STYLE_PRESETS,
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

export default function ArtcraftStyleBoard({ references = [] }: { references?: StyleReference[] }) {
  const projectSlug = useOlympus((s) => s.activeProject?.slug ?? 'project');
  const projectName = useOlympus((s) => s.activeProject?.name ?? 'the project');
  const [tokens, setTokens] = useState<StyleTokens>(DEFAULT_TOKENS);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [priority, setPriority] = useState<Priority>('high');
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [queueing, setQueueing] = useState(false);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [note, setNote] = useState<string | null>(null);
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

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/olympus/artcraft?project=${encodeURIComponent(projectSlug)}`, { cache: 'no-store' });
      const d = await r.json();
      if (d?.ok) {
        setTokens(normalizeStyleTokens(d.tokens));
        const urls: string[] = Array.isArray(d.references) ? d.references.map((x: any) => String(x?.demoUrl ?? '')) : [];
        setPicked(new Set(urls.filter(Boolean)));
        setSavedAt(d.updatedAt ?? null);
      }
      const q = await fetch(`/api/olympus/artcraft/queue?project=${encodeURIComponent(projectSlug)}`, { cache: 'no-store' });
      const qd = await q.json();
      if (qd?.ok && Array.isArray(qd.items)) setQueue(qd.items.slice(0, 5));
    } catch {
      /* the board still works offline; save will narrate the failure */
    }
  }, [projectSlug]);

  useEffect(() => { void load(); }, [load]);

  const persist = useCallback(async (nextTokens: StyleTokens, nextRefs: StyleReference[]) => {
    setSaving(true);
    try {
      const r = await fetch('/api/olympus/artcraft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project: projectSlug, tokens: nextTokens, references: nextRefs }),
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

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setNote('clipboard blocked — select the prompt manually');
    }
  }, [prompt]);

  const enqueue = useCallback(async () => {
    setQueueing(true);
    try {
      const r = await fetch('/api/olympus/artcraft/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project: projectSlug,
          title: `${projectName} — ${STYLE_PRESETS[tokens.palette].label}`,
          prompt,
          tokens,
          references: selectedRefs,
          priority,
        }),
      });
      const d = await r.json();
      if (d?.ok) {
        setQueue((prev) => [d.item, ...prev].slice(0, 5));
        setNote(`queued (${priority})`);
      } else {
        setNote(d?.error ?? 'queue failed');
      }
    } catch (e: any) {
      setNote(e?.message || 'queue failed');
    } finally {
      setQueueing(false);
    }
  }, [projectName, projectSlug, prompt, tokens, selectedRefs, priority]);

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
            {saving ? <Loader2 size={10} className="animate-spin text-olympus-gold ml-auto" /> : savedAt ? <span className="ml-auto text-[8px] font-mono text-olympus-text-dim">saved</span> : null}
          </header>

          <div className="grid grid-cols-2 gap-1.5 mb-2">
            {(Object.keys(STYLE_PRESETS) as PaletteId[]).map((id) => {
              const p = STYLE_PRESETS[id];
              const active = tokens.palette === id;
              return (
                <button
                  key={id}
                  onClick={() => update({ palette: id, accent: undefined })}
                  className={cn('text-left rounded border px-2 py-1.5 transition-colors', active ? 'border-olympus-gold/60 bg-olympus-gold/10' : 'border-olympus-gold/15 hover:border-olympus-gold/40')}
                >
                  <span className="flex items-center gap-1">
                    {[p.colors.bg, p.colors.surface, p.colors.accent].map((c) => (
                      <span key={c} className="w-2.5 h-2.5 rounded-sm ring-1 ring-black/30" style={{ background: c }} />
                    ))}
                  </span>
                  <span className="block text-[9px] font-mono text-olympus-text mt-1 leading-tight">{p.label}</span>
                </button>
              );
            })}
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

        {/* prompt + queue */}
        <section className="rounded border border-olympus-gold/15 bg-olympus-panel/60 p-2.5 flex flex-col min-h-0">
          <header className="flex items-center gap-1.5 mb-1.5">
            <Sparkles size={12} className="text-olympus-gold" />
            <span className="text-[10px] font-mono font-semibold text-olympus-gold uppercase">prompt</span>
            <button onClick={copy} className="ml-auto flex items-center gap-1 text-[9px] font-mono px-1.5 py-0.5 rounded bg-olympus-cyan/10 text-olympus-cyan ring-1 ring-olympus-cyan/25 hover:bg-olympus-cyan/20">
              {copied ? <Check size={10} /> : <Copy size={10} />} {copied ? 'copied' : 'copy'}
            </button>
          </header>
          <textarea
            readOnly
            value={prompt}
            rows={12}
            className="w-full flex-1 min-h-[180px] bg-olympus-bg border border-olympus-gold/15 rounded p-2 text-[9px] leading-relaxed font-mono text-olympus-text resize-y outline-none"
          />
          <div className="flex items-center gap-1.5 mt-2">
            <select className={cn(field, 'flex-1')} value={priority} onChange={(e) => setPriority(e.target.value as Priority)} aria-label="priority">
              <option value="now">priority: now</option>
              <option value="high">priority: high</option>
              <option value="normal">priority: normal</option>
            </select>
            <button
              onClick={enqueue}
              disabled={queueing}
              className="flex items-center gap-1 text-[9px] font-mono px-2 py-1 rounded bg-olympus-gold/15 text-olympus-gold ring-1 ring-olympus-gold/30 hover:bg-olympus-gold/25 disabled:opacity-50"
            >
              {queueing ? <Loader2 size={10} className="animate-spin" /> : <Send size={10} />} queue
            </button>
          </div>
          {note && <p className="text-[8px] font-mono text-olympus-amber-soft mt-1">{note}</p>}
          {queue.length > 0 && (
            <div className="mt-2 border-t border-olympus-gold/10 pt-1.5">
              <span className="text-[8px] font-mono text-olympus-text-dim uppercase">queued</span>
              {queue.map((q) => (
                <p key={q.id} className="text-[8px] font-mono text-olympus-text truncate">
                  <span className="text-olympus-gold">{q.priority}</span> · {q.title}
                </p>
              ))}
            </div>
          )}
        </section>

        {/* reference picker */}
        <section className="rounded border border-olympus-gold/15 bg-olympus-panel/60 p-2.5 lg:col-span-2">
          <header className="flex items-center gap-1.5 mb-1.5">
            <span className="text-[10px] font-mono font-semibold text-olympus-gold uppercase">references</span>
            <span className="text-[8px] font-mono text-olympus-text-dim">link only — never a copied asset without a license</span>
            <span className="ml-auto text-[8px] font-mono text-olympus-text-dim">{picked.size} selected</span>
          </header>
          <div className="flex items-center gap-1.5 mb-1.5">
            <input
              value={webQuery}
              onChange={(e) => setWebQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void searchWeb(); }}
              placeholder="search the web for a visual reference — e.g. editorial dashboard, warm brutalist, glass cards"
              className={cn(field, 'flex-1')}
            />
            <button onClick={() => void searchWeb()} disabled={webBusy} className="flex items-center gap-1 text-[9px] font-mono px-2 py-1 rounded bg-olympus-cyan/10 text-olympus-cyan ring-1 ring-olympus-cyan/25 hover:bg-olympus-cyan/20 disabled:opacity-50">
              {webBusy ? <Loader2 size={10} className="animate-spin" /> : <Sparkles size={10} />} web
            </button>
          </div>
          {webError && <p className="text-[8px] font-mono text-olympus-amber-soft mb-1">{webError}</p>}
          <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3 max-h-40 overflow-auto">
            {allRefs.length === 0 && <p className="text-[9px] font-mono text-olympus-text-dim">no references loaded</p>}
            {allRefs.map((r) => (
              <label key={r.demoUrl} className="flex items-start gap-1.5 rounded border border-olympus-gold/10 px-1.5 py-1 cursor-pointer hover:border-olympus-gold/30">
                <input type="checkbox" checked={picked.has(r.demoUrl)} onChange={() => toggleRef(r)} className="mt-0.5 accent-[#D4A574]" />
                <span className="min-w-0">
                  <span className="block text-[9px] font-mono text-olympus-text truncate">{r.name}</span>
                  <span className="block text-[8px] font-mono text-olympus-text-dim truncate">{r.category ?? r.library ?? ''}</span>
                </span>
              </label>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
