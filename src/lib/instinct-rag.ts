/**
 * instinct-rag.ts — #84 (HIGIENIA-2 H3b / F1): the instinct RAG — proven
 * instincts as SHORT prior-context blocks in dispatches.
 *
 * The D16-compliant form (short blocks, never prompt essays): when a
 * dispatch is composed, the composer god's PROVEN instincts (confidence ≥
 * the threshold, a real token match against the task) ride into the
 * payload as a compact "trust but verify" block. No match — no block (the
 * honest skip; the dispatch stays lean).
 *
 * The scoring is deliberately naive and cheap: token overlap between the
 * task text and the instinct's trigger (lowercased, alphanumeric tokens,
 * a small stoplist). The instinct pools are small (a handful per god);
 * a vector store would be ceremony here.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getVaultRoot } from './vault-root';

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'to', 'of', 'in', 'on', 'for', 'with', 'is', 'are',
  'be', 'this', 'that', 'it', 'as', 'at', 'by', 'from', 'into', 'any', 'when', 'if',
  'then', 'than', 'so', 'we', 'you', 'use', 'make', 'build', 'task', 'please',
]);

function tokenize(text: string): Set<string> {
  return new Set(
    String(text || '')
      .toLowerCase()
      .split(/[^a-z0-9-]+/)
      .filter((t) => t.length >= 3 && !STOPWORDS.has(t)),
  );
}

/** Parse an instinct file's frontmatter (the vault's seed/empirical shape). */
function parseInstinctFile(filePath: string): { confidence: number; trigger: string; action: string; source: string } | null {
  try {
    const raw = readFileSync(filePath, 'utf-8');
    const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!m) return null;
    const fm: Record<string, string> = {};
    for (const line of m[1].split('\n')) {
      const kv = line.match(/^([a-zA-Z_]+):\s*(.*)$/);
      if (kv) fm[kv[1]] = kv[2].trim();
    }
    const confidence = Number.parseFloat(fm.confidence ?? '');
    if (!Number.isFinite(confidence)) return null;
    return {
      confidence,
      trigger: String(fm.trigger ?? ''),
      action: String(fm.action ?? ''),
      source: String(fm.source ?? 'unknown'),
    };
  } catch { return null; }
}

export interface InstinctPriorContextOptions {
  vaultRoot?: string;
  minConfidence?: number;
  maxBlocks?: number;
}

/**
 * Compose the prior-context block for a dispatch: the composer's proven
 * instincts matching the task text. Returns null when nothing qualifies —
 * the dispatch must stay lean, never padded.
 */
export function instinctPriorContext(
  godId: string,
  taskText: string,
  opts: InstinctPriorContextOptions = {},
): string | null {
  let vaultRoot = opts.vaultRoot ?? null;
  if (!vaultRoot) {
    // The canonical resolver (env → vault-root.txt → ~/OLYMPUS-VAULT) — the
    // same truth every vault consumer uses. Never a hand-rolled default.
    try { vaultRoot = getVaultRoot(); } catch { return null; }
  }
  if (!vaultRoot || !godId) return null;
  const minConfidence = opts.minConfidence ?? 0.8;
  const maxBlocks = opts.maxBlocks ?? 2;
  const taskTokens = tokenize(taskText);
  if (taskTokens.size === 0) return null;

  const candidates: Array<{ trigger: string; action: string; confidence: number; overlap: number; source: string }> = [];
  for (const pool of ['seed', 'empirical']) {
    const dir = join(vaultRoot, '05_Auto_Learning', 'instincts', godId, pool);
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir)) {
      if (!f.endsWith('.md')) continue;
      const inst = parseInstinctFile(join(dir, f));
      if (!inst || inst.confidence < minConfidence || !inst.action) continue;
      const triggerTokens = tokenize(inst.trigger);
      let overlap = 0;
      for (const t of triggerTokens) if (taskTokens.has(t)) overlap++;
      if (overlap >= 1) candidates.push({ trigger: inst.trigger, action: inst.action, confidence: inst.confidence, overlap, source: inst.source });
    }
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => (b.overlap - a.overlap) || (b.confidence - a.confidence));
  const blocks = candidates.slice(0, maxBlocks);
  return [
    '[PRIOR CONTEXT — proven instincts for this god, matching this task. Trust but verify.]',
    ...blocks.map((c) => `- trigger: ${c.trigger || '(general)'} → ${c.action} (confidence ${c.confidence.toFixed(2)}, ${c.source})`),
  ].join('\n');
}
