#!/usr/bin/env node
/**
 * incremental-skill-index.js — Watch the skills tree for .md changes
 * and upsert single skill vectors into skill-vec.db (no full rebuild).
 *
 *
 * Complements build-skill-index.js (which does a full rebuild). The watcher
 * runs in the background (spawned by the Electron main process on app start)
 * and handles:
 *   - add:    new skill file → compute TF-IDF vector → insert into DB
 *   - change: existing skill modified → recompute vector → upsert
 *   - unlink: skill deleted → delete from DB
 *
 * The TF-IDF vocabulary is rebuilt incrementally — when a new document adds
 * a term to the vocab, we recompute the IDF for all existing documents. This
 * is O(N) per new term, which is acceptable for ~330 skills. For larger
 * collections, a more sophisticated incremental IDF scheme would be needed.
 *
 * Usage:
 *   node scripts/incremental-skill-index.js                # start watcher
 *   node scripts/incremental-skill-index.js --once         # scan once + exit
 *   node scripts/incremental-skill-index.js --verbose      # debug logging
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { existsSync, readFileSync, watch, readdirSync, statSync } from 'node:fs';
import { join, extname, basename } from 'node:path';
import { homedir } from 'node:os';
import chokidar from 'chokidar';
import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';

const OLYMPUS_ROOT = process.env.OLYMPUS_ROOT || process.cwd();
const VAULT_ROOT = process.env.OLYMPUS_VAULT || process.env.OLYMPUS_VAULT_DIR || join(homedir(), 'OLYMPUS-VAULT');
const DB_PATH = join(VAULT_ROOT, '03_Index', 'skill-vec.db');
const SKILLS_ROOT = join(OLYMPUS_ROOT, '.opencode', 'skills');

const VERBOSE = process.argv.includes('--verbose');
const ONCE = process.argv.includes('--once');

function log(msg) { if (VERBOSE) console.log(`[skill-index] ${msg}`); }
function ok(msg) { console.log(`[skill-index] ✓ ${msg}`); }
function warn(msg) { console.warn(`[skill-index] ! ${msg}`); }
function err(msg) { console.error(`[skill-index] X ${msg}`); }

// ─── TF-IDF (mirrors build-skill-index.js) ──────────────────────────────────

const STOPWORDS = new Set(['the','a','an','is','are','was','were','be','been','being','have','has','had','do','does','did','will','would','could','should','to','of','in','for','on','with','as','by','at','from','up','about','into','through','during','before','after','and','or','but','not','no','this','that','these','those','i','you','he','she','it','we','they','me','him','her','us','them','my','your','his','its','our','their','what','which','who','when','where','why','how','all','each','every','both','few','more','most','other','some','such','only','own','same','so','than','too','very','just','now']);

function tokenize(text) {
  return text.toLowerCase()
    .split(/[^a-z0-9-]+/)
    .filter(w => w.length > 1 && !STOPWORDS.has(w));
}

// Load existing vocabulary from the DB (built by build-skill-index.js).
function loadVocab(db) {
  const vocab = new Map(); // term -> index
  const df = new Map();    // term -> document frequency
  try {
    const row = db.prepare('SELECT value FROM skill_meta WHERE key = ?').get('vocab');
    if (row) {
      const parsed = JSON.parse(row.value);
      for (let i = 0; i < parsed.terms.length; i++) {
        vocab.set(parsed.terms[i], i);
        df.set(parsed.terms[i], parsed.df[i] || 0);
      }
    }
  } catch {}
  return { vocab, df };
}

function saveVocab(db, vocab, df) {
  const terms = Array.from(vocab.keys()).sort((a, b) => vocab.get(a) - vocab.get(b));
  const dfArr = terms.map(t => df.get(t) || 0);
  db.prepare('INSERT OR REPLACE INTO skill_meta (key, value) VALUES (?, ?)').run(
    'vocab',
    JSON.stringify({ terms, df: dfArr }),
  );
}

// Compute the TF-IDF vector for a single document given the current vocab + df.
function computeTfidf(text, vocab, df, totalDocs) {
  const tokens = tokenize(text);
  const tf = new Map();
  for (const t of tokens) {
    tf.set(t, (tf.get(t) || 0) + 1);
  }
  const vec = new Float32Array(vocab.size);
  for (const [term, count] of tf) {
    const idx = vocab.get(term);
    if (idx === undefined) continue; // term not in vocab
    const docFreq = df.get(term) || 1;
    const idf = Math.log((totalDocs + 1) / (docFreq + 1)) + 1;
    vec[idx] = (count / tokens.length) * idf;
  }
  // Normalize.
  let norm = 0;
  for (const v of vec) norm += v * v;
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < vec.length; i++) vec[i] /= norm;
  return Buffer.from(vec.buffer);
}

// ─── Skill parsing ───────────────────────────────────────────────────────────

function parseSkill(filePath) {
  try {
    const content = readFileSync(filePath, 'utf-8');
    // Extract title from the first H1 or the filename.
    const titleMatch = content.match(/^#\s+(.+)$/m);
    const title = titleMatch ? titleMatch[1].trim() : basename(filePath, '.md');
    // Extract god from the path (skills/<god>/<skill>.md).
    const godMatch = filePath.match(/skills\/([^/]+)\//);
    const god = godMatch ? godMatch[1] : 'general';
    return {
      skill_id: basename(filePath, '.md'),
      god,
      title,
      description: content.slice(0, 500).replace(/[#*`]/g, ''),
      source_path: filePath,
      text: content,
    };
  } catch (e) {
    return null;
  }
}

// ─── Upsert ──────────────────────────────────────────────────────────────────

function upsertSkill(db, skill, vocab, df, totalDocs) {
  const vec = computeTfidf(skill.text, vocab, df, totalDocs);
  // Update DF for terms in this document.
  const tokens = new Set(tokenize(skill.text));
  for (const t of tokens) {
    // If the term is new, add it to the vocab + extend the vector.
    if (!vocab.has(t)) {
      const newIdx = vocab.size;
      vocab.set(t, newIdx);
      df.set(t, 0);
    }
  }
  // Recompute the vector with the updated vocab (terms may have been added).
  const vec2 = computeTfidf(skill.text, vocab, df, totalDocs);
  db.prepare(`
    INSERT OR REPLACE INTO skills (skill_id, god, title, description, source_path, embedding)
    VALUES (?, ?, ?, ?, ?, vec_blob(?))
  `).run(skill.skill_id, skill.god, skill.title, skill.description, skill.source_path, vec2);
  log(`Upserted skill: ${skill.skill_id} (god=${skill.god})`);
}

function deleteSkill(db, skillId) {
  db.prepare('DELETE FROM skills WHERE skill_id = ?').run(skillId);
  log(`Deleted skill: ${skillId}`);
}

// ─── Main ────────────────────────────────────────────────────────────────────

function initDb() {
  if (!existsSync(DB_PATH)) {
    err(`skill-vec.db not found at ${DB_PATH}. Run \`node scripts/build-skill-index.js\` first.`);
    process.exit(1);
  }
  const db = new Database(DB_PATH);
  sqliteVec.load(db);
  // Ensure the skill_meta table exists (for vocab persistence).
  db.exec(`
    CREATE TABLE IF NOT EXISTS skill_meta (key TEXT PRIMARY KEY, value TEXT);
  `);
  // Schema-drift guard — build-skill-index.js writes to `skill_vectors`
  // + `skill_metadata`, but this incremental watcher predates that split and
  // queries a legacy `skills` table that no longer exists. Rather than crash
  // at the first prepare() (which it did silently, every Electron launch),
  // detect the mismatch and exit cleanly. The full `npm run skill-index`
  // rebuild keeps the index correct; reconciling the incremental schema is a
  // v0.0.2 task. Spawned with stdio:'ignore' by Electron, so this only lands
  // in the watcher's own log when run manually.
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name);
  if (!tables.includes('skills')) {
    log('incremental watcher: `skills` table absent — current index uses skill_vectors + skill_metadata.');
    log('incremental watcher: schema migration pending v0.0.2. Exiting. Run `npm run skill-index` to rebuild.');
    db.close();
    process.exit(0);
  }
  return db;
}

function scanOnce(db) {
  const { vocab, df } = loadVocab(db);
  const totalDocs = db.prepare('SELECT COUNT(*) as count FROM skills').get().count;

  let added = 0, updated = 0, removed = 0;

  // Scan all skill files.
  const diskSkills = new Set();
  function scanDir(dir) {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        scanDir(full);
      } else if (entry.name.endsWith('.md')) {
        diskSkills.add(full);
      }
    }
  }
  scanDir(SKILLS_ROOT);

  // Check for new + changed skills.
  const dbSkills = db.prepare('SELECT skill_id, source_path FROM skills').all();
  const dbByPath = new Map(dbSkills.map(s => [s.source_path, s]));

  for (const filePath of diskSkills) {
    const skill = parseSkill(filePath);
    if (!skill) continue;
    const existing = dbByPath.get(filePath);
    if (!existing) {
      upsertSkill(db, skill, vocab, df, totalDocs + added);
      added++;
    } else {
      // Check mtime vs DB — if file is newer, upsert.
      try {
        const stat = statSync(filePath);
        // We don't store mtime in the DB, so just upsert if the content hash
        // For simplicity, always upsert (the TF-IDF
        // recomputation is cheap for ~330 skills).
        upsertSkill(db, skill, vocab, df, totalDocs);
        updated++;
      } catch {}
    }
  }

  // Check for deleted skills.
  for (const [path, row] of dbByPath) {
    if (!diskSkills.has(path)) {
      deleteSkill(db, row.skill_id);
      removed++;
    }
  }

  // Save the updated vocab.
  saveVocab(db, vocab, df);

  return { added, updated, removed };
}

function startWatcher(db) {
  ok(`Watching ${SKILLS_ROOT} for skill changes...`);
  ok(`DB: ${DB_PATH}`);

  const watcher = chokidar.watch(join(SKILLS_ROOT, '**/*.md'), {
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 },
  });

  const { vocab, df } = loadVocab(db);

  watcher.on('add', (filePath) => {
    log(`File added: ${filePath}`);
    const skill = parseSkill(filePath);
    if (skill) {
      const totalDocs = db.prepare('SELECT COUNT(*) as count FROM skills').get().count;
      upsertSkill(db, skill, vocab, df, totalDocs);
      saveVocab(db, vocab, df);
    }
  });

  watcher.on('change', (filePath) => {
    log(`File changed: ${filePath}`);
    const skill = parseSkill(filePath);
    if (skill) {
      const totalDocs = db.prepare('SELECT COUNT(*) as count FROM skills').get().count;
      upsertSkill(db, skill, vocab, df, totalDocs);
      saveVocab(db, vocab, df);
    }
  });

  watcher.on('unlink', (filePath) => {
    log(`File deleted: ${filePath}`);
    const skillId = basename(filePath, '.md');
    deleteSkill(db, skillId);
  });

  watcher.on('error', (e) => {
    err(`Watcher error: ${e.message}`);
  });

  // Keep the process alive.
  process.on('SIGINT', () => {
    ok('Shutting down watcher...');
    watcher.close();
    db.close();
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    watcher.close();
    db.close();
    process.exit(0);
  });
}

// ─── Entry ───────────────────────────────────────────────────────────────────

const db = initDb();

if (ONCE) {
  ok('Scanning once + exiting...');
  const result = scanOnce(db);
  ok(`Done: ${result.added} added, ${result.updated} updated, ${result.removed} removed.`);
  db.close();
  process.exit(0);
} else {
  // Do an initial scan, then start the watcher.
  ok('Initial scan...');
  const result = scanOnce(db);
  ok(`Initial: ${result.added} added, ${result.updated} updated, ${result.removed} removed.`);
  startWatcher(db);
}
