/**
 * retrieval/indexer.ts — v0.1.3: index the vault's skills, knowledge,
 * instincts and patterns into the local hybrid index.
 *
 * Deterministic collection, content-hash skipping, batched 768d embeddings.
 * If Ollama is down the lexical half still indexes; the next run with Ollama
 * up fills the vectors (the `embedded` flag makes that resume honest).
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import fs from 'node:fs';
import path from 'node:path';
import { getVaultRoot } from '../vault-root';
import { chunkDocument } from './chunker';
import { embedDocuments, ollamaAvailable, EMBED_MODEL } from './embedding';
import {
  getRetrievalStore,
  hasChunkWithHash,
  upsertChunk,
  setMeta,
  storeStats,
  type RetrievalStore,
} from './store';
import { isRetrievalPaused } from './runtime';
import { listContext7Docs } from './context7-cache';
import type { IndexProgress, RetrievalChunk, RetrievalDocument } from './types';

const ROOT = () => process.env.OLYMPUS_ROOT || process.cwd();

function fmField(raw: string, key: string): string {
  const m = new RegExp(`^${key}:\\s*(.*)$`, 'm').exec(raw);
  return m ? m[1].trim().replace(/^["']|["']$/g, '') : '';
}

function fmList(raw: string, key: string): string[] {
  const value = fmField(raw, key);
  if (!value) return [];
  return value.replace(/^\[|\]$/g, '').split(',').map((s) => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
}

function stripFrontmatter(raw: string): string {
  const m = raw.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
  return m ? raw.slice(m[0].length) : raw;
}

function walk(root: string, files: string[], match: (name: string) => boolean, depth = 0): void {
  if (depth > 8) return;
  let entries: fs.Dirent[] = [];
  try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (e.name === 'node_modules' || e.name === '.git' || e.name === '.next') continue;
    const abs = path.join(root, e.name);
    if (e.isDirectory()) walk(abs, files, match, depth + 1);
    else if (match(e.name)) files.push(abs);
  }
}

function docSkill(file: string): RetrievalDocument | null {
  try {
    const raw = fs.readFileSync(file, 'utf-8');
    const rel = path.relative(ROOT(), file).split(path.sep).join('/');
    const title = fmField(raw, 'name') || rel.split('/').slice(-2)[0] || rel;
    const description = fmField(raw, 'description');
    const body = stripFrontmatter(raw).slice(0, 7_000);
    return {
      docId: `skill:${rel}`,
      kind: 'skill',
      sourcePath: file,
      title,
      text: `${description}\n\n${body}`,
      project: null,
      stacks: [],
      god: fmField(raw, 'god') || 'all',
      hash: '',
      updatedAt: new Date(fs.statSync(file).mtimeMs).toISOString(),
      expiresAt: null,
      stale: false,
    };
  } catch { return null; }
}

function docKnowledge(file: string): RetrievalDocument | null {
  try {
    const raw = fs.readFileSync(file, 'utf-8');
    const rel = path.relative(getVaultRoot(), file).split(path.sep).join('/');
    const title = fmField(raw, 'title') || path.basename(file, '.md');
    const category = fmField(raw, 'category');
    const body = stripFrontmatter(raw).slice(0, 7_000);
    return {
      docId: `knowledge:${rel}`,
      kind: 'knowledge',
      sourcePath: file,
      title,
      text: `${category}\n\n${body}`,
      project: null,
      stacks: fmList(raw, 'stacks'),
      god: fmField(raw, 'god') || 'all',
      hash: '',
      updatedAt: new Date(fs.statSync(file).mtimeMs).toISOString(),
      expiresAt: null,
      stale: false,
    };
  } catch { return null; }
}

function docInstinct(file: string, god: string, tier: string): RetrievalDocument | null {
  try {
    const raw = fs.readFileSync(file, 'utf-8');
    const body = stripFrontmatter(raw).slice(0, 5_000);
    const trigger = fmField(raw, 'trigger');
    const action = fmField(raw, 'action');
    const projectList = fmList(raw, 'projects');
    const stale = fmField(raw, 'stale') === 'true';
    return {
      docId: `instinct:${god}:${tier}:${path.basename(file)}`,
      kind: 'instinct',
      sourcePath: file,
      title: trigger || `${god} ${path.basename(file, '.md')}`,
      text: `${trigger}\n${action}\n\n${body}`,
      project: projectList.length === 1 ? projectList[0] : null,
      stacks: fmList(raw, 'stacks'),
      god,
      hash: '',
      updatedAt: new Date(fs.statSync(file).mtimeMs).toISOString(),
      expiresAt: fmField(raw, 'expires_at') || null,
      stale,
    };
  } catch { return null; }
}

function docPattern(file: string): RetrievalDocument | null {
  try {
    const raw = fs.readFileSync(file, 'utf-8');
    const body = stripFrontmatter(raw).slice(0, 5_000);
    return {
      docId: `pattern:${path.basename(file)}`,
      kind: 'pattern',
      sourcePath: file,
      title: fmField(raw, 'trigger_signature') || path.basename(file, '.md'),
      text: body,
      project: null,
      stacks: fmList(raw, 'stacks'),
      god: 'all',
      hash: '',
      updatedAt: new Date(fs.statSync(file).mtimeMs).toISOString(),
      expiresAt: null,
      stale: false,
    };
  } catch { return null; }
}

export function collectRetrievalDocuments(): RetrievalDocument[] {
  const docs: RetrievalDocument[] = [];
  const skills: string[] = [];
  walk(path.join(ROOT(), '.opencode', 'skills'), skills, (n) => n === 'SKILL.md');
  for (const f of skills) { const d = docSkill(f); if (d) docs.push(d); }

  const knowledge: string[] = [];
  walk(path.join(getVaultRoot(), '04_Knowledge', 'references'), knowledge, (n) => n.endsWith('.md'));
  for (const f of knowledge) { const d = docKnowledge(f); if (d) docs.push(d); }

  const instinctsRoot = path.join(getVaultRoot(), '05_Auto_Learning', 'instincts');
  for (const god of fs.existsSync(instinctsRoot) ? fs.readdirSync(instinctsRoot) : []) {
    for (const tier of ['seed', 'empirical']) {
      const dir = path.join(instinctsRoot, god, tier);
      if (!fs.existsSync(dir)) continue;
      for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.md'))) {
        const d = docInstinct(path.join(dir, f), god, tier);
        if (d) docs.push(d);
      }
    }
  }

  docs.push(...listContext7Docs(200));

  const patternsRoot = path.join(getVaultRoot(), '05_Auto_Learning', 'patterns');
  if (fs.existsSync(patternsRoot)) {
    for (const f of fs.readdirSync(patternsRoot).filter((n) => n.endsWith('.md'))) {
      const d = docPattern(path.join(patternsRoot, f));
      if (d) docs.push(d);
    }
  }
  return docs;
}

function clearIndex(store: RetrievalStore): void {
  store.db.exec('DELETE FROM retrieval_fts; DELETE FROM retrieval_docs; DELETE FROM retrieval_map;');
  try { store.db.exec('DELETE FROM retrieval_vec'); } catch { /* no vec */ }
}

