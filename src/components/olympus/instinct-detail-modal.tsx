/**
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

'use client';

import { useEffect, useState } from 'react';
import { X, FileText, Loader2 } from 'lucide-react';

/**
 * InstinctDetailModal — modal showing an instinct's full markdown content.
 *
 * Fetches the instinct file's content from /api/olympus/fs/read?path=<abs_path>
 * and renders the frontmatter as a structured table + the body as preformatted
 * markdown. Opened by god-detail.tsx when the user clicks an instinct row.
 */
export default function InstinctDetailModal({
 instinctPath,
 instinctName,
 onCloseAction,
}: {
 instinctPath: string;
 instinctName: string;
 onCloseAction: () => void;
}) {
 const [loading, setLoading] = useState(true);
 const [content, setContent] = useState<string>('');
 const [error, setError] = useState<string | null>(null);

 useEffect(() => {
 let cancelled = false;
 setLoading(true);
 setError(null);
 (async () => {
 try {
 		// Fix the API 403 error. The instinct path is
 // ABSOLUTE (e.g. /home/user/OLYMPUS-VAULT/05_Auto_Learning/...).
 // The /api/olympus/fs/read route strips leading slashes and resolves
 // against the default safe root (the OLYMPUS app root), which fails
 // because the path doesn't live under the app root.
 //
 // Fix: extract the vault root from the absolute path (the path
 // always contains '/OLYMPUS-VAULT' as a segment) and pass it as the
 // `root` query param. The helper's resolveSafeRoot accepts
 // ~/OLYMPUS-VAULT as a known-safe root, so the path resolves
 // correctly and the file is found.
 const vaultMarker = '/OLYMPUS-VAULT';
 const vaultIdx = instinctPath.indexOf(vaultMarker);
 const vaultRoot = vaultIdx >= 0
 ? instinctPath.slice(0, vaultIdx + vaultMarker.length)
 : '';
 const rootParam = vaultRoot ? `&root=${encodeURIComponent(vaultRoot)}` : '';
 const r = await fetch(`/api/olympus/fs/read?path=${encodeURIComponent(instinctPath)}${rootParam}`, { cache: 'no-store' });
 if (!r.ok) throw new Error(`API ${r.status}`);
 const d = await r.json();
 if (cancelled) return;
 setContent(d.content || '');
 } catch (e: any) {
 if (!cancelled) setError(e.message);
 } finally {
 if (!cancelled) setLoading(false);
 }
 })();
 return () => { cancelled = true; };
 }, [instinctPath]);

 // Parse frontmatter + body.
 	// CRLF-tolerant regex. The seed instinct .md files
 // ship with \r\n line terminators on Windows; the original LF-only
 // regex returned `null` and the modal showed the entire file as the
 // "body" with no frontmatter table. The `\r?\n` variant below matches
 // both LF and CRLF.
 let frontmatterLines: Array<[string, string]> = [];
 let body = content;
 const m = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
 if (m) {
 body = m[2];
 for (const line of m[1].split(/\r?\n/)) {
 const eq = line.indexOf(':');
 if (eq < 0) continue;
 frontmatterLines.push([line.slice(0, eq).trim(), line.slice(eq + 1).trim().replace(/^["']|["']$/g, '')]);
 }
 }

 return (
 <div
   className="fixed inset-0 bg-black/60 z-300 flex items-center justify-center p-8"
	  onClick={onCloseAction}
 >
 <div
 className="bg-olympus-card border border-olympus-gold/30 rounded-lg shadow-2xl max-w-2xl w-full max-h-[80vh] flex flex-col"
 onClick={e => e.stopPropagation()}
 >
 <div className="flex items-center gap-2 px-4 py-3 border-b border-olympus-gold/15 bg-olympus-panel">
 <FileText size={13} className="text-olympus-gold" />
 <span className="text-[11px] font-mono text-olympus-gold truncate flex-1">{instinctName}</span>
 <button
 aria-label="Close"
            onClick={onCloseAction}
 className="w-6 h-6 rounded hover:bg-olympus-gold/10 flex items-center justify-center text-olympus-text-dim hover:text-olympus-gold"
 >
 <X size={12} />
 </button>
 </div>

 <div className="flex-1 overflow-y-auto custom-scroll p-4">
 {loading && (
 <div className="flex items-center gap-2 text-olympus-text-dim text-[10px] font-mono">
 <Loader2 size={11} className="animate-spin" /> loading instinct…
 </div>
 )}
 {error && (
 <div className="text-[10px] font-mono text-olympus-red leading-relaxed">
 Failed to load: {error}
 </div>
 )}
 {!loading && !error && (
 <>
 {frontmatterLines.length > 0 && (
 <div className="mb-3">
 <div className="text-[9px] font-mono text-olympus-text-dim uppercase tracking-wide mb-1.5">
 Frontmatter
 </div>
 <div className="rounded border border-olympus-gold/15 bg-olympus-bg p-2 space-y-1">
 {frontmatterLines.map(([k, v]) => (
 <div key={k} className="flex gap-3 text-[10px] font-mono">
 <span className="text-olympus-gold w-28 shrink-0">{k}:</span>
 <span className="text-olympus-text break-all">{v}</span>
 </div>
 ))}
 </div>
 </div>
 )}
 <div>
 <div className="text-[9px] font-mono text-olympus-text-dim uppercase tracking-wide mb-1.5">
 Body
 </div>
 <pre className="text-[10px] font-mono text-olympus-text whitespace-pre-wrap wrap-break-word leading-relaxed">
 {body}
 </pre>
 </div>
 </>
 )}
 </div>
 </div>
 </div>
 );
}
