/**
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

'use client';

import { useEffect, useState, useCallback } from 'react';
import { X, FileText, Loader2, Wrench, Sparkles, BookOpen, ChevronRight, Folder } from 'lucide-react';
import { marked } from 'marked';
import type { GraphNode } from '@/lib/olympus';
import { cn } from '@/lib/utils';

/**
 * DocumentViewerModal — full-document viewer for brain-atlas nodes.
 *
 * When the user clicks a skill / instinct / knowledge / evolved /
 * project node in the 3D brain atlas, this modal opens (in addition to the
 * existing small NodeDetailPanel) and renders the source markdown file
 * with full scrolling so the user can actually read and understand the
 * document.
 *
 * File path resolution (per node type):
 * - skill: <olympusRoot>/.opencode/skills/<skill-name>/SKILL.md
 * Fetched via the existing `/api/olympus/skill?name=...`
 * route (returns `{ content, extraFiles }`).
 *
 * Some skills ("umbrella" skills
 * like `superpowers`) ship as a directory of sub-skills with
 * NO top-level SKILL.md. The API route now returns a
 * `subSkills: [{name, title}]` array when this happens. The
 * modal renders a picker so the user can choose which
 * sub-skill to read. The first sub-skill's content is
 * inlined in the response so the modal shows something
 * immediately (no extra round-trip on first open).
 *
 * - instinct: ~/OLYMPUS-VAULT/05_Auto_Learning/instincts/<god>/<tier>/<name>.md
 * Fetched via `/api/vault/file/read?path=...` (vault-relative).
 * The node id format is `instinct:<god>:<tier>/<basename>`
 * (e.g. `instinct:apollo:seed/use-openspec-for-planning`).
 * The `<tier>/` segment is REQUIRED — instinct files live in
 * tiered subdirectories (`seed/`, `empirical/`, `_archive/`).
 * Without the tier the file path resolves to
 * `instincts/<god>/<basename>.md` which does NOT exist on
 * disk, causing a 500/404. We split the id on `:` and treat
 * everything after the god as the `<tier>/<basename>` path
 * segment (joined with `:` so multi-segment names work).
 * For the legacy v1 layout (no tier subdirs), the id
 * collapses to `instinct:<god>:<basename>` and the resolver
 * transparently produces the flat path.
 *
 * - evolved: Same as instinct — evolved nodes point at the instinct
 * file they evolved from. The id format is the same as
 * instinct's (`evolved:<god>:<tier>/<basename>`), so we
 * reuse the instinct resolver and just swap the prefix.
 *
 * - knowledge: ~/OLYMPUS-VAULT/04_Knowledge/references/<cat>/<name>.md
 * (falls back to 04_Knowledge/<cat>/<name>.md if the
 * references/ subdirectory layout isn't used.)
 * Fetched via `/api/vault/file/read?path=...`.
 *
 * - project: ~/OLYMPUS-VAULT/02_Projects/<slug>/project.md
 * The project's architecture / overview doc. Fetched via
 * `/api/vault/file/read?path=...`.
 *
 * The GraphNode `id` field encodes the path components:
 * - skill: `skill:<skill-name>`
 * - instinct: `instinct:<god>:<tier>/<basename>`
 * - evolved: `evolved:<god>:<tier>/<basename>` (or `<god>:<basename>`)
 * - knowledge: `knowledge:<category>/<name>`
 * - project: `project:<slug>`
 *
 * Rendering uses `marked` (already a devDependency) and the
 * `.olympus-markdown` CSS rules in globals.css for the dark theme. The
 * source content is local doc files we control (not user-supplied), so
 * `dangerouslySetInnerHTML` is safe here.
 */
