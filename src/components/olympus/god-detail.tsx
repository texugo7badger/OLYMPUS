/**
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

'use client';

import { useEffect, useState } from 'react';
import { useOlympus, GOD_ICONS, GOD_DOMAINS } from '@/lib/olympus-store';
import { Cpu, Zap, Clock, TrendingUp, Activity as ActivityIcon, BookOpenText, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { demigodShortDescription } from '@/lib/demigod-short-desc';
import DemigodPromptModal from './demigod-prompt-modal';
// Instincts section removed from God-Detail (instincts
// are now browsable in the Vault-Summary panel). InstinctDetailModal import
// removed. Added KnowledgeDetailModal so clicking a knowledge row opens a
// markdown-box overlay (like the instinct modal) instead of the IDE panel.
import KnowledgeDetailModal from './knowledge-detail-modal';

/* ------------------------------------------------------------------ */
/* God Detail — minimalist refactor. */
/* */
/* impeccable `distill` pass: */
/* - Removed legacy "Model / Caveman / Designed capacity / Army" */
/* grid — those fields are static, outdated, and tied to the */
/* legacy Olympus config we no longer use. */
/* - Replaced with a live, god-centric view: */
/* 1. Identity header (icon + name + domain) */
/* 2. Live stats (dispatches, success rate, avg latency, */
/* short-circuit hits) — fetched from /api/olympus/brain-stats */
/* 3. demigod catalog (fetched from dispatch-graph) — */
/* expandable rows showing the task each demigod handles */
/* 4. Skill arsenal + MCPs (one-liners, not paragraphs) */
/* - Callimachus is now first-class (9th god). It dispatches to its */
/* own demigods (instinct-curator, brain-backup, etc.) like any */
/* other god — no longer treated as a special case. */
/* */
/* All data is live; no static GOD_INFO hardcoding. */
/* ------------------------------------------------------------------ */

interface DemigodEntry { task: string; agent: string; skill: string }
interface DispatchInfo {
 god: string;
 demigods: DemigodEntry[];
 skills: string[];
 mcps: string[];
 recentShortCircuits: any[];
}

interface GodStats {
 instinctCounts: { seed: number; empirical: number; archived: number; total: number };
 shortCircuitHitRate: number;
 shortCircuitCount: number;
 dispatchCount: number;
 avgConfidence: number;
 successRate: { '7d': number | null; '30d': number | null; allTime: number | null };
 learningVelocity: number;
 avgDurationMs: number | null;
}

