/**
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

'use client';

import { useEffect, useRef, useState } from 'react';
import { FolderPlus, Folder, ChevronDown, Layers } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useOlympus, type ProjectNote } from '@/lib/olympus-store';

const GOD_COLOR = '#D4A574';
const STACK_ICONS: Record<string, string> = { react: 'React', next: 'Next.js', vue: 'Vue', svelte: 'Svelte', node: 'Node.js', bun: 'Bun', python: 'Python', rust: 'Rust', go: 'Go', typescript: 'TS', javascript: 'JS', tailwind: 'Tailwind', postgres: 'Postgres', mongodb: 'MongoDB', redis: 'Redis', docker: 'Docker', kubernetes: 'K8s', vercel: 'Vercel', aws: 'AWS', gcp: 'GCP', azure: 'Azure' };

/**
 * Project Switcher.
 *
 * impeccable refactor:
 * - Removed the hover tooltip on the trigger button. The button label
 * already shows the active project name (or "No Project"). A second
 * hover popup restating the same info added noise.
 * - The dropdown itself still shows full descriptions per project —
 * that's where context belongs, not on the trigger.
 */
export default function ProjectSwitcher() {
 const projects = useOlympus(s => s.availableProjects);
 const activeProject = useOlympus(s => s.activeProject);
 const setActiveProject = useOlympus(s => s.setActiveProject);
 const refreshProjects = useOlympus(s => s.refreshProjects);
 const setNewProjectDialogOpen = useOlympus(s => s.setNewProjectDialogOpen);
 const [dropdownOpen, setDropdownOpen] = useState(false);
 const [hoveredProject, setHoveredProject] = useState<string | null>(null);
 const dropdownRef = useRef<HTMLDivElement>(null);

 useEffect(() => { refreshProjects(); }, [refreshProjects]);
 useEffect(() => { function h(e: MouseEvent) { if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setDropdownOpen(false); } document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h); }, []);

 // the old switchProject() function used to
 // POST to /api/olympus/vscodium/launch on every project switch, but that
 // endpoint was removed when the VSCodium frame was deleted. Switching
 // projects now just updates the active context; the user clicks "Open in
 // Editor" on the Editor Bridge tab to launch their configured editor on
 // the new project's path. See EDITORS.md for the supported editors.
 async function switchProject(p: ProjectNote) {
 setActiveProject(p); setDropdownOpen(false);
 }

 return (
 <div className="relative" ref={dropdownRef}>
 <button
 onClick={() => setDropdownOpen(!dropdownOpen)}
 aria-label="Switch project"
 className="flex items-center gap-1.5 px-2 py-0.5 rounded hover:bg-olympus-gold/10 transition-colors group"
 >
 <Folder size={11} style={{ color: GOD_COLOR }} />
 <span className="text-olympus-gold font-semibold max-w-[120px] truncate">{activeProject?.name || 'No Project'}</span>
 <ChevronDown size={10} className={cn('text-olympus-text-dim transition-transform', dropdownOpen && 'rotate-180')} />
 </button>
 {dropdownOpen && (
 <div className="absolute top-full left-0 mt-1 w-80 bg-olympus-panel border border-olympus-gold/20 rounded-lg shadow-md z-50 overflow-hidden">
 <div className="px-3 py-2 border-b border-olympus-gold/10 flex items-center justify-between">
 <span className="text-[10px] font-mono text-olympus-text-dim uppercase tracking-wide">Projects</span>
 <button onClick={() => { setNewProjectDialogOpen(true); setDropdownOpen(false); }} className="flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded bg-olympus-gold/15 ring-1 ring-olympus-gold/30 hover:bg-olympus-gold/25 transition-colors" style={{ color: GOD_COLOR }}><FolderPlus size={10} /> New</button>
 </div>
 <div className="max-h-64 overflow-y-auto custom-scroll">
 {projects.length === 0 ? <div className="px-3 py-6 text-center text-[11px] font-mono text-olympus-text-dim">No projects yet.<br />Click "New" to create one.</div> : projects.map(p => (
 <div key={p.slug} className={cn('relative px-3 py-2 transition-colors group', activeProject?.slug === p.slug ? 'bg-olympus-gold/10' : 'hover:bg-olympus-gold/5')} onClick={() => switchProject(p)} onMouseEnter={() => setHoveredProject(p.slug)} onMouseLeave={() => setHoveredProject(null)}>
 <div className="flex items-center gap-2"><Folder size={12} style={{ color: activeProject?.slug === p.slug ? GOD_COLOR : '#8B8B8B' }} /><span className="text-[11px] font-mono font-semibold flex-1 truncate" style={{ color: activeProject?.slug === p.slug ? GOD_COLOR : '#B8B8B8' }}>{p.name}</span>{activeProject?.slug === p.slug && <span className="text-[9px] font-mono text-olympus-green">ACTIVE</span>}</div>
 <div className="text-[10px] font-mono text-olympus-text-dim truncate ml-5">{p.description || '(no description)'}</div>
 {hoveredProject === p.slug && p.stacks.length > 0 && (<div className="absolute top-full left-0 mt-1 w-full bg-olympus-bg border border-olympus-gold/30 rounded-lg p-2 z-10 shadow-md"><div className="text-[9px] font-mono text-olympus-text-dim mb-1.5 flex items-center gap-1"><Layers size={9} style={{ color: GOD_COLOR }} /> STACKS</div><div className="flex flex-wrap gap-1">{p.stacks.map(s => <span key={s} className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-olympus-gold/10 ring-1 ring-olympus-gold/20" style={{ color: GOD_COLOR }}>{STACK_ICONS[s.toLowerCase()] || s}</span>)}</div></div>)}
 </div>))}
 </div>
 <div className="px-3 py-1.5 border-t border-olympus-gold/10 text-[9px] font-mono text-[#5A5A5A]">Brain is global — instincts accumulate across all projects</div>
 </div>
 )}
 </div>
 );
}