export default function DocumentViewerModal({
 node,
 onClose,
}: {
 node: GraphNode;
 onClose: () => void;
}) {
 const [loading, setLoading] = useState(true);
 const [content, setContent] = useState<string>('');
 const [error, setError] = useState<string | null>(null);
 const [sourceLabel, setSourceLabel] = useState<string>('');
 const [extraFiles, setExtraFiles] = useState<string[]>([]);
 // Sub-skill picker state. Populated when the
 // API returns `nested: true` with a `subSkills` array. `activeSub` tracks
 // which sub-skill is currently rendered so the picker can highlight it.
 const [subSkills, setSubSkills] = useState<Array<{ name: string; title: string | null }>>([]);
 const [activeSub, setActiveSub] = useState<string | null>(null);

 // Resolve the node id → fetch URL + human-readable source label.
 const meta = resolveNodeSource(node);

 // Single fetcher function — used by both the initial load and the
 // sub-skill picker. Keeps the response-shape handling in one place.
 const applyResponse = useCallback((d: any, fallbackLabel?: string) => {
 setContent(d.content || '');
 if (Array.isArray(d.extraFiles)) setExtraFiles(d.extraFiles);
 else setExtraFiles([]);
 if (Array.isArray(d.subSkills) && d.subSkills.length > 0) {
 setSubSkills(d.subSkills);
 setActiveSub(d.sub || d.subSkills[0]?.name || null);
 } else {
 setSubSkills([]);
 setActiveSub(null);
 }
 if (d.path) {
 setSourceLabel(d.path.replace(/^.*?\.opencode\//, '.opencode/'));
 } else if (fallbackLabel) {
 setSourceLabel(fallbackLabel);
 }
 }, []);

 // Sub-skill switcher — fetches <skill>/<sub>/SKILL.md when the user clicks
 // a different sub-skill in the picker. Skips the fetch if the user clicks
 // the already-active sub-skill.
 const selectSubSkill = useCallback(async (subName: string) => {
 if (!meta || meta.kind !== 'skill' || subName === activeSub) return;
 setLoading(true);
 setError(null);
 try {
 const r = await fetch(`${meta.url}&sub=${encodeURIComponent(subName)}`, { cache: 'no-store' });
 if (!r.ok) throw new Error(`HTTP ${r.status}`);
 const d = await r.json();
 applyResponse(d);
 } catch (e: any) {
 setError(e.message || String(e));
 } finally {
 setLoading(false);
 }
 }, [meta, activeSub, applyResponse]);

 useEffect(() => {
 if (!meta) return;
 let cancelled = false;
 setLoading(true);
 setError(null);
 setContent('');
 setExtraFiles([]);
 setSubSkills([]);
 setActiveSub(null);
 setSourceLabel(meta.label);
 (async () => {
 try {
 const r = await fetch(meta.url, { cache: 'no-store' });
 if (cancelled) return;
 if (!r.ok) {
 // Try the fallback URL (knowledge references/ vs root) if provided.
 if (meta.fallbackUrl) {
 const r2 = await fetch(meta.fallbackUrl, { cache: 'no-store' });
 if (cancelled) return;
 if (r2.ok) {
 const d2 = await r2.json();
 if (cancelled) return;
 applyResponse(d2, meta.fallbackLabel || meta.label);
 return;
 }
 }
 throw new Error(`HTTP ${r.status}`);
 }
 const d = await r.json();
 if (cancelled) return;
 applyResponse(d, meta.label);
 } catch (e: any) {
 if (!cancelled) setError(e.message || String(e));
 } finally {
 if (!cancelled) setLoading(false);
 }
 })();
 return () => { cancelled = true; };
 }, [meta?.url, meta?.fallbackUrl, applyResponse]);

 // Escape hatch: close on Escape.
 useEffect(() => {
 const onKey = (e: KeyboardEvent) => {
 if (e.key === 'Escape') onClose();
 };
 window.addEventListener('keydown', onKey);
 return () => window.removeEventListener('keydown', onKey);
 }, [onClose]);

 if (!meta) {
 // Should not happen — the modal is only rendered for resolvable nodes.
 return null;
 }

 const Icon =
 meta.kind === 'skill' ? Wrench :
 meta.kind === 'instinct' ? Sparkles :
 meta.kind === 'evolved' ? Sparkles :
 meta.kind === 'project' ? Folder :
 BookOpen;
 const html = content
 ? (marked.parse(content, { async: false, breaks: true }) as string)
 : '';

 return (
 <div
 className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 sm:p-8"
 onClick={onClose}
 >
 <div
 className="bg-olympus-card border border-olympus-gold/30 rounded-lg shadow-2xl max-w-3xl w-full max-h-[88vh] flex flex-col"
 onClick={e => e.stopPropagation()}
 >
 {/* Header */}
 <div className="flex items-center gap-2 px-4 py-3 border-b border-olympus-gold/15 bg-olympus-panel shrink-0">
 <Icon size={13} className="text-olympus-gold shrink-0" />
 <div className="flex-1 min-w-0">
 <div className="text-[12px] font-mono text-olympus-gold truncate">
 {node.name}
 {activeSub && (
 <span className="text-olympus-cyan ml-1">/{activeSub}</span>
 )}
 </div>
 <div className="text-[10px] font-mono text-olympus-text-dim truncate">
 {sourceLabel}
 </div>
 </div>
 <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-olympus-bg/60 text-olympus-text-dim uppercase tracking-wide shrink-0">
 {meta.kind}
 </span>
 <button
 aria-label="Close"
 onClick={onClose}
 className="w-6 h-6 rounded hover:bg-olympus-gold/10 flex items-center justify-center text-olympus-text-dim hover:text-olympus-gold shrink-0"
 >
 <X size={13} />
 </button>
 </div>

 {/* Sub-skill picker — only shown when the skill ships as a
 directory of sub-skills (no top-level SKILL.md). Each chip is
 a button so keyboard / screen-reader users can switch. */}
 {subSkills.length > 1 && (
 <div className="px-4 py-2 border-b border-olympus-gold/10 bg-olympus-bg/40 shrink-0">
 <div className="text-[9px] font-mono text-olympus-text-dim uppercase tracking-wide mb-1.5">
 Sub-skills ({subSkills.length})
 </div>
 <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto custom-scroll">
 {subSkills.map(s => {
 const isActive = s.name === activeSub;
 return (
 <button
 key={s.name}
 onClick={() => selectSubSkill(s.name)}
 title={s.title || s.name}
 className={cn(
 'flex items-center gap-1 px-2 py-1 rounded text-[9px] font-mono transition-all',
 isActive
 ? 'bg-olympus-gold/20 text-olympus-gold ring-1 ring-olympus-gold/30'
 : 'bg-olympus-bg/60 text-olympus-text-dim hover:text-olympus-gold hover:bg-olympus-gold/10',
 )}
 >
 <ChevronRight size={9} className={isActive ? 'text-olympus-gold' : 'text-olympus-text-dim/50'} />
 <span className="truncate max-w-[160px]">{s.name}</span>
 </button>
 );
 })}
 </div>
 </div>
 )}

 {/* Body — scrollable markdown */}
 <div className="flex-1 overflow-y-auto custom-scroll p-4">
 {loading && (
 <div className="flex items-center gap-2 text-olympus-text-dim text-[11px] font-mono">
 <Loader2 size={12} className="animate-spin" /> loading {meta.kind}{activeSub ? `/${activeSub}` : ''}…
 </div>
 )}
 {error && (
 <div className="flex flex-col gap-2 py-6 text-center">
 <FileText size={20} className="text-olympus-text-dim mx-auto" />
 <p className="text-[11px] font-mono text-olympus-red leading-relaxed">
 Failed to load: {error}
 </p>
 <p className="text-[10px] font-mono text-[#5A5A5A]">
 Source: {sourceLabel}
 </p>
 </div>
 )}
 {!loading && !error && content && (
 <article
 className="olympus-markdown text-[11px] font-mono text-olympus-text leading-relaxed"
 dangerouslySetInnerHTML={{ __html: html }}
 />
 )}
 {!loading && !error && !content && (
 <div className="flex flex-col items-center gap-2 py-8 text-center">
 <FileText size={20} className="text-olympus-text-dim" />
 <p className="text-[11px] font-mono text-olympus-text-dim">
 Document is empty.
 </p>
 </div>
 )}
 </div>

 {/* Footer — source path + skill extras */}
 {!loading && (
 <div className="px-4 py-2 border-t border-olympus-gold/10 bg-olympus-panel shrink-0">
 <div className="text-[9px] font-mono text-[#5A5A5A] truncate">
 source: {sourceLabel}
 </div>
 {extraFiles.length > 0 && (
 <div className="mt-1 flex flex-wrap gap-1">
 {extraFiles.map(f => (
 <span key={f} className="text-[9px] font-mono text-olympus-cyan bg-olympus-bg px-1.5 py-0.5 rounded">
 {f}
 </span>
 ))}
 </div>
 )}
 </div>
 )}
 </div>
 </div>
 );
}

/* ------------------------------------------------------------------ */
/* Path resolution. */
/* ------------------------------------------------------------------ */

interface NodeSource {
 kind: 'skill' | 'instinct' | 'evolved' | 'knowledge' | 'project';
 /** Primary fetch URL. */
 url: string;
 /** Optional fallback URL (used when the primary returns 404). */
 fallbackUrl?: string;
 /** Human-readable source label shown in the footer. */
 label: string;
 /** Label to show when the fallback URL succeeds. */
 fallbackLabel?: string;
}

/**
 * Build the vault-relative path for an instinct (or evolved) node.
 *
 * The id format is `<prefix>:<god>:<tier>/<basename>` (e.g.
 * `instinct:apollo:seed/use-openspec-for-planning`) where `<prefix>` is
 * `instinct` or `evolved`. For the legacy v1 layout (no tier subdirs), the
 * id collapses to `<prefix>:<god>:<basename>` and this function produces
 * the flat `instincts/<god>/<basename>.md` path.
 *
 * `rest` is everything after the leading `<prefix>:`. We split on `:` to
 * separate the god from the rest; everything after the god becomes the
 * `<tier>/<basename>` (or just `<basename>`) path segment. We JOIN with `:`
 * (not split-then-rejoin) so multi-segment names that happen to contain
 * `:` round-trip correctly.
 */
function buildInstinctVaultPath(rest: string): { god: string; relPath: string } | null {
 const parts = rest.split(':');
 if (parts.length < 2) return null;
 const god = parts[0];
 // `tierSlashBase` is either `<tier>/<basename>` (current layout) or
 // `<basename>` (legacy v1 layout). Either way it becomes the path
 // segment under `instincts/<god>/`.
 const tierSlashBase = parts.slice(1).join(':');
 const relPath = `05_Auto_Learning/instincts/${god}/${tierSlashBase}.md`;
 return { god, relPath };
}

/**
 * Convert a GraphNode (skill / instinct / evolved / knowledge / project)
 * into a fetch URL + human-readable source label. Returns null for node
 * types we can't resolve (god, subagent) — the modal shouldn't open for
 * those.
 */
function resolveNodeSource(node: GraphNode): NodeSource | null {
 if (!node || !node.id) return null;
 const id = node.id;

 // Skill: id = `skill:<skill-name>`
 // Loaded via the existing /api/olympus/skill route (handles the path
 // .opencode/skills/<skill>/SKILL.md server-side, with nested-sub-skill
 // fallback for umbrella skills like `superpowers`).
 if (node.type === 'skill' || id.startsWith('skill:')) {
 const skillName = id.slice('skill:'.length);
 if (!skillName) return null;
 return {
 kind: 'skill',
 url: `/api/olympus/skill?name=${encodeURIComponent(skillName)}`,
 label: `.opencode/skills/${skillName}/SKILL.md`,
 };
 }

 // Instinct: id = `instinct:<god>:<tier>/<basename>`
 // (or `instinct:<god>:<basename>` for the legacy v1 layout)
 // Loaded via the vault API (vault-relative path). The `<tier>/` segment
 // is REQUIRED in the current vault layout — instinct files live in
 // tiered subdirectories (`seed/`, `empirical/`, `_archive/`). See
 // buildInstinctVaultPath for the resolution details.
 if (node.type === 'instinct' || id.startsWith('instinct:')) {
 const rest = id.slice('instinct:'.length);
 const resolved = buildInstinctVaultPath(rest);
 if (!resolved) return null;
 return {
 kind: 'instinct',
 url: `/api/vault/file/read?path=${encodeURIComponent(resolved.relPath)}`,
 label: `~/OLYMPUS-VAULT/${resolved.relPath}`,
 };
 }

 // Evolved: id = `evolved:<god>:<tier>/<basename>` (same shape as instinct).
 // Evolved nodes point at the instinct file they evolved from, so we
 // reuse the instinct path resolver. The kind stays 'evolved' so the
 // modal's header badge and icon are correct.
 if (node.type === 'evolved' || id.startsWith('evolved:')) {
 const rest = id.slice('evolved:'.length);
 const resolved = buildInstinctVaultPath(rest);
 if (!resolved) return null;
 return {
 kind: 'evolved',
 url: `/api/vault/file/read?path=${encodeURIComponent(resolved.relPath)}`,
 label: `~/OLYMPUS-VAULT/${resolved.relPath}`,
 };
 }

 // Knowledge: id = `knowledge:<category>/<name>`
 // Loaded via the vault API. The actual on-disk layout is
 // `04_Knowledge/references/<cat>/<name>.md`; we try that first and fall
 // back to `04_Knowledge/<cat>/<name>.md` (per the task spec) if 404.
 if (node.type === 'knowledge' || id.startsWith('knowledge:')) {
 const rest = id.slice('knowledge:'.length);
 if (!rest) return null;
 const relPathRefs = `04_Knowledge/references/${rest}.md`;
 const relPathRoot = `04_Knowledge/${rest}.md`;
 return {
 kind: 'knowledge',
 url: `/api/vault/file/read?path=${encodeURIComponent(relPathRefs)}`,
 fallbackUrl: `/api/vault/file/read?path=${encodeURIComponent(relPathRoot)}`,
 label: `~/OLYMPUS-VAULT/${relPathRefs}`,
 fallbackLabel: `~/OLYMPUS-VAULT/${relPathRoot}`,
 };
 }

 // Project: id = `project:<slug>`
 // Opens the project's architecture / overview doc at
 // `02_Projects/<slug>/project.md`. The slug is everything after the
 // `project:` prefix (URL-decoded for safety).
 if (node.type === 'project' || id.startsWith('project:')) {
 const slug = id.slice('project:'.length);
 if (!slug) return null;
 const relPath = `02_Projects/${slug}/project.md`;
 return {
 kind: 'project',
 url: `/api/vault/file/read?path=${encodeURIComponent(relPath)}`,
 label: `~/OLYMPUS-VAULT/${relPath}`,
 };
 }

 return null;
}