export default function GodDetail() {
 const node = useOlympus(s => s.selectedNode);
 const god = node?.god;
 const GodIcon = god ? GOD_ICONS[god] : null;
 const domain = god ? GOD_DOMAINS[god] : null;
 const [dispatch, setDispatch] = useState<DispatchInfo | null>(null);
 const [stats, setStats] = useState<GodStats | null>(null);
 	// When set, opens the DemigodPromptModal showing the
 // agent's full Identity .txt prompt. Set by clicking a demigod row.
 const [viewingDemigod, setViewingDemigod] = useState<{ agent: string; shortDesc: string } | null>(null);
 	// Instincts section + state REMOVED (instincts are now
 // browsable in the Vault-Summary panel). Only references (Knowledge) remain.
 const [references, setReferences] = useState<any[] | null>(null);
 	// When set, opens KnowledgeDetailModal showing the
 // knowledge doc's full markdown (frontmatter + body) as a markdown-box
 // overlay. Replaces the old setIdeFilePath() call that opened the IDE.
 const [viewingKnowledge, setViewingKnowledge] = useState<{ relPath: string; name: string } | null>(null);

 	// LIVE demigod catalog + brain-stats + instincts + references.
 // All fetches run on mount + every 10s + on the 'olympus:demigods-changed'
 // custom event. This ensures new demigods appear immediately with their
 // parent god reference + one-line description.
 useEffect(() => {
 if (!god) return;
 setDispatch(null);
 setStats(null);
 let cancelled = false;

 // Live demigod catalog (dispatch-graph API reads from disk)
 const loadDispatch = async () => {
 try {
 const ctrl = new AbortController();
 const timeout = setTimeout(() => ctrl.abort(), 5000);
 const r = await fetch(`/api/olympus/god/dispatch-graph?god=${god}`, { signal: ctrl.signal, cache: 'no-store' });
 clearTimeout(timeout);
 if (!r.ok) return;
 const d = await r.json();
 if (cancelled) return;
 setDispatch({
 god,
 demigods: Array.isArray(d.demigods) ? d.demigods : [],
 skills: Array.isArray(d.skills) ? d.skills : [],
 mcps: Array.isArray(d.mcps) ? d.mcps : [],
 recentShortCircuits: Array.isArray(d.recentShortCircuits) ? d.recentShortCircuits : [],
 });
 } catch {}
 };

 // Brain-stats (dispatch count, success rate, instinct counts)
 const loadStats = async () => {
 try {
 const ctrl = new AbortController();
 const timeout = setTimeout(() => ctrl.abort(), 5000);
 const r = await fetch('/api/olympus/brain-stats', { signal: ctrl.signal, cache: 'no-store' });
 clearTimeout(timeout);
 if (!r.ok) return;
 const d = await r.json();
 if (cancelled) return;
 const gs: GodStats | undefined = d.perGod?.[god];
 if (gs) setStats(gs);
 } catch {}
 };

 // References (knowledge docs)
 const loadReferences = async () => {
 try {
 const r = await fetch(`/api/olympus/god/references?god=${god}`, { cache: 'no-store' });
 if (r.ok) {
 const d = await r.json();
 if (!cancelled) setReferences(d.references || []);
 }
 } catch {}
 };

 loadDispatch();
 loadStats();
 loadReferences();

 const iv = setInterval(() => {
 loadDispatch();
 loadStats();
 }, 10000);
 const onDemigodsChanged = () => { loadDispatch(); loadStats(); };
 window.addEventListener('olympus:demigods-changed', onDemigodsChanged);

 return () => {
 cancelled = true;
 clearInterval(iv);
 window.removeEventListener('olympus:demigods-changed', onDemigodsChanged);
 };
 }, [god]);

 if (!god || !GodIcon) {
 return (
 <div className="p-4 text-olympus-text-dim text-xs font-mono">
 Select a god node or click an icon in the activity bar.
 </div>
 );
 }

 return (
 <div className="h-full overflow-y-auto custom-scroll bg-olympus-bg">
 {/* Identity header */}
 <div className="p-4 border-b border-olympus-gold/15 bg-linear-to-br from-olympus-gold/10 to-transparent">
 <div className="flex items-center gap-3">
 <div className="w-12 h-12 rounded-xl bg-olympus-gold/15 border border-olympus-gold/30 flex items-center justify-center shrink-0">
 <GodIcon size={22} className="text-olympus-gold" />
 </div>
 <div className="min-w-0">
 <h2 className="text-base font-semibold text-olympus-gold">{god ? god.charAt(0).toUpperCase() + god.slice(1) : ''}</h2>
 {domain && <p className="text-[10px] text-olympus-text-dim font-mono truncate">{domain}</p>}
 </div>
 </div>
 </div>

 <div className="p-3 space-y-3">
 {/* Live stats — all 9 gods (including Callimachus, which now dispatches) */}
 {stats && (
 <div className="grid grid-cols-2 gap-1.5">
 <Stat label="Dispatches" value={String(stats.dispatchCount)} icon={ActivityIcon} color="text-olympus-gold" />
 <Stat
 label="Short-circuit hits"
 value={`${(stats.shortCircuitHitRate * 100).toFixed(0)}%`}
 icon={Zap}
 color={stats.shortCircuitHitRate > 0.3 ? 'text-olympus-green' : 'text-olympus-text-dim'}
 />
 <Stat
 label="Success rate"
 value={stats.successRate.allTime === null ? '—' : `${(stats.successRate.allTime * 100).toFixed(0)}%`}
 icon={TrendingUp}
 color={stats.successRate.allTime === null ? 'text-olympus-text-dim' :
 stats.successRate.allTime > 0.85 ? 'text-olympus-green' :
 stats.successRate.allTime > 0.6 ? 'text-olympus-amber-soft' : 'text-olympus-red'}
 />
 <Stat
 label="Avg latency"
 value={stats.avgDurationMs !== null ? `${stats.avgDurationMs}ms` : '—'}
 icon={Clock}
 color="text-olympus-cyan"
 />
 </div>
 )}

 {/* Callimachus info panel — kept as a brief description, but he
 now dispatches to demigods like any other god. The demigods
 section below shows his dispatch routes. */}
 {god === 'callimachus' && (
 <div className="rounded-lg border border-olympus-purple/20 bg-olympus-purple/5 p-3 text-[11px] font-mono text-olympus-text leading-relaxed">
 Vault curator — runs the 7-stage brain maintenance loop (observe, distill, inject,
 prune, compact, evolve, stocktake) AND dispatches to demigods for vault work
 (instinct curation, backup, restore, docs verification). Use{' '}
 <code className="text-olympus-gold">Compact Brain</code> for on-demand deep cleanup.
 </div>
 )}

 {/* demigods */}
 {dispatch && dispatch.demigods.length > 0 && (
 <div>
 <div className="flex items-center gap-1.5 mb-2 text-[10px] font-semibold text-olympus-text-dim uppercase tracking-wide">
 <Cpu size={11} className="text-olympus-gold" />
 demigods ({dispatch.demigods.length})
 </div>
 <div className="space-y-1">
 {dispatch.demigods.map((a, i) => {
 const key = `${a.agent}-${i}`;
 		// Show a SHORT one-line phrase derived from the
 // demigod's agent name instead of the verbose Identity sentence.
 // The full .txt prompt opens in a modal on click. Removed the
 // repetitive "Skills, tools, and MCPs are equipped dynamically
 // by the god at dispatch time…" boilerplate per task spec.
 const shortDesc = demigodShortDescription(a.agent);
 return (
 <div
 key={key}
 onClick={() => setViewingDemigod({ agent: a.agent, shortDesc })}
 className="w-full text-left group flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-olympus-gold/5 transition-colors"
 title={`Open ${a.agent} prompt`}
 role="button"
 tabIndex={0}
 onKeyDown={(e) => {
 if (e.key === 'Enter' || e.key === ' ') {
 e.preventDefault();
 setViewingDemigod({ agent: a.agent, shortDesc });
 }
 }}
 >
 <span className="w-1.5 h-1.5 rounded-full bg-olympus-gold shrink-0" />
 <div className="flex-1 min-w-0">
 <div className="text-[11px] font-mono text-olympus-text group-hover:text-olympus-gold truncate">
 {shortDesc}
 </div>
 <div className="text-[9px] font-mono text-olympus-text-dim truncate">
 {a.agent.replace(/[-_]/g, '-')}
 </div>
 </div>
 <FileText size={11} className="text-olympus-text-dim group-hover:text-olympus-gold shrink-0 transition-colors" />
 </div>
 );
 })}
 </div>
 </div>
 )}

 {/* Empty state for gods with no demigods */}
 {dispatch && dispatch.demigods.length === 0 && (
 <div className="rounded-lg border border-olympus-gold/10 bg-olympus-card/40 p-3 text-center">
 <p className="text-[11px] text-olympus-text font-mono mb-1">No demigods</p>
 <p className="text-[10px] text-olympus-text-dim font-mono">
 {god.charAt(0).toUpperCase() + god.slice(1)} handles tasks directly without delegating to demigods.
 </p>
 </div>
 )}

 {/* Skills arsenal — clickable chips */}
 {dispatch && dispatch.skills.length > 0 && (
 <div>
 <div className="text-[10px] font-semibold text-olympus-text-dim uppercase tracking-wide mb-1.5">Skills</div>
 <div className="flex flex-wrap gap-1">
 {dispatch.skills.map(s => (
 <span
 key={s}
 className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-olympus-card/60 text-olympus-text-dim border border-olympus-gold/10 transition-colors"
 >
 {s}
 </span>
 ))}
 </div>
 </div>
 )}

 {/* MCPs — clickable chips */}
 {dispatch && dispatch.mcps.length > 0 && (
 <div>
 <div className="text-[10px] font-semibold text-olympus-text-dim uppercase tracking-wide mb-1.5">MCPs</div>
 <div className="flex flex-wrap gap-1">
 {dispatch.mcps.map(m => (
 <span
 key={m}
 className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-olympus-card/60 text-olympus-cyan border border-olympus-gold/10 transition-colors"
 >
 {m}
 </span>
 ))}
 </div>
 </div>
 )}

	 {/* Instincts section REMOVED from God-Detail.
	 Instincts are now browsable in the Vault-Summary panel's
	 "Mastered / Learning / Quick Circuits" table (clickable god rows
	 expand to show instinct names + confidence scores). The God-Detail
	 panel now focuses on: live stats, demigods, skills, MCPs, and
	 knowledge docs. */}

	 {/* Knowledge section (was "References"). Lists the
	 reference docs relevant to the god's domain. Each row is clickable
	 → opens a KnowledgeDetailModal (markdown-box overlay) showing the
	 * doc's full content. Replaced the legacy IDE file-path
	 setter (which used to open the in-app Monaco editor) with
	 setViewingKnowledge() (which opens the modal overlay, matching the
	 * instinct modal UX). The Monaco editor was
	 removed; knowledge is now always viewed in the modal overlay.
	 Also added an empty-state placeholder for gods with no knowledge. */}
 {references && references.length > 0 && (
 <div>
 <div className="flex items-center gap-1.5 mb-1.5 text-[10px] font-semibold text-olympus-text-dim uppercase tracking-wide">
 <BookOpenText size={11} className="text-olympus-gold" />
 Knowledge ({references.length})
 </div>
 <div className="space-y-1">
 {references.map((ref, i) => (
 <button
 key={`ref-${i}`}
 onClick={() => ref.relPath && setViewingKnowledge({ relPath: ref.relPath, name: ref.name })}
 className="w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-olympus-gold/5 transition-colors"
 title={`Open ${ref.name}`}
 disabled={!ref.path}
 >
 <BookOpenText size={10} className="text-olympus-cyan shrink-0" />
 <div className="flex-1 min-w-0">
 <div className="text-[11px] font-mono text-olympus-text truncate">
 {ref.name}
 </div>
 {ref.description && (
 <div className="text-[9px] font-mono text-olympus-text-dim truncate">{ref.description}</div>
 )}
 </div>
 </button>
 ))}
 </div>
 </div>
 )}
	 {/* Empty-state placeholder for gods with no
	 knowledge docs. Matches the existing "No demigods" placeholder
	 pattern. */}
 {references && references.length === 0 && (
 <div className="rounded-lg border border-olympus-gold/10 bg-olympus-card/40 p-3 text-center">
 <BookOpenText size={16} className="text-olympus-text-dim mx-auto mb-1.5" />
 <p className="text-[11px] text-olympus-text font-mono mb-1">No knowledge docs</p>
 <p className="text-[10px] text-olympus-text-dim font-mono">
 {god.charAt(0).toUpperCase() + god.slice(1)} has no reference docs assigned yet.
 </p>
 </div>
 )}

 {/* Recent short-circuits — only if any */}
 {dispatch && dispatch.recentShortCircuits.length > 0 && (
 <div>
 <div className="text-[10px] font-semibold text-olympus-text-dim uppercase tracking-wide mb-1.5">
 Recent short-circuits ({dispatch.recentShortCircuits.length})
 </div>
 <div className="space-y-1">
 {dispatch.recentShortCircuits.slice(0, 5).map((sc, i) => (
 <div key={i} className="text-[10px] font-mono text-olympus-text-dim flex items-center gap-2">
 <Zap size={9} className="text-olympus-gold shrink-0" />
 <span className="truncate flex-1">{sc.task_signature || sc.task || '—'}</span>
 <span className="text-[#5A5A5A] shrink-0">{new Date(sc.ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
 </div>
 ))}
 </div>
 </div>
 )}
 </div>

 {/* DemigodPromptModal. Opens when the user clicks a
 demigod row. Shows the agent's full Identity .txt prompt as
 scrollable markdown. Rendered at the bottom of the god-detail
 panel so it overlays the entire screen via `position: fixed`. */}
 {viewingDemigod && god && (
 <DemigodPromptModal
 god={god}
 agent={viewingDemigod.agent}
 shortDescription={viewingDemigod.shortDesc}
 onClose={() => setViewingDemigod(null)}
 />
 )}

 {/* KnowledgeDetailModal. Opens when the user
 clicks a knowledge row. Shows the doc's full markdown (frontmatter +
 body) as a markdown-box overlay, matching the instinct modal UX. */}
 {viewingKnowledge && (
 <KnowledgeDetailModal
 knowledgeRelPath={viewingKnowledge.relPath}
 knowledgeName={viewingKnowledge.name}
 onCloseAction={() => setViewingKnowledge(null)}
 />
 )}
 </div>
 );
}

function Stat({ label, value, icon: Icon, color }: { label: string; value: string; icon: any; color: string }) {
 return (
 <div className="bg-olympus-card rounded-md px-2.5 py-1.5 border border-olympus-gold/10">
 <div className="flex items-center gap-1.5 mb-0.5">
 <Icon size={10} className={color} />
 <span className="text-[9px] text-olympus-text-dim uppercase">{label}</span>
 </div>
 <div className={cn('text-sm font-mono font-bold', color)}>{value}</div>
 </div>
 );
}

// InstinctRow helper component REMOVED. The Instincts
// section was removed from God-Detail (instincts are now browsable in the
// Vault-Summary panel). This helper is no longer used.
