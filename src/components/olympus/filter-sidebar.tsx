/**
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

'use client';

import { useOlympus } from '@/lib/olympus-store';
import { Filter, ChevronLeft, ChevronRight, Globe, Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import OlympusTooltip from './olympus-tooltip'; // P9 — replaces native title=

/* ------------------------------------------------------------------ */
/* Filter Sidebar — collapsible (Issue 6) + distinct pastel colors */
/* (Issue 12). */
/* */
/* Added Scope filters:
/* - scopeGlobal: show global instincts (rule 1, 2) */
/* - scopeStack: show stack-scoped instincts (rule 3) */
/* - scopeProject: show project-bound instincts (rule 4) */
/* - showCrossStack: show cross-stack promoted instincts (rule 2b) */
/* */
/* The scope filters are visual hints — actual filtering happens */
/* server-side in /api/olympus/graph based on the active project. */
/* These checkboxes are HIDE-only (you can hide a scope you don't */
/* want to see, but you can't surface instincts that the server */
/* already filtered out). */
/* */
/* Several UX issues addressed:
/* 1. Instincts filter now actually surfaces instinct nodes (the */
/* root cause was server-side: loadAllInstincts() wasn't */
/* traversing the seed/empirical/_archive subdirectories). */
/* 2. Projects + Evolved filters render with a "0" count badge even */
/* when no nodes of that type exist yet, so the user can see they */
/* are functional (they will populate as the vault grows). */
/* 3. Removed the OlympusTooltip wrappers from the SCOPE filter */
/* items — the user found them unnecessary. The scope items now */
/* behave like the Type items (plain checkbox rows). */
/* 4. min confidence slider — value badge is now on the same row as */
/* the label (right-aligned), and the slider track is slightly */
/* taller for easier dragging. The slider is functional: it */
/* filters instinct nodes by effective confidence. */
/* 5. All filter rows share the same height, padding, and alignment */
/* so the Type and Scope sections look like one cohesive list. */
/* ------------------------------------------------------------------ */
export default function FilterSidebar() {
 const filters = useOlympus(s => s.filters);
 const toggleFilter = useOlympus(s => s.toggleFilter);
 const setMinConfidence = useOlympus(s => s.setMinConfidence);
 const collapsed = useOlympus(s => s.filterSidebarCollapsed);
 const toggle = useOlympus(s => s.toggleFilterSidebar);
 const activeProject = useOlympus(s => s.activeProject);
 const graphData = useOlympus(s => s.graphData);

 // Phase 2 (P4.F): visible/hidden node counts.
 const totalNodes = graphData?.nodes?.length ?? 0;
  const visibleNodes = graphData?.nodes?.filter((n: any) => {
 const tk = n.type === 'god' ? 'god' : n.type === 'instinct' ? 'instinct' : n.type === 'knowledge' ? 'knowledge' : null;
 if (!tk) return true;
 return (filters as any)[tk] !== false;
 }).length ?? 0;
 const hiddenNodes = Math.max(0, totalNodes - visibleNodes);

 	// Per-type counts (from the raw graph data, before the
 // filter is applied). Shown as a small badge on each filter row so the
 // user can see at a glance how many of each type exist in the brain
 // (and that Projects / Evolved will populate later).
 const counts: Record<string, number> = { god: 0, instinct: 0, knowledge: 0 };
 if (graphData?.nodes) {
 for (const n of graphData.nodes) {
 const t = (n as any)?.type;
 if (typeof t === 'string' && t in counts) counts[t]++;
 }
 }

 // Issue 12 — clearly distinct pastel colors per filter type.
 const items: { key: keyof typeof filters; label: string; color: string }[] = [
   { key: 'god', label: 'Gods', color: '#D4A574' },
   { key: 'instinct', label: 'Instincts', color: '#7BAE8E' },
   { key: 'knowledge', label: 'Knowledge', color: '#6BAEB5' },
  ];

 // Scope filters (NEW) — tooltips removed per user request.
 const scopeItems: { key: keyof typeof filters; label: string; color: string }[] = [
 { key: 'scopeGlobal', label: 'Global', color: '#7BAE8E' },
 { key: 'scopeStack', label: 'Stack', color: '#6BAEB5' },
 { key: 'scopeProject', label: 'Project', color: '#9B7BAE' },
 { key: 'showCrossStack', label: 'Cross-stack', color: '#C4A265' },
 ];

 if (collapsed) {
 return (
 <div
 className="shrink-0 bg-olympus-panel border-r border-olympus-gold/10 flex flex-col items-center py-2 transition-all duration-200"
 style={{ width: '24px' }}
 >
 <OlympusTooltip content="Expand filters" side="right">
 <button
 onClick={toggle}
 className="w-5 h-5 rounded flex items-center justify-center text-olympus-text-dim hover:text-olympus-gold hover:bg-olympus-gold/10 transition-colors"
 >
 <ChevronRight size={12} />
 </button>
 </OlympusTooltip>
 <div className="mt-2 [writing-mode:vertical-rl] rotate-180 text-[9px] font-mono text-olympus-text-dim uppercase tracking-wider">
 Filters
 </div>
 <Filter size={11} className="mt-2 text-olympus-text-dim" />
 </div>
 );
 }

 return (
 <div
 className="shrink-0 bg-olympus-panel border-r border-olympus-gold/10 p-2.5 flex flex-col gap-2 overflow-y-auto custom-scroll transition-all duration-200"
 style={{ width: '176px' }}
 >
 <div className="flex items-center justify-between">
 <div className="flex items-center gap-1.5 px-1 text-[10px] font-semibold text-olympus-text-dim uppercase tracking-wide">
 <Filter size={11} /> Filters
 </div>
 <OlympusTooltip content="Collapse filters" side="right">
 <button
 onClick={toggle}
 className="w-5 h-5 rounded flex items-center justify-center text-olympus-text-dim hover:text-olympus-gold hover:bg-olympus-gold/10 transition-colors"
 >
 <ChevronLeft size={12} />
 </button>
 </OlympusTooltip>
 </div>

 {/* Phase 2 (P4.F) — Project Scope indicator */}
 <div className={cn('px-2 py-1.5 rounded border', activeProject ? 'bg-olympus-purple/10 border-olympus-purple/20' : 'bg-olympus-green/10 border-olympus-green/20')}>
 <div className="flex items-center gap-1 text-[9px] font-mono uppercase tracking-wide">
 {activeProject ? <><Globe size={9} className="text-olympus-purple" /><span className="text-olympus-purple">Project Mode</span></> : <><Globe size={9} className="text-olympus-green" /><span className="text-olympus-green">Browsing Mode</span></>}
 </div>
 {activeProject ? (
 <>
 <div className="text-[11px] text-olympus-text font-mono truncate mt-0.5">{activeProject.name}</div>
 {activeProject.stacks.length > 0 && (<div className="flex flex-wrap gap-0.5 mt-0.5">{activeProject.stacks.slice(0, 4).map(s => <span key={s} className="text-[8px] px-1 py-0.5 rounded font-mono bg-olympus-purple/20 text-olympus-purple">{s}</span>)}{activeProject.stacks.length > 4 && <span className="text-[8px] text-olympus-text-dim font-mono">+{activeProject.stacks.length - 4}</span>}</div>)}
 </>
 ) : (<div className="text-[10px] text-olympus-text-dim font-mono mt-0.5 leading-relaxed">All skills/instincts visible. Switch to a project to scope by stack.</div>)}
 <div className="flex items-center gap-2 mt-1.5 text-[9px] font-mono">
 <span className="flex items-center gap-0.5 text-olympus-green"><Eye size={8} /> {visibleNodes} visible</span>
 {hiddenNodes > 0 && <span className="flex items-center gap-0.5 text-olympus-text-dim"><EyeOff size={8} /> {hiddenNodes} hidden{activeProject && ' (stack)'}</span>}
 </div>
 </div>

 {/* Node type filters */}
 <div className="text-[9px] text-[#5A5A5A] font-mono uppercase tracking-wider px-1">Type</div>
 {items.map(it => (
 <label
 key={it.key}
 className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-olympus-gold/5 group"
 >
 <span
 className={cn('w-2.5 h-2.5 rounded-full transition-all shrink-0')}
 style={{
 background: it.color,
 opacity: filters[it.key] ? 1 : 0.25,
 boxShadow: filters[it.key] ? `0 0 6px ${it.color}80` : 'none',
 }}
 />
 <span
 className={cn(
 'text-[11px] font-mono flex-1',
 filters[it.key] ? 'text-olympus-text' : 'text-olympus-text-dim',
 )}
 >
 {it.label}
 </span>
 {/* Count badge. Shows the number of nodes of this
 type currently in the graph data. */}
 <span
 className={cn(
 'text-[9px] font-mono px-1 py-0.5 rounded min-w-4.5 text-center',
 counts[it.key as string] > 0
 ? 'bg-olympus-gold/10 text-olympus-text-dim'
 : 'bg-transparent text-[#5A5A5A]',
 )}
 >
 {counts[it.key as string] ?? 0}
 </span>
 <input
 type="checkbox"
 checked={filters[it.key] as boolean}
 onChange={() => toggleFilter(it.key)}
 className="w-3 h-3 accent-olympus-gold"
 />
 </label>
 ))}

 {/* Scope filters (NEW) — tooltips removed per user request. */}
 <div className="text-[9px] text-[#5A5A5A] font-mono uppercase tracking-wider px-1 mt-1">Scope</div>
 {scopeItems.map(it => (
 <label
 key={it.key}
 className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-olympus-gold/5 group"
 >
 <span
 className={cn('w-2.5 h-2.5 rounded-full transition-all shrink-0')}
 style={{
 background: it.color,
 opacity: filters[it.key] ? 1 : 0.25,
 boxShadow: filters[it.key] ? `0 0 6px ${it.color}80` : 'none',
 }}
 />
 <span
 className={cn(
 'text-[11px] font-mono flex-1',
 filters[it.key] ? 'text-olympus-text' : 'text-olympus-text-dim',
 )}
 >
 {it.label}
 </span>
 <input
 type="checkbox"
 checked={filters[it.key] as boolean}
 onChange={() => toggleFilter(it.key)}
 className="w-3 h-3 accent-olympus-gold"
 />
 </label>
 ))}

 {/* Min confidence slider. The label and value badge are
 on the same row (right-aligned) so the slider section is compact
 and the current value is always visible at a glance. The slider
 filters instinct nodes by effective confidence (brain-atlas-3d). */}
 <div className="mt-2 px-1">
 <div className="flex items-center justify-between mb-1.5">
 <span className="text-[10px] text-olympus-text-dim font-mono">min confidence</span>
 <span className="text-[10px] text-olympus-gold font-mono tabular-nums">
 {filters.minConfidence.toFixed(2)}
 </span>
 </div>
 <input
 type="range"
 min={0}
 max={1}
 step={0.05}
 value={filters.minConfidence}
 onChange={e => setMinConfidence(parseFloat(e.target.value))}
 className="w-full accent-olympus-gold h-1.5"
 aria-label="Minimum confidence filter for instinct nodes"
 />
 <div className="flex items-center justify-between mt-1 text-[8px] font-mono text-[#5A5A5A]">
 <span>0.00</span>
 <span>1.00</span>
 </div>
 </div>

 {/* Symphony (v1.0) — always-on, integrated into every brain node */}
 </div>
 );
}
