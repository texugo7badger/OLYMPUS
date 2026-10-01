/**
 * Intake Orchestrator — the main pipeline that turns a user's upload
 * (archive, git URL, or conversational prompt) into a fully-prepared
 * vault project with a TUI handoff prompt.
 *
 * PIPELINE:
 *   1. Receive intake request (archive path, project name, user request, target TUI)
 *   2. Extract archive (if provided) → extractDir
 *      v0.0.1: archive extraction is moving to an MCP. The in-process
 *      extractor (archive-extractor.ts) was deleted. Until the MCP lands,
 *      the archive path throws a clear "not yet implemented" error.
 *   3. Organize files into vault categories (code, docs, config, images)
 *   4. Detect tech stack from extracted markers
 *   5. Summarize documentation via opencode (cost-efficient via MCP pipeline)
 *   6. Create project note in 02_Projects/<slug>/ with frontmatter + workspace
 *   7. Compose handoff prompt for the target TUI
 *   8. Emit activity feed events throughout
 *   9. Return: { project, stacks, summary, handoffPrompt, handoffPath }
 *
 * The caller (API route or terminal) then:
 *   - Launches the TUI in a CustomFrame with the handoff prompt as initial message
 *   - Switches the terminal to "monitoring mode" (watching the activity feed)
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import fs from 'fs';
import path from 'path';
import { organizeExtraction, type OrganizeResult } from './vault-organizer';
import { detectStacksWithFs, type StackDetection, type FsAdapter } from './stack-detector';
import { createProject, type ProjectNote, type CreateProjectResult, VAULT as PROJECT_VAULT, slugify } from './project-context';
import { summarizeDocs, type DocSummaryResult } from './doc-summarizer';
import { buildHandoffPrompt, saveHandoffPrompt, type HandoffContext } from './handoff-prompt-builder';
import { appendActivity } from './activity-feed';
import { getVaultRoot } from './vault-root';

/**
 * ExtractionResult — shape preserved for backwards compat with the
 * organizeExtraction stage. The actual extraction logic has moved to an MCP
 * (in-progress); until that MCP lands, the archive path throws.
 */
export interface ExtractionResult {
  archiveName: string;
  extractDir: string;
  fileCount: number;
  manifestPath: string;
  treePath: string;
}

const VAULT = getVaultRoot();

export type IntakeSource = 'archive' | 'git' | 'conversational' | 'empty';
export type TargetTui = 'opencode' | 'generic';

export interface IntakeRequest {
  /** Where the project came from */
  source: IntakeSource;
  /** The user's original request — what they want to build/do */
  userRequest: string;
  /** Project name (human-readable) */
  projectName: string;
  /** Path to the uploaded archive (for source='archive') */
  archivePath?: string;
  /** Original archive filename (for extraction naming) */
  archiveName?: string;
  /** Git URL to clone (for source='git') — future feature */
  gitUrl?: string;
  /** Target TUI for the handoff prompt */
  targetTui: TargetTui;
  /** Optional: override stack detection */
  manualStacks?: string[];
  /** Optional: additional context lines for the handoff prompt */
  additionalContext?: string[];
}

export interface IntakeStage {
  name: string;
  status: 'pending' | 'running' | 'done' | 'skipped' | 'error';
  message?: string;
  duration?: number;
}

export interface IntakeResult {
  ok: boolean;
  project?: ProjectNote;
  projectDir?: string;
  stacks?: string[];
  extraction?: ExtractionResult;
  organization?: OrganizeResult;
  summary?: DocSummaryResult;
  handoffPrompt?: string;
  handoffPath?: string;
  stages: IntakeStage[];
  error?: string;
}

/**
 * Run the full intake pipeline.
 *
 * This function is async because archive extraction and doc summarization
 * involve I/O and child process spawning. It emits activity feed events
 * at each stage so the terminal can show progress.
 */
