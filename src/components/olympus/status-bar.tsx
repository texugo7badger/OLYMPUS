/**
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

'use client';

import { useEffect, useState } from 'react';
import { useOlympus, GOD_ICONS } from '@/lib/olympus-store';
import {
 Wifi, WifiOff, DollarSign, Key, Terminal,
 Minus, Square, X, Copy, PanelLeftClose, PanelLeftOpen,
 Lightbulb, Gauge, Layers, Users,
} from 'lucide-react';
import dynamic from 'next/dynamic';

const CompactBrainButton = dynamic(() => import('./compact-brain-button'), { ssr: false });
const ProjectSwitcher = dynamic(() => import('./project-switcher'), { ssr: false });
const ApiConfigDialog = dynamic(() => import('./api-config-dialog'), { ssr: false });
import { cn } from '@/lib/utils';
import OlympusTooltip from './olympus-tooltip';
import { useWorkingGods } from '@/lib/use-working-gods';

interface ProviderInfo {
 name: string; isFree: boolean; displayName: string; capsDisplay: string;
}

/* ------------------------------------------------------------------ */
/* StatusBar (top bar, 28px). */
/* Window controls on the far left after the OLYMPUS logo. */
/* The entire bar is the drag region; interactive children opt out. */
/* macOS: 80px left padding for native traffic lights. */
/* Windows production: native titleBarOverlay handles controls. */
/* Linux + dev mode: custom controls rendered on the left. */
/* ------------------------------------------------------------------ */

function shouldShowCustomWindowControls(): boolean {
 	if (typeof window === 'undefined') return false;
 	if (!window.olympus?.isElectron?.()) return false;
 	// process.platform is not available in sandboxed Electron renderer.
 	// Use preload-provided getOsInfo() instead, with try/catch for safety.
 	try {
 const osInfo = window.olympus?.getOsInfo?.();
 if (osInfo?.platform === 'darwin') return false;
 } catch {
 // If getOsInfo throws (preload not ready, IPC failed), assume non-mac
 // so window controls are shown — safer than hiding them.
 }
 return true;
}

