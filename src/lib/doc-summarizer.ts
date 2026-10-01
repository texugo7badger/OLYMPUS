/**
 * Doc Summarizer — reads extracted documentation and produces a concise
 * summary by spawning `opencode run --agent apollo`.
 *
 * When a user uploads a project archive, the intake orchestrator extracts
 * the files, organizes them into the vault, and then calls this module to
 * generate a _summary.md that the TUI handoff prompt can reference.
 *
 * The summary is capped at ~500 words to keep the handoff prompt small.
 * If opencode fails or is unavailable, a fallback summary is generated
 * from the file list alone.
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import fs from 'fs';
import path from 'path';
// Use spawnOpencode() for Windows + stdin fix.
import { spawnOpencode } from '@/lib/opencode-spawn';
import { getVaultRoot } from './vault-root';

const VAULT = getVaultRoot();

export interface DocSummaryResult {
  summaryPath: string;       // absolute path to _summary.md
  summary: string;           // the summary text
  fileCount: number;         // how many doc files were summarized
  totalBytes: number;        // total size of source docs
  truncated: boolean;        // whether the input was truncated to fit the context window
}

/**
 * Find documentation files in an extraction directory.
 * Looks for .md, .txt, .rst, .adoc files (case-insensitive) and key config
 * files (package.json, tsconfig.json, README without extension, etc.).
 */
export function findDocFiles(extractDir: string): string[] {
  const out: string[] = [];
  const docExtensions = ['.md', '.txt', '.rst', '.adoc', '.asciidoc'];
  const configFiles = ['package.json', 'tsconfig.json', 'pyproject.toml', 'Cargo.toml', 'go.mod', 'pom.xml', 'build.gradle', 'README', 'readme'];

  function walk(dir: string) {
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile()) {
        const lower = entry.name.toLowerCase();
        if (docExtensions.some(ext => lower.endsWith(ext))) {
          out.push(full);
        } else if (configFiles.includes(lower)) {
          out.push(full);
        }
      }
    }
  }

  walk(extractDir);
  return out.sort();
}

/**
 * Concatenate doc files into a single string with a size cap.
 * Truncates at `maxBytes` to avoid exceeding the LLM context window.
 */
export function concatenateDocs(files: string[], maxBytes: number = 50000): { content: string; truncated: boolean } {
  const parts: string[] = [];
  let totalBytes = 0;
  let truncated = false;

  for (const file of files) {
    let content: string;
    try { content = fs.readFileSync(file, 'utf-8'); } catch { continue; }
    const relPath = path.relative(process.cwd(), file);
    const header = `\n\n---\n## File: ${relPath}\n---\n\n`;
    const chunk = header + content + '\n';
    const chunkBytes = Buffer.byteLength(chunk, 'utf-8');

    if (totalBytes + chunkBytes > maxBytes) {
      const remaining = maxBytes - totalBytes;
      if (remaining > 500) {
        parts.push(chunk.slice(0, remaining) + '\n[... truncated ...]');
      }
      truncated = true;
      break;
    }

    parts.push(chunk);
    totalBytes += chunkBytes;
  }

  return { content: parts.join(''), truncated };
}

/**
 * Generate a concise summary of the extracted documentation.
 *
 * Spawns `opencode run --agent apollo` with a prompt that asks
 * for a structured summary. If opencode is unavailable or fails, a
 * fallback summary is generated from the file list alone.
 *
 * The summary is saved to `<projectDir>/_summary.md` and returned.
 */
