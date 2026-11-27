/**
 * retrieval/runtime.ts — v0.1.3: pause/resume and hibernate discipline.
 *
 * The indexer checks the pause flag between embedding batches. Hibernate
 * sets it, checkpoints the WAL and asks Ollama to unload our model. The
 * index is idempotent: a resumed run skips every chunk whose hash already
 * exists, so an interrupted batch never duplicates vectors.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { releaseOllamaModel } from './embedding';
import { getRetrievalStore } from './store';

let paused = false;
let lastPauseReason: string | null = null;
let lastPausedAt: string | null = null;

const HOME = () => process.env.OLYMPUS_HOME || path.join(os.homedir(), '.olympus');
const STATE = () => path.join(HOME(), 'retrieval-runtime.json');
const PAUSE_FILE = () => path.join(HOME(), 'retrieval-paused');

function writeState(): void {
  try {
    fs.mkdirSync(path.dirname(STATE()), { recursive: true });
    fs.writeFileSync(STATE(), JSON.stringify({
      paused,
      reason: lastPauseReason,
      pausedAt: lastPausedAt,
      updatedAt: new Date().toISOString(),
    }, null, 2) + '\n', { mode: 0o600 });
  } catch { /* best effort */ }
}

export function pauseRetrievalIndexing(reason = 'hibernate'): void {
  paused = true;
  lastPauseReason = reason;
  lastPausedAt = new Date().toISOString();
  try { fs.mkdirSync(path.dirname(PAUSE_FILE()), { recursive: true }); fs.writeFileSync(PAUSE_FILE(), `${lastPausedAt}\n`, 'utf-8'); } catch { /* best effort */ }
  try { getRetrievalStore().db.pragma('wal_checkpoint(TRUNCATE)'); } catch { /* no index yet */ }
  writeState();
  // Best-effort: free the embedding model while the window sleeps.
  void releaseOllamaModel();
}

export function resumeRetrievalIndexing(): void {
  paused = false;
  lastPauseReason = null;
  try { fs.rmSync(PAUSE_FILE(), { force: true }); } catch { /* gone */ }
  writeState();
}

export function isRetrievalPaused(): boolean {
  if (paused) return true;
  try { return fs.existsSync(PAUSE_FILE()); } catch { return false; }
}

export function retrievalRuntimeState() {
  return { paused, reason: lastPauseReason, pausedAt: lastPausedAt };
}
