#!/usr/bin/env node
/**
 * build-skill-index.js — Build the per-god skill index for semantic search.
 *
 * v0.0.1 — LOCAL TF-IDF FALLBACK. If no OpenAI API key is configured, this
 * script builds a TF-IDF index (no external API calls) that powers the
 * SkillIndex cosine search. The TF-IDF vectors are lower-dimensional than
 * OpenAI embeddings but provide good enough semantic matching for 330 skills.
 *
 * Usage:
 *   node scripts/build-skill-index.js                # build
 *   node scripts/build-skill-index.js --rebuild      # drop + rebuild
 *
 * Env vars:
 *   OLYMPUS_EMBED_PROVIDER = "local" (default, TF-IDF) | "openai"
 *   OLYMPUS_EMBED_API_KEY  = OpenAI API key (only if provider=openai)
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';

const OLYMPUS_ROOT = process.env.OLYMPUS_ROOT || process.cwd();
const VAULT_ROOT = process.env.OLYMPUS_VAULT || path.join(os.homedir(), 'OLYMPUS-VAULT');
const DB_PATH = path.join(VAULT_ROOT, '03_Index', 'skill-vec.db');
const SKILLS_ROOT = path.join(OLYMPUS_ROOT, '.opencode', 'skills');

// TF-IDF implementation (local, no API calls)
const STOPWORDS = new Set(['the','a','an','is','are','was','were','be','been','being','have','has','had','do','does','did','will','would','could','should','to','of','in','for','on','with','as','by','at','from','up','about','into','through','during','before','after','and','or','but','not','no','this','that','these','those','i','you','he','she','it','we','they','me','him','her','us','them','my','your','his','its','our','their','what','which','who','when','where','why','how','all','each','every','both','few','more','most','other','some','such','only','own','same','so','than','too','very','just','now']);

function tokenize(text) {
  return text.toLowerCase()
    .split(/[^a-z0-9-]+/)
    .filter(w => w.length > 1 && !STOPWORDS.has(w));
}

// Build vocabulary + document frequencies from all skills
function buildVocabulary(documents) {
  const df = new Map(); // document frequency
  const vocab = new Map(); // term -> index
  let vocabSize = 0;

  for (const doc of documents) {
    const tokens = new Set(tokenize(doc.text));
    for (const t of tokens) {
      df.set(t, (df.get(t) || 0) + 1);
      if (!vocab.has(t)) {
        vocab.set(t, vocabSize++);
      }
    }
  }

  return { df, vocab, vocabSize };
}

// Build TF-IDF vector for a document
function tfidfVector(text, vocab, df, numDocs, vocabSize) {
  const vector = new Float32Array(vocabSize);
  const tokens = tokenize(text);
  const tf = new Map();
  for (const t of tokens) {
    tf.set(t, (tf.get(t) || 0) + 1);
  }

  for (const [term, count] of tf) {
    const idx = vocab.get(term);
    if (idx === undefined) continue;
    const idf = Math.log((numDocs + 1) / (df.get(term) || 1));
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

// Read skill content
function readSkill(skillDir) {
  const skillMd = path.join(skillDir, 'SKILL.md');
  if (!fs.existsSync(skillMd)) return null;
  try {
    const content = fs.readFileSync(skillMd, 'utf-8');
    // Extract frontmatter + first 500 chars of body for the index
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)/);
    let frontmatter = '';
    let body = content;
    if (fmMatch) {
      frontmatter = fmMatch[1];
      body = fmMatch[2];
    }
    // Extract name from frontmatter or directory name
    const nameMatch = frontmatter.match(/^name:\s*(.+)$/m);
    const name = nameMatch ? nameMatch[1].trim() : path.basename(skillDir);
    // Extract description
    const descMatch = frontmatter.match(/^description:\s*(.+)$/m);
    const desc = descMatch ? descMatch[1].trim() : '';
    // Extract tags
    const tagsMatch = frontmatter.match(/^tags:\s*\[([^\]]*)\]/m);
    const tags = tagsMatch ? tagsMatch[1].split(',').map(s => s.trim().replace(/["']/g, '')) : [];

    // Index text = name + description + tags + first 500 chars of body
    const indexText = [name, desc, tags.join(' '), body.slice(0, 500)].join(' ');

    return { name, description: desc, tags, text: indexText, body: body.slice(0, 1000) };
  } catch {
    return null;
  }
}

// Map skills to gods (based on mastered-skills profiles)
function mapSkillsToGods() {
  const godSkills = new Map();
  const masteredDir = path.join(OLYMPUS_ROOT, '.opencode', 'vault-brain', 'mastered-skills');
  const GOD_NAMES = ['apollo','artemis','athena','dionysus','hephaestus','hermes','persephone','prometheus','callimachus'];

  for (const god of GOD_NAMES) {
    const fp = path.join(masteredDir, `${god}.md`);
    if (!fs.existsSync(fp)) continue;
    const content = fs.readFileSync(fp, 'utf-8');
    // Extract skill names from the "## Available Skills" section
    let capturing = false;
    const skills = [];
    for (const line of content.split('\n')) {
      if (line.startsWith('## Available Skills')) { capturing = true; continue; }
      if (line.startsWith('## ')) { capturing = false; continue; }
      if (!capturing) continue;
      const m = line.match(/^-\s+`([^`]+)`/);
      if (m) {
        const subMatch = line.match(/\(([^)]+)\s+sub-skill\)/);
        if (subMatch) skills.push(subMatch[1]);
        else skills.push(m[1]);
      }
    }
    for (const s of skills) {
      if (!godSkills.has(s)) godSkills.set(s, []);
      godSkills.get(s).push(god);
    }
  }
  return godSkills;
}

// Main
console.log('Building skill index...');
console.log(`  Skills root: ${SKILLS_ROOT}`);
console.log(`  DB path: ${DB_PATH}`);

// Ensure DB directory exists
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

// Read all skills
const skillDirs = fs.readdirSync(SKILLS_ROOT, { withFileTypes: true })
  .filter(e => e.isDirectory())
  .map(e => e.name);

const documents = [];
const godSkillsMap = mapSkillsToGods();

for (const skillName of skillDirs) {
  const skillDir = path.join(SKILLS_ROOT, skillName);
  const skill = readSkill(skillDir);
  if (!skill) continue;
  const gods = godSkillsMap.get(skillName) || ['all'];
  for (const god of gods) {
    documents.push({
      skill_id: skillName,
      god_scope: god,
      kind: 'skill',
      title: skill.name,
      description: skill.description,
      body: skill.body,
      source_path: path.join(skillDir, 'SKILL.md'),
      text: skill.text,
    });
  }
  // Also add sub-skills (e.g., superpowers/*)
  const subSkillDir = path.join(skillDir);
  const subFiles = fs.readdirSync(subSkillDir).filter(f => f.endsWith('.md') && f !== 'SKILL.md');
  for (const sf of subFiles) {
    const subContent = fs.readFileSync(path.join(subSkillDir, sf), 'utf-8');
    const subName = sf.replace(/\.md$/, '');
    documents.push({
      skill_id: `${skillName}/${subName}`,
      god_scope: gods[0] || 'all',
      kind: 'skill',
      title: `${skillName} (${subName})`,
      description: '',
      body: subContent.slice(0, 1000),
      source_path: path.join(subSkillDir, sf),
      text: `${skillName} ${subName} ${subContent.slice(0, 500)}`,
    });
  }
}

console.log(`  Documents to index: ${documents.length}`);

// Build vocabulary + TF-IDF vectors
const { df, vocab, vocabSize } = buildVocabulary(documents);
console.log(`  Vocabulary size: ${vocabSize}`);

// Create SQLite database with sqlite-vec
if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH);
const db = new Database(DB_PATH);
sqliteVec.load(db);

// Create tables
db.exec(`
  CREATE VIRTUAL TABLE IF NOT EXISTS skill_vectors USING vec0(
    embedding float[${vocabSize}]
  );
  CREATE TABLE IF NOT EXISTS skill_metadata (
    rowid INTEGER PRIMARY KEY,
    skill_id TEXT,
    god_scope TEXT,
    kind TEXT,
    title TEXT,
    description TEXT,
    body TEXT,
    source_path TEXT
  );
`);

// Insert documents
const insertVec = db.prepare('INSERT INTO skill_vectors (embedding) VALUES (?)');
const insertMeta = db.prepare('INSERT INTO skill_metadata (rowid, skill_id, god_scope, kind, title, description, body, source_path) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');

const insertMany = db.transaction((docs) => {
  for (let i = 0; i < docs.length; i++) {
    const doc = docs[i];
    const vector = tfidfVector(doc.text, vocab, df, documents.length, vocabSize);
    const buf = Buffer.from(vector.buffer);
    insertVec.run(buf);
    insertMeta.run(i, doc.skill_id, doc.god_scope, doc.kind, doc.title, doc.description, doc.body, doc.source_path);
  }
});
insertMany(documents);

// Save vocabulary for runtime queries
const vocabPath = path.join(VAULT_ROOT, '03_Index', 'skill-vocab.json');
fs.writeFileSync(vocabPath, JSON.stringify({
  vocab: [...vocab.entries()].reduce((o, [k, v]) => { o[k] = v; return o; }, {}),
  df: [...df.entries()],
  numDocs: documents.length,
  vocabSize,
}), 'utf-8');

console.log(`  Vocabulary saved: ${vocabPath}`);
console.log(`\nSkill index built: ${documents.length} documents, ${vocabSize} vocab terms`);
console.log(`DB: ${DB_PATH}`);
db.close();
