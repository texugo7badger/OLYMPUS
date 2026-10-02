/**
 * Olympus UI state (Zustand) — graph data, selected node, active god,
 * Compact Brain button state, filter sidebar, SSE events, and project
 * context.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { create } from 'zustand';
import type { LucideIcon } from 'lucide-react';
import {
  Sun, Hammer, Bird, Compass, Target, Wine, Flower2, Flame, BookMarked, Orbit, Globe,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/* GOD ICONS — single source of truth (NO emoji anywhere in the UI).   */
/*                                                                      */
/* Callimachus (the vault librarian / curator) is the 9th god. Uses     */
/* BookMarked — a unique glyph that doesn't collide with the other 8.   */
/* ------------------------------------------------------------------ */
export const GOD_ICONS: Record<string, LucideIcon> = {
  apollo: Sun,
  atlas: Orbit,
  hephaestus: Hammer,
  athena: Bird,
  hermes: Compass,
  artemis: Target,
  dionysus: Wine,
  persephone: Flower2,
  prometheus: Flame,
  callimachus: BookMarked,
  global: Globe,
};

export const GOD_IDS = Object.keys(GOD_ICONS);

/** Pastel god accent colors (Issue 11). */
export const GOD_COLORS: Record<string, string> = {
  apollo: '#D4A574',
  hephaestus: '#C4956A',
  athena: '#D4A574',
  hermes: '#D4A574',
  artemis: '#D4A574',
  dionysus: '#D4A574',
  persephone: '#D4A574',
  prometheus: '#D4A574',
  callimachus: '#9B7BAE',
};

/** God domains — short descriptors for the god-detail panel. */
export const GOD_DOMAINS: Record<string, string> = {
  apollo: 'Planner — Architecture, Spec, User Contract',
  atlas: 'Orchestrator — Dispatch, Execution, Sync',
  hephaestus: 'Backend / Infrastructure',
  athena: 'Frontend / UX-UI / Design',
  hermes: 'Integrations / APIs / MCPs',
  artemis: 'Security / Auditing',
  dionysus: 'QA / Testing / Edge Cases',
  persephone: 'Database / Persistence',
  prometheus: 'DevOps / CI-CD / Deploy',
  callimachus: 'Vault curator — Instincts, Compaction',
};

/** Lookup helper: returns the lucide icon component for a god id. */
export function godIcon(god: string | undefined | null): LucideIcon | null {
  if (!god) return null;
  return GOD_ICONS[god] ?? null;
}

/* ------------------------------------------------------------------ */
/* Pastel palette (Issue 11) — exposed for inline styles.              */
/* ------------------------------------------------------------------ */
export const PASTEL = {
  gold:        '#D4A574',
  amber:       '#C4956A',
  blue:        '#6B8FB5',
  green:       '#7BAE8E',
  amberSoft:   '#C4A265',
  purple:      '#9B7BAE',
  teal:        '#6BAE9B',
  red:         '#C4756A',
  cyan:        '#6BAEB5',
  grayText:    '#8B8B8B',
  grayPrimary: '#B8B8B8',
  bg:          '#0A0E16',
  panel:       '#0E1320',
  card:        '#121826',
} as const;

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */
export interface ActivityEvent {
  type: string;
  from?: string;
  to?: string;
  god?: string;
  subagent?: string;
  task?: string;
  tool?: string;
  file?: string;
  msg?: string;
  ts: string;
  [k: string]: any;
}

export interface CompactPhase {
  id: number;
  name: string;
  status: 'pending' | 'start' | 'done';
  fixed?: number;
  desc?: string;
}

type CompactState = 'idle' | 'cooldown' | 'in-progress' | 'undo-window';

/* ------------------------------------------------------------------ */
/* Project context types (mirrors src/lib/project-context.ts).         */
/* Client-side lightweight shape — server validates against the vault. */
/* ------------------------------------------------------------------ */
export interface ProjectNote {
  slug: string;
  name: string;
  path: string;
  stacks: string[];
  created: string;
  last_active: string;
  description?: string;
  vscodium_workspace?: string;
  /** Phase 2 (Live Preview): dev-server port. Default 3000. */
  livePreviewPort?: number;
}

export type ProjectFilterMode = 'strict' | 'cross-stack' | 'browsing';

/* ------------------------------------------------------------------ */
/* LLM strategy type (mirrors src/lib/model-strategies.ts).            */
/* 3 GO + 3 Zen + 3 free strategies + user-defined custom-*.           */
/* ------------------------------------------------------------------ */
export type LLMStrategy =
  | 'go-max-quality'
  | 'go-balanced'
  | 'go-budget'
  | 'zen-max-quality'
  | 'zen-balanced'
  | 'zen-budget'
  | 'free-openrouter'
  | 'free-big-pickle'
  | 'free-nvidia-build'
  | `custom-${string}`;

