/**
 * retrieval/types.ts — v0.1.3 retrieval contracts.
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

export type RetrievalKind =
  | 'skill'
  | 'knowledge'
  | 'instinct'
  | 'pattern'
  | 'doc'
  | 'media';

export interface RetrievalDocument {
  docId: string;
  kind: RetrievalKind;
  sourcePath: string;
  title: string;
  text: string;
  project: string | null;
  stacks: string[];
  god: string;
  hash: string;
  updatedAt: string;
  expiresAt: string | null;
  stale: boolean;
}

export interface RetrievalChunk {
  docId: string;
  kind: RetrievalKind;
  sourcePath: string;
  title: string;
  text: string;
  project: string | null;
  stacks: string[];
  god: string;
  hash: string;
  updatedAt: string;
  expiresAt: string | null;
  stale: boolean;
}

export interface RetrievalHit extends RetrievalChunk {
  score: number;
  ftsRank: number | null;
  denseRank: number | null;
  snippet: string;
}

export interface RetrievalQuery {
  query: string;
  kinds?: RetrievalKind[];
  god?: string | null;
  project?: string | null;
  stacks?: string[] | null;
  limit?: number;
  budgetChars?: number;
  includeStale?: boolean;
  /** Disable the dense lane (FTS-only baseline/tests). */
  dense?: boolean;
}

export interface IndexProgress {
  total: number;
  done: number;
  embedded: number;
  skipped: number;
  errors: number;
  current: string;
  paused: boolean;
}
