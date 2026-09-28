/**
 * Editor detection + launch. Finds Zed, VSCode, VSCodium, Cursor on PATH
 * or known install locations, persists to ~/.olympus/editor-config.json.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { spawnSync } from 'node:child_process';

// ─── Types ────────────────────────────────────────────────────────────────────

export type EditorId = 'zed' | 'vscode' | 'vscodium' | 'cursor';

export interface EditorCatalogEntry {
  id: EditorId;
  displayName: string;
  /** CLI binary name(s) to look for on PATH (in priority order). */
  binaries: string[];
  /** Known install locations per platform (used as fallback). */
  knownPaths: {
    darwin?: string[];
    win32?: string[];
    linux?: string[];
  };
  /** Default args to pass when launching on a project path. */
  defaultArgs: (projectPath: string) => string[];
  /** The homepage URL (for the "Install" link in the UI). */
  homepage: string;
  /** A short tagline for the UI. */
  tagline: string;
}

export interface DetectedEditor {
  id: EditorId;
  displayName: string;
  /** Absolute path to the resolved binary, or null if not detected. */
  binPath: string | null;
  /** How the binary was found: 'PATH' or 'known-location' or null. */
  source: 'PATH' | 'known-location' | null;
  homepage: string;
  tagline: string;
}

export interface EditorConfig {
  /** The user's chosen editor id, or 'auto' to use the first detected one. */
  preferred: EditorId | 'auto';
  /** Optional override binary path (for editors installed in non-standard locations). */
  customBinPath?: string;
  /** Last detection result (cached for the UI). */
  lastDetected?: DetectedEditor[];
  lastDetectedAt?: string;
}

// ─── Catalog ──────────────────────────────────────────────────────────────────

export const EDITOR_CATALOG: EditorCatalogEntry[] = [
  {
    id: 'zed',
    displayName: 'Zed',
    binaries: ['zed', 'zeditor'],
    knownPaths: {
      darwin: [
        '/Applications/Zed.app/Contents/MacOS/cli',
        join(homedir(), 'Applications/Zed.app/Contents/MacOS/cli'),
      ],
      linux: [
        join(homedir(), '.local/bin/zed'),
        '/usr/bin/zed',
        '/usr/local/bin/zed',
        '/snap/bin/zed',
        join(homedir(), '.local/share/zed/cli/zed'),
      ],
      win32: [
        join(homedir(), 'AppData', 'Local', 'Programs', 'Zed', 'zed.exe'),
        'C:\\Program Files\\Zed\\zed.exe',
      ],
    },
    defaultArgs: (p) => [p],
    homepage: 'https://zed.dev/download',
    tagline: 'GPU-accelerated, multiplayer — your current editor.',
  },
  {
    id: 'vscode',
    displayName: 'VSCode',
    binaries: ['code', 'code-insiders'],
    knownPaths: {
      darwin: [
        '/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code',
        join(homedir(), 'Applications/Visual Studio Code.app/Contents/Resources/app/bin/code'),
      ],
      linux: [
        '/usr/bin/code',
        '/usr/local/bin/code',
        '/snap/bin/code',
        join(homedir(), '.local/bin/code'),
      ],
      win32: [
        join(homedir(), 'AppData', 'Local', 'Programs', 'Microsoft VS Code', 'bin', 'code.cmd'),
        'C:\\Program Files\\Microsoft VS Code\\bin\\code.cmd',
      ],
    },
    defaultArgs: (p) => [p],
    homepage: 'https://code.visualstudio.com/download',
    tagline: "Microsoft's VSCode — the industry default.",
  },
  {
    id: 'vscodium',
    displayName: 'VSCodium',
    binaries: ['codium', 'vscodium'],
    knownPaths: {
      darwin: [
        '/Applications/VSCodium.app/Contents/Resources/app/bin/codium',
        join(homedir(), 'Applications/VSCodium.app/Contents/Resources/app/bin/codium'),
      ],
      linux: [
        '/usr/bin/codium',
        '/usr/local/bin/codium',
        '/snap/bin/codium',
        join(homedir(), '.local/bin/codium'),
      ],
      win32: [
        join(homedir(), 'AppData', 'Local', 'Programs', 'VSCodium', 'bin', 'codium.cmd'),
        'C:\\Program Files\\VSCodium\\bin\\codium.cmd',
      ],
    },
    defaultArgs: (p) => [p],
    homepage: 'https://vscodium.com/#download',
    tagline: 'Telemetry-free VSCode fork — fully open-source.',
  },
  {
    id: 'cursor',
    displayName: 'Cursor',
    binaries: ['cursor'],
    knownPaths: {
      darwin: [
        '/Applications/Cursor.app/Contents/Resources/app/bin/cursor',
        join(homedir(), 'Applications/Cursor.app/Contents/Resources/app/bin/cursor'),
      ],
      linux: [
        join(homedir(), '.local/bin/cursor'),
        '/usr/bin/cursor',
        '/opt/cursor/cursor',
        join(homedir(), '.config', 'Cursor', 'cursor'),
      ],
      win32: [
        join(homedir(), 'AppData', 'Local', 'Programs', 'cursor', 'Cursor.exe'),
        'C:\\Program Files\\Cursor\\Cursor.exe',
      ],
    },
    defaultArgs: (p) => [p],
    homepage: 'https://cursor.com/download',
    tagline: 'AI-focused VSCode fork — built-in LLM completions.',
  },
];

