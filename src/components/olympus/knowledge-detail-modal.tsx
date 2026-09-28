/**
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

'use client';

import { useEffect, useState } from 'react';
import { X, BookOpenText, Loader2 } from 'lucide-react';

/**
 * KnowledgeDetailModal -- modal showing a knowledge/reference doc's full
 * markdown content. Modeled on InstinctDetailModal (patch-6) with the
 * BookOpenText icon and "loading knowledge..." text.
 *
 * created for the God-Detail Knowledge section. The
 * old behavior called a setter that opened the file in the in-app Monaco
 * editor (which the user called "the terminal"). The user wanted it to
 * open as a markdown-box overlay, like the instinct detail modal. This
 * component reuses the same /api/olympus/fs/read endpoint and the same
 * vault-root extraction logic (patch-17 fix for the 403). with Monaco removed, this modal is the only way to view
 * knowledge/reference docs in-app. For full-text editing the user opens
 * the file in their external editor via the Editor Bridge tab.
 */
export default function KnowledgeDetailModal({
  knowledgePath,
  knowledgeName,
  onCloseAction,
}: {
  knowledgePath: string;
  knowledgeName: string;
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
        // same vault-root extraction as instinct-detail-modal.
        // Knowledge docs live under ~/OLYMPUS-VAULT/04_Knowledge/ so the same
        // /OLYMPUS-VAULT marker extraction works.
        const vaultMarker = '/OLYMPUS-VAULT';
        const vaultIdx = knowledgePath.indexOf(vaultMarker);
        const vaultRoot = vaultIdx >= 0
          ? knowledgePath.slice(0, vaultIdx + vaultMarker.length)
          : '';
        const rootParam = vaultRoot ? `&root=${encodeURIComponent(vaultRoot)}` : '';
        const r = await fetch(`/api/olympus/fs/read?path=${encodeURIComponent(knowledgePath)}${rootParam}`, { cache: 'no-store' });
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
  }, [knowledgePath]);

  // Parse frontmatter + body (CRLF-tolerant, same as patch-6).
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
          <BookOpenText size={13} className="text-olympus-gold" />
          <span className="text-[11px] font-mono text-olympus-gold truncate flex-1">{knowledgeName}</span>
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
              <Loader2 size={11} className="animate-spin" /> loading knowledge...
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