interface OlympusStore {
  graphData: { nodes: any[]; links: any[] } | null;
  setGraphData: (g: { nodes: any[]; links: any[] }) => void;
  selectedNode: any | null;
  setSelectedNode: (n: any | null) => void;
  activeGod: string | null;
  setActiveGod: (g: string | null) => void;
  filters: {
    god: boolean; skill: boolean; instinct: boolean;
    project: boolean; knowledge: boolean; evolved: boolean;
    minConfidence: number;
    /** New: scope filter for instincts. */
    scopeGlobal: boolean;
    scopeStack: boolean;
    scopeProject: boolean;
    /** New: show cross-stack instincts (rule 2b) with a tint. */
    showCrossStack: boolean;
  };
  toggleFilter: (key: keyof OlympusStore['filters']) => void;
  setMinConfidence: (v: number) => void;
  /**
   * Symphony (v1.0) — node-graph filter mode.
   * When enabled, the brain atlas renders vibrational ring overlays on
   * every visible node, color-coded by the node's last coherence reading.
   * Symphony is ALWAYS ON — it is the standard language between Gods and
   * Demigods. There is no toggle; the overlay is always present.
   */
  symphonyCoherenceWarning: number; // default 0.70 (matches protocol.ts)
  events: ActivityEvent[];
  pushEvent: (e: ActivityEvent) => void;
  pulses: { from: string; to: string; id: number; ts: string }[];
  pushPulse: (from: string, to: string) => void;
  compactState: CompactState;
  compactPhases: CompactPhase[];
  compactCooldownEnds: number | null;
  compactUndoEnds: number | null;
  compactRunId: string | null;
  /**
   * Mid-task guard for the Compact Brain button. True when a god/task
   * is actively running; false when idle. Disables the Compact Brain
   * button (prevents concurrent vault mutation).
   */
  isTaskRunning: boolean;
  activeTaskId: string | null;
  setTaskRunning: (running: boolean, taskId?: string | null) => void;
  setCompactState: (s: CompactState) => void;
  setCompactPhases: (p: CompactPhase[]) => void;
  updatePhase: (id: number, patch: Partial<CompactPhase>) => void;
  startCooldown: (seconds: number) => void;
  startUndoWindow: (minutes: number, runId: string) => void;
  clearCompact: () => void;
  leftPane:
    | 'brain' | 'god-intelligence' | 'cost' | 'timeline' | 'provider-settings'
    | 'god-detail' | 'live-preview' | 'mcp-config' | 'benchmarks';
  setLeftPane: (p: OlympusStore['leftPane']) => void;
  /**
   * rightTab now includes 'ide' (Monaco editor + file explorer + terminal)
   * alongside 'terminal' (chat), 'editor' (vault summary), and 'frames'.
   */
  rightTab: 'terminal' | 'editor' | 'frames' | 'ide';
  setRightTab: (t: OlympusStore['rightTab']) => void;
  bottomOpen: boolean;
  toggleBottom: () => void;
  filterSidebarCollapsed: boolean;
  toggleFilterSidebar: () => void;
  setFilterSidebarCollapsed: (b: boolean) => void;
  /**
   * Focus Mode: collapses the left dashboard so the right pane can take
   * the full window width. Toggled from the StatusBar.
   */
  focusMode: boolean;
  toggleFocusMode: () => void;
  setFocusMode: (b: boolean) => void;
  /**
   * Quick Open dialog (Cmd/Ctrl+P). Shows a modal with a fuzzy file finder;
   * selecting a file opens it in the IDE tab's Monaco editor.
   */
  quickOpenOpen: boolean;
  setQuickOpenOpen: (b: boolean) => void;
  toggleQuickOpen: () => void;
  /**
   * The file to open in the IDE tab's Monaco editor. Set by QuickOpen
   * when the user selects a file.
   */
  ideFilePath: string | null;
  setIdeFilePath: (p: string | null) => void;
  /**
   * Optional root override for the IDE's active file. When set, the Monaco
   * editor + file API use this safe root instead of the default. Used when
   * opening vault files where the vault root differs from the project root.
   */
  ideFileRoot: string | null;
  setIdeFileRoot: (r: string | null) => void;
  /**
   * IDE document tab management (VS Code-like). Tracks open files,
   * pinned tabs, and the active tab.
   */
  openTabs: string[];
  pinnedTabs: string[];
  openTab: (path: string) => void;
  closeTab: (path: string) => void;
  togglePinTab: (path: string) => void;
  setActiveTab: (path: string) => void;
  settingsOpen: boolean;
  setSettingsOpen: (b: boolean) => void;
  editorPath: string | null;
  setEditorPath: (p: string | null) => void;
  sseConnected: boolean;
  setSseConnected: (b: boolean) => void;