export async function runIntake(request: IntakeRequest): Promise<IntakeResult> {
  const stages: IntakeStage[] = [];
  const result: IntakeResult = { ok: false, stages };
  const projectSlug = slugify(request.projectName);

  // Helper: run a stage with timing + activity feed emission
  async function runStage<T>(
    name: string,
    fn: () => Promise<T>,
    opts?: { skip?: boolean; skipMsg?: string }
  ): Promise<T | null> {
    if (opts?.skip) {
      stages.push({ name, status: 'skipped', message: opts.skipMsg });
      return null;
    }
    const stage: IntakeStage = { name, status: 'running' };
    stages.push(stage);
    const start = Date.now();
    appendActivity({
      god: 'apollo',
      action: 'tool_call',
      msg: `Intake stage: ${name}`,
      project: projectSlug,
    });
    try {
      const res = await fn();
      stage.status = 'done';
      stage.duration = Date.now() - start;
      stage.message = 'OK';
      return res;
    } catch (err: any) {
      stage.status = 'error';
      stage.duration = Date.now() - start;
      stage.message = err.message;
      appendActivity({
        god: 'apollo',
        action: 'error',
        msg: `Intake stage "${name}" failed: ${err.message}`,
        project: projectSlug,
      });
      throw err;
    }
  }

  try {
    // ── Stage 1: Extract archive ──────────────────────────────────
    // v0.0.1: archive extraction is moving to an MCP. The in-process
    // extractor (archive-extractor.ts) was deleted. Until the MCP lands,
    // the archive path throws a clear error so the UI can surface it
    // rather than silently fail. The non-archive paths (git, conversational,
    // empty) work normally.
    let extraction: ExtractionResult | null = null;
    if (request.source === 'archive' && request.archivePath) {
      // The lambda below always throws, but runStage<T> needs T to be
      // ExtractionResult (not never) so the assignment to `extraction`
      // type-checks. Explicit type annotation on the parameter.
      extraction = await runStage<ExtractionResult>('extract-archive', async () => {
        throw new Error(
          'Archive extraction is moving to an MCP and is not yet wired up. ' +
          'For now, please extract the archive manually and use the "folder" intake path. ' +
          'See AGENTS.md §10.2 (Documentation unpacking) for the planned MCP integration.'
        );
      });
      result.extraction = extraction || undefined;
    } else {
      stages.push({ name: 'extract-archive', status: 'skipped', message: 'No archive provided' });
    }

    // ── Stage 2: Organize files into vault categories ─────────────
    let organization: OrganizeResult | null = null;
    if (extraction) {
      organization = await runStage('organize-vault', async () => {
        return organizeExtraction({
          vaultRoot: VAULT,
          projectSlug,
          extractDir: extraction!.extractDir,
          archiveName: extraction!.archiveName,
        });
      });
      result.organization = organization || undefined;
    } else {
      stages.push({ name: 'organize-vault', status: 'skipped', message: 'No extraction to organize' });
    }

    // ── Stage 3: Detect tech stack ────────────────────────────────
    const detectPath = extraction?.extractDir || request.archivePath || process.cwd();
    const detection: StackDetection | null = await runStage('detect-stack', async () => {
      const fsAdapter: FsAdapter = {
        existsSync: (p) => fs.existsSync(p),
        readFileSync: (p) => fs.readFileSync(p, 'utf-8'),
        statSync: (p) => fs.statSync(p),
      };
      return detectStacksWithFs(detectPath, fsAdapter);
    });
    const stacks = request.manualStacks && request.manualStacks.length > 0
      ? request.manualStacks
      : (detection?.stacks || []);
    result.stacks = stacks;

    // ── Stage 4: Create project note ──────────────────────────────
    const projectPath = extraction?.extractDir || detectPath;
    const projectResult: CreateProjectResult | null = await runStage('create-project', async () => {
      // createProject requires a valid directory path
      const createPath = fs.existsSync(projectPath) && fs.statSync(projectPath).isDirectory()
        ? projectPath
        : path.join(VAULT, '02_Projects', projectSlug);
      if (!fs.existsSync(createPath)) {
        fs.mkdirSync(createPath, { recursive: true });
      }
      return createProject({
        name: request.projectName,
        path: createPath,
        stacks,
        description: request.userRequest.slice(0, 200),
      });
    });
    result.project = projectResult?.project;
    result.projectDir = projectResult ? path.join(VAULT, '02_Projects', projectSlug) : undefined;

    // ── Stage 5: Summarize documentation ──────────────────────────
    let summary: DocSummaryResult | null = null;
    if (extraction && result.projectDir) {
      summary = await runStage('summarize-docs', async () => {
        return summarizeDocs({
          extractDir: extraction!.extractDir,
          projectDir: result.projectDir!,
          projectName: request.projectName,
          timeout: 120000,
        });
      }, { skip: !extraction, skipMsg: 'No extraction to summarize' });
      result.summary = summary || undefined;
    } else {
      stages.push({ name: 'summarize-docs', status: 'skipped', message: 'No docs to summarize' });
    }

    // ── Stage 6: Compose handoff prompt ───────────────────────────
    const handoffCtx: HandoffContext = {
      userRequest: request.userRequest,
      projectSlug,
      projectName: request.projectName,
      projectPath: extraction?.extractDir,
      stacks,
      summaryPath: summary?.summaryPath ? path.relative(VAULT, summary.summaryPath) : undefined,
      summaryText: summary?.summary,
      targetTui: request.targetTui,
      additionalContext: request.additionalContext,
    };
    const handoffPrompt = await runStage('compose-handoff', async () => {
      const prompt = buildHandoffPrompt(handoffCtx);
      const handoffPath = saveHandoffPrompt(prompt, projectSlug);
      return { prompt, handoffPath };
    });
    if (handoffPrompt) {
      result.handoffPrompt = handoffPrompt.prompt;
      result.handoffPath = handoffPrompt.handoffPath;
    }

    // ── Final: emit milestone event ───────────────────────────────
    appendActivity({
      god: 'apollo',
      action: 'milestone',
      msg: `Project "${request.projectName}" intake complete. Ready for ${request.targetTui} handoff.`,
      project: projectSlug,
      meta: { stacks, stages: stages.length, handoffPath: result.handoffPath },
    });

    result.ok = true;
    return result;

  } catch (err: any) {
    result.ok = false;
    result.error = err.message;
    return result;
  }
}

/**
 * Quick intake — for conversational mode (no archive, no git).
 * Creates a project from just a user request + project name.
 */
export async function quickIntake(opts: {
  userRequest: string;
  projectName: string;
  targetTui: TargetTui;
  additionalContext?: string[];
}): Promise<IntakeResult> {
  return runIntake({
    source: 'conversational',
    userRequest: opts.userRequest,
    projectName: opts.projectName,
    targetTui: opts.targetTui,
    additionalContext: opts.additionalContext,
  });
}

/**
 * Archive intake — for when the user uploads an archive.
 * The archive should already be saved to disk (by the upload route).
 */
export async function archiveIntake(opts: {
  archivePath: string;
  archiveName: string;
  userRequest: string;
  projectName: string;
  targetTui: TargetTui;
  manualStacks?: string[];
  additionalContext?: string[];
}): Promise<IntakeResult> {
  return runIntake({
    source: 'archive',
    archivePath: opts.archivePath,
    archiveName: opts.archiveName,
    userRequest: opts.userRequest,
    projectName: opts.projectName,
    targetTui: opts.targetTui,
    manualStacks: opts.manualStacks,
    additionalContext: opts.additionalContext,
  });
}
