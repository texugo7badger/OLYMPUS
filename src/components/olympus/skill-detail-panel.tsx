/**
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

'use client';

import { useEffect, useState } from 'react';
import { X, FileText, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * SkillDetailPanel — side panel showing a skill's SKILL.md content.
 *
 * Created for AUX 7 (clickable skills). Fetches the
 * content from /api/olympus/skill?name=<skill> and renders it as preformatted
 * markdown (no syntax highlighting — keep it minimal). The panel is opened
 * by god-detail.tsx when the user clicks a skill chip.
 */
export default function SkillDetailPanel({
 skillName,
 onClose,
}: {
 skillName: string;
 onClose: () => void;
}) {
 const [loading, setLoading] = useState(true);
 const [content, setContent] = useState<string>('');
 const [error, setError] = useState<string | null>(null);
 const [extraFiles, setExtraFiles] = useState<string[]>([]);

 useEffect(() => {
 let cancelled = false;
 setLoading(true);
 setError(null);
 (async () => {
 try {
 const r = await fetch(`/api/olympus/skill?name=${encodeURIComponent(skillName)}`, { cache: 'no-store' });
 if (!r.ok) throw new Error(`API ${r.status}`);
 const d = await r.json();
 if (cancelled) return;
 setContent(d.content || '');
 setExtraFiles(d.extraFiles || []);
 } catch (e: any) {
 if (!cancelled) setError(e.message);
 } finally {
 if (!cancelled) setLoading(false);
 }
 })();
 return () => { cancelled = true; };
 }, [skillName]);

 return (
 <div className="absolute right-0 top-0 bottom-0 w-[420px] bg-olympus-card border-l border-olympus-gold/20 shadow-2xl flex flex-col z-30">
 {/* Header */}
 <div className="flex items-center gap-2 px-3 py-2 border-b border-olympus-gold/15 bg-olympus-panel">
 <FileText size={13} className="text-olympus-gold" />
 <span className="text-[11px] font-mono text-olympus-gold truncate flex-1">{skillName}</span>
 <button
 aria-label="Close"
 onClick={onClose}
 className="w-6 h-6 rounded hover:bg-olympus-gold/10 flex items-center justify-center text-olympus-text-dim hover:text-olympus-gold"
 >
 <X size={12} />
 </button>
 </div>

 {/* Body */}
 <div className="flex-1 overflow-y-auto custom-scroll p-3">
 {loading && (
 <div className="flex items-center gap-2 text-olympus-text-dim text-[10px] font-mono">
 <Loader2 size={11} className="animate-spin" /> loading skill…
 </div>
 )}
 {error && (
 <div className="text-[10px] font-mono text-olympus-red leading-relaxed">
 Failed to load: {error}
 </div>
 )}
 {!loading && !error && (
 <>
 <pre className="text-[10px] font-mono text-olympus-text whitespace-pre-wrap break-words leading-relaxed">
 {content}
 </pre>
 {extraFiles.length > 0 && (
 <div className="mt-3 pt-3 border-t border-olympus-gold/10">
 <div className="text-[9px] font-mono text-olympus-text-dim uppercase tracking-wide mb-1.5">
 Skill directory contents
 </div>
 <div className="flex flex-wrap gap-1">
 {extraFiles.map(f => (
 <span key={f} className="text-[9px] font-mono text-olympus-cyan bg-olympus-bg px-1.5 py-0.5 rounded">
 {f}
 </span>
 ))}
 </div>
 </div>
 )}
 </>
 )}
 </div>
 </div>
 );
}
