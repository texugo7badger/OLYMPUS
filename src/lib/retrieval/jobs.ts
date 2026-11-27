/**
 * retrieval/jobs.ts — v0.1.4: the index build is a background job.
 *
 * v0.1.3's POST ran the whole build inside the request (maxDuration 300s),
 * while a full build takes ~16 minutes on this host. A request could die with
 * the build half-done and the UI had no progress to show.
 *
 * One job at a time, in-process:
 *   1. core  — skills + knowledge (the first useful retrieval surface);
 *   2. all   — instincts, patterns and cached docs (incremental by hash).
 *
 * A hibernate pause between batches stops the job honestly (`paused`); the
 * next start resumes from the content hashes. A server restart loses the
 * in-memory job, never the index.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { indexRetrieval, type IndexResult } from './indexer';
import type { IndexProgress } from './types';

export type IndexJobStatus = 'queued' | 'running' | 'done' | 'error' | 'paused';

export interface IndexJob {
  id: string;
  status: IndexJobStatus;
  phase: 'core' | 'all' | 'done';
  progress: IndexProgress;
  core?: IndexResult;
  all?: IndexResult;
  error?: string;
  startedAt: string;
  finishedAt?: string;
}

const jobs = new Map<string, IndexJob>();
let activeId: string | null = null;
let lastId: string | null = null;

const EMPTY_PROGRESS: IndexProgress = {
  total: 0, done: 0, embedded: 0, skipped: 0, errors: 0,
  current: '', paused: false, cacheHits: 0, scope: 'core',
};

export function startIndexJob(opts: { force?: boolean; limit?: number } = {}): { job: IndexJob; reused: boolean } {
  if (activeId) {
    const active = jobs.get(activeId);
    if (active && (active.status === 'running' || active.status === 'queued')) {
      return { job: active, reused: true };
    }
  }
  const id = `idx-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;
  const job: IndexJob = {
    id,
    status: 'queued',
    phase: 'core',
    progress: { ...EMPTY_PROGRESS },
    startedAt: new Date().toISOString(),
  };
  jobs.set(id, job);
  activeId = id;
  lastId = id;
  while (jobs.size > 20) {
    const first = jobs.keys().next().value;
    if (!first || first === id) break;
    jobs.delete(first);
  }
  void run(job, opts);
  return { job, reused: false };
}

async function run(job: IndexJob, opts: { force?: boolean; limit?: number }): Promise<void> {
  job.status = 'running';
  try {
    job.phase = 'core';
    const core = await indexRetrieval({
      force: opts.force === true,
      ...(opts.limit ? { limit: opts.limit } : {}),
      scope: 'core',
      onProgress: (p) => { job.progress = p; job.phase = 'core'; },
    });
    job.core = core;
    if (core.paused) {
      job.status = 'paused';
      job.phase = 'core';
      job.finishedAt = new Date().toISOString();
      return;
    }
    job.phase = 'all';
    const all = await indexRetrieval({
      scope: 'all',
      onProgress: (p) => { job.progress = p; job.phase = 'all'; },
    });
    job.all = all;
    job.status = all.paused ? 'paused' : 'done';
    job.phase = 'done';
    job.finishedAt = new Date().toISOString();
  } catch (err: any) {
    job.status = 'error';
    job.error = err?.message || String(err);
    job.finishedAt = new Date().toISOString();
  } finally {
    if (activeId === job.id) activeId = null;
  }
}

export function getIndexJob(id: string): IndexJob | null {
  return jobs.get(id) ?? null;
}

/** The active job, else the most recent one (the UI's progress source). */
export function latestIndexJob(): IndexJob | null {
  if (activeId) return jobs.get(activeId) ?? null;
  return lastId ? jobs.get(lastId) ?? null : null;
}
