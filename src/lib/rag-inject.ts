/**
 * rag-inject.ts — #164 RAG-AGENTIC (v0.0.6): the semantic retrieval reaches
 * every god's context. The hop prompt + the planner carry the Media Vault
 * hits ("style of my previous assets") + the instinct-pool prior context —
 * the #84 instinct RAG + the #150 vec layer FUSED into one retrieval pass
 * that the walker composes into every hop.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { searchSemantic } from './media-vault-vec';
import { listAssets, type MediaAsset } from './media-vault';

/** The retrieval budget per hop (the prior-context block is capped). */
const MAX_ASSETS = 4;
const MAX_CHARS = 600;

/**
 * Compose the RAG block for a hop/planner prompt: the semantic hits from the
 * vault (when a key indexes it) + the honest keyword pass — the assets named
 * with their tags + one-line descriptions. Absent vault / no hits = the empty
 * string (the hop prompt stays lean, never padded).
 */
export async function composeRagContext(query: string): Promise<string> {
  try {
    // The semantic lane first (the Pollinations-keyed vec search), then the
    // keyword fallback — both honest, both bounded.
    const ids = await searchSemantic(query, MAX_ASSETS).catch(() => null);
    let hits: MediaAsset[] | null = null;
    if (ids) {
      const byId = new Map(listAssets(1000).map((a) => [a.id, a]));
      hits = ids.map((id) => byId.get(id)).filter(Boolean) as MediaAsset[];
    } else {
      // The keyword fallback (searchAssets is the same pass the UI uses)
      const { searchAssets } = await import('./media-vault');
      hits = searchAssets(query, MAX_ASSETS);
    }
    if (!hits || hits.length === 0) return '';
    const lines = ['[YOUR PRIOR ASSETS — the vault retrieval (use the style/mood as art direction, never copy blindly)]:'];
    let budget = MAX_CHARS;
    for (const a of hits) {
      const one = `- ${a.id.slice(0, 24)}: ${(a.description ?? '').slice(0, 140)}${a.tags?.length ? ` [${a.tags.slice(0, 5).join(', ')}]` : ''}`;
      if (one.length > budget) break;
      lines.push(one);
      budget -= one.length;
    }
    return lines.length > 1 ? lines.join('\n') : '';
  } catch {
    return ''; // the RAG never breaks the hop
  }
}

/**
 * The planner-flavored retrieval: the campaign prompt queries the vault for
 * the style context BEFORE the plan (the "style of my previous assets" input
 * the user can lean on in any build prompt).
 */
export async function composePlannerRag(campaignPrompt: string): Promise<string> {
  // The style-bearing words of the prompt drive the retrieval (the nouns the
  // artist would search by) — the whole prompt as the query is too noisy.
  const styleWords = campaignPrompt
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 4 && !/^(the|and|for|with|this|that|from|your|have|must|will|should|build|create|make|page|site|app)\b/.test(w))
    .slice(0, 8)
    .join(' ');
  if (!styleWords) return '';
  return composeRagContext(styleWords);
}
