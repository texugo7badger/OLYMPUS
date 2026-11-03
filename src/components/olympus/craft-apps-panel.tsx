/**
 * craft-apps-panel.tsx — W-M CRAFT-VENDOR (v0.0.8): the thirteen ArtCraft
 * Crafting Apps DOWNLOADED INSIDE OLYMPUS — the pane embeds the VENDORED
 * web build served from the OLYMPUS origin (~/.olympus/craft-apps via the
 * serve route), never the upstream site as the primary lane. No login
 * ever: the self-hosted WASM builds run on our disk. Auto-update is ON
 * (the background sweep + the per-card Update chip). The native lane
 * (the "downloaded app" escalation) installs the per-OS portable build
 * and launches its own window; the agents drive it via the olympus-craft
 * MCP + the upstream CLI/JSON channel. The live web build stays as the
 * honest fallback (W-G probe layer intact); the References tab (W-J)
 * rides untouched.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import OlympusLoader from './olympus-loader';
import { Boxes, ExternalLink, RefreshCw, X, ChevronLeft, LayoutGrid, Lightbulb, Download, MonitorUp, Play, HardDriveDownload, Palette, Sparkles, Maximize2, Bookmark, BookmarkCheck, Copy, MessageSquare, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useOlympus } from '@/lib/olympus-store';
import ArtcraftStyleBoard from './artcraft-style-board';
import DesignBuildsPanel from './design-builds-panel';
import ReferencePreview from './reference-preview';
import { previewFor } from '@/lib/reference-previews';
import { useLanguage, t, categoryName, searchTerms } from '@/lib/i18n';

interface CraftApp {
  id: string;
  name: string;
  category: string;
  status: string;
  url: string;
  repo: string;
  license: string;
}

interface Probe {
  id: string;
  url: string;
  ok: boolean;
  frameable: boolean;
  httpStatus: number | null;
  note?: string;
}

/** The vendored truth (src/lib/craft-vendor.ts getVendorStatus). */
interface VendorStatus {
  id: string;
  vendored: boolean;
  version: string | null;
  latestVersion: string | null;
  updateAvailable: boolean;
  serveUrl: string | null;
  webUrl: string;
  nativeInstalled: boolean;
  nativeVersion: string | null;
  nativeRunning: boolean;
  nativeUpdateAvailable: boolean;
  sizeBytes: number | null;
  verified: boolean;
}

interface VendorJob {
  id: string;
  app: string;
  lane: 'web' | 'native';
  phase: string;
  progress: number;
  bytes?: number;
  totalBytes?: number;
  version?: string;
  error?: string;
}

type View =
  | { kind: 'grid' }
  | { kind: 'app'; app: CraftApp; src: string; local: boolean; probe: Probe | null }
  | { kind: 'get'; app: CraftApp; probe: Probe | null };
type PaneTab = 'apps' | 'references' | 'style' | 'builds';

interface UiRef {
  id: string;
  name: string;
  library: 'originkit' | 'skiper' | 'magicui';
  category: string;
  what: string;
  demoUrl: string;
  fetchLane: string;
  free: boolean;
  probe: { ok: boolean; frameable: boolean; inconclusive?: boolean; httpStatus: number | null };
}

