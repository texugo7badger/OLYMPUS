/**
 * retrieval/chunker.ts — v0.1.3: bounded, heading-aware chunks.
 *
 * 3,500 characters soft max, 400-character overlap. The chunk carries the
 * source metadata so a hit can be cited without reopening the file.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import crypto from 'node:crypto';
import type { RetrievalChunk } from './types';

export const CHUNK_MAX = 3_500;
export const CHUNK_OVERLAP = 400;

export interface ChunkInput {
  docId: string;
  kind: RetrievalChunk['kind'];
  sourcePath: string;
  title: string;
  text: string;
  project?: string | null;
  stacks?: string[];
  god?: string;
  updatedAt?: string;
  expiresAt?: string | null;
  stale?: boolean;
}

export function hashText(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function splitText(text: string): string[] {
  const clean = String(text || '').replace(/\r\n/g, '\n').trim();
  if (!clean) return [];
  if (clean.length <= CHUNK_MAX) return [clean];

  const blocks = clean.split(/\n{2,}/);
  const out: string[] = [];
  let current = '';
  for (const block of blocks) {
    if (!current) {
      current = block;
      continue;
    }
    if (current.length + block.length + 2 <= CHUNK_MAX) {
      current += `\n\n${block}`;
    } else {
      out.push(current);
      // Keep a small overlap into the next block.
      current = current.slice(-CHUNK_OVERLAP) + `\n\n${block}`;
    }
  }
  if (current) out.push(current);
  return out;
}

export function chunkDocument(input: ChunkInput): RetrievalChunk[] {
  const parts = splitText(`${input.title}\n\n${input.text}`);
  const updatedAt = input.updatedAt || new Date().toISOString();
  return parts.map((text, i) => ({
    docId: `${input.docId}#${i}`,
    kind: input.kind,
    sourcePath: input.sourcePath,
    title: input.title,
    text,
    project: input.project ?? null,
    stacks: input.stacks ?? [],
    god: input.god || 'all',
    hash: hashText(`${input.title}\n${text}`),
    updatedAt,
    expiresAt: input.expiresAt ?? null,
    stale: input.stale === true,
  }));
}