  /* ─── Project context ──────────────────────────────────────────── */
  activeProject: ProjectNote | null;
  setActiveProject: (p: ProjectNote | null) => void;
  /** Phase 2 (P4.D): set active project by slug. */
  setActiveProjectBySlug: (slug: string | null) => Promise<void>;
  availableProjects: ProjectNote[];
  setAvailableProjects: (p: ProjectNote[]) => void;
  refreshProjects: () => Promise<void>;
  projectFilterMode: ProjectFilterMode;
  setProjectFilterMode: (m: ProjectFilterMode) => void;
  newProjectDialogOpen: boolean;
  setNewProjectDialogOpen: (b: boolean) => void;
  /**
   * @deprecated Always null. The old code-server flow was replaced by the
   * Editor Bridge. Use /api/olympus/editor/* routes instead.
   */
  vscodiumState: {
    pid: number | null;
    projectSlug: string | null;
    projectPath: string | null;
    url: string;
    startedAt: string | null;
  } | null;
  /** @deprecated Always sets to null — see vscodiumState. */
  setVscodiumState: (s: OlympusStore['vscodiumState']) => void;

  /* ─── LLM strategy (v6.0) ────────────────────────────────────── */
  /** The active LLM strategy (default: 'go-balanced'). */
  llmStrategy: LLMStrategy;
  /** Set the LLM strategy (persists to ~/.olympus/llm-providers.json via API). */
  setLlmStrategy: (s: LLMStrategy) => void;
}

let pulseId = 0;

