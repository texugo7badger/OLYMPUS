/**
 * project-summary.ts — v0.0.38: one honest identity per project.
 *
 * A project's note carries the prompt that created it, not what it IS. The
 * Projects folder therefore used to show “Planeje e execute o desenvolvimento
 * do AIME!” as a description. This module derives a real identity from the
 * folder: the lowercase folder name, the stacks detected from the manifests,
 * and a short summary taken from package.json or the README's opening lines.
 *
 * Read-only and bounded: only a handful of well-known manifest files are
 * stat/read, never a tree walk.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import fs from 'node:fs';
import path from 'node:path';

/** Dependency/manifest marker → the stack key used by the icons. */
const DEPENDENCY_STACKS: Array<[RegExp, string]> = [
  [/^next$/, 'nextjs'],
  [/^react$/, 'react'],
  [/^react-dom$/, 'react'],
  [/^vue$/, 'vue'],
  [/^svelte$/, 'svelte'],
  [/^typescript$/, 'typescript'],
  [/^tailwindcss$/, 'tailwind'],
  [/^@prisma\/client$|^prisma$/, 'prisma'],
  [/^stripe$/, 'stripe'],
  [/^vite$/, 'vite'],
  [/^jest$|^vitest$/, 'jest'],
  [/^storybook$|^@storybook\//, 'storybook'],
  [/^expo$|^expo-/, 'expo'],
  [/^express$|^fastify$|^koa$/, 'nodejs'],
  [/^@supabase\/supabase-js$/, 'supabase'],
  [/^firebase$|^firebase-admin$/, 'firebase'],
  [/^graphql$|^@apollo\//, 'graphql'],
  [/^mongoose$|^mongodb$/, 'mongodb'],
  [/^pg$|^postgres$/, 'postgresql'],
  [/^redis$|^ioredis$/, 'redis'],
  [/^docker$/, 'docker'],
];

const MANIFEST_STACKS: Array<[string, string]> = [
  ['go.mod', 'go'],
  ['Cargo.toml', 'rust'],
  ['pyproject.toml', 'python'],
  ['requirements.txt', 'python'],
  ['Gemfile', 'ruby'],
  ['composer.json', 'php'],
  ['pubspec.yaml', 'flutter'],
  ['build.gradle', 'java'],
  ['pom.xml', 'java'],
  ['Dockerfile', 'docker'],
  ['docker-compose.yml', 'docker'],
];

function readJson(file: string): any {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch {
    return null;
  }
}

function readFirstLines(file: string, max = 1400): string {
  try {
    return fs.readFileSync(file, 'utf-8').slice(0, max);
  } catch {
    return '';
  }
}

/** Clean a markdown README into prose: no badges, headings, links or tags. */
function cleanReadme(text: string): string {
  return text
    .replace(/^---[\s\S]*?---\s*/m, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/[*_`>]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * A short, human summary. Order of truth:
 *   1. the package manifest's description (when it is not a placeholder);
 *   2. the README's opening prose (the project's own words);
 *   3. a generated identity line from the detected stacks and file count.
 */
/** The folder name leads the summary in the folder's own casing (aime, not AIME). */
function lowerLeadingSlug(summary: string, slug: string): string {
  const clean = summary.trim();
  if (!clean || !slug) return clean;
  if (clean.toLowerCase().startsWith(slug.toLowerCase())) return slug + clean.slice(slug.length);
  return clean;
}

export function projectSummary(input: {
  slug: string;
  pkg: any;
  root?: string;
  stacks: string[];
  files?: number;
  port?: number | null;
}): string {
  const { slug, pkg, root, stacks, files, port } = input;
  const pkgDescription = typeof pkg?.description === 'string' ? pkg.description.trim() : '';
  if (pkgDescription && !/^(a|an|the)?\s*(project|app|application|todo|test|sample)$/i.test(pkgDescription)) {
    return lowerLeadingSlug(pkgDescription.slice(0, 260), slug);
  }

  if (root) {
    for (const name of ['README.md', 'README.MD', 'readme.md', 'README.markdown']) {
      const file = path.join(root, name);
      if (!fs.existsSync(file)) continue;
      const prose = cleanReadme(readFirstLines(file));
      if (!prose) continue;
      // Join the opening sentences until there is enough signal, but never a
      // wall of text: the card needs one calm paragraph.
      const sentences = prose.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
      let summary = '';
      for (const sentence of sentences) {
        const next = summary ? `${summary} ${sentence}` : sentence;
        if (next.length > 260) break;
        summary = next;
        if (summary.length >= 80) break;
      }
      if (summary) return lowerLeadingSlug(summary.replace(/\s+/g, ' ').slice(0, 300), slug);
    }
  }

  const stackText = stacks.length > 0 ? stacks.join(' · ') : 'polyglot';
  const fileText = typeof files === 'number' && files > 0 ? ` · ${files} files` : '';
  const portText = port ? ` · live preview :${port}` : '';
  return `${slug} — ${stackText} project${fileText}${portText}.`;
}

/** Infer stacks from the manifests and dependency names. Bounded to one read. */
export function detectProjectStacks(root: string | undefined, pkg: any): string[] {
  const found = new Set<string>();
  const deps = {
    ...(pkg?.dependencies && typeof pkg.dependencies === 'object' ? pkg.dependencies : {}),
    ...(pkg?.devDependencies && typeof pkg.devDependencies === 'object' ? pkg.devDependencies : {}),
  };
  for (const dep of Object.keys(deps)) {
    for (const [pattern, stack] of DEPENDENCY_STACKS) {
      if (pattern.test(dep)) found.add(stack);
    }
  }
  if (root && fs.existsSync(root)) {
    for (const [manifest, stack] of MANIFEST_STACKS) {
      if (fs.existsSync(path.join(root, manifest))) found.add(stack);
    }
  }
  return Array.from(found);
}

/** Read only the root package.json; undefined when there is none. */
export function readProjectPackage(root: string | undefined): any {
  if (!root) return undefined;
  const file = path.join(root, 'package.json');
  return fs.existsSync(file) ? readJson(file) : undefined;
}

/** The folder name, lowercase — the one stable identity across platforms. */
export function folderName(slug: string): string {
  return String(slug || '').trim().toLowerCase();
}
