/**
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

'use client';

import { useEffect, useState } from 'react';
import { X, FileText, Loader2, Cpu } from 'lucide-react';
import { marked } from 'marked';
import { demigodPromptUrl } from '@/lib/demigod-short-desc';

/**
 * DemigodPromptModal — modal showing a demigod's FULL Identity prompt (.txt).
 *
 * The cost dashboard + god-detail screens now show a SHORT one-line phrase
 * (derived from the demigod's agent name) instead of the verbose Identity
 * sentence. Clicking the row opens this modal, which fetches the agent's
 * full .txt prompt from `.opencode/prompts/agents/demigods/<god>/<agent>.txt`
 * (via the existing `/api/olympus/fs/read` route) and renders it as
 * scrollable markdown so the user can read the entire identity, mission,
 * rules, deliverables, workflow, etc.
 *
 * The .txt files are plain markdown (despite the .txt extension), so we
 * render with `marked`. The rendered HTML is injected via
 * `dangerouslySetInnerHTML` — the source is local prompt files we control,
 * not user-supplied content, so XSS is not a concern here.
 */
export default function DemigodPromptModal({
 god,
 agent,
 shortDescription,
 onClose,
}: {
 god: string;
 agent: string;
 shortDescription?: string;
 onClose: () => void;
}) {
 const [loading, setLoading] = useState(true);
 const [content, setContent] = useState<string>('');
 const [error, setError] = useState<string | null>(null);
 const [notFound, setNotFound] = useState(false);

 useEffect(() => {
 let cancelled = false;
 setLoading(true);
 setError(null);
 setNotFound(false);
 (async () => {
 try {
 const url = demigodPromptUrl(god, agent);
 const r = await fetch(url, { cache: 'no-store' });
 if (cancelled) return;
 if (r.status === 404) {
 setNotFound(true);
 setLoading(false);
 return;
 }
 if (!r.ok) throw new Error(`API ${r.status}`);
 const d = await r.json();
 if (cancelled) return;
 setContent(d.content || '');
 } catch (e: any) {
 if (!cancelled) setError(e.message || String(e));
 } finally {
 if (!cancelled) setLoading(false);
 }
 })();
 return () => { cancelled = true; };
 }, [god, agent]);

 // Render the markdown body once when content changes. `marked.parse` can
 // return either a string or a Promise<string> depending on whether async
 // extensions are registered. We use the synchronous form by passing
 // `{ async: false }` (the default) and casting the result.
 const html = content
 ? (marked.parse(content, { async: false, breaks: true }) as string)
 : '';

 // Escape hatch: close on Escape.
 useEffect(() => {
 const onKey = (e: KeyboardEvent) => {
 if (e.key === 'Escape') onClose();
 };
 window.addEventListener('keydown', onKey);
 return () => window.removeEventListener('keydown', onKey);
 }, [onClose]);

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
 <Cpu size={13} className="text-olympus-gold shrink-0" />
 <div className="flex-1 min-w-0">
 <div className="text-[12px] font-mono text-olympus-gold truncate">
 {agent.replace(/[-_]/g, '-')}
 </div>
 {shortDescription && (
 <div className="text-[10px] font-mono text-olympus-text-dim truncate">
 {shortDescription}
 </div>
 )}
 </div>
 <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-olympus-bg/60 text-olympus-text-dim uppercase tracking-wide shrink-0">
 demigod of {god}
 </span>
 <button
 aria-label="Close"
 onClick={onClose}
 className="w-6 h-6 rounded hover:bg-olympus-gold/10 flex items-center justify-center text-olympus-text-dim hover:text-olympus-gold shrink-0"
 >
 <X size={13} />
 </button>
 </div>

 {/* Body — scrollable markdown */}
 <div className="flex-1 overflow-y-auto custom-scroll p-4">
 {loading && (
 <div className="flex items-center gap-2 text-olympus-text-dim text-[11px] font-mono">
 <Loader2 size={12} className="animate-spin" /> loading demigod prompt…
 </div>
 )}
 {error && (
 <div className="text-[11px] font-mono text-olympus-red leading-relaxed">
 Failed to load: {error}
 </div>
 )}
 {notFound && (
 <div className="flex flex-col items-center gap-2 py-8 text-center">
 <FileText size={20} className="text-olympus-text-dim" />
 <p className="text-[11px] font-mono text-olympus-text-dim">
 No prompt file found for <code className="text-olympus-gold">{agent}</code> under{' '}
 <code className="text-olympus-cyan">{god}</code>.
 </p>
 <p className="text-[10px] font-mono text-[#5A5A5A]">
 Expected at .opencode/prompts/agents/demigods/{god}/{agent.replace(/-/g, '_')}.txt
 </p>
 </div>
 )}
 {!loading && !error && !notFound && content && (
 <article
 className="olympus-markdown text-[11px] font-mono text-olympus-text leading-relaxed"
 dangerouslySetInnerHTML={{ __html: html }}
 />
 )}
 </div>

 {/* Footer — file path hint */}
 {!loading && !notFound && (
 <div className="px-4 py-2 border-t border-olympus-gold/10 bg-olympus-panel shrink-0">
 <div className="text-[9px] font-mono text-[#5A5A5A] truncate">
 source: .opencode/prompts/agents/demigods/{god}/{agent.replace(/-/g, '_')}.txt
 </div>
 </div>
 )}
 </div>
 </div>
 );
}