export async function summarizeDocs(opts: {
  extractDir: string;
  projectDir: string;
  projectName: string;
  timeout?: number;
}): Promise<DocSummaryResult> {
  const { extractDir, projectDir, projectName } = opts;
  const timeout = opts.timeout || 120000; // 2 minutes

  // Find documentation files
  const docFiles = findDocFiles(extractDir);
  if (docFiles.length === 0) {
    const summary = `# ${projectName} — Documentation Summary\n\nNo documentation files were found in the uploaded archive. The project will start with minimal context.\n`;
    const summaryPath = path.join(projectDir, '_summary.md');
    fs.writeFileSync(summaryPath, summary, 'utf-8');
    return { summaryPath, summary, fileCount: 0, totalBytes: 0, truncated: false };
  }

  // Concatenate with size cap
  const { content: docContent, truncated } = concatenateDocs(docFiles, 50000);
  const totalBytes = Buffer.byteLength(docContent, 'utf-8');

  // Build the summarization prompt
  const prompt = `You are Apollo, the master planner of the OLYMPUS system. A user has uploaded a project archive named "${projectName}". Below is the extracted documentation and key config files.

Analyze this documentation and produce a structured summary with the following sections:

## Project Overview
A 2-3 sentence description of what this project is and does.

## Tech Stack
List the key technologies, frameworks, and languages detected.

## Architecture
Briefly describe the project's architecture (monorepo? microservices? monolith? frontend+backend?).

## Key Files
List the 5-10 most important files and what they do.

## Dependencies
List the major dependencies and what they're used for.

## Getting Started
Summarize how to set up and run the project (if documented).

## Notes
Any gotchas, special configurations, or important context.

Keep the summary under 500 words. Be concise and factual. Do not invent information that isn't in the documentation.

---

## Documentation Content

${docContent}`;

  // Spawn opencode directly with the summarization prompt
  let summary = '';
  try {
    const result = await new Promise<{ code: number; stdout: string; stderr: string }>((resolve) => {
      let stdout = '';
      let stderr = '';
      // Resolve the LOCAL opencode binary + prepend
      // node_modules/.bin to PATH. The doc-summarizer runs with
      // cwd=extractDir (the extracted archive dir), but opencode needs
      // to find Olympus's opencode.json — so we pass cwd explicitly
      // AND set OLYMPUS_ROOT so the helper can locate the local binary.
      // Use spawnOpencode() for Windows + stdin fix.
      const child = spawnOpencode(['run', '--agent', 'apollo', prompt]);

      const timer = setTimeout(() => {
        try { child.kill('SIGTERM'); } catch {}
        setTimeout(() => { try { child.kill('SIGKILL'); } catch {} }, 2000);
      }, timeout);

      child.stdout?.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
      child.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
      child.on('close', (code) => {
        clearTimeout(timer);
        resolve({ code: code ?? 0, stdout, stderr });
      });
      child.on('error', (err: any) => {
        clearTimeout(timer);
        resolve({ code: -1, stdout, stderr: err.message });
      });
    });

    if (result.code === 0 && result.stdout.trim()) {
      // opencode's output may be JSON-lines or plain text
      const lines = result.stdout.trim().split('\n');
      const textParts: string[] = [];
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        if (trimmed.startsWith('{')) {
          try {
            const ev = JSON.parse(trimmed);
            if (ev.msg) textParts.push(ev.msg);
          } catch {
            textParts.push(trimmed);
          }
        } else {
          textParts.push(trimmed);
        }
      }
      summary = textParts.join('\n');
    } else {
      summary = generateFallbackSummary(projectName, docFiles, truncated);
    }
  } catch (err: any) {
    summary = generateFallbackSummary(projectName, docFiles, truncated, err.message);
  }

  // Prepend header
  const fullSummary = `# ${projectName} — Documentation Summary\n\n> Auto-generated by Olympus Doc Summarizer.\n> Source: ${docFiles.length} files, ${totalBytes} bytes${truncated ? ' (truncated)' : ''}.\n\n${summary}\n`;

  // Save to project dir
  if (!fs.existsSync(projectDir)) {
    fs.mkdirSync(projectDir, { recursive: true });
  }
  const summaryPath = path.join(projectDir, '_summary.md');
  fs.writeFileSync(summaryPath, fullSummary, 'utf-8');

  return {
    summaryPath,
    summary: fullSummary,
    fileCount: docFiles.length,
    totalBytes,
    truncated,
  };
}

function generateFallbackSummary(projectName: string, docFiles: string[], truncated: boolean, errorMsg?: string): string {
  const fileList = docFiles.slice(0, 20).map(f => `- \`${path.basename(f)}\``).join('\n');
  const note = errorMsg ? `\n\n> Note: LLM summarization was unavailable (${errorMsg}). Showing file list only.` : '';
  return `## Project Overview\n\n${projectName} — documentation was uploaded but the LLM summarizer could not run.${note ? '\n' + note : ''}\n\n## Key Files\n\n${fileList}${docFiles.length > 20 ? `\n- ... and ${docFiles.length - 20} more` : ''}\n\n## Notes\n\nThe full documentation is available in the project's vault folder. The TUI agent should read the files directly for detailed context.\n`;
}
