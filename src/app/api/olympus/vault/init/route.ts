/**
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { NextRequest, NextResponse } from 'next/server';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { getVaultRoot } from '@/lib/vault-root';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VAULT_ROOT = getVaultRoot();

// Use process.cwd() to resolve the seed script path.
// The previous patch attempt used fileURLToPath(import.meta.url) + __dirname
// to avoid Turbopack NFT warnings, but that approach still triggered the
// warnings AND the __dirname approach broke in other routes (ESM issue).
// process.cwd() returns the project root in both `next dev` and `next build`
// modes, which is exactly where scripts/seed-vault.py lives.
//
// Note: Turbopack may still emit a non-fatal NFT warning about this path
// operation. The warning is harmless — the build succeeds, and the runtime
// behavior is correct.
const SEED_SCRIPT = path.join(/*turbopackIgnore: true*/ process.cwd(), 'scripts', 'seed-vault.py');

/**
 * POST /api/olympus/vault/init
 *
 * Initializes the Olympus vault at ~/OLYMPUS-VAULT/ by running the seed-vault.py
 * script. Creates the full directory structure + seed instincts + seed knowledge
 * files. Idempotent — running it twice won't overwrite existing files.
 *
 * Body:
 *   { force?: boolean }  — if true, re-seeds even if the vault already exists
 *                          (still idempotent per-file — won't overwrite existing)
 *
 * Returns:
 *   { ok, vaultRoot, stats: { dirsCreated, instinctsWritten, knowledgeWritten } }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const force = body.force === true;

    // Check if vault already exists
    const vaultExists = fs.existsSync(VAULT_ROOT) && fs.existsSync(path.join(VAULT_ROOT, '05_Auto_Learning'));
    if (vaultExists && !force) {
      return NextResponse.json({
        ok: true,
        alreadyExists: true,
        vaultRoot: VAULT_ROOT,
        message: 'Vault already initialized. Pass { force: true } to re-seed (idempotent — existing files preserved).',
      });
    }

    // Run the seed script
    if (!fs.existsSync(SEED_SCRIPT)) {
      return NextResponse.json(
        { ok: false, error: `Seed script not found at ${SEED_SCRIPT}` },
        { status: 500 }
      );
    }

    const output = execSync(`python3 "${SEED_SCRIPT}"`, {
      encoding: 'utf-8',
      timeout: 30000,
      env: { ...process.env, OLYMPUS_VAULT: VAULT_ROOT },
    });

    // Parse the output for stats
    const dirsMatch = output.match(/Directories created:\s*(\d+)/);
    const instinctsMatch = output.match(/Seed instincts:\s*(\d+)/);
    const knowledgeMatch = output.match(/Seed knowledge:\s*(\d+)/);

    const stats = {
      dirsCreated: dirsMatch ? parseInt(dirsMatch[1], 10) : 0,
      instinctsWritten: instinctsMatch ? parseInt(instinctsMatch[1], 10) : 0,
      knowledgeWritten: knowledgeMatch ? parseInt(knowledgeMatch[1], 10) : 0,
    };

    return NextResponse.json({
      ok: true,
      alreadyExists: false,
      vaultRoot: VAULT_ROOT,
      stats,
      message: `Vault initialized. ${stats.instinctsWritten} seed instincts, ${stats.knowledgeWritten} seed knowledge files.`,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

/**
 * GET /api/olympus/vault/init
 * Returns the vault initialization status.
 */
export async function GET() {
  try {
    const vaultExists = fs.existsSync(VAULT_ROOT) && fs.existsSync(path.join(VAULT_ROOT, '05_Auto_Learning'));
    const instinctsDir = path.join(VAULT_ROOT, '05_Auto_Learning', 'instincts');

    let godCount = 0;
    let seedInstinctCount = 0;
    let empiricalInstinctCount = 0;
    let knowledgeFileCount = 0;

    if (fs.existsSync(instinctsDir)) {
      for (const god of fs.readdirSync(instinctsDir)) {
        const godDir = path.join(instinctsDir, god);
        if (!fs.statSync(godDir).isDirectory()) continue;
        godCount++;
        const seedDir = path.join(godDir, 'seed');
        const empiricalDir = path.join(godDir, 'empirical');
        if (fs.existsSync(seedDir)) {
          seedInstinctCount += fs.readdirSync(seedDir).filter(f => f.endsWith('.md')).length;
        }
        if (fs.existsSync(empiricalDir)) {
          empiricalInstinctCount += fs.readdirSync(empiricalDir).filter(f => f.endsWith('.md') && !f.startsWith('_')).length;
        }
      }
    }

    const knowledgeDir = path.join(VAULT_ROOT, '04_Knowledge', 'references');
    if (fs.existsSync(knowledgeDir)) {
      for (const cat of fs.readdirSync(knowledgeDir)) {
        const catDir = path.join(knowledgeDir, cat);
        if (fs.statSync(catDir).isDirectory()) {
          knowledgeFileCount += fs.readdirSync(catDir).filter(f => f.endsWith('.md')).length;
        }
      }
    }

    return NextResponse.json({
      ok: true,
      vaultRoot: VAULT_ROOT,
      initialized: vaultExists,
      stats: {
        gods: godCount,
        seedInstincts: seedInstinctCount,
        empiricalInstincts: empiricalInstinctCount,
        knowledgeFiles: knowledgeFileCount,
      },
      message: vaultExists
        ? `Vault initialized. ${godCount} gods, ${seedInstinctCount} seed instincts, ${empiricalInstinctCount} empirical instincts, ${knowledgeFileCount} knowledge files.`
        : 'Vault not initialized. POST to this endpoint to initialize.',
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