export default function StatusBar({ health }: { health: any }) {
 const activeGod = useOlympus(s => s.activeGod);
 // W-D1: the idle fallback reads the user's SELECTED god (its own comment
 // always claimed it) — activeGod alone is the live session, reset to
 // apollo on every submit.
 const selectedGod = useOlympus(s => s.selectedGod);
 const fallbackGod = selectedGod ?? activeGod;
 // W0-A: the WORKING gods strip — the live set replaces the static
 // 'active god: Apollo' label. Icons side by side, blinking while the
 // gods work, no names (the user's directive).
 const workingGods = useWorkingGods();
 const sseConnected = useOlympus(s => s.sseConnected);
 const eventsCount = useOlympus(s => s.events.length);
 const setLeftPane = useOlympus(s => s.setLeftPane);
 const focusMode = useOlympus(s => s.focusMode);
 const toggleFocusMode = useOlympus(s => s.toggleFocusMode);
 // #179: the split cost pair — Real (provider-reported, honestly $0.00 on
 // free lanes) + Estimated (heuristic per-tool figure). Never a mixed total.
 const [cost, setCost] = useState<{
	 realUsd: number; estimatedUsd: number; totalTokens: number; provider: ProviderInfo;
 } | null>(null);
 const [apiConfigOpen, setApiConfigOpen] = useState(false);
 const [apiConfigsCount, setApiConfigsCount] = useState(0);
 const [winWidth, setWinWidth] = useState<number>(typeof window !== 'undefined' ? window.innerWidth : 1920);
 const [isMaximized, setIsMaximized] = useState(false);
 const [isElectron, setIsElectron] = useState(false);
 const [isMac, setIsMac] = useState(false);

 useEffect(() => {
 setIsElectron(!!window.olympus?.isElectron?.());
 	// Use preload-provided getOsInfo() (process.platform is not available
 	// in sandboxed Electron renderer).
 	try {
 setIsMac(window.olympus?.getOsInfo?.()?.platform === 'darwin');
 } catch {
 setIsMac(false);
 }
 if (window.olympus?.window?.isMaximized) {
 setIsMaximized(window.olympus.window.isMaximized());
 }
 if (window.olympus?.window?.onMaximizeChange) {
 window.olympus.window.onMaximizeChange(setIsMaximized);
 }
 return () => {
 window.olympus?.window?.offMaximizeChange?.();
 };
 }, []);

 useEffect(() => {
 const onResize = () => setWinWidth(window.innerWidth);
 window.addEventListener('resize', onResize);
 return () => window.removeEventListener('resize', onResize);
 }, []);

 useEffect(() => {
 	// Use cache: 'no-store' so API key status reflects changes immediately.
 	fetch('/api/olympus/api-configs', { cache: 'no-store' }).then(r => r.json()).then(d => {
 const configured = Object.values(d.configs || {}).filter(Boolean).length;
 setApiConfigsCount(configured);
 }).catch(() => {});
 }, [apiConfigOpen]);

 useEffect(() => {
	// Use cache: 'no-store' so cost reflects the latest events.
	 const load = () => fetch('/api/olympus/costs', { cache: 'no-store' }).then(r => r.json()).then(d => {
	 // #179: prefer the real provider-reported token aggregate; the mixed
	 // input+output totals are only the pre-split fallback.
	 const realTok = d.realTokens ? (d.realTokens.input ?? 0) + (d.realTokens.output ?? 0) : null;
	 setCost({
		 realUsd: d.totalSpendRealUsd ?? d.totalSpend ?? 0,
		 estimatedUsd: d.totalSpendEstimatedUsd ?? 0,
		 totalTokens: realTok ?? (d.totalInput ?? 0) + (d.totalOutput ?? 0),
		 provider: d.provider,
	 });
	 }).catch(() => {});
 load();
 const iv = setInterval(load, 10000);
 return () => clearInterval(iv);
 }, []);

	 const prov = cost?.provider;
	 const isFree = prov?.isFree ?? false;
	 const realUsd = cost?.realUsd ?? 0;
	 const estimatedUsd = cost?.estimatedUsd ?? 0;
	 const totalTokens = cost?.totalTokens ?? 0;
 const ActiveGodIcon = fallbackGod ? GOD_ICONS[fallbackGod] : null;

 const compact = winWidth < 1200;
 const hideProject = winWidth < 900;
 const iconOnly = winWidth < 700;
 const hideVersion = winWidth < 1100;
 const hideCli = winWidth < 1000;

 const showCustomWindowControls = shouldShowCustomWindowControls();

 return (
 <div
 data-drag-region
	 // Flat background (single panel color — no gradient).
	 className="h-7 shrink-0 bg-olympus-panel border-b border-olympus-gold/10 flex items-center justify-between px-3 text-[11px] font-mono text-olympus-text-dim select-none"
 style={{ WebkitAppRegion: 'drag', paddingLeft: isMac && isElectron ? 80 : 12 } as React.CSSProperties}
 >
	 {/* LEFT SIDE: logo + window controls + Compact Brain + focus mode + nav info */}
 <div className="flex items-center gap-3 min-w-0" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
 <div className="flex items-center gap-1.5 text-olympus-gold font-semibold shrink-0">
 <img src="/logo.svg" alt="OLYMPUS" className="size-5" />
 <span>OLYMPUS</span>
              {!hideVersion && (
   <span className="text-olympus-text-dim font-normal" data-tip="OLYMPUS version">
     v{(typeof window !== 'undefined' && (window as any).__OLYMPUS_VERSION__) || '0.0.15'}
   </span>
)}
 </div>

	 {/* Focus Mode toggle. */}
		 <button
 onClick={toggleFocusMode}
 aria-label={focusMode ? 'Expand left dashboard' : 'Collapse left dashboard'}
 className={cn(
 'flex items-center justify-center w-6 h-5 rounded transition-colors shrink-0',
 focusMode
 ? 'text-olympus-gold bg-olympus-gold/10 hover:bg-olympus-gold/20'
 : 'text-olympus-text-dim hover:text-olympus-gold hover:bg-olympus-gold/10',
 )}
 >
 {focusMode ? <PanelLeftOpen size={12} /> : <PanelLeftClose size={12} />}
 </button>

 {/* Compact Brain button — to the RIGHT of Focus Mode. */}
 <CompactBrainButton />

 <div className="w-px h-3 bg-olympus-gold/15 shrink-0" />
 {/* W0-A: the WORKING-GODS strip — every god working RIGHT NOW, icons
     side by side, blinking (animate-pulse), NO names. Falls back to the
     selected god (dimmed, steady) when the machine is idle. */}
 {/* RUN-STATE — the honest "is it working?" pill (2026-10-24). The god
     icons above answer from the 3-minute activity feed, which made a
     HEALTHY 8-minute hop look idle. This pill answers from PROCESS
     evidence: the walk lock's pid + heartbeat (/api/olympus/run-state),
     per the #105 law — no probe, no claim. */}
 <RunStatePill />
 {/* DIAGNOSTIC (2026-10-25): one-click bundle — the user asked for "análise
     dele funcionando em live e tbm o log". Copies the last 5 min of every
     relevant source (masked) to the clipboard. */}
 <OlympusTooltip content="Copy the last 5 min diagnostic bundle (feed + bus + logs + health + lanes) to the clipboard" side="bottom" delay={150}>
   <button
     type="button"
     onClick={async () => {
       try {
         const r = await fetch('/api/olympus/diagnostic', { cache: 'no-store' });
         if (!r.ok) throw new Error(`HTTP ${r.status}`);
         const d = await r.json();
         await navigator.clipboard.writeText(JSON.stringify(d, null, 2));
       } catch (e) {
         console.warn('diagnostic copy failed:', e);
       }
     }}
     className="text-[9px] font-mono text-olympus-text-dim hover:text-olympus-gold transition-colors cursor-pointer px-1"
     aria-label="Copy diagnostic bundle"
   >
     diag
   </button>
 </OlympusTooltip>
 <div className="flex items-center gap-1 shrink-0" data-tip={workingGods.length > 0 ? workingGods.join(' · ') : (fallbackGod || 'idle')}>
 {workingGods.length > 0 ? (
 workingGods.map((g) => {
 const Icon = GOD_ICONS[g];
 return Icon ? (
 <span key={g} className="flex items-center">
 <Icon size={12} className="text-olympus-gold animate-pulse" />
 </span>
 ) : null;
 })
 ) : ActiveGodIcon ? (
 <ActiveGodIcon size={12} className="text-olympus-text-dim" />
 ) : (
 <span className="text-olympus-text-dim text-[10px] font-mono">idle</span>
 )}
 </div>
 {!hideProject && (
 <>
 <div className="w-px h-3 bg-olympus-gold/15 shrink-0" />
 <ProjectSwitcher />
 </>
 )}
 <div className="w-px h-3 bg-olympus-gold/15 shrink-0" />
	 {/* Brain metrics with icons + text labels. Text collapses in
	 compact mode (<1200px) but icons remain for identification. */}
 <div className="flex items-center gap-1.5 shrink-0" aria-label="Brain metrics">
 <span className="text-olympus-text-dim">{compact ? '' : 'brain:'}</span>
 <span className="flex items-center gap-1 text-olympus-green" data-tip="Total instinct files in the brain">
 <Lightbulb size={11} />
 <span>{health?.total_instincts ?? 0}</span>
 {!compact && <span className="text-olympus-text-dim text-[10px]">instincts</span>}
 </span>
 <span className="text-[#5A5A5A]">·</span>
 <span className="flex items-center gap-1 text-olympus-green" data-tip="Average instinct confidence (0.00 – 1.00)">
 <Gauge size={11} />
 <span>{(health?.avg_confidence ?? 0).toFixed(2)}</span>
 {!compact && <span className="text-olympus-text-dim text-[10px]">conf</span>}
 </span>
 <span className="text-[#5A5A5A]">·</span>
 <span className="flex items-center gap-1 text-olympus-cyan" data-tip="Total installed skills">
 <Layers size={11} />
 <span>{health?.total_skills ?? 0}</span>
 {!compact && <span className="text-olympus-text-dim text-[10px]">skills</span>}
 </span>
 <span className="text-[#5A5A5A]">·</span>
 <span className="flex items-center gap-1 text-olympus-purple" data-tip="Total gods + demigods">
 <Users size={11} />
 <span>{health?.total_agents ?? 0}</span>
 {!compact && <span className="text-olympus-text-dim text-[10px]">agents</span>}
 </span>
 </div>
 </div>

 {/* RIGHT SIDE: cost + SSE + APIs (NO window controls — they're on the left now) */}
 <div className="flex items-center gap-3 shrink-0" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
 <button
 onClick={() => setLeftPane('cost')}
 className="flex items-center gap-1.5 px-2 py-0.5 rounded hover:bg-olympus-gold/10 transition-colors"
 >
	 <DollarSign size={11} className={isFree ? 'text-olympus-green' : 'text-olympus-gold'} />
	 <span className={cn('font-semibold', isFree ? 'text-olympus-green' : 'text-olympus-gold')}>
	 {isFree ? `${(totalTokens >= 1000 ? (totalTokens / 1000).toFixed(1) + 'k' : String(totalTokens))} tok` : `$${realUsd.toFixed(2)}`}
	 </span>
	 <span className="text-olympus-text-dim text-[10px] hidden sm:inline" data-tip={estimatedUsd > 0 ? `Est. $${estimatedUsd.toFixed(2)} (heuristic) + real provider spend` : undefined}>
	 {isFree && realUsd === 0 ? '(free)' : `· ${prov?.name ?? '-'}${estimatedUsd > 0 ? ` +~$${estimatedUsd.toFixed(2)} est` : ''}`}
	 </span>
 </button>
 <div className="w-px h-3 bg-olympus-gold/15" />
 <div className="flex items-center gap-1.5">
 {sseConnected
 ? <Wifi size={12} className="text-olympus-green" />
 : <WifiOff size={12} className="text-olympus-text-dim" />}
 <span className={sseConnected ? 'text-olympus-green' : 'text-olympus-text-dim'}>
 {compact ? 'SSE' : `SSE ${sseConnected ? 'live' : 'offline'}`} · {eventsCount}
 </span>
 </div>
 <div className="w-px h-3 bg-olympus-gold/15" />
 <button
 onClick={() => setApiConfigOpen(true)}
 aria-label={`Configure API keys — ${apiConfigsCount} configured`}
 className="flex items-center gap-1.5 px-2 py-0.5 rounded hover:bg-olympus-gold/10 transition-colors"
 >
 <Key size={11} className={apiConfigsCount > 0 ? 'text-olympus-green' : 'text-olympus-gold'} />
 <span className={cn('text-[10px]', apiConfigsCount > 0 ? 'text-olympus-green' : 'text-olympus-gold')}>
 {iconOnly ? '' : `${apiConfigsCount} APIs`}
 </span>
 </button>
 <ApiConfigDialog open={apiConfigOpen} onClose={() => setApiConfigOpen(false)} />

	 {/* Window controls on the right side. */}
 {showCustomWindowControls && (
 <>
 <div className="w-px h-3 bg-olympus-gold/15 mx-1" />
 <div className="flex items-center gap-0.5 shrink-0">
 <button
 onClick={() => window.olympus?.window?.minimize()}
 aria-label="Minimize"
 className="w-6 h-5 flex items-center justify-center text-olympus-text-dim hover:bg-olympus-gold/15 hover:text-olympus-gold transition-colors rounded"
 >
 <Minus size={12} strokeWidth={1.75} />
 </button>
 <button
 onClick={async () => { await window.olympus?.window?.maximizeToggle(); }}
 aria-label={isMaximized ? 'Restore' : 'Maximize'}
 className="w-6 h-5 flex items-center justify-center text-olympus-text-dim hover:bg-olympus-gold/15 hover:text-olympus-gold transition-colors rounded"
 >
 {isMaximized ? <Copy size={10} strokeWidth={1.75} /> : <Square size={10} strokeWidth={1.75} />}
 </button>
 <button
 onClick={() => window.olympus?.window?.close()}
 aria-label="Close"
 className="w-6 h-5 flex items-center justify-center text-olympus-text-dim hover:bg-olympus-red/30 hover:text-olympus-red transition-colors rounded"
 >
 <X size={12} strokeWidth={1.75} />
 </button>
 </div>
 </>
 )}
 </div>
 </div>
 );
}

