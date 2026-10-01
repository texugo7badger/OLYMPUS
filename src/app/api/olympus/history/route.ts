/**
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { NextResponse } from 'next/server';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { getVaultRoot } from '@/lib/vault-root';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VAULT = getVaultRoot();

interface GitCommit {
  hash: string;
  shortHash: string;
  ts: string;
  message: string;
  author: string;
  /**
   * Brain state at this commit. v0.0.1: NOT computed — we return null for
   * every commit. Computing real brain state per commit would require
   * checking out each commit and running `buildGraph`, which is expensive
   * and not yet wired up. The UI shows the commit list without the
   * brain-state fields, consistent with the v0.0.1 "no fake data" discipline.
   */
  brainState: null;
}

/**
 * GET /api/olympus/history
 * Returns the vault's git commit history. The Time Slider component scrubs
 * through these to visualize brain evolution over time (spec §Ⅹ-B).
 *
 * v0.0.1: Returns the real git commit list (hash, ts, author, message) but
 * does NOT compute brain-state snapshots per commit. The `brainState` field
 * is `null` for every commit. Computing real brain state per commit is
 * expensive (requires checkout + buildGraph per commit) and is deferred to
 * a future release. This is consistent with the v0.0.1 "no fake data"
 * discipline — we no longer synthesize brain-state numbers from a
 * growthFactor formula.
 *
 * If the vault has no git repo, returns an empty commit list with a note.
 */
export async function GET() {
  try {
    if (!fs.existsSync(path.join(VAULT, '.git'))) {
      return NextResponse.json({
        commits: [],
        total: 0,
        note: 'Vault has no git repo. Initialize vault sync via the Settings dialog to enable history.',
      });
    }

    // Get commit log: hash|iso-date|author|message
    const log = execSync(
      'git log --format="%H|%aI|%an|%s" --no-merges',
      { cwd: VAULT, encoding: 'utf-8', timeout: 5000 },
    ).trim();

    if (!log) {
      return NextResponse.json({
        commits: [],
        total: 0,
        note: 'Vault git repo has no commits yet.',
      });
    }

    const commits: GitCommit[] = log.split('\n').filter(Boolean).map((line) => {
      const [hash, ts, author, ...msgParts] = line.split('|');
      const message = msgParts.join('|');
      return {
        hash,
        shortHash: hash.slice(0, 7),
        ts,
        message,
        author,
        brainState: null,
      };
    });

    return NextResponse.json({
      commits,
      total: commits.length,
      note: commits.length > 0
        ? undefined
        : 'No commits yet.',
    });
  } catch (e: any) {
    return NextResponse.json({
      commits: [],
      total: 0,
      error: e.message,
    });
  }
}
