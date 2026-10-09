/**
 * Stack detector — scans a project root and returns the detected stacks.
 *
 * SERVER-ONLY. This module imports `fs` and must never be imported from
 * client components. Client components should import from `./stack-catalog`
 * instead (pure data, no filesystem).
 *
 * Re-exports STACK_CATALOG, stackLabel, stackColor from ./stack-catalog
 * for backwards compatibility with server code that imports from here.
 *
 * Strategy:
 *  1. Marker files at root (Cargo.toml → rust, package.json → check deps, etc.)
 *  2. Secondary marker files in common subdirs (src-tauri/, android/, ios/)
 *  3. Presence of dirs (k8s/, .github/workflows/ → devops)
 *
 * References:
 *  - rust-analyzer's Cargo.toml discovery (https://github.com/rust-lang/rust-analyzer)
 *  - linthis auto-detection (https://crates.io/crates/linthis)
 *  - VSCode multi-root workspaces (https://code.visualstudio.com/docs/editing/workspaces/multi-root-workspaces)
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

// Re-export catalog types + data for server consumers (backwards compat)
export { STACK_CATALOG, stackLabel, stackColor } from './stack-catalog';
export type { StackMarker, StackDetection } from './stack-catalog';

import type { StackMarker, StackDetection } from './stack-catalog';
import path from 'node:path';

/** Filesystem interface — injectable for testability. */
export interface FsAdapter {
  existsSync(p: string): boolean;
  readFileSync(p: string): string;
  statSync(p: string): { isDirectory(): boolean };
}

/** Marker files that map 1:1 to a stack. */
const ROOT_MARKERS: { file: string; stack: string }[] = [
  { file: 'Cargo.toml', stack: 'rust' },
  { file: 'pyproject.toml', stack: 'python' },
  { file: 'requirements.txt', stack: 'python' },
  { file: 'setup.py', stack: 'python' },
  { file: 'go.mod', stack: 'go' },
  { file: 'pom.xml', stack: 'java' },
  { file: 'build.gradle', stack: 'java' },
  { file: 'build.gradle.kts', stack: 'java' },
  { file: 'composer.json', stack: 'php' },
  { file: 'Gemfile', stack: 'ruby' },
  { file: 'mix.exs', stack: 'elixir' },
  { file: 'deno.json', stack: 'deno' },
  { file: 'deno.jsonc', stack: 'deno' },
  { file: 'CMakeLists.txt', stack: 'cpp' },
  { file: 'Package.swift', stack: 'swift' },
  { file: 'Dockerfile', stack: 'docker' },
  { file: 'docker-compose.yml', stack: 'docker' },
  { file: 'docker-compose.yaml', stack: 'docker' },
];

/** package.json dependencies that imply a stack. */
const PACKAGE_JSON_DERIVED: { dep: string; stack: string }[] = [
  { dep: 'react', stack: 'react' },
  { dep: 'react-dom', stack: 'react' },
  { dep: 'next', stack: 'nextjs' },
  { dep: 'vue', stack: 'vue' },
  { dep: 'nuxt', stack: 'nuxt' },
  { dep: 'svelte', stack: 'svelte' },
  { dep: '@sveltejs/kit', stack: 'sveltekit' },
  { dep: '@angular/core', stack: 'angular' },
  { dep: 'solid-js', stack: 'solid' },
  { dep: 'astro', stack: 'astro' },
  { dep: 'express', stack: 'express' },
  { dep: 'fastify', stack: 'fastify' },
  { dep: '@nestjs/core', stack: 'nestjs' },
  { dep: '@hono/node-server', stack: 'hono' },
  { dep: 'tauri', stack: 'tauri' },
  { dep: '@tauri-apps/api', stack: 'tauri' },
  { dep: 'expo', stack: 'expo' },
  { dep: 'react-native', stack: 'react-native' },
  { dep: 'electron', stack: 'electron' },
  { dep: 'prisma', stack: 'prisma' },
  { dep: '@prisma/client', stack: 'prisma' },
  { dep: 'drizzle-orm', stack: 'drizzle' },
  { dep: 'typescript', stack: 'typescript' },
];

