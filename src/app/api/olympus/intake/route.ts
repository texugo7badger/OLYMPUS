/**
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
// Use spawnOpencode() for cross-platform support.
import { spawnOpencode, resolveDispatchCwd } from '@/lib/opencode-spawn';
// Issue 1 dynamic input token routing.
import { classifyTask, serializeClassification } from '@/lib/task-classifier';
import { getVaultRoot } from '@/lib/vault-root';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VAULT_ROOT = getVaultRoot();

/**
 * POST /api/olympus/intake
 *
 * Runs the full intake pipeline:
 *   1. Receive archive (already uploaded to /tmp/ or ~/OLYMPUS-VAULT/uploads/)
 *   2. Extract archive
 *   3. Organize files into vault categories
 *   4. Detect tech stack
 *   5. Summarize documentation (via DeepSeek V4 Flash — the vault LLM)
 *   6. Create project note in 02_Projects/<slug>/
 *   7. Compose handoff prompt for OpenCode
 *   8. Launch OpenCode in background with the handoff prompt
 *
 * This wraps the existing src/lib/intake-orchestrator.ts logic.
 *
 * Body:
 *   {
 *     archivePath: string,     — path to the uploaded archive
 *     archiveName: string,     — original filename
 *     userRequest: string,     — what the user wants to build/do
 *     projectName: string,     — human-readable project name
 *     manualStacks?: string[], — optional manual stack override
 *     additionalContext?: string[],
 *     launchOpencode?: boolean — if true, launch OpenCode after intake (default: true)
 *   }
 *
 * Returns:
 *   { ok, project, stacks, handoffPrompt, handoffPath, stages }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      archivePath,
      archiveName,
      userRequest,
      projectName,
      manualStacks,
      additionalContext,
      launchOpencode = true,
    } = body;

    // Validate required fields
    if (!userRequest || !projectName) {
      return NextResponse.json(
        { ok: false, error: 'userRequest and projectName are required' },
        { status: 400 }
      );
    }

    if (!archivePath && !archiveName) {
      return NextResponse.json(
        { ok: false, error: 'archivePath and archiveName are required (or use /api/olympus/upload first)' },
        { status: 400 }
      );
    }

    // Log intake start to activity feed
    const feedPath = path.join(VAULT_ROOT, '06_Activity_Feed', 'live.jsonl');
    const logEvent = (god: string, action: string, msg: string, meta?: any) => {
      try {
        const dir = path.dirname(feedPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.appendFileSync(feedPath, JSON.stringify({
          ts: new Date().toISOString(),
          god, action, msg,
          project: null,
          meta: meta || {},
        }) + '\n', 'utf-8');
      } catch {}
    };

    logEvent('apollo', 'session_start', `Intake started for project: ${projectName}`, { archiveName, userRequest: userRequest.slice(0, 200) });

    // Dynamically import the intake orchestrator (server-only)
    const { runIntake } = await import('@/lib/intake-orchestrator');

    const result = await runIntake({
      source: 'archive',
      archivePath,
      archiveName,
      userRequest,
      projectName,
      targetTui: 'opencode',
      manualStacks,
      additionalContext,
    });

    if (!result.ok) {
      logEvent('apollo', 'error', `Intake failed: ${result.error}`, { stages: result.stages });
      return NextResponse.json({
        ok: false,
        error: result.error,
        stages: result.stages,
      }, { status: 500 });
    }

    // Log completion
    logEvent('apollo', 'milestone', `Intake complete for "${projectName}". Stacks: ${result.stacks?.join(', ')}`, {
      projectSlug: result.project?.slug,
      stacks: result.stacks,
      handoffPath: result.handoffPath,
    });

    // Launch OpenCode in background if requested
    let opencodeLaunched = false;
    if (launchOpencode && result.handoffPath) {
      try {
        // Issue 1 dynamic input token routing.
        // Classify the handoff prompt so the olympus-dynamic-context plugin
        // can filter the system prompt for the intake path too.
        const classification = classifyTask(result.handoffPrompt || userRequest);
        const classificationEnv = serializeClassification(classification);

        // Use spawnOpencode() for Windows + stdin fix.
        const child = spawnOpencode(
          ['run', '--agent', 'apollo', result.handoffPrompt || ''],
          {
            // #104 (the complete class, SERVE-1 Batch C): the intake
            // handoff lands in the project when one is known, else the
            // lane — never the repo root.
            cwd: resolveDispatchCwd(result.project?.slug || undefined),
            extraEnv: {
              OLYMPUS_PROJECT_SLUG: result.project?.slug || '',
              OLYMPUS_HANDOFF_PATH: result.handoffPath,
              OLYMPUS_TASK_CLASSIFICATION: classificationEnv,
            },
            detached: true,
            stdio: 'ignore',
          },
        );
        child.unref();
        opencodeLaunched = true;
        logEvent('apollo', 'delegation', 'OpenCode launched in background with handoff prompt', {
          projectSlug: result.project?.slug,
          handoffPath: result.handoffPath,
        });
      } catch (err) {
        logEvent('apollo', 'error', `Failed to launch OpenCode: ${err instanceof Error ? err.message : 'unknown'}`);
      }
    }

    return NextResponse.json({
      ok: true,
      project: result.project,
      stacks: result.stacks,
      handoffPath: result.handoffPath,
      stages: result.stages,
      opencodeLaunched,
      message: opencodeLaunched
        ? `Project "${projectName}" intake complete. OpenCode launched in background.`
        : `Project "${projectName}" intake complete. OpenCode not launched (set launchOpencode: true to auto-launch).`,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

/**
 * GET /api/olympus/intake
 * Returns endpoint info.
 */
export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: 'POST /api/olympus/intake',
    description: 'Runs the full intake pipeline: extract → organize → detect stack → summarize → create project → launch OpenCode.',
    body: {
      archivePath: 'string (required) — path to the uploaded archive',
      archiveName: 'string (required) — original filename',
      userRequest: 'string (required) — what the user wants to build/do',
      projectName: 'string (required) — human-readable project name',
      manualStacks: 'string[] (optional) — manual stack override',
      additionalContext: 'string[] (optional) — extra context lines for the handoff prompt',
      launchOpencode: 'boolean (optional, default: true) — launch OpenCode after intake',
    },
  });
}
