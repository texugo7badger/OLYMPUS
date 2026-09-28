'use client';

import { useEffect, useState, useRef, Component, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
// Use raw Panel for imperative collapse/expand (shadcn wrapper doesn't forward refs).
import { Panel as RawPanel, Group as RawGroup, type GroupImperativeHandle } from 'react-resizable-panels';
import { useOlympus, type ActivityEvent } from '@/lib/olympus-store';
import { Terminal as TerminalIcon, Library, LayoutGrid, AlertCircle, RefreshCw, Code2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

/* ------------------------------------------------------------------ */
/* ChunkErrorBoundary — catches ChunkLoadError from Turbopack HMR.     */
/* ------------------------------------------------------------------ */
interface ChunkErrorBoundaryState {
  hasError: boolean;
  isChunkError: boolean;
}
class ChunkErrorBoundary extends Component<{ children: ReactNode }, ChunkErrorBoundaryState> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, isChunkError: false };
  }
  static getDerivedStateFromError(error: any): ChunkErrorBoundaryState {
    const isChunkError =
      error?.name === 'ChunkLoadError' ||
      error?.name === 'ChunkLoadError ' ||
      (typeof error?.message === 'string' && (
        error.message.includes('Failed to load chunk') ||
        error.message.includes('Loading chunk') ||
        error.message.includes('Loading CSS chunk')
      ));
    return { hasError: true, isChunkError };
  }
  componentDidCatch(error: any) {
    if (this.state.isChunkError) {
      console.warn('[Olympus] ChunkLoadError detected — auto-reloading page…', error?.message);
      setTimeout(() => {
        if (typeof window !== 'undefined') window.location.reload();
      }, 500);
    }
  }
  render() {
    if (this.state.hasError && !this.state.isChunkError) {
      return (
        <div className="w-full h-full flex flex-col items-center justify-center gap-3 bg-olympus-bg text-olympus-text-dim">
          <AlertCircle size={24} className="text-olympus-red" />
          <p className="text-xs font-mono">Something went wrong loading this panel.</p>
          <button
            onClick={() => {
              this.setState({ hasError: false, isChunkError: false });
              if (typeof window !== 'undefined') window.location.reload();
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-olympus-gold/15 text-olympus-gold text-[11px] font-mono hover:bg-olympus-gold/25"
          >
            <RefreshCw size={11} /> Reload
          </button>
        </div>
      );
    }
    if (this.state.hasError && this.state.isChunkError) {
      return (
        <div className="w-full h-full flex items-center justify-center bg-olympus-bg text-olympus-text-dim">
          <div className="flex items-center gap-2 text-xs font-mono">
            <RefreshCw size={14} className="animate-spin text-olympus-gold" />
            reloading…
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// Code-split all Olympus components via next/dynamic.
//
// Loading fallbacks are all `null` so only the route-level
// loading.tsx spinner appears (centered, "OLYMPUS is waking the gods…").
// Per-panel spinners would create a "two gears" effect as each dynamic
// chunk loads independently — instead, panels appear silently as they
// finish compiling.
const ActivityBar = dynamic(() => import('@/components/olympus/activity-bar'), { ssr: false, loading: () => null });
const StatusBar = dynamic(() => import('@/components/olympus/status-bar'), { ssr: false, loading: () => null });
const FilterSidebar = dynamic(() => import('@/components/olympus/filter-sidebar'), { ssr: false, loading: () => null });
const BrainGraph3D = dynamic(() => import('@/components/olympus/brain-atlas-3d'), { ssr: false, loading: () => null });
// GodIntelligenceDashboard is the unified view (absorbs BrainHealthDashboard).
const GodIntelligenceDashboard = dynamic(() => import('@/components/olympus/god-intelligence-dashboard'), { ssr: false, loading: () => null });
const CostDashboard = dynamic(() => import('@/components/olympus/cost-dashboard'), { ssr: false, loading: () => null });
// Read-only panel showing real-world benchmark totals. Recording is opt-in
// via Settings → Benchmark Recording.
const BenchmarksPanel = dynamic(() => import('@/components/olympus/benchmarks-panel'), { ssr: false, loading: () => null });
const ActivityTimeline = dynamic(() => import('@/components/olympus/activity-timeline'), { ssr: false, loading: () => null });
const GodDetail = dynamic(() => import('@/components/olympus/god-detail'), { ssr: false, loading: () => null });
// Vault Summary replaces Vault Editor (read-only).
const VaultSummary = dynamic(() => import('@/components/olympus/vault-summary'), { ssr: false, loading: () => null });
// Editor Bridge panel — replaces the old IdePanel (Monaco editor +
// file explorer + terminal tabs). Shows the Terminal Bridge status +
// IDE extension install commands for the user's preferred editor.
const EditorBridgePanel = dynamic(() => import('@/components/olympus/editor-bridge-panel'), { ssr: false, loading: () => null });
// Onboarding wizard (first-run experience).
const OnboardingWizard = dynamic(() => import('@/components/olympus/onboarding-wizard'), { ssr: false, loading: () => null });
// HITL DAG gate toast (approval prompts).
const HitlGateToast = dynamic(() => import('@/components/olympus/hitl-gate-toast'), { ssr: false, loading: () => null });
// Quick Open fuzzy file finder (Cmd/Ctrl+P).
const QuickOpen = dynamic(() => import('@/components/olympus/quick-open'), { ssr: false, loading: () => null });
const InteractiveTerminal = dynamic(() => import('@/components/olympus/interactive-terminal'), { ssr: false, loading: () => null });
const LivePreview = dynamic(() => import('@/components/olympus/live-preview'), { ssr: false, loading: () => null });
const CustomFrames = dynamic(() => import('@/components/olympus/custom-frames'), { ssr: false, loading: () => null });
const SSEStreamPanel = dynamic(() => import('@/components/olympus/sse-stream-panel'), { ssr: false, loading: () => null });
const ShortcutsOverlay = dynamic(() => import('@/components/olympus/shortcuts-overlay'), { ssr: false, loading: () => null });
const TimeSlider = dynamic(() => import('@/components/olympus/time-slider'), { ssr: false, loading: () => null });
const ProviderSettings = dynamic(() => import('@/components/olympus/provider-settings'), { ssr: false, loading: () => null });
const MCPConfigPanel = dynamic(() => import('@/components/olympus/mcp-config-panel'), { ssr: false, loading: () => null });
const SettingsDialog = dynamic(() => import('@/components/olympus/settings-dialog'), { ssr: false, loading: () => null });
const NewProjectDialog = dynamic(() => import('@/components/olympus/new-project-dialog'), { ssr: false, loading: () => null });
// Symphony visual overlay container REMOVED — the brain stays minimalist.
// Symphony remains as the always-on background communication protocol
// (see src/lib/symphony/), but the canvas ring overlay is no longer rendered.

/* ------------------------------------------------------------------ */
/* RightPane — extracted outside the component to prevent remounting.  */
/* When defined inside OlympusWorkspace, each render creates a new      */
/* component type, causing React to unmount/remount the entire right    */
/* pane tree (killing terminal PTYs, losing Monaco state, etc.).       */
/* ------------------------------------------------------------------ */
function RightPane({ rightTab, setRightTab }: { rightTab: string; setRightTab: (t: any) => void }) {
  return (
    <div className="h-full flex flex-col bg-olympus-bg">
      <div className="h-9 shrink-0 flex items-center border-b border-olympus-gold/10 bg-olympus-panel px-1">
        <Tab id="terminal" icon={TerminalIcon} label="Terminal" active={rightTab === 'terminal'} onClick={() => setRightTab('terminal')} />
        <Tab id="ide" icon={Code2} label="Editor" active={rightTab === 'ide'} onClick={() => setRightTab('ide')} />
        <Tab id="editor" icon={Library} label="Vault" active={rightTab === 'editor'} onClick={() => setRightTab('editor')} />
        <Tab id="frames" icon={LayoutGrid} label="Frames" active={rightTab === 'frames'} onClick={() => setRightTab('frames')} />
        <div className="flex-1" />
      </div>
      <div className="flex-1 min-h-0 relative">
        	{/* visibility:hidden instead of display:none for inactive tabs —
	    display:none gives the container 0 dimensions, preventing xterm.js
	    from opening (term.open() needs non-zero container dimensions).
	    ConPTY hangs if xterm.js can't respond to cursor-position queries.
	    visibility:hidden keeps layout dimensions so term.open() works. */}
        <div className="absolute inset-0" style={{ visibility: rightTab === 'terminal' ? 'visible' : 'hidden', zIndex: rightTab === 'terminal' ? 1 : 0 }}>
          <ChunkErrorBoundary><InteractiveTerminal /></ChunkErrorBoundary>
        </div>
        <div className="absolute inset-0" style={{ visibility: rightTab === 'ide' ? 'visible' : 'hidden', zIndex: rightTab === 'ide' ? 1 : 0 }}>
          <ChunkErrorBoundary><EditorBridgePanel /></ChunkErrorBoundary>
        </div>
        <div className="absolute inset-0" style={{ visibility: rightTab === 'editor' ? 'visible' : 'hidden', zIndex: rightTab === 'editor' ? 1 : 0 }}>
          <ChunkErrorBoundary><VaultSummary /></ChunkErrorBoundary>
        </div>
        <div className="absolute inset-0" style={{ visibility: rightTab === 'frames' ? 'visible' : 'hidden', zIndex: rightTab === 'frames' ? 1 : 0 }}>
          <ChunkErrorBoundary><CustomFrames /></ChunkErrorBoundary>
        </div>
      </div>
    </div>
  );
}

function Tab({ id, icon: Icon, label, active, onClick }: { id: string; icon: any; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 px-3 h-9 text-[11px] font-mono border-r border-olympus-gold/10 transition-all relative',
        active
          ? 'text-olympus-gold bg-olympus-gold/10'
          : 'text-olympus-text-dim hover:text-olympus-text hover:bg-olympus-gold/5',
      )}
    >
      <Icon size={13} strokeWidth={1.75} />
      {label}
      {active && (
        <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-linear-to-r from-olympus-gold/0 via-olympus-gold to-olympus-gold/0" />
      )}
    </button>
  );
}

export default function OlympusWorkspace() {
  const setGraphData = useOlympus(s => s.setGraphData);
  const leftPane = useOlympus(s => s.leftPane);
  const rightTab = useOlympus(s => s.rightTab);
  const setRightTab = useOlympus(s => s.setRightTab);
  const pushEvent = useOlympus(s => s.pushEvent);
  const pushPulse = useOlympus(s => s.pushPulse);
  const setActiveGod = useOlympus(s => s.setActiveGod);
  const setSseConnected = useOlympus(s => s.setSseConnected);
  const activeProject = useOlympus(s => s.activeProject);
  const refreshProjects = useOlympus(s => s.refreshProjects);
  const focusMode = useOlympus(s => s.focusMode);
  const quickOpenOpen = useOlympus(s => s.quickOpenOpen);
  const setQuickOpenOpen = useOlympus(s => s.setQuickOpenOpen);
  const [health, setHealth] = useState<any>(null);
  const [brainHealth, setBrainHealth] = useState<any>(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  // Onboarding wizard (first-run only).
  const [onboardingOpen, setOnboardingOpen] = useState(false);

  // Ref to the ResizablePanelGroup so focus mode can set the exact
  // group layout (0/100 when hidden, 50/50 when open). Avoiding the
  // Panel collapse/expand API prevents the left panel from getting stuck
  // in a collapsed state where the drag handle can no longer reopen it.
  const groupRef = useRef<GroupImperativeHandle>(null);

  // Set the group layout when focus mode changes. Keeps RightPane mounted
  // in the same React subtree position, preventing remounts that would kill
  // PTYs and lose state.
  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;
    if (focusMode) {
      group.setLayout({ left: 0, right: 100 });
    } else {
      group.setLayout({ left: 50, right: 50 });
    }
  }, [focusMode]);

  // GLOBAL_TICK_PATCH — applied ONCE at app root, NEVER removed.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const origRAF = window.requestAnimationFrame.bind(window);
    if ((window as any).__olympusRAFPatched) return;
    (window as any).__olympusRAFPatched = true;
    window.requestAnimationFrame = function(cb: FrameRequestCallback): number {
      return origRAF((ts: number) => {
        try {
          cb(ts);
        } catch (e: any) {
          const msg = e?.message || String(e);
          if (msg.includes('state.layout') || msg.includes("'tick'") || msg.includes('layoutTick')) {
            return;
          }
          throw e;
        }
      });
    };
    const origOnError = window.onerror;
    window.onerror = function(message, source, lineno, colno, error) {
      const msg = String(message || '');
      if (msg.includes('state.layout') || msg.includes("'tick'") || msg.includes('layoutTick')) {
        return true;
      }
      if (origOnError) return origOnError(message, source, lineno, colno, error);
      return false;
    };
  }, []);

  // Load graph + health on mount
  // cache: 'no-store' on every fetch so the brain graph and health reflect
  // live state (was previously showing stale snapshots from browser cache).
  useEffect(() => {
    fetch('/api/olympus/graph', { cache: 'no-store' })
      .then(r => r.json())
      .then(d => {
        setGraphData(d.graph);
        setBrainHealth(d.health);
        setHealth(d.health);
      })
      .catch(() => {});
    const brainIv = setInterval(() => {
      fetch('/api/olympus/graph', { cache: 'no-store' })
        .then(r => r.json())
        .then(d => { setBrainHealth(d.health); })
        .catch(() => {});
    }, 30000);
    const iv = setInterval(() => {
      fetch('/api/olympus/health', { cache: 'no-store' }).then(r => r.json()).then(setHealth).catch(() => {});
    }, 15000);
    return () => { clearInterval(brainIv); clearInterval(iv); };
  }, [setGraphData]);

  // Refresh health + graph when the user switches panes (instead of waiting
  // up to 30s for the next poll). Also refreshes on window focus so counts
  // stay live when a god creates a new demigod/skill.
  useEffect(() => {
    fetch('/api/olympus/graph', { cache: 'no-store' })
      .then(r => r.json())
      .then(d => { if (d.health) { setBrainHealth(d.health); setHealth(d.health); } })
      .catch(() => {});
  }, [leftPane]);

  useEffect(() => {
    const onFocus = () => {
      fetch('/api/olympus/graph', { cache: 'no-store' })
        .then(r => r.json())
        .then(d => { if (d.health) { setBrainHealth(d.health); setHealth(d.health); } })
        .catch(() => {});
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  useEffect(() => { refreshProjects(); }, [refreshProjects]);
  useEffect(() => {
    const slug = activeProject?.slug;
    const url = slug ? `/api/olympus/graph?project=${encodeURIComponent(slug)}` : '/api/olympus/graph';
    fetch(url, { cache: 'no-store' }).then(r => r.json()).then(d => { setGraphData(d.graph); if (d.health) setBrainHealth(d.health); }).catch(() => {});
  }, [activeProject?.slug]);

  // Editor Bridge migration — one-time lazy migration of any project that
  // still has a vscodium_workspace frontmatter field to external_editor.
  // Idempotent, gated on a localStorage flag.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const MIGRATION_KEY = 'olympus:editor-bridge-migrated';
    if (localStorage.getItem(MIGRATION_KEY) === 'done') return;
    fetch('/api/olympus/editor/detect?migrate=1', { cache: 'no-store' })
      .then(r => r.json())
      .then((d: any) => {
        localStorage.setItem(MIGRATION_KEY, 'done');
        if (d?.migration?.migrated && d.migration.migrated > 0) {
          toast.success(
            `Migrated ${d.migration.migrated} project${d.migration.migrated === 1 ? '' : 's'} from VSCodium to the new Editor Bridge`,
            { description: 'Open the Editor Bridge tab to pick your preferred editor.' },
          );
        }
      })
      .catch(() => {
        // Migration is best-effort; don't bother the user on failure.
        localStorage.setItem(MIGRATION_KEY, 'done');
      });
  }, []);

  // priority-3 patch — check onboarding status on launch. If the user
  // hasn't completed onboarding (~/.olympus/onboarding-completed doesn't exist),
  // show the 3-step wizard.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    fetch('/api/olympus/onboarding', { cache: 'no-store' })
      .then(r => r.json())
      .then((d: any) => {
        if (d?.completed === false) {
          setOnboardingOpen(true);
        }
      })
      .catch(() => {});
  }, []);

  // SSE activity stream
  useEffect(() => {
    let es: EventSource | null = null;
    let reconnect: any;
    function connect() {
      es = new EventSource('/api/olympus/activity');
      es.onopen = () => setSseConnected(true);
      es.onerror = () => { setSseConnected(false); es?.close(); reconnect = setTimeout(connect, 3000); };
      es.onmessage = (e) => {
        try {
          const ev: ActivityEvent = JSON.parse(e.data);
          pushEvent(ev);
          if (ev.type === 'delegation' && ev.from && ev.to) {
            pushPulse(ev.from, ev.to);
            setActiveGod(ev.to);
          } else if (ev.type === 'dispatch' && ev.god) {
            setActiveGod(ev.god);
          }
        } catch {}
      };
    }
    connect();
    return () => { es?.close(); clearTimeout(reconnect); };
  }, [pushEvent, pushPulse, setActiveGod, setSseConnected]);

  // Global keyboard shortcuts.
  //   Cmd/Ctrl+B  -> toggle Focus Mode
  //   Cmd/Ctrl+`  -> switch to the Terminal tab
  //   Cmd/Ctrl+Shift+E -> switch to the Editor Bridge tab
  //   Cmd/Ctrl+P  -> Quick Open fuzzy file finder
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const inField = (e.target as HTMLElement)?.matches?.('input, textarea, [contenteditable]');
      const cmd = e.metaKey || e.ctrlKey;
      if (e.key === '?' && !inField) {
        e.preventDefault();
        setShortcutsOpen(o => !o);
      }
      if (e.key === '/' && !inField) {
        e.preventDefault();
        const searchInput = document.querySelector('input[placeholder*="fuzzy"]') as HTMLInputElement;
        searchInput?.focus();
      }
      // Focus Mode toggle — works even when a field is focused (it's a window
      // control, not a typing shortcut).
      if (cmd && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        useOlympus.getState().toggleFocusMode();
      }
      // Quick-switch to Terminal tab.
      if (cmd && e.key === '`') {
        e.preventDefault();
        useOlympus.getState().setRightTab('terminal');
      }
      // Cmd/Ctrl+Shift+E switches to the Editor Bridge tab.
      if (cmd && e.shiftKey && e.key.toLowerCase() === 'e') {
        e.preventDefault();
        useOlympus.getState().setRightTab('ide');
      }
      // Quick Open (Cmd/Ctrl+P) opens a fuzzy file finder; selecting a
      // file launches the user's external editor on that file.
      if (cmd && !e.shiftKey && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        useOlympus.getState().toggleQuickOpen();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <ChunkErrorBoundary>
    <div suppressHydrationWarning className="h-screen w-screen flex flex-col bg-olympus-bg text-olympus-text overflow-hidden">
      <StatusBar health={brainHealth ?? health} />

      <div suppressHydrationWarning className="flex-1 flex min-h-0">
        {/* Focus Mode: hide the entire left dashboard so the right pane
            takes full width. RightPane is always mounted in the same React
            position to prevent remount-side effects (PTY death, state loss).
            The split is controlled via the group ref (group.setLayout) so
            the left panel reliably returns to 50% when focus mode is off.
            The ActivityBar and ResizableHandle are hidden via CSS
            (display:none). No remounts = no state loss. */}

        {/* ActivityBar — conditionally rendered. Focus Mode hides it.
            State lives in Zustand, so remounting is harmless. */}
        {!focusMode && <ActivityBar />}

        {/* ResizablePanelGroup — always mounted.
            Left panel is collapsible (via imperative API) for focus mode.
            Right panel contains RightPane (always mounted). */}
        <RawGroup groupRef={groupRef} orientation="horizontal" className="flex flex-1 h-full w-full" suppressHydrationWarning>
          {/* Left dashboard panel.
              When focusMode is on, the useEffect above calls group.setLayout()
              which sets its size to 0. Content is hidden via display:none. */}
          <RawPanel
            id="left"
            defaultSize={50}
            minSize={20}
            // Hide the panel content via CSS when focus mode is on (size 0).
            // The panel itself has width:0, but its content might still be
            // visible briefly during the resize animation. This wrapper ensures
            // it's hidden immediately.
            style={{ display: focusMode ? 'none' : undefined, overflow: 'hidden' }}
          >
            <div className="h-full flex relative">
              <FilterSidebar />
              <div className="flex-1 relative min-w-0">
                {leftPane === 'brain' && <ChunkErrorBoundary><BrainGraph3D /></ChunkErrorBoundary>}
                {leftPane === 'live-preview' && <ChunkErrorBoundary><LivePreview /></ChunkErrorBoundary>}
                {leftPane === 'god-intelligence' && <ChunkErrorBoundary><GodIntelligenceDashboard health={health} /></ChunkErrorBoundary>}
                {leftPane === 'cost' && <ChunkErrorBoundary><CostDashboard /></ChunkErrorBoundary>}
                {leftPane === 'benchmarks' && <ChunkErrorBoundary><BenchmarksPanel /></ChunkErrorBoundary>}
                {leftPane === 'timeline' && <ChunkErrorBoundary><ActivityTimeline /></ChunkErrorBoundary>}
                {leftPane === 'god-detail' && <ChunkErrorBoundary><GodDetail /></ChunkErrorBoundary>}
                {leftPane === 'provider-settings' && <ChunkErrorBoundary><ProviderSettings /></ChunkErrorBoundary>}
                {leftPane === 'mcp-config' && <ChunkErrorBoundary><MCPConfigPanel /></ChunkErrorBoundary>}
                {leftPane === 'brain' && <TimeSlider />}
                {/* Symphony visual overlay REMOVED — the brain stays minimalist.
                    Symphony remains as the always-on background communication
                    protocol between Gods and Demigods (see src/lib/symphony/),
                    but the vibrational ring overlay is no longer rendered on
                    top of the brain atlas. */}
                {/* NodeDetailPanel REMOVED — clicking a skill / instinct /
                    knowledge node now opens the DocumentViewerModal (rendered
                    inside BrainGraph3D) which shows the actual source document.
                    God nodes switch leftPane to 'god-detail' via setSelectedNode.
                    The node-detail-panel.tsx file is intentionally left in place
                    for manual deletion if desired. */}
              </div>
            </div>
          </RawPanel>

          {/* Resizable handle — hidden via CSS when focusMode is on.
              `disabled` prevents drag interaction while hidden. */}
          <ResizableHandle
            withHandle
            disabled={focusMode}
            className={cn(
              'bg-olympus-gold/10 hover:bg-olympus-gold/30 transition-colors',
              focusMode && 'pointer-events-none opacity-0',
            )}
          />

          {/* Right panel — RightPane is ALWAYS MOUNTED here.
              This is the key fix: RightPane never unmounts, so PTYs,
              Monaco state, terminal chat history, and frames state
              are all preserved across focus mode toggles. */}
          <ResizablePanel id="right" defaultSize={50} minSize={25}>
            <RightPane rightTab={rightTab} setRightTab={setRightTab} />
          </ResizablePanel>
        </RawGroup>
      </div>
      <SSEStreamPanel />

      {/* Global overlays — Command Palette removed. */}
      <ShortcutsOverlay open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />

      {/* Quick Open (Cmd/Ctrl+P). Selecting a file launches the user's external editor on its parent directory. */}
      <QuickOpen
        open={quickOpenOpen}
        onClose={() => setQuickOpenOpen(false)}
        onSelect={async (filePath) => {
          // Launch the user's external editor on the file's parent directory.
          // The editor opens with the file visible in its tree.
          const parentDir = filePath.split('/').slice(0, -1).join('/') || '/';
          try {
            const r = await fetch('/api/olympus/editor/launch', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ projectPath: parentDir }),
            });
            const d = await r.json();
            if (!r.ok || !d.ok) {
              throw new Error(d.error || `HTTP ${r.status}`);
            }
            toast.success(`Opened ${d.editorName} on ${parentDir.split('/').pop()}`);
          } catch (e: any) {
            toast.error(`Editor launch failed: ${e.message}`);
          }
        }}
      />

      <SettingsDialog />
      <NewProjectDialog />

      {/* First-run onboarding wizard. */}
      <OnboardingWizard open={onboardingOpen} onClose={() => setOnboardingOpen(false)} />

      {/* HITL DAG gate toast (approval prompts). */}
      <HitlGateToast />
    </div>
    </ChunkErrorBoundary>
  );
}
