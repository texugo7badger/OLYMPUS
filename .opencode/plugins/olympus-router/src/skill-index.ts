/**
 * skill-index.ts — Runtime cosine-search for the per-god skill index.
 *
 * Opens the sqlite-vec database built by scripts/build-skill-index.js
 * and answers search(query, god, k) calls.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import Database from "better-sqlite3";
import type { Database as Db, Statement } from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";

export interface SkillHit {
  skill_id: string;
  god_scope: string;
  kind: "skill" | "instinct" | "sub-agent-instinct";
  title: string;
  description: string | null;
  body: string;
  source_path: string;
  similarity: number;
}

const VAULT_ROOT = process.env.OLYMPUS_VAULT_ROOT ?? join(homedir(), "OLYMPUS-VAULT");
const DEFAULT_DB_PATH = join(VAULT_ROOT, "03_Index", "skill-vec.db");
const VOCAB_PATH = join(VAULT_ROOT, "03_Index", "skill-vocab.json");

const STOPWORDS = new Set(['the','a','an','is','are','was','were','be','been','being','have','has','had','do','does','did','will','would','could','should','to','of','in','for','on','with','as','by','at','from','up','about','into','through','during','before','after','and','or','but','not','no','this','that','these','those','i','you','he','she','it','we','they','me','him','her','us','them','my','your','his','its','our','their','what','which','who','when','where','why','how','all','each','every','both','few','more','most','other','some','such','only','own','same','so','than','too','very','just','now']);

function tokenize(text: string): string[] {
  return text.toLowerCase()
    .split(/[^a-z0-9-]+/)
    .filter(w => w.length > 1 && !STOPWORDS.has(w));
}

export class SkillIndex {
  private db: Db;
  private searchStmt: Statement;
  private getStmt: Statement;
  private statsStmt: Statement;
  private vocab: Map<string, number> | null = null;
  private df: Map<string, number> | null = null;
  private numDocs = 0;
  private vocabSize = 0;

  constructor(dbPath: string = DEFAULT_DB_PATH) {
    if (!existsSync(dbPath)) {
      throw new Error(`Skill index not found at ${dbPath}. Run: node scripts/build-skill-index.js`);
    }
    this.db = new Database(dbPath, { readonly: true });
    sqliteVec.load(this.db);

    // Load vocabulary for TF-IDF query vectorization
    if (existsSync(VOCAB_PATH)) {
      try {
        const v = JSON.parse(readFileSync(VOCAB_PATH, "utf-8"));
        this.vocab = new Map(Object.entries(v.vocab));
        this.df = new Map(v.df);
        this.numDocs = v.numDocs;
        this.vocabSize = v.vocabSize;
      } catch {
        // OpenAI embedding mode — no vocab needed
      }
    }

    this.searchStmt = this.db.prepare(`
      SELECT rowid, distance
      FROM skill_vectors
      WHERE embedding MATCH ?
      ORDER BY distance
      LIMIT ?
    `);
    this.getStmt = this.db.prepare(`
      SELECT skill_id, god_scope, kind, title, description, body, source_path
      FROM skill_metadata
      WHERE rowid = ?
    `);
    this.statsStmt = this.db.prepare(`SELECT COUNT(*) as count FROM skill_metadata`);
  }

  /**
   * Build a TF-IDF query vector from the search text.
   * Only used when the index was built with TF-IDF (not OpenAI embeddings).
   */
  private buildQueryVector(query: string): Float32Array | null {
    if (!this.vocab || !this.df) return null;
    const vector = new Float32Array(this.vocabSize);
    const tokens = tokenize(query);
    const tf = new Map<string, number>();
    for (const t of tokens) {
      tf.set(t, (tf.get(t) || 0) + 1);
    }
    for (const [term, count] of tf) {
      const idx = this.vocab.get(term);
      if (idx === undefined) continue;
      const idf = Math.log((this.numDocs + 1) / (this.df.get(term) || 1));
      vector[idx] = (count / tokens.length) * idf;
    }
    // L2 normalize
    let norm = 0;
    for (let i = 0; i < vector.length; i++) norm += vector[i] * vector[i];
    norm = Math.sqrt(norm);
    if (norm > 0) {
      for (let i = 0; i < vector.length; i++) vector[i] /= norm;
    }
    return vector;
  }

  search(queryEmbedding: number[] | string, god: string, k: number = 5): SkillHit[] {
    let buf: Buffer;
    if (typeof queryEmbedding === "string") {
      // TF-IDF mode — build vector from text query
      const vec = this.buildQueryVector(queryEmbedding);
      if (!vec) return [];
      buf = Buffer.from(vec.buffer);
    } else {
      // OpenAI embedding mode — use provided embedding
      buf = Buffer.from(new Float32Array(queryEmbedding).buffer);
    }

    const rows = this.searchStmt.all(buf, k * 3) as Array<{ rowid: number; distance: number }>;
    const hits: SkillHit[] = [];
    for (const row of rows) {
      const meta = this.getStmt.get(row.rowid) as any;
      if (!meta) continue;
      // Filter by god scope (or 'all')
      if (meta.god_scope !== god && meta.god_scope !== "all") continue;
      hits.push({
        skill_id: meta.skill_id,
        god_scope: meta.god_scope,
        kind: meta.kind,
        title: meta.title,
        description: meta.description,
        body: meta.body,
        source_path: meta.source_path,
        similarity: 1 - row.distance, // cosine distance → similarity
      });
      if (hits.length >= k) break;
    }
    return hits;
  }

  stats(): { count: number } {
    return this.statsStmt.get() as { count: number };
  }

  close(): void {
    this.db.close();
  }
}

/**
 * Singleton accessor — caches the SkillIndex instance.
 * Returns null if the DB doesn't exist (graceful degradation).
 */
let _index: SkillIndex | null | undefined;
export function getSkillIndex(): SkillIndex | null {
  if (_index !== undefined) return _index;
  try {
    _index = new SkillIndex();
    return _index;
  } catch {
    _index = null;
    return null;
  }
}