// ─── Detection ────────────────────────────────────────────────────────────────

const isWindows = process.platform === 'win32';

/**
 * Look for `binary` on PATH using `which` (Mac/Linux) or `where` (Windows).
 * Returns the absolute path to the binary, or null if not found.
 */
function findOnPath(binary: string): string | null {
  const cmd = isWindows ? 'where' : 'which';
  try {
    const result = spawnSync(cmd, [binary], {
      encoding: 'utf-8',
      timeout: 3000,
      windowsHide: true,
    });
    if (result.status === 0 && result.stdout.trim()) {
      // which/where may return multiple paths (one per line) — take the first.
      return result.stdout.trim().split('\n')[0].trim();
    }
  } catch {}
  return null;
}

/** Detect a single editor by trying PATH first, then known locations. */
function detectEditor(entry: EditorCatalogEntry): DetectedEditor {
  // 1. Try each binary name on PATH.
  for (const bin of entry.binaries) {
    const onPath = findOnPath(bin);
    if (onPath) {
      return {
        id: entry.id,
        displayName: entry.displayName,
        binPath: onPath,
        source: 'PATH',
        homepage: entry.homepage,
        tagline: entry.tagline,
      };
    }
  }

  // 2. Try known install locations for the current platform.
  const platform = process.platform as 'darwin' | 'win32' | 'linux';
  const known = entry.knownPaths[platform] || [];
  for (const p of known) {
    if (existsSync(p)) {
      return {
        id: entry.id,
        displayName: entry.displayName,
        binPath: p,
        source: 'known-location',
        homepage: entry.homepage,
        tagline: entry.tagline,
      };
    }
  }

  // 3. Not detected.
  return {
    id: entry.id,
    displayName: entry.displayName,
    binPath: null,
    source: null,
    homepage: entry.homepage,
    tagline: entry.tagline,
  };
}

/** Detect all known editors on the user's machine. */
export function detectAllEditors(): DetectedEditor[] {
  return EDITOR_CATALOG.map(detectEditor);
}

// ─── Config persistence ──────────────────────────────────────────────────────

const CONFIG_FILE = join(homedir(), '.olympus', 'editor-config.json');

export function loadEditorConfig(): EditorConfig {
  try {
    if (existsSync(CONFIG_FILE)) {
      const raw = readFileSync(CONFIG_FILE, 'utf-8');
      const cfg = JSON.parse(raw);
      // Merge with defaults to handle new fields added in future versions.
      return {
        preferred: cfg.preferred === 'auto' || (cfg.preferred && EDITOR_CATALOG.some(e => e.id === cfg.preferred)) ? cfg.preferred : 'auto',
        customBinPath: typeof cfg.customBinPath === 'string' ? cfg.customBinPath : undefined,
        lastDetected: Array.isArray(cfg.lastDetected) ? cfg.lastDetected : undefined,
        lastDetectedAt: typeof cfg.lastDetectedAt === 'string' ? cfg.lastDetectedAt : undefined,
      };
    }
  } catch {}
  return { preferred: 'auto' };
}

export function saveEditorConfig(cfg: EditorConfig): void {
  try {
    mkdirSync(dirname(CONFIG_FILE), { recursive: true });
    writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), { mode: 0o600 });
  } catch (err: any) {
    console.error('[olympus:editor] saveEditorConfig failed:', err.message);
  }
}

// ─── Launch ───────────────────────────────────────────────────────────────────

export interface LaunchResult {
  ok: boolean;
  editorId: EditorId;
  editorName: string;
  binPath: string;
  args: string[];
  cwd: string;
  pid?: number | null;
  error?: string;
}

/**
 * Resolve which editor + binary to use, given the user's config + detected list.
 *
 * Resolution order:
 *   1. If cfg.customBinPath exists and is executable, use it (with editor =
 *      'auto' so the UI shows "Custom").
 *   2. If cfg.preferred is a specific editor id and that editor is detected,
 *      use it.
 *   3. Otherwise, use the first detected editor (preference order: Zed,
 *      VSCode, VSCodium, Cursor — matches EDITOR_CATALOG order).
 *
 * Returns null if no editor is available.
 */
export function resolveEditor(
  cfg: EditorConfig,
  detected: DetectedEditor[],
): { entry: EditorCatalogEntry; binPath: string; detected: DetectedEditor } | null {
  // 1. Custom bin path override.
  if (cfg.customBinPath && existsSync(cfg.customBinPath)) {
    // We don't know which editor id this is — pick the catalog entry that
    // matches by displayName heuristic, defaulting to 'vscode'.
    const entry = EDITOR_CATALOG.find(e => e.id === cfg.preferred) || EDITOR_CATALOG[1];
    return {
      entry,
      binPath: cfg.customBinPath,
      detected: {
        id: entry.id,
        displayName: 'Custom',
        binPath: cfg.customBinPath,
        source: 'known-location',
        homepage: entry.homepage,
        tagline: 'User-configured custom binary path.',
      },
    };
  }

  // 2. Preferred editor if detected.
  if (cfg.preferred !== 'auto') {
    const found = detected.find(d => d.id === cfg.preferred && d.binPath);
    if (found && found.binPath) {
      const entry = EDITOR_CATALOG.find(e => e.id === found.id)!;
      return { entry, binPath: found.binPath, detected: found };
    }
  }

  // 3. First detected editor (catalog order).
  for (const entry of EDITOR_CATALOG) {
    const found = detected.find(d => d.id === entry.id && d.binPath);
    if (found && found.binPath) {
      return { entry, binPath: found.binPath, detected: found };
    }
  }

  return null;
}

/**
 * Build the launch args for a project path. The renderer passes these to
 * the Electron main process's `olympus:spawn-external-editor` IPC handler.
 */
export function buildLaunchArgs(
  entry: EditorCatalogEntry,
  projectPath: string,
): string[] {
  return entry.defaultArgs(projectPath);
}

// ─── Migration from old vscodium_workspace field ─────────────────────────────

/**
 * Auto-migrates any project that has a `vscodium_workspace` frontmatter
 * field but no `external_editor` field. Idempotent — running it twice
 * is a no-op.
 *
 * Returns the number of projects migrated.
 */
export function migrateVscodiumWorkspace(): { migrated: number; skipped: number; total: number } {
  // Lazy-load to avoid circular imports at module load.
  const { listProjects, updateProject } = require('@/lib/project-context') as typeof import('@/lib/project-context');
  const projects = listProjects();
  let migrated = 0;
  let skipped = 0;
  for (const p of projects) {
    const fm = (p as any).__rawFrontmatter as any | undefined;
    if (!fm) { skipped++; continue; }
    if (fm.vscodium_workspace && !fm.external_editor) {
      try {
        updateProject(p.slug, { external_editor: 'vscodium' } as any);
        migrated++;
      } catch {
        skipped++;
      }
    } else {
      skipped++;
    }
  }
  return { migrated, skipped, total: projects.length };
}