export interface IndexResult {
  ok: boolean;
  documents: number;
  chunks: number;
  embedded: number;
  skipped: number;
  errors: number;
  dense: boolean;
  paused: boolean;
  stats: ReturnType<typeof storeStats>;
}

export async function indexRetrieval(opts: {
  force?: boolean;
  limit?: number;
  signal?: AbortSignal;
  onProgress?: (p: IndexProgress) => void;
} = {}): Promise<IndexResult> {
  const store = getRetrievalStore();
  try {
    if (opts.force) clearIndex(store);
    const dense = await ollamaAvailable();
    const docs = collectRetrievalDocuments().slice(0, opts.limit && opts.limit > 0 ? opts.limit : undefined);
    const progress: IndexProgress = {
      total: docs.length, done: 0, embedded: 0, skipped: 0, errors: 0,
      current: '', paused: false,
    };

    // Build the pending chunk list first so one batch failure loses little.
    const pending: RetrievalChunk[] = [];
    for (const doc of docs) {
      const chunks = chunkDocument(doc);
      for (const chunk of chunks) {
        if (hasChunkWithHash(store, chunk.docId, chunk.hash, dense)) {
          progress.skipped++;
          continue;
        }
        pending.push(chunk);
      }
      progress.current = doc.docId;
      progress.done++;
      opts.onProgress?.({ ...progress });
      if (opts.signal?.aborted) break;
    }

    for (let i = 0; i < pending.length; i += 32) {
      if (opts.signal?.aborted) break;
      if (isRetrievalPaused()) {
        progress.paused = true;
        break;
      }
      const batch = pending.slice(i, i + 32);
      const vectors = dense ? await embedDocuments(batch.map((c) => c.text)) : null;
      if (dense && !vectors) {
        // Embedding failed mid-run: keep the lexical rows so the bus works,
        // but do not mark them embedded. A later run fills them.
        progress.errors++;
      }
      for (let j = 0; j < batch.length; j++) {
        const chunk = batch[j];
        try {
          upsertChunk(store, chunk, vectors?.[j] ?? null);
          if (vectors?.[j]) progress.embedded++;
        } catch {
          progress.errors++;
        }
      }
      opts.onProgress?.({ ...progress });
    }

    setMeta(store, 'lastIndexedAt', new Date().toISOString());
    setMeta(store, 'model', dense ? EMBED_MODEL : 'fts5-only');
    setMeta(store, 'dense', dense ? '1' : '0');
    return {
      ok: true,
      documents: docs.length,
      chunks: pending.length,
      embedded: progress.embedded,
      skipped: progress.skipped,
      errors: progress.errors,
      dense,
      paused: progress.paused,
      stats: storeStats(store),
    };
  } finally {
    /* The shared store stays open for the bus; closing it would unload
       sqlite-vec for the next request. */
  }
}