/** Stacks that imply a JS framework (so we don't add 'node' as a duplicate). */
const JS_FRAMEWORKS = new Set([
  'react','vue','nextjs','svelte','solid','angular','astro','nuxt',
  'sveltekit','expo','react-native','electron','nestjs','express',
  'fastify','hono','tauri',
]);

/** Subdirectory presence hints. */
const SUBDIR_HINTS: { dir: string; stack: string }[] = [
  { dir: 'src-tauri', stack: 'tauri' },
  { dir: 'android', stack: 'android' },
  { dir: 'ios', stack: 'ios' },
  { dir: '.github/workflows', stack: 'ci-cd' },
  { dir: 'k8s', stack: 'kubernetes' },
  { dir: 'terraform', stack: 'terraform' },
  { dir: 'helm', stack: 'helm' },
  { dir: '.terraform', stack: 'terraform' },
];

/**
 * Run stack detection against an injected filesystem.
 * Exported so tests can pass a mock fs.
 */
export function detectStacksWithFs(
  projectPath: string,
  fs: FsAdapter,
): StackDetection {
  const stacks = new Set<string>();
  const markers: StackMarker[] = [];

  // 1. Root marker files
  for (const m of ROOT_MARKERS) {
    const full = path.join(projectPath, m.file);
    const found = fs.existsSync(full);
    markers.push({ file: m.file, stack: m.stack, found });
    if (found) stacks.add(m.stack);
  }

  // 2. package.json derived stacks
  const pkgPath = path.join(projectPath, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath));
      const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
      for (const { dep, stack } of PACKAGE_JSON_DERIVED) {
        if (dep in deps) {
          stacks.add(stack);
          markers.push({ file: `package.json#${dep}`, stack, found: true });
        }
      }
      if (![...stacks].some(s => JS_FRAMEWORKS.has(s))) {
        stacks.add('node');
      }
    } catch {}
  }

  // 3. Subdir hints
  for (const { dir, stack } of SUBDIR_HINTS) {
    const full = path.join(/* turbopackIgnore: true */ projectPath, dir);
    if (fs.existsSync(full) && fs.statSync(full).isDirectory()) {
      stacks.add(stack);
      markers.push({ file: `${dir}/`, stack, found: true });
    }
  }

  // 4. TypeScript presence
  const tsconfigPath = path.join(projectPath, 'tsconfig.json');
  if (fs.existsSync(tsconfigPath)) {
    stacks.add('typescript');
    markers.push({ file: 'tsconfig.json', stack: 'typescript', found: true });
  }

  // 5. Prisma schema
  const prismaSchema = path.join(projectPath, 'prisma', 'schema.prisma');
  if (fs.existsSync(prismaSchema)) {
    stacks.add('prisma');
    markers.push({ file: 'prisma/schema.prisma', stack: 'prisma', found: true });
  }

  // 6. Bun / Deno lockfiles
  if (fs.existsSync(path.join(projectPath, 'bun.lockb')) || fs.existsSync(path.join(projectPath, 'bun.lock'))) {
    stacks.add('bun');
    markers.push({ file: 'bun.lock', stack: 'bun', found: true });
  }
  if (fs.existsSync(path.join(projectPath, 'pnpm-lock.yaml'))) {
    stacks.add('pnpm');
    markers.push({ file: 'pnpm-lock.yaml', stack: 'pnpm', found: true });
  }
  if (fs.existsSync(path.join(projectPath, 'yarn.lock'))) {
    stacks.add('yarn');
    markers.push({ file: 'yarn.lock', stack: 'yarn', found: true });
  }

  return {
    stacks: [...stacks].sort(),
    markers,
    path: projectPath,
    ts: new Date().toISOString(),
  };
}

/**
 * Server-side entrypoint — uses the real Node fs.
 */
export async function detectStacks(projectPath: string): Promise<StackDetection> {
  const fs = await import('fs');
  const adapter: FsAdapter = {
    existsSync: (p) => fs.existsSync(p),
    readFileSync: (p) => fs.readFileSync(p, 'utf-8'),
    statSync: (p) => fs.statSync(p),
  };
  return detectStacksWithFs(projectPath, adapter);
}