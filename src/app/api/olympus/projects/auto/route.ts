/**
 * POST /api/olympus/projects/auto
 *
 * Auto-create + activate a project from a conversational prompt.
 *
 * When the user tells Apollo "create a new Next.js app called Foo", Apollo
 * can call this endpoint to:
 *   1. Create the project directory (if it doesn't exist)
 *   2. Auto-detect stacks/frameworks (or use the ones Apollo specifies)
 *   3. Create the project note in the vault (02_Projects/<slug>/project.md)
 *   4. Create the workspace file (.code-workspace)
 *   5. Set the project as active (so the IDE auto-roots to it)
 *   6. Create delegation folders (_delegations/{inbox,processing,done,escalated}/)
 *
 * This bridges the gap: previously Apollo had no way to create Olympus
 * projects from a conversation — the user had to use the NewProjectDialog
 * manually. Now Apollo can self-serve.
 *
 * Body:
 *   {
 *     name: string,          // project name (e.g., "Foo")
 *     path?: string,         // absolute path (optional — defaults to ~/Documents/Projects/<slug>)
 *     stacks?: string[],     // explicit stacks (e.g., ["nextjs", "typescript"])
 *     frameworks?: string[], // explicit frameworks
 *     description?: string,  // project description for the vault note
 *   }
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { createProject } from '@/lib/project-context';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const authError = requireAuth(req);
  if (authError) return authError;

  try {
    const body = await req.json();
    const { name, path: projectPath, stacks, frameworks, description } = body;

    if (!name || typeof name !== 'string') {
      return NextResponse.json(
        { ok: false, error: 'Missing required field: name' },
        { status: 400 },
      );
    }

    // Derive the project path if not provided.
    // Default: ~/Documents/Projects/<slugified-name>
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 64);

    const resolvedPath = projectPath || path.join(
      os.homedir(),
      'Documents',
      'Projects',
      slug,
    );

    // Create the project directory if it doesn't exist.
    try {
      await fs.mkdir(resolvedPath, { recursive: true });
    } catch (err: any) {
      return NextResponse.json(
        { ok: false, error: `Failed to create project directory: ${err.message}` },
        { status: 500 },
      );
    }

    // Create the project via the existing createProject() function.
    const project = await createProject({
      name,
      path: resolvedPath,
      stacks: stacks || [],
      frameworks: frameworks || [],
      description: description || `Project: ${name}`,
    });

    if (!project) {
      return NextResponse.json(
        { ok: false, error: 'Failed to create project (createProject returned null)' },
        { status: 500 },
      );
    }

    // Set the project as active by calling the active-project endpoint.
    try {
      const activeResponse = await fetch(
        `http://localhost:${process.env.PORT || 3737}/api/olympus/projects/active`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slug: project.project.slug }),
        },
      );
      if (!activeResponse.ok) {
        console.error('[auto-project] Failed to set active project:', activeResponse.status);
      }
    } catch (err) {
      console.error('[auto-project] Failed to set active project:', err);
    }

    return NextResponse.json({
      ok: true,
      project,
      message: `Project "${name}" created and activated. The IDE will auto-root to ${resolvedPath}. Vault documentation organized at 02_Projects/${slug}/project.md.`,
    });
  } catch (err: any) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 },
    );
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: 'auto',
    description: 'POST a name + optional path/stacks/frameworks to auto-create + activate a project.',
  });
}
