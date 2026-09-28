/**
 * Stack catalog — pure data, client-safe.
 *
 * This module contains NO filesystem imports. It's safe to import from
 * client components (dialogs, switchers) without pulling `fs` into the
 * browser bundle.
 *
 * The server-only detection logic (detectStacks, ROOT_MARKERS, etc.)
 * lives in `stack-detector.ts` and re-exports from here.
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

export interface StackMarker {
  file: string;
  stack: string;
  found: boolean;
}

export interface StackDetection {
  stacks: string[];
  markers: StackMarker[];
  path: string;
  ts: string;
}

/** Stack catalog with display metadata for the UI. */
export const STACK_CATALOG: Record<string, { label: string; color: string }> = {
  rust:           { label: 'Rust',           color: '#C4956A' },
  python:         { label: 'Python',         color: '#6B8FB5' },
  typescript:     { label: 'TypeScript',     color: '#6BAEB5' },
  javascript:     { label: 'JavaScript',     color: '#C4A265' },
  node:           { label: 'Node.js',        color: '#7BAE8E' },
  bun:            { label: 'Bun',            color: '#C4A265' },
  pnpm:           { label: 'pnpm',           color: '#C4756A' },
  yarn:           { label: 'Yarn',           color: '#6BAEB5' },
  react:          { label: 'React',          color: '#6BAEB5' },
  nextjs:         { label: 'Next.js',        color: '#8B8B8B' },
  vue:            { label: 'Vue',            color: '#7BAE8E' },
  nuxt:           { label: 'Nuxt',           color: '#7BAE8E' },
  svelte:         { label: 'Svelte',         color: '#C4756A' },
  sveltekit:      { label: 'SvelteKit',      color: '#C4756A' },
  solid:          { label: 'Solid',          color: '#6B8FB5' },
  angular:        { label: 'Angular',        color: '#C4756A' },
  astro:          { label: 'Astro',          color: '#C4756A' },
  express:        { label: 'Express',        color: '#7BAE8E' },
  fastify:        { label: 'Fastify',        color: '#7BAE8E' },
  nestjs:         { label: 'NestJS',         color: '#C4756A' },
  hono:           { label: 'Hono',           color: '#C4756A' },
  tauri:          { label: 'Tauri',          color: '#9B7BAE' },
  expo:           { label: 'Expo',           color: '#9B7BAE' },
  'react-native': { label: 'React Native',   color: '#6BAEB5' },
  electron:       { label: 'Electron',       color: '#9B7BAE' },
  prisma:         { label: 'Prisma',         color: '#6BAEB5' },
  drizzle:        { label: 'Drizzle',        color: '#7BAE8E' },
  go:             { label: 'Go',             color: '#6BAEB5' },
  java:           { label: 'Java',           color: '#C4756A' },
  php:            { label: 'PHP',            color: '#9B7BAE' },
  ruby:           { label: 'Ruby',           color: '#C4756A' },
  elixir:         { label: 'Elixir',         color: '#9B7BAE' },
  deno:           { label: 'Deno',           color: '#6BAEB5' },
  cpp:            { label: 'C++',            color: '#9B7BAE' },
  csharp:         { label: 'C#',             color: '#9B7BAE' },
  swift:          { label: 'Swift',          color: '#C4756A' },
  docker:         { label: 'Docker',         color: '#6BAEB5' },
  'ci-cd':        { label: 'CI/CD',          color: '#7BAE8E' },
  kubernetes:     { label: 'Kubernetes',     color: '#6BAEB5' },
  terraform:      { label: 'Terraform',      color: '#9B7BAE' },
  helm:           { label: 'Helm',           color: '#9B7BAE' },
  android:        { label: 'Android',        color: '#7BAE8E' },
  ios:            { label: 'iOS',            color: '#8B8B8B' },
  postgres:       { label: 'PostgreSQL',     color: '#6BAEB5' },
  mysql:          { label: 'MySQL',          color: '#6BAEB5' },
  sqlite:         { label: 'SQLite',         color: '#6BAEB5' },
  redis:          { label: 'Redis',          color: '#C4756A' },
  clickhouse:     { label: 'ClickHouse',     color: '#C4A265' },
};

export function stackLabel(stack: string): string {
  return STACK_CATALOG[stack]?.label ?? stack;
}

export function stackColor(stack: string): string {
  return STACK_CATALOG[stack]?.color ?? '#8B8B8B';
}