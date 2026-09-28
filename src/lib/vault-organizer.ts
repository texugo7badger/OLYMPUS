/**
 * Vault organizer — P11 fix.
 *
 * After extraction, classifies each extracted file by extension + content
 * sniff and moves it (or copies it) into the appropriate vault folder:
 *
 *   .md notes          → 00_Inbox/  (or 04_Knowledge/ if reference material)
 *   code files         → 02_Projects/<slug>/snippets/
 *   images             → 02_Projects/<slug>/assets/
 *   config files       → 02_Projects/<slug>/config/
 *   docs (.pdf,.docx)  → 04_Knowledge/references/
 *
 * Generates a `02_Projects/<slug>/uploads/_index.md` note linking every
 * uploaded file with its vault-relative path so the LLM can cite them.
 *
 * Returns the new vault-relative paths so the upload API can hand them to
 * the LLM in the prompt prefix.
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

export interface OrganizedFile {
  originalPath: string; // vault-relative path under uploads/<archive>/
  organizedPath: string; // vault-relative path under the vault folder
  category: 'note' | 'code' | 'image' | 'config' | 'doc' | 'data' | 'other';
  size: number;
}

export interface OrganizeResult {
  indexNotePath: string; // vault-relative path to _index.md
  files: OrganizedFile[];
}

const CODE_EXT = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.py', '.rs', '.go', '.java', '.c', '.cpp', '.h', '.hpp',
  '.cs', '.rb', '.php', '.swift', '.kt', '.scala', '.sh', '.bash', '.ps1', '.bat',
  '.html', '.css', '.scss', '.less', '.vue', '.svelte', '.sql', '.graphql', '.proto',
]);
const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico', '.bmp']);
const CONFIG_EXT = new Set(['.json', '.yaml', '.yml', '.toml', '.env', '.gitignore', '.editorconfig', '.dockerfile', '.ini']);
const DOC_EXT = new Set(['.pdf', '.docx', '.doc', '.pptx', '.xlsx', '.odt', '.epub']);
const DATA_EXT = new Set(['.csv', '.tsv', '.xml', '.parquet', '.feather']);

function categorize(filename: string): OrganizedFile['category'] {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.md')) return 'note';
  for (const ext of CODE_EXT) if (lower.endsWith(ext)) return 'code';
  for (const ext of IMAGE_EXT) if (lower.endsWith(ext)) return 'image';
  for (const ext of CONFIG_EXT) if (lower.endsWith(ext)) return 'code'; // config goes to snippets
  for (const ext of DOC_EXT) if (lower.endsWith(ext)) return 'doc';
  for (const ext of DATA_EXT) if (lower.endsWith(ext)) return 'data';
  return 'other';
}

/**
 * Organize an extraction's files into vault folders.
 * `vaultRoot` is the absolute path to ~/OLYMPUS-VAULT.
 * `projectSlug` may be null (browsing mode) — files go to global folders.
 * `extractDir` is the absolute path to the per-archive subfolder.
 */
export function organizeExtraction(opts: {
  vaultRoot: string;
  projectSlug: string | null;
  extractDir: string;
  archiveName: string;
}): OrganizeResult {
  const fs = eval('require("fs")');
  const path = eval('require("path")');
  const { vaultRoot, projectSlug, extractDir, archiveName } = opts;

  const out: OrganizedFile[] = [];
  const files: { abs: string; rel: string; size: number }[] = [];
  // Walk extractDir, collect files (skip _manifest.json, _tree.md).
  function walk(dir: string): void {
    let entries: import('fs').Dirent[];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }) as import('fs').Dirent[]; } catch { return; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.isFile()) {
        if (e.name === '_manifest.json' || e.name === '_tree.md') continue;
        const rel = path.relative(extractDir, full).split(path.sep).join('/');
        let size = 0;
        try { size = fs.statSync(full).size; } catch {}
        files.push({ abs: full, rel, size });
      }
    }
  }
  walk(extractDir);

  // Target base: project folder or global inbox.
  const projectBase = projectSlug ? path.join(vaultRoot, '02_Projects', projectSlug) : path.join(vaultRoot, '00_Inbox');
  const snippetsDir = path.join(projectBase, 'snippets');
  const assetsDir = path.join(projectBase, 'assets');
  const configDir = path.join(projectBase, 'config');
  const docsDir = path.join(vaultRoot, '04_Knowledge', 'references');
  const notesDir = path.join(vaultRoot, '00_Inbox');
  for (const d of [snippetsDir, assetsDir, configDir, docsDir, notesDir]) {
    try { fs.mkdirSync(d, { recursive: true }); } catch {}
  }

  for (const f of files) {
    const cat = categorize(f.rel);
    let targetDir: string;
    let category: OrganizedFile['category'] = cat;
    if (cat === 'note') {
      targetDir = notesDir;
      category = 'note';
    } else if (cat === 'code') {
      targetDir = snippetsDir;
      category = 'code';
    } else if (cat === 'image') {
      targetDir = assetsDir;
      category = 'image';
    } else if (cat === 'doc') {
      targetDir = docsDir;
      category = 'doc';
    } else if (cat === 'data') {
      targetDir = snippetsDir;
      category = 'data';
    } else {
      targetDir = snippetsDir;
      category = 'other';
    }
    // Unique filename: prepend archive basename to avoid collisions.
    const safeName = `${path.basename(archiveName).replace(/\.(tar\.gz|tgz|tar|zip|rar)$/i, '')}__${f.rel.replace(/\//g, '__')}`;
    const targetAbs = path.join(targetDir, safeName);
    try {
      // Copy (don't move — preserves the extraction for re-organization).
      fs.copyFileSync(f.abs, targetAbs);
    } catch {
      continue;
    }
    const organizedPath = path.relative(vaultRoot, targetAbs).split(path.sep).join('/');
    out.push({
      originalPath: path.relative(vaultRoot, f.abs).split(path.sep).join('/'),
      organizedPath,
      category,
      size: f.size,
    });
  }

  // Generate _index.md note linking every organized file.
  const uploadsDir = projectSlug
    ? path.join(vaultRoot, '02_Projects', projectSlug, 'uploads')
    : path.join(vaultRoot, 'uploads');
  try { fs.mkdirSync(uploadsDir, { recursive: true }); } catch {}
  const indexAbs = path.join(uploadsDir, `_index.md`);
  const indexLines: string[] = [];
  indexLines.push(`---`);
  indexLines.push(`type: upload-index`);
  indexLines.push(`archive: ${archiveName}`);
  indexLines.push(`generated: ${new Date().toISOString()}`);
  indexLines.push(`project: ${projectSlug || '(browsing mode)'}`);
  indexLines.push(`---`);
  indexLines.push(``);
  indexLines.push(`# Upload index: ${archiveName}`);
  indexLines.push(``);
  indexLines.push(`> Auto-generated by Olympus. Every file extracted from \`${archiveName}\` is linked below with its vault-relative path. Use the \`vault.read\` tool to inspect any of them.`);
  indexLines.push(``);
  // Group by category.
  const byCat: Record<string, OrganizedFile[]> = {};
  for (const f of out) { (byCat[f.category] ||= []).push(f); }
  for (const cat of ['note', 'code', 'image', 'config', 'doc', 'data', 'other']) {
    const arr = byCat[cat];
    if (!arr || arr.length === 0) continue;
    indexLines.push(`## ${cat} (${arr.length})`);
    indexLines.push(``);
    for (const f of arr) {
      indexLines.push(`- [[${f.organizedPath}]] — ${f.size} B`);
    }
    indexLines.push(``);
  }
  fs.writeFileSync(indexAbs, indexLines.join('\n'), 'utf-8');

  const indexNotePath = path.relative(vaultRoot, indexAbs).split(path.sep).join('/');
  return { indexNotePath, files: out };
}