export const useOlympus = create<OlympusStore>((set, get) => ({
  graphData: null,
  setGraphData: (g) => set({ graphData: g }),
  selectedNode: null,
  setSelectedNode: (n) => {
    set({ selectedNode: n });
    if (n?.type === 'god') set({ leftPane: 'god-detail' });
  },
  activeGod: null,
  setActiveGod: (g) => set({ activeGod: g }),
  filters: {
    // Brain view reduced to three categories: Gods, Instincts, Knowledge.
    // The skill / evolved / project booleans remain for backward compat
    // but are always false — the Brain renderer hard-excludes those types.
    god: true, instinct: true, knowledge: true,
    skill: false, evolved: false, project: false,
    minConfidence: 0.5,
    scopeGlobal: true, scopeStack: true, scopeProject: true,
    showCrossStack: false,
  },
  toggleFilter: (key) =>
    set((s) => ({ filters: { ...s.filters, [key]: !s.filters[key] } })),
  setMinConfidence: (v) =>
    set((s) => ({ filters: { ...s.filters, minConfidence: v } })),
  /**
   * Symphony (v1.0) — always-on. The brain atlas overlays
   * vibrational rings on every visible node as the standard visualization
   * of God↔Demigod Symphony state.
   */
  symphonyCoherenceWarning: 0.7,
  events: [],
  pushEvent: (e) => set((s) => ({ events: [...s.events.slice(-199), e] })),
  pulses: [],
  pushPulse: (from, to) => {
    pulseId += 1;
    const p = { from, to, id: pulseId, ts: new Date().toISOString() };
    set((s) => ({ pulses: [...s.pulses.slice(-12), p] }));
  },
  compactState: 'idle',
  compactPhases: [
    { id: 1, name: 'complete aliases', status: 'pending' },
    { id: 2, name: 'merge duplicates', status: 'pending' },
    { id: 3, name: 'fix dead links', status: 'pending' },
    { id: 4, name: 'link orphans', status: 'pending' },
    { id: 5, name: 'expand empty pages', status: 'pending' },
  ],
  compactCooldownEnds: null,
  compactUndoEnds: null,
  compactRunId: null,
  isTaskRunning: false,
  activeTaskId: null,
  setTaskRunning: (running, taskId = null) =>
    set({ isTaskRunning: running, activeTaskId: running ? taskId : null }),
  setCompactState: (s) => set({ compactState: s }),
  setCompactPhases: (p) => set({ compactPhases: p }),
  updatePhase: (id, patch) =>
    set((s) => ({
      compactPhases: s.compactPhases.map((p) =>
        p.id === id ? { ...p, ...patch } : p,
      ),
    })),
  startCooldown: (seconds) =>
    set({ compactState: 'cooldown', compactCooldownEnds: Date.now() + seconds * 1000 }),
  startUndoWindow: (minutes, runId) =>
    set({
      compactState: 'undo-window',
      compactUndoEnds: Date.now() + minutes * 60 * 1000,
      compactRunId: runId,
    }),
  clearCompact: () =>
    set({
      compactState: 'idle', compactCooldownEnds: null,
      compactUndoEnds: null, compactRunId: null,
    }),
  leftPane: 'brain',
  setLeftPane: (p) => set({ leftPane: p }),
  rightTab: 'terminal',
  setRightTab: (t) => set({ rightTab: t }),
  bottomOpen: false,
  toggleBottom: () => set((s) => ({ bottomOpen: !s.bottomOpen })),
  filterSidebarCollapsed: true,
  toggleFilterSidebar: () =>
    set((s) => ({ filterSidebarCollapsed: !s.filterSidebarCollapsed })),
  setFilterSidebarCollapsed: (b) => set({ filterSidebarCollapsed: b }),
  /* Focus Mode (collapsible left dashboard). */
  focusMode: false,
  toggleFocusMode: () => set((s) => ({ focusMode: !s.focusMode })),
  setFocusMode: (b) => set({ focusMode: b }),
  /* Quick Open dialog + IDE file path. */
  quickOpenOpen: false,
  setQuickOpenOpen: (b) => set({ quickOpenOpen: b }),
  toggleQuickOpen: () => set((s) => ({ quickOpenOpen: !s.quickOpenOpen })),
  ideFilePath: null,
  setIdeFilePath: (p) => set({ ideFilePath: p, rightTab: 'ide' }),
  // IDE file root override (for vault files).
  ideFileRoot: null,
  setIdeFileRoot: (r) => set({ ideFileRoot: r }),
  /* IDE document tab management. */
  openTabs: [],
  pinnedTabs: [],
  openTab: (path) => set((s) => {
    if (s.openTabs.includes(path)) {
      // Already open — just activate it.
      return { ideFilePath: path, rightTab: 'ide' };
    }
    // New tab — add it. Pinned tabs stay left, unpinned tabs go right.
    return { openTabs: [...s.openTabs, path], ideFilePath: path, rightTab: 'ide' };
  }),
  closeTab: (path) => set((s) => {
    const idx = s.openTabs.indexOf(path);
    const newTabs = s.openTabs.filter(t => t !== path);
    const newPinned = s.pinnedTabs.filter(t => t !== path);
    // If we're closing the active tab, switch to the next one (or previous).
    let newActive = s.ideFilePath;
    if (s.ideFilePath === path) {
      if (newTabs.length === 0) {
        newActive = null;
      } else if (idx >= newTabs.length) {
        newActive = newTabs[newTabs.length - 1];
      } else {
        newActive = newTabs[idx] || newTabs[newTabs.length - 1];
      }
    }
    return { openTabs: newTabs, pinnedTabs: newPinned, ideFilePath: newActive };
  }),
  togglePinTab: (path) => set((s) => {
    if (s.pinnedTabs.includes(path)) {
      return { pinnedTabs: s.pinnedTabs.filter(t => t !== path) };
    }
    return { pinnedTabs: [...s.pinnedTabs, path] };
  }),
  setActiveTab: (path) => set({ ideFilePath: path, rightTab: 'ide' }),
  settingsOpen: false,
  setSettingsOpen: (b) => set({ settingsOpen: b }),
  editorPath: null,
  setEditorPath: (p) => set({ editorPath: p, rightTab: 'editor' }),
  sseConnected: false,
  setSseConnected: (b) => set({ sseConnected: b }),

  /* ─── Project context ──────────────────────────────────────────── */
  activeProject: null,
  setActiveProject: (p) => {
    set({ activeProject: p });
    fetch('/api/olympus/projects/active', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: p?.slug ?? null }),
    }).catch(() => {});
  },
  setActiveProjectBySlug: async (slug) => {
    if (slug === null) { get().setActiveProject(null); return; }
    let project = get().availableProjects.find(p => p.slug === slug) || null;
    if (!project) { await get().refreshProjects(); project = get().availableProjects.find(p => p.slug === slug) || null; }
    get().setActiveProject(project);
  },
  availableProjects: [],
  setAvailableProjects: (p) => set({ availableProjects: p }),
  refreshProjects: async () => {
    try {
      const r = await fetch('/api/olympus/projects');
      const d = await r.json();
      const projects: ProjectNote[] = Array.isArray(d.projects) ? d.projects : [];
      set({ availableProjects: projects });
      if (d.active) { set({ activeProject: d.active }); }
      else if (d.active === null && get().activeProject) { set({ activeProject: null }); }
    } catch {}
  },
  projectFilterMode: 'cross-stack',
  setProjectFilterMode: (m) => set({ projectFilterMode: m }),
  newProjectDialogOpen: false,
  setNewProjectDialogOpen: (b) => set({ newProjectDialogOpen: b }),
  vscodiumState: null,
  setVscodiumState: (_s) => set({ vscodiumState: null }),

  /* ─── LLM strategy (v6.0) ────────────────────────────────────── */
  llmStrategy: 'go-balanced',
  setLlmStrategy: (s) => {
    set({ llmStrategy: s });
    // Persist to ~/.olympus/llm-providers.json via the API.
    fetch('/api/olympus/providers/gods', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ strategy: s }),
    }).catch(() => {});
  },
}));