/* ------------------------------------------------------------------ */
/* RunStatePill — "RUNNING / PARKED / IDLE / UNVERIFIED" with evidence. */
/* ------------------------------------------------------------------ */
/* The 2026-10-24 specimen: the user could never tell whether the machine
   was working. The god-icon strip answers from the activity feed (a
   3-minute window), so a healthy 8-minute hop read as idle and five
   concurrent walkers read as one confused god.

   This pill answers from /api/olympus/run-state, which is built on PROCESS
   evidence (the walk lock's pid + heartbeat, the hop state on disk) — the
   #105 law applied to liveness: no probe, no claim. A `disk-only` answer
   renders the literal refusal, never a green dot. */
function RunStatePill() {
 const [state, setState] = useState<{
  verdict: 'RUNNING' | 'PARKED' | 'IDLE' | 'UNVERIFIED';
  line: string;
  evidence: string;
  blockedCount: number;
 } | null>(null);

 useEffect(() => {
  let cancelled = false;
  const tick = async () => {
   try {
    const res = await fetch('/api/olympus/run-state', { cache: 'no-store' });
    if (!res.ok) return;
    const d = await res.json();
    if (cancelled) return;
    setState({
     verdict: d.verdict,
     line: d.line,
     evidence: d.evidence,
     blockedCount: d?.laneHealth?.blockedCount ?? 0,
    });
   } catch { /* a dead API never breaks the status bar */ }
  };
  tick();
  // 10s: fast enough that a park/start is felt, slow enough to stay free.
  const iv = setInterval(tick, 10_000);
  return () => { cancelled = true; clearInterval(iv); };
 }, []);

 if (!state) return null;

 const tone =
  state.verdict === 'RUNNING' ? 'text-olympus-green'
  : state.verdict === 'PARKED' ? 'text-olympus-red'
  : state.verdict === 'UNVERIFIED' ? 'text-olympus-gold'
  : 'text-olympus-text-dim';
 const dot =
  state.verdict === 'RUNNING' ? 'bg-olympus-green animate-pulse'
  : state.verdict === 'PARKED' ? 'bg-olympus-red'
  : state.verdict === 'UNVERIFIED' ? 'bg-olympus-gold'
  : 'bg-olympus-text-dim/50';

 return (
  <span
   className={cn('flex items-center gap-1 shrink-0 text-[10px] font-mono', tone)}
   data-tip={`${state.line}\n\nevidence: ${state.evidence}${state.blockedCount ? `\n\n${state.blockedCount} dead model lane(s) — open Settings → LLM Strategy` : ''}`}
  >
   <span className={cn('w-1.5 h-1.5 rounded-full', dot)} />
   <span className="hidden xl:inline">{state.verdict}</span>
   {state.blockedCount > 0 && (
    <OlympusTooltip
      content={`${state.blockedCount} dead model lane(s) (quota/route/key) — click to inspect and retry`}
      side="bottom"
      delay={150}
    >
      <button
        type="button"
        onClick={() => {
          useOlympus.getState().setLeftPane('provider-settings');
        }}
        className="text-olympus-red/90 hover:text-olympus-red font-bold cursor-pointer transition-colors"
        aria-label={`${state.blockedCount} dead model lanes — open LLM Strategy`}
      >
        ⚠
      </button>
    </OlympusTooltip>
   )}
  </span>
 );
}