export default function CraftAppsPanel({ initialApp }: { initialApp?: string | null }) {
  const language = useLanguage();
  const [apps, setApps] = useState<CraftApp[]>([]);
  const [studio, setStudio] = useState<CraftApp | null>(null);
  const [probes, setProbes] = useState<Record<string, Probe>>({});
  const [vendor, setVendor] = useState<Record<string, VendorStatus>>({});
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>({ kind: 'grid' });
  const [tab, setTab] = useState<PaneTab>('apps');
  const [jobs, setJobs] = useState<Record<string, VendorJob>>({});
  const [uiRefs, setUiRefs] = useState<UiRef[]>([]);
  const [refSearch, setRefSearch] = useState('');
  const [refView, setRefView] = useState<UiRef | null>(null);
  const [refVariant, setRefVariant] = useState('');
  // v0.0.32 — live previews: at most 3 iframes (60fps), hover promotes one.
  const [refCat, setRefCat] = useState('all');
  const [refLib, setRefLib] = useState('all');
  const [refLimit, setRefLimit] = useState(60);
  const [pendingRef, setPendingRef] = useState<{ name: string; demoUrl: string; category: string; library: string } | null>(null);
  // #198 — the OriginKit free-tier budget (10 fetches/day), surfaced in the
  // References tab so exhaustion never looks like a broken lane.
  const [originkitBudget, setOriginkitBudget] = useState<{ limit: number; remaining: number; exhausted: boolean; resetAt: string } | null>(null);
  // v0.0.43 — DESIGN MEMORY: named references the user chose to keep.
  const activeProject = useOlympus((s) => s.activeProject);
  const projectSlug = activeProject?.slug ?? 'project';
  const [memory, setMemory] = useState<Array<{ id: string; name: string; library: string; note: string; savedAt: string }>>([]);
  const [memoryOnly, setMemoryOnly] = useState(false);
  const memoryIds = new Set(memory.map((m) => m.id));
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async (check = false) => {
    setLoading(true);
    try {
      const r = await fetch(`/api/olympus/craft-apps${check ? '?check=1' : ''}`, { cache: 'no-store' });
      const d = await r.json();
      setApps(d.apps || []);
      setStudio(d.studio || null);
      const map: Record<string, Probe> = {};
      for (const p of d.probes || []) map[new URL(p.url).pathname.split('/').filter(Boolean).pop() || p.url] = p;
      setProbes(map);
      const vmap: Record<string, VendorStatus> = {};
      for (const v of d.vendor || []) vmap[v.id] = v;
      setVendor(vmap);
    } catch { /* the honest empty grid */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // W-J: the references loader (the tab's first paint + the search debounces).
  const loadRefs = useCallback(async (q: string) => {
    try {
      const r = await fetch(`/api/olympus/ui-references${q ? `?q=${encodeURIComponent(q)}` : ''}`, { cache: 'no-store' });
      const d = await r.json();
      if (Array.isArray(d?.references)) setUiRefs(d.references);
    } catch { /* the honest empty */ }
  }, []);
  useEffect(() => { loadRefs(''); }, [loadRefs]);
  const loadMemory = useCallback(async () => {
    try {
      const r = await fetch(`/api/olympus/design-memory?project=${encodeURIComponent(projectSlug)}`, { cache: 'no-store' });
      const d = await r.json();
      if (Array.isArray(d?.memory)) setMemory(d.memory);
    } catch { /* the honest empty */ }
  }, [projectSlug]);
  useEffect(() => { if (tab === 'references') void loadMemory(); }, [tab, loadMemory]);
  useEffect(() => { setRefLimit(60); }, [refCat, refLib, refSearch]);

  // #198 — poll the budget while the References tab is open (a god may fetch
  // while the user watches; the count stays honest).
  useEffect(() => {
    if (tab !== 'references') return;
    let alive = true;
    const pull = async () => {
      try {
        const r = await fetch('/api/olympus/originkit-budget', { cache: 'no-store' });
        const d = await r.json();
        if (alive && d?.budget) setOriginkitBudget(d.budget);
      } catch { /* the chip stays on its last honest value */ }
    };
    void pull();
    const iv = setInterval(pull, 15_000);
    return () => { alive = false; clearInterval(iv); };
  }, [tab]);

  // The install/update job poll — one interval while any job is live.
  useEffect(() => {
    const active = Object.values(jobs).filter((j) => j.phase !== 'done' && j.phase !== 'error');
    if (active.length === 0) { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } return; }
    if (pollRef.current) return;
    pollRef.current = setInterval(async () => {
      const ids = Object.values(jobs).filter((j) => j.phase !== 'done' && j.phase !== 'error').map((j) => j.id);
      if (ids.length === 0) return;
      const next: Record<string, VendorJob> = {};
      let anyDone = false;
      for (const id of ids) {
        try {
          const r = await fetch(`/api/olympus/craft-apps?action=job&id=${encodeURIComponent(id)}`, { cache: 'no-store' });
          const d = await r.json();
          if (d?.job) { next[id] = d.job; if (d.job.phase === 'done') anyDone = true; }
        } catch { /* keep polling */ }
      }
      setJobs((prev) => {
        const merged = { ...prev, ...next };
        for (const id of Object.keys(merged)) if (merged[id].phase === 'done' || merged[id].phase === 'error') {
          setTimeout(() => setJobs((p) => { const c = { ...p }; delete c[id]; return c; }), 4000);
        }
        return merged;
      });
      if (anyDone) load();
    }, 900);
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, [jobs, load]);

  const install = useCallback(async (app: CraftApp, lane: 'web' | 'native') => {
    try {
      const r = await fetch('/api/olympus/craft-apps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'install', app: app.id, lane }),
      });
      const d = await r.json();
      if (d?.ok && d.jobId) setJobs((prev) => ({ ...prev, [d.jobId]: { id: d.jobId, app: app.id, lane, phase: 'checking', progress: 0 } }));
    } catch { /* the honest no-op */ }
  }, []);

  const launchNative = useCallback(async (app: CraftApp) => {
    try {
      await fetch('/api/olympus/craft-apps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'launch', app: app.id }),
      });
      setTimeout(() => load(), 1500);
    } catch { /* the honest no-op */ }
  }, [load]);

  // The atelier handoff: the studio lands embedded live; a vendored app
  // opens from OUR origin; an unvendored one opens the Get view.
  useEffect(() => {
    if (!initialApp) return;
    (async () => {
      const r = await fetch(`/api/olympus/craft-apps?app=${encodeURIComponent(initialApp)}`, { cache: 'no-store' }).catch(() => null);
      const d = r ? await r.json().catch(() => null) : null;
      if (!d?.ok) return;
      if (initialApp === 'artcraft-studio') {
        const target: CraftApp = { id: 'artcraft-studio', name: 'ArtCraft Studio', category: 'AI image & video crafting', status: 'Live', url: d.probe.url, repo: 'storytold/artcraft', license: 'MIT / Apache-2.0' };
        setView({ kind: 'app', app: target, src: d.probe.url, local: false, probe: d.probe });
        return;
      }
      const app = apps.find((a) => a.id === initialApp);
      if (!app) return;
      const v = d.vendor as VendorStatus | null;
      if (v?.vendored && v.serveUrl) setView({ kind: 'app', app, src: `${v.serveUrl}index.html`, local: true, probe: d.probe });
      else setView({ kind: 'get', app, probe: d.probe });
    })();
  }, [initialApp, apps]);

  const openApp = async (app: CraftApp) => {
    const v = vendor[app.id];
    if (v?.vendored && v.serveUrl) {
      setView({ kind: 'app', app, src: `${v.serveUrl}index.html`, local: true, probe: null });
      return;
    }
    setView({ kind: 'get', app, probe: null });
    const r = await fetch(`/api/olympus/craft-apps?app=${encodeURIComponent(app.id)}`, { cache: 'no-store' }).catch(() => null);
    const d = r ? await r.json().catch(() => null) : null;
    if (d?.ok && d.probe) setView((cur) => (cur.kind === 'get' && cur.app.id === app.id ? { kind: 'get', app, probe: d.probe } : cur));
  };

  const openStudio = async (target: CraftApp) => {
    setView({ kind: 'app', app: target, src: target.url, local: false, probe: null });
    const r = await fetch(`/api/olympus/craft-apps?app=${encodeURIComponent(target.id)}`, { cache: 'no-store' }).catch(() => null);
    const d = r ? await r.json().catch(() => null) : null;
    if (d?.ok && d.probe) setView((cur) => (cur.kind === 'app' && cur.app.id === target.id ? { kind: 'app', app: target, src: target.url, local: false, probe: d.probe } : cur));
  };

  const probeFor = (id: string, url: string): Probe | null => {
    const key = new URL(url).pathname.split('/').filter(Boolean).pop() || url;
    return probes[key] ?? probes[id] ?? null;
  };

  const letterMark = (name: string) => name.replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase();

  /** The app tile: the REAL logo, with the letter mark only as the
   *  on-error fallback (never rendered over the image — the 16:04
   *  specimen: the absolute overlay sat ON TOP of every logo). */
  const AppLogo = ({ id, name, tileCls, imgCls, letterCls }: { id: string; name: string; tileCls: string; imgCls: string; letterCls: string }) => {
    const [failed, setFailed] = useState(false);
    return (
      <span className={tileCls}>
        {failed
          ? <span className={letterCls}>{letterMark(name)}</span>
          : <img src={`/craft-apps/logos/${id}.png`} alt="" className={imgCls} loading="lazy" onError={() => setFailed(true)} />}
      </span>
    );
  };

  const jobFor = (id: string): VendorJob | null => {
    const live = Object.values(jobs).filter((j) => j.app === id && j.phase !== 'done' && j.phase !== 'error');
    return live[0] ?? null;
  };

  const fmtMb = (b?: number) => (b ? `${(b / 1e6).toFixed(1)} MB` : '');

  // v0.0.34 — the full catalog (860+). Filter by category AND library, then
  // page the grid (60 at a time) so the DOM stays light; the preview canvas
  // mounts only near the viewport.
  const refCats = ['all', ...Array.from(new Set(uiRefs.map((r) => r.category)))];
  const query = refSearch.trim().toLowerCase();
  const queryTerms = searchTerms(refSearch, language);
  const filteredRefs = uiRefs.filter((r) => {
    if (memoryOnly && !memoryIds.has(r.id)) return false;
    if (refCat !== 'all' && r.category !== refCat) return false;
    if (refLib !== 'all' && r.library !== refLib) return false;
    if (!query) return true;
    const hay = `${r.id} ${r.name} ${r.category} ${r.what} ${categoryName(r.category, language)}`.toLowerCase();
    return hay.includes(query) || queryTerms.some((term) => hay.includes(term));
  });
  const visibleRefs = filteredRefs.slice(0, refLimit);

  // v0.0.34 — infinite scroll: the sentinel loads the next 60 a little
  // BEFORE the user reaches it (900px). No button, no jank: the cards mount
  // lazily and the preview canvas only exists near the viewport.
  useEffect(() => {
    if (tab !== 'references' || refView) return;
    const el = loadMoreRef.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setRefLimit((n) => Math.min(n + 60, filteredRefs.length));
      return;
    }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        setRefLimit((n) => Math.min(n + 60, filteredRefs.length));
      }
    }, { rootMargin: '900px' });
    io.observe(el);
    return () => io.disconnect();
  }, [tab, refView, filteredRefs.length, visibleRefs.length]);
  // v0.0.32 — the Originkit demo requires a session; embedding it showed a
  // login wall. Use = carry the reference into the project's Style Board;
  // Queue = a design task for Athena (priority high).
  const referencePrompt = (r: UiRef): string => [
    `Implement the "${r.name}" interaction (${r.library} · ${r.category}) in the open project.`,
    r.what,
    `Reference: ${r.demoUrl}`,
    `Fetch lane: ${r.fetchLane}`,
    'Recreate the MOTION and structure in the project identity — do not copy colors or demo copy. Verify the result in the live preview and keep all existing content.',
  ].join('\n');
  const copyReferencePrompt = async (r: UiRef) => {
    try {
      await navigator.clipboard.writeText(referencePrompt(r));
      toast.success('reference prompt copied');
    } catch { toast.error('clipboard blocked'); }
  };
  const saveReference = async (r: UiRef) => {
    try {
      const res = await fetch('/api/olympus/design-memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: r.id, name: r.name, library: r.library, category: r.category, demoUrl: r.demoUrl, note: r.what, projectSlug }),
      });
      const d = await res.json();
      if (d?.ok) { toast.success(`saved to design memory · ${r.name}`); void loadMemory(); }
      else toast.error(d?.error || 'could not save');
    } catch { toast.error('could not save'); }
  };
  const critiqueReference = async (r: UiRef) => {
    try {
      const res = await fetch('/api/olympus/artcraft/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project: projectSlug,
          title: `Critique the ${r.name} reference`,
          priority: 'high',
          prompt: `Athena: critique the "${r.name}" reference (${r.library} · ${r.category}) against the open project's current style.\n${r.what}\nReference: ${r.demoUrl}\n\nName what fits, what conflicts, and the smallest change that would make it belong. Do not edit any file in this turn.`,
        }),
      });
      const d = await res.json();
      if (d?.ok) toast.success('Athena will critique this reference');
      else toast.error(d?.error || 'could not queue the critique');
    } catch { toast.error('could not queue the critique'); }
  };
  const applyReference = (r: UiRef) => {
    setPendingRef({ name: r.name, demoUrl: r.demoUrl, category: r.category, library: r.library });
    setTab('style');
    setRefView(null);
  };
  const queueReference = async (r: UiRef) => {
    try {
      await fetch('/api/olympus/artcraft/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project: useOlympus.getState().activeProject?.slug ?? 'project',
          title: `Use the ${r.name} reference`,
          priority: 'high',
          prompt: `Use the "${r.name}" reference (${r.library} · ${r.category}) in the open project.\n${r.what}\nReference link: ${r.demoUrl}\nFetch lane: ${r.fetchLane}\n\nAsk me where it belongs before changing the page if it is ambiguous.`,
        }),
      });
    } catch { /* best effort */ }
  };

  return (
    <div className="w-full h-full flex flex-col bg-olympus-bg">
      {/* Header */}
      <div className="h-9 shrink-0 flex items-center gap-2 px-3 border-b border-olympus-gold/10 bg-olympus-panel">
        <Boxes size={13} className="text-olympus-gold" />
        <span className="text-[11px] font-mono font-semibold text-olympus-gold">Craft</span>
        {/* W-J: the tab bar — Apps | References */}
        <div className="flex items-center gap-0.5">
          <button onClick={() => { setTab('apps'); setRefView(null); }} className={cn('flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-mono uppercase', tab === 'apps' ? 'bg-olympus-gold/15 text-olympus-gold ring-1 ring-olympus-gold/30' : 'text-olympus-text-dim hover:text-olympus-gold')}><LayoutGrid size={10} /> apps</button>
          <button onClick={() => setTab('references')} className={cn('flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-mono uppercase', tab === 'references' ? 'bg-olympus-gold/15 text-olympus-gold ring-1 ring-olympus-gold/30' : 'text-olympus-text-dim hover:text-olympus-gold')}><Lightbulb size={10} /> references</button>
          <button onClick={() => { setTab('style'); setRefView(null); }} className={cn('flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-mono uppercase', tab === 'style' ? 'bg-olympus-gold/15 text-olympus-gold ring-1 ring-olympus-gold/30' : 'text-olympus-text-dim hover:text-olympus-gold')}><Palette size={10} /> design</button>
          <button onClick={() => { setTab('builds'); setRefView(null); }} className={cn('flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-mono uppercase', tab === 'builds' ? 'bg-olympus-gold/15 text-olympus-gold ring-1 ring-olympus-gold/30' : 'text-olympus-text-dim hover:text-olympus-gold')}><Sparkles size={10} /> builds</button>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          {view.kind !== 'grid' && (
            <button onClick={() => setView({ kind: 'grid' })} className="flex items-center gap-1 text-[10px] font-mono text-olympus-text-dim hover:text-olympus-gold px-1.5 py-1 rounded hover:bg-olympus-gold/10">
              <ChevronLeft size={11} /> grid
            </button>
          )}
          <button onClick={() => load(true)} aria-label="Refresh" className="text-olympus-text-dim hover:text-olympus-gold transition-colors p-1">
            <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 relative">
        {tab === 'builds' ? (
          <DesignBuildsPanel />
        ) : tab === 'style' ? (
          /* v0.0.32 (Epic Q) — the STYLE BOARD: tokens + prompt + queue */
          <ArtcraftStyleBoard references={uiRefs.map((r) => ({ name: r.name, demoUrl: r.demoUrl, category: r.category, library: r.library }))} pendingRef={pendingRef} onPendingConsumed={() => setPendingRef(null)} />
        ) : tab === 'references' ? (
          /* W-J: the REFERENCES tab — the curated inspiration catalog */
          <div className="absolute inset-0 flex flex-col">
            {refView ? (
              <div className="flex-1 min-h-0 flex flex-col">
                <div className="h-8 shrink-0 flex items-center gap-2 px-3 border-b border-olympus-gold/10 bg-olympus-panel/80">
                  <button onClick={() => setRefView(null)} className="flex items-center gap-1 text-[10px] font-mono text-olympus-text-dim hover:text-olympus-gold"><ChevronLeft size={11} /> catalog</button>
                  <span className="text-[10px] font-mono font-semibold text-olympus-gold truncate">{refView.name}</span>
                  <span className="text-[8px] font-mono text-olympus-text-dim truncate hidden md:block">{refView.what}</span>
                  <button
                    onClick={() => void saveReference(refView)}
                    data-tip={memoryIds.has(refView.id) ? 'Saved in design memory' : 'Save to design memory (named reference)'}
                    className="ml-auto text-olympus-text-dim hover:text-olympus-gold p-1 shrink-0"
                    aria-label="Save to design memory"
                  >{memoryIds.has(refView.id) ? <BookmarkCheck size={12} className="text-olympus-green" /> : <Bookmark size={12} />}</button>
                  <button
                    onClick={() => void copyReferencePrompt(refView)}
                    data-tip="Copy the implementation prompt"
                    className="text-olympus-text-dim hover:text-olympus-gold p-1 shrink-0"
                    aria-label="Copy implementation prompt"
                  ><Copy size={11} /></button>
                  <button
                    onClick={() => { try { navigator.clipboard.writeText(refView.fetchLane); } catch { /* best-effort */ } }}
                    data-tip="Copy the fetch/install lane"
                    className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-olympus-cyan/10 text-olympus-cyan ring-1 ring-olympus-cyan/25 hover:bg-olympus-cyan/20 shrink-0"
                  >{t('common.copyLane', language)}</button>
                  <a href={refView.demoUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[9px] font-mono text-olympus-text-dim hover:text-olympus-gold px-1 shrink-0"><ExternalLink size={10} /></a>
                </div>
                {/* v0.0.34 — the component ONLY. No vendor page, no login
                    banner, no site chrome. The study is native and interactive. */}
                <div className="flex-1 min-h-[280px] bg-olympus-card">
                  <ReferencePreview referenceId={refView.id} label={refView.name} variant={refVariant || previewFor(refView).variants[0]} kind={previewFor(refView).kind} />
                </div>
                <div className="shrink-0 flex items-center gap-1.5 flex-wrap px-3 py-2 border-t border-olympus-gold/10 bg-olympus-panel/80">
                  <span className="text-[8px] font-mono uppercase tracking-wide text-olympus-text-dim">{t('common.variation', language)}</span>
                  {previewFor(refView).variants.map((v) => (
                    <button
                      key={v}
                      onClick={() => setRefVariant(v)}
                      aria-pressed={(refVariant || previewFor(refView).variants[0]) === v}
                      className={cn(
                        'text-[9px] font-mono px-2 py-0.5 rounded-full border transition-colors',
                        (refVariant || previewFor(refView).variants[0]) === v
                          ? 'border-olympus-gold/60 bg-olympus-gold/15 text-olympus-gold'
                          : 'border-olympus-gold/15 text-olympus-text-dim hover:text-olympus-text',
                      )}
                    >{v}</button>
                  ))}
                  <span className="text-[8px] font-mono text-olympus-text-dim hidden md:inline">· interactive — move the pointer</span>
                  <button onClick={() => void critiqueReference(refView)} className="ml-auto flex items-center gap-1 text-[9px] font-mono px-2 py-1 rounded bg-olympus-purple/10 text-olympus-purple ring-1 ring-olympus-purple/25 hover:bg-olympus-purple/20"><MessageSquare size={9} /> {t('references.critique', language)}</button>
                  <button onClick={() => applyReference(refView)} className="text-[9px] font-mono px-2.5 py-1 rounded bg-olympus-gold/15 text-olympus-gold ring-1 ring-olympus-gold/30 hover:bg-olympus-gold/25">{t('common.use', language)}</button>
                  <button onClick={() => void queueReference(refView)} className="text-[9px] font-mono px-2.5 py-1 rounded bg-olympus-cyan/10 text-olympus-cyan ring-1 ring-olympus-cyan/25 hover:bg-olympus-cyan/20">{t('common.queue', language)}</button>
                </div>
              </div>
            ) : (
              <>
                <div className="shrink-0 px-3 py-2 border-b border-olympus-gold/10">
                  <input
                    value={refSearch}
                    onChange={(e) => setRefSearch(e.target.value)}
                    placeholder={t('references.search', language)}
                    className="w-full bg-olympus-bg border border-olympus-gold/20 rounded px-2 py-1 text-[10px] font-mono text-olympus-text placeholder:text-olympus-text-dim outline-none focus:border-olympus-gold/50"
                  />
                  <div className="flex items-center gap-1 mt-1.5">
                    <span className="text-[8px] font-mono uppercase tracking-wide text-olympus-text-dim">library</span>
                    {['all', 'originkit', 'skiper', 'magicui'].map((lib) => (
                      <button
                        key={lib}
                        onClick={() => setRefLib(lib)}
                        className={cn('text-[8px] font-mono px-1.5 py-0.5 rounded-full border uppercase tracking-wide transition-colors', refLib === lib ? 'border-olympus-cyan/50 bg-olympus-cyan/10 text-olympus-cyan' : 'border-olympus-gold/10 text-olympus-text-dim hover:text-olympus-text')}
                      >
                        {lib === 'all' ? 'all' : lib === 'originkit' ? 'OriginKit' : lib === 'skiper' ? 'Skiper' : 'Magic UI'}
                      </button>
                    ))}
                    <button
                      onClick={() => setMemoryOnly((v) => !v)}
                      data-tip="Show only the references saved in design memory for this project"
                      className={cn('flex items-center gap-1 text-[8px] font-mono px-1.5 py-0.5 rounded-full border transition-colors', memoryOnly ? 'border-olympus-green/50 bg-olympus-green/10 text-olympus-green' : 'border-olympus-gold/15 text-olympus-text-dim hover:text-olympus-text')}
                    >
                      {memoryOnly ? <BookmarkCheck size={8} /> : <Bookmark size={8} />} memory {memory.length > 0 ? `· ${memory.length}` : ''}
                    </button>
                    <span className="ml-auto text-[8px] font-mono text-olympus-text-dim tabular-nums">{t('references.count', language, { n: filteredRefs.length.toLocaleString() })}</span>
                  </div>
                  <div className="flex items-center gap-1 mt-1.5 overflow-x-auto custom-scroll pb-0.5">
                    {refCats.map((cat) => (
                      <button
                        key={cat}
                        onClick={() => setRefCat(cat)}
                        className={cn('shrink-0 text-[8px] font-mono px-1.5 py-0.5 rounded-full border uppercase tracking-wide transition-colors', refCat === cat ? 'border-olympus-gold/50 bg-olympus-gold/10 text-olympus-gold' : 'border-olympus-gold/10 text-olympus-text-dim hover:text-olympus-text')}
                      >
                        {cat === 'all' ? t('common.all', language) : categoryName(cat, language)} {cat !== 'all' && <span className="opacity-60">{uiRefs.filter((r) => (refLib === 'all' || r.library === refLib) && r.category === cat).length}</span>}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-1">
                    <p className="text-[8px] font-mono text-olympus-text-dim">{t('references.hint', language)}</p>
                    {originkitBudget && (
                      <span
                        data-tip={originkitBudget.exhausted
                          ? `OriginKit free key exhausted — resets ${new Date(originkitBudget.resetAt).toLocaleString('en-US', { hour12: false })}`
                          : `Resets ${new Date(originkitBudget.resetAt).toLocaleString('en-US', { hour12: false })}`}
                        className={cn(
                          'text-[8px] font-mono px-1.5 py-0.5 rounded ring-1 shrink-0 whitespace-nowrap',
                          originkitBudget.exhausted
                            ? 'text-olympus-red bg-olympus-red/10 ring-olympus-red/25'
                            : 'text-olympus-green bg-olympus-green/10 ring-olympus-green/25',
                        )}
                      >
                        originkit: {originkitBudget.remaining}/{originkitBudget.limit} fetches left today
                        {originkitBudget.exhausted && ` — resets ${new Date(originkitBudget.resetAt).toLocaleTimeString('en-US', { hour12: false })}`}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto custom-scroll p-3">
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                    {visibleRefs.map((r) => (
                      <ReferenceCard
                        key={r.id}
                        reference={r}
                        onOpen={() => setRefView(r)}
                        onUse={() => applyReference(r)}
                        onQueue={() => void queueReference(r)}
                      />
                    ))}
                  </div>
                  {visibleRefs.length === 0 && <p className="text-center py-8 text-olympus-text-dim text-xs font-mono">{t('references.noMatch', language)}</p>}
                  {visibleRefs.length > 0 && visibleRefs.length < filteredRefs.length && (
                    <div ref={loadMoreRef} className="h-10 flex items-center justify-center gap-2 text-[9px] font-mono text-olympus-text-dim">
                      <span className="w-1.5 h-1.5 rounded-full bg-olympus-gold animate-pulse" />
                      loading the next references… {(filteredRefs.length - visibleRefs.length).toLocaleString()} left
                    </div>
                  )}
                  {visibleRefs.length > 0 && visibleRefs.length >= filteredRefs.length && (
                    <div className="h-10 flex items-center justify-center text-[9px] font-mono text-olympus-text-dim">
                      end of the catalog · {t('references.count', language, { n: filteredRefs.length.toLocaleString() })}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        ) : view.kind === 'grid' ? (
          <div className="absolute inset-0 overflow-y-auto custom-scroll p-3">
            {loading && apps.length === 0 && (
              <div className="text-center py-10 text-olympus-text-dim text-xs font-mono">
                <RefreshCw size={14} className="animate-spin inline mr-2" />probing the apps…
              </div>
            )}
            {/* The STUDIO card first — the AI crafting engine (their hosted
                product; the vendored lane covers the 13 released apps). */}
            {studio && (
              <button
                onClick={() => openStudio(studio)}
                className="w-full mb-3 rounded-lg p-3 flex items-center gap-3 bg-olympus-card border border-olympus-gold/25 ring-1 ring-olympus-gold/15 hover:border-olympus-gold/50 transition-colors text-left"
              >
                <span className="w-10 h-10 rounded-lg bg-olympus-gold/15 ring-1 ring-olympus-gold/30 flex items-center justify-center shrink-0 overflow-hidden">
                  <img src="/craft-apps/logos/artcraft-icon.svg" alt="" className="w-7 h-7 object-contain" loading="lazy" />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[12px] font-mono font-semibold text-olympus-gold">{studio.name}</span>
                  <span className="block text-[9px] font-mono text-olympus-text-dim truncate">{studio.category} · {studio.license} · {studio.repo}</span>
                </span>
                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-olympus-green/15 text-olympus-green ring-1 ring-olympus-green/25 shrink-0">live</span>
              </button>
            )}
            {/* The 13 apps grid — the vendored truth per card */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
              {apps.map((a) => {
                const v = vendor[a.id];
                const job = jobFor(a.id);
                return (
                  <div
                    key={a.id}
                    className="rounded-lg p-2.5 bg-olympus-card border border-olympus-gold/10 hover:border-olympus-gold/40 transition-colors group"
                  >
                    <button onClick={() => openApp(a)} className="w-full text-left">
                      <div className="flex items-center gap-2">
                        <AppLogo
                          id={a.id}
                          name={a.name}
                          tileCls="w-8 h-8 rounded-md bg-olympus-cyan/10 ring-1 ring-olympus-cyan/25 flex items-center justify-center shrink-0 overflow-hidden"
                          imgCls="w-6 h-6 object-contain"
                          letterCls="text-olympus-cyan font-mono font-bold text-[11px]"
                        />
                        <span className="flex-1 min-w-0">
                          <span className="block text-[11px] font-mono font-semibold text-olympus-text truncate group-hover:text-olympus-gold">{a.name}</span>
                          <span className="block text-[8px] font-mono text-olympus-text-dim truncate">{a.category}</span>
                        </span>
                      </div>
                    </button>
                    {job ? (
                      <div className="mt-2">
                        <div className="h-1 rounded-full bg-olympus-gold/10 overflow-hidden">
                          <div className="h-full bg-olympus-gold transition-all" style={{ width: `${Math.max(4, job.progress)}%` }} />
                        </div>
                        <div className="text-[8px] font-mono text-olympus-gold mt-1 truncate">{job.phase}{job.totalBytes ? ` · ${fmtMb(job.bytes)}/${fmtMb(job.totalBytes)}` : ''}</div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 mt-2">
                        {v?.vendored ? (
                          v.updateAvailable ? (
                            <button onClick={() => install(a, 'web')} className="text-[8px] font-mono px-1 py-px rounded ring-1 bg-olympus-amber-soft/10 text-olympus-amber-soft ring-olympus-amber-soft/25 hover:bg-olympus-amber-soft/20 shrink-0">
                              v{v.version} → v{v.latestVersion}
                            </button>
                          ) : (
                            <span className="text-[8px] font-mono px-1 py-px rounded ring-1 bg-olympus-green/10 text-olympus-green ring-olympus-green/25 shrink-0">
                              v{v.version} vendored
                            </span>
                          )
                        ) : (
                          <button onClick={() => openApp(a)} className="text-[8px] font-mono px-1 py-px rounded ring-1 bg-olympus-cyan/10 text-olympus-cyan ring-olympus-cyan/25 hover:bg-olympus-cyan/20 shrink-0">
                            get v{v?.latestVersion ?? ''}
                          </button>
                        )}
                        {v?.nativeInstalled && (
                          <button onClick={() => launchNative(a)} className="text-[8px] font-mono px-1 py-px rounded ring-1 bg-olympus-purple/10 text-olympus-purple ring-olympus-purple/25 hover:bg-olympus-purple/20 shrink-0">
                            {v.nativeRunning ? '● native' : 'launch'}
                          </button>
                        )}
                        <span className="text-[8px] font-mono text-olympus-text-dim truncate">{a.status}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <p className="text-[9px] font-mono text-olympus-text-dim mt-3 leading-relaxed">
              The apps download into OLYMPUS (~/.olympus/craft-apps) and run from there — self-hosted web builds, no login, auto-updated on every release. Apache-2.0 (github.com/storytold/*); the agents drive them via the olympus-craft MCP (docs/research/craft-apps.md).
            </p>
          </div>
        ) : view.kind === 'get' ? (
          /* The download hero — the app is not vendored yet. */
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-8 text-center">
            <span className="w-14 h-14 rounded-xl bg-olympus-cyan/10 ring-1 ring-olympus-cyan/25 flex items-center justify-center overflow-hidden">
              <img src={`/craft-apps/logos/${view.app.id}.png`} alt="" className="w-9 h-9 object-contain" loading="lazy" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            </span>
            <div>
              <p className="text-olympus-text text-sm font-mono font-semibold">{view.app.name}</p>
              <p className="text-[10px] font-mono text-olympus-text-dim mt-1">{view.app.category} · {view.app.license}</p>
            </div>
            <p className="text-[11px] font-mono text-olympus-text-dim max-w-md leading-relaxed">
              Not downloaded yet. The self-hosted web build (≈7-14 MB) vendors into OLYMPUS and
              runs from your disk — no account, no login, auto-updated. The native build (~80 MB)
              adds the real OS-window app + the agent CLI lane.
            </p>
            {(() => {
              const job = jobFor(view.app.id);
              if (job) {
                return (
                  <div className="w-full max-w-sm">
                    <div className="h-1.5 rounded-full bg-olympus-gold/10 overflow-hidden">
                      <div className="h-full bg-olympus-gold transition-all" style={{ width: `${Math.max(4, job.progress)}%` }} />
                    </div>
                    <p className="text-[9px] font-mono text-olympus-gold mt-1.5">
                      {job.phase}{job.totalBytes ? ` · ${fmtMb(job.bytes)} / ${fmtMb(job.totalBytes)}` : ''}
                      {job.error ? ` — ${job.error}` : ''}
                    </p>
                  </div>
                );
              }
              return (
                <div className="flex items-center gap-2">
                  <button onClick={() => install(view.app, 'web')} className="flex items-center gap-1.5 text-[11px] font-mono px-3 py-1.5 rounded bg-olympus-gold/15 text-olympus-gold ring-1 ring-olympus-gold/30 hover:bg-olympus-gold/25">
                    <Download size={11} /> Download web build{vendor[view.app.id]?.latestVersion ? ` (v${vendor[view.app.id].latestVersion})` : ''}
                  </button>
                  <button onClick={() => install(view.app, 'native')} className="flex items-center gap-1.5 text-[11px] font-mono px-3 py-1.5 rounded bg-olympus-purple/10 text-olympus-purple ring-1 ring-olympus-purple/25 hover:bg-olympus-purple/20">
                    <HardDriveDownload size={11} /> native app
                  </button>
                </div>
              );
            })()}
            {/* The honest live-web fallback while nothing is vendored. */}
            {(() => {
              const p = view.probe ?? probeFor(view.app.id, view.app.url);
              if (!p || !p.frameable) return null;
              return (
                <button onClick={() => setView({ kind: 'app', app: view.app, src: view.app.url, local: false, probe: p })}
                  className="text-[9px] font-mono text-olympus-text-dim hover:text-olympus-gold underline underline-offset-2">
                  or use the live web build on their site (the fallback lane)
                </button>
              );
            })()}
          </div>
        ) : (
          <div className="absolute inset-0 flex flex-col">
            {/* The app bar */}
            <div className="h-8 shrink-0 flex items-center gap-2 px-3 border-b border-olympus-gold/10 bg-olympus-panel/80">
              <span className="text-[10px] font-mono font-semibold text-olympus-gold truncate">{view.app.name}</span>
              <span className={cn('text-[8px] font-mono px-1.5 py-0.5 rounded ring-1 shrink-0', view.local ? 'bg-olympus-green/10 text-olympus-green ring-olympus-green/25' : 'bg-olympus-amber-soft/10 text-olympus-amber-soft ring-olympus-amber-soft/25')}>
                {view.local ? `vendored${vendor[view.app.id]?.version ? ` v${vendor[view.app.id].version}` : ''} · no login` : 'live web · their site'}
              </span>
              <div className="ml-auto flex items-center gap-1.5">
                {vendor[view.app.id]?.nativeInstalled ? (
                  <button onClick={() => launchNative(view.app)} className="flex items-center gap-1 text-[9px] font-mono px-1.5 py-0.5 rounded bg-olympus-purple/10 text-olympus-purple ring-1 ring-olympus-purple/25 hover:bg-olympus-purple/20 shrink-0">
                    <Play size={9} /> native window
                  </button>
                ) : view.app.id !== 'artcraft-studio' && (
                  <button onClick={() => install(view.app, 'native')} className="flex items-center gap-1 text-[9px] font-mono px-1.5 py-0.5 rounded bg-olympus-purple/10 text-olympus-purple ring-1 ring-olympus-purple/25 hover:bg-olympus-purple/20 shrink-0">
                    <MonitorUp size={9} /> install native
                  </button>
                )}
                {vendor[view.app.id]?.updateAvailable && (
                  <button onClick={() => install(view.app, 'web')} className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-olympus-amber-soft/10 text-olympus-amber-soft ring-1 ring-olympus-amber-soft/25 hover:bg-olympus-amber-soft/20 shrink-0">
                    update → v{vendor[view.app.id].latestVersion}
                  </button>
                )}
                <a href={view.app.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[9px] font-mono text-olympus-text-dim hover:text-olympus-gold px-1.5 shrink-0">
                  <ExternalLink size={10} /> open externally
                </a>
              </div>
            </div>
            {/* The embed — the vendored build from OUR origin (or the honest
                live fallback; never a dead frame). */}
            {view.local ? (
              <iframe
                src={view.src}
                className="flex-1 w-full bg-white"
                data-tip={view.app.name}
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-downloads allow-modals"
              />
            ) : view.probe === null ? (
              <div className="flex-1 flex items-center justify-center text-olympus-text-dim text-xs font-mono">
                probing {view.app.name}…
              </div>
            ) : view.probe.frameable ? (
              <iframe
                src={view.src}
                className="flex-1 w-full bg-white"
                data-tip={view.app.name}
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-downloads allow-modals"
              />
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center p-8">
                <X size={22} className="text-olympus-amber-soft/60" />
                <p className="text-olympus-text text-xs font-mono">{view.app.name} {view.probe.ok ? 'blocks embedding (an upstream frame policy)' : 'is unreachable right now'}</p>
                <p className="text-olympus-text-dim text-[10px] font-mono max-w-md">
                  The app stays in the catalog — download the vendored build above, or open it
                  externally; the agents drive it via the olympus-craft MCP.
                </p>
                <a href={view.app.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[10px] font-mono px-2.5 py-1.5 rounded bg-olympus-gold/15 text-olympus-gold ring-1 ring-olympus-gold/30 hover:bg-olympus-gold/25">
                  <ExternalLink size={10} /> open {view.app.name} externally
                </a>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * v0.0.34 — a reference card showing the COMPONENT, not the vendor page.
 *
 * The whole 220px stage is a native, interactive study (category-specific
 * canvas renderer). Every control lives BELOW the stage in OLYMPUS chrome:
 * the variations are OLYMPUS buttons, and use / queue / details sit in the
 * footer. No iframe, no login banner, no site chrome — and all visible cards
 * animate at once, so the grid can be scanned without hovering.
 */
function ReferenceCard({
  reference,
  onOpen,
  onUse,
  onQueue,
}: {
  reference: UiRef;
  onOpen: () => void;
  onUse: () => void;
  onQueue: () => void;
}) {
  const language = useLanguage();
  const spec = previewFor(reference);
  const [variant, setVariant] = useState(spec.variants[0]);
  return (
    <div
      className="rounded-lg bg-olympus-card border border-olympus-gold/10 hover:border-olympus-gold/40 transition-colors text-left group overflow-hidden"
      style={{ contentVisibility: 'auto', containIntrinsicSize: '360px' }}
    >
      <div className="relative h-[220px] w-full overflow-hidden">
        <ReferencePreview referenceId={reference.id} label={reference.name} variant={variant} kind={spec.kind} />
      </div>
      <div className="px-3 pt-2">
        <div className="flex items-center gap-1.5">
          <button onClick={onOpen} className="text-[12px] font-mono font-semibold text-olympus-text truncate hover:text-olympus-gold text-left">{reference.name}</button>
          {!reference.free && <span className="text-[7px] font-mono px-1 rounded bg-olympus-amber-soft/10 text-olympus-amber-soft ring-1 ring-olympus-amber-soft/25 shrink-0 uppercase">premium</span>}
          <span className="ml-auto text-[7px] font-mono text-olympus-cyan/70 uppercase tracking-wide shrink-0">{t('common.liveStudy', language)}</span>
        </div>
        <div className="text-[8px] font-mono text-olympus-cyan/80 uppercase tracking-wide mt-0.5">{reference.library} · {reference.category}</div>
        <p className="text-[10px] font-mono text-olympus-text-dim mt-1 leading-relaxed line-clamp-2">{reference.what}</p>
      </div>
      <div className="flex items-center gap-1 flex-wrap px-3 pt-1.5">
        <span className="text-[7px] font-mono uppercase tracking-wide text-olympus-text-dim">{t('common.variation', language)}</span>
        {spec.variants.map((v) => (
          <button
            key={v}
            onClick={() => setVariant(v)}
            aria-pressed={variant === v}
            className={cn(
              'text-[8px] font-mono px-1.5 py-0.5 rounded-full border transition-colors',
              variant === v
                ? 'border-olympus-gold/60 bg-olympus-gold/15 text-olympus-gold'
                : 'border-olympus-gold/15 text-olympus-text-dim hover:text-olympus-text',
            )}
          >{v}</button>
        ))}
      </div>
      <div className="flex items-center gap-1 px-3 pb-2 pt-1.5">
        <button onClick={onUse} className="flex items-center gap-1 text-[10px] font-mono px-3 py-1.5 rounded bg-olympus-gold/15 text-olympus-gold ring-1 ring-olympus-gold/30 hover:bg-olympus-gold/25">{t('common.use', language)}</button>
        <button onClick={onQueue} className="flex items-center gap-1 text-[10px] font-mono px-3 py-1.5 rounded bg-olympus-cyan/10 text-olympus-cyan ring-1 ring-olympus-cyan/25 hover:bg-olympus-cyan/20">{t('common.queue', language)}</button>
        <button onClick={onOpen} data-tip="Open the component details" aria-label={`Open ${reference.name} details`} className="ml-auto text-olympus-text-dim hover:text-olympus-gold p-1.5 rounded hover:bg-olympus-gold/10"><Maximize2 size={12} /></button>
      </div>
    </div>
  );
}
