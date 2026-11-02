/**
 * model-context.ts — v0.0.32 (R32-01): ONE source for the model window.
 *
 * THE SPECIMEN: the context indicator defaulted to 200,000 tokens whenever it
 * could not read a session value. A 1M-context model then read "0%" while it
 * was already at 600k, and compaction fired at the wrong time. A guessed
 * number is worse than an honest "—".
 *
 * Resolution order (first wins):
 *   1. the session row (measured for THIS session)   → confidence measured
 *   2. the live free-model list                      → documented
 *   3. the OpenCode model catalog                    → documented
 *   4. the vendor table below                        → documented
 *   5. unknown                                       → context 0, UI shows "—"
 *
 * The table only carries values the project can defend (vendor docs quoted in
 * AGENTS.md/README). An unknown model is UNKNOWN, never 200k.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

export type ContextSource = 'session' | 'free-list' | 'catalog' | 'documented' | 'unknown';
export type ContextConfidence = 'measured' | 'documented' | 'unknown';

export interface ModelWindow {
  /** Context window in tokens; 0 means unknown (never a fabricated default). */
  context: number;
  /** Max output tokens when documented; null when unknown. */
  output: number | null;
  source: ContextSource;
  confidence: ContextConfidence;
  /** The matched model id (normalized), or null. */
  modelId: string | null;
}

interface DocumentedWindow {
  context: number;
  output: number | null;
  note: string;
}

/**
 * Vendor-documented windows for the lanes OLYMPUS actually assigns.
 * Add a row only with a source; a guessed row is worse than unknown.
 */
export const DOCUMENTED_WINDOWS: Record<string, DocumentedWindow> = {
  // AGENTS.md: "Apollo rides DeepSeek V4.1 Flash (1M ctx / 384k out)".
  'deepseek-v4.1-flash': { context: 1_000_000, output: 384_000, note: 'DeepSeek V4.1 Flash vendor spec (AGENTS.md)' },
  // The same family; the PRO lane was retired but old sessions still name it.
  'deepseek-v4-pro': { context: 1_000_000, output: 384_000, note: 'DeepSeek V4 Pro vendor spec (AGENTS.md, retired)' },
  // Gemini 3.1 Pro: 1M context (vendor).
  'gemini-3.1-pro': { context: 1_000_000, output: 65_536, note: 'Gemini 3.1 Pro vendor spec' },
  // Claude Sonnet/Opus 5.5: 200k context, 64k output (vendor).
  'claude-sonnet-5.5': { context: 200_000, output: 64_000, note: 'Claude Sonnet 5.5 vendor spec' },
  'claude-opus-5.5': { context: 200_000, output: 64_000, note: 'Claude Opus 5.5 vendor spec' },
};

/** Normalize `provider/model`, `provider:model`, and case. */
export function normalizeModelId(modelId: string | null | undefined): string | null {
  if (typeof modelId !== 'string' || !modelId.trim()) return null;
  const raw = modelId.trim().toLowerCase();
  const tail = raw.includes('/') ? raw.slice(raw.lastIndexOf('/') + 1) : raw.includes(':') ? raw.slice(raw.lastIndexOf(':') + 1) : raw;
  return tail || null;
}

function positive(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** The documented row for a model id (suffix match, so version tags work). */
export function documentedWindow(modelId: string | null | undefined): { key: string; window: DocumentedWindow } | null {
  const normalized = normalizeModelId(modelId);
  if (!normalized) return null;
  if (DOCUMENTED_WINDOWS[normalized]) return { key: normalized, window: DOCUMENTED_WINDOWS[normalized] };
  // `deepseek-v4.1-flash-2026-01` → `deepseek-v4.1-flash`
  for (const [key, window] of Object.entries(DOCUMENTED_WINDOWS)) {
    if (normalized.startsWith(`${key}-`) || normalized.startsWith(`${key}@`)) return { key, window };
  }
  return null;
}

export function resolveModelWindow(
  modelId: string | null | undefined,
  sources: { sessionLimit?: unknown; freeListLimit?: unknown; catalogLimit?: unknown } = {},
): ModelWindow {
  const sessionLimit = positive(sources.sessionLimit);
  if (sessionLimit) {
    return {
      context: sessionLimit,
      output: documentedWindow(modelId)?.window.output ?? null,
      source: 'session',
      confidence: 'measured',
      modelId: normalizeModelId(modelId),
    };
  }
  const freeListLimit = positive(sources.freeListLimit);
  if (freeListLimit) {
    return {
      context: freeListLimit,
      output: documentedWindow(modelId)?.window.output ?? null,
      source: 'free-list',
      confidence: 'documented',
      modelId: normalizeModelId(modelId),
    };
  }
  const catalogLimit = positive(sources.catalogLimit);
  if (catalogLimit) {
    return {
      context: catalogLimit,
      output: documentedWindow(modelId)?.window.output ?? null,
      source: 'catalog',
      confidence: 'documented',
      modelId: normalizeModelId(modelId),
    };
  }
  const documented = documentedWindow(modelId);
  if (documented) {
    return {
      context: documented.window.context,
      output: documented.window.output,
      source: 'documented',
      confidence: 'documented',
      modelId: normalizeModelId(modelId),
    };
  }
  return {
    context: 0,
    output: null,
    source: 'unknown',
    confidence: 'unknown',
    modelId: normalizeModelId(modelId),
  };
}
