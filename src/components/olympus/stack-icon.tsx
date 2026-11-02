/**
 * stack-icon.tsx — v0.0.38: the stack shelf.
 *
 * A project's stacks are images, not adjectives. The official Devicon marks
 * live in /public/stacks (MIT); an unknown stack falls back to a themed
 * monogram so a new ecosystem never shows a broken image.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
'use client';

import { cn } from '@/lib/utils';

const ALIASES: Record<string, string> = {
  next: 'nextjs', 'next.js': 'nextjs', nextjs: 'nextjs',
  reactjs: 'react', 'react-dom': 'react',
  ts: 'typescript', js: 'javascript',
  node: 'nodejs', 'node.js': 'nodejs',
  tailwindcss: 'tailwind',
  postgres: 'postgresql', pg: 'postgresql',
  mongo: 'mongodb',
  vuejs: 'vue',
  k8s: 'kubernetes',
  bunjs: 'bun',
  'framer-motion': '',
};

/** Keys with a file in /public/stacks. */
const ICONS = new Set([
  'react', 'nextjs', 'typescript', 'javascript', 'nodejs', 'python', 'rust', 'go',
  'postgresql', 'mongodb', 'redis', 'docker', 'kubernetes', 'tailwind', 'vue', 'svelte',
  'prisma', 'stripe', 'vite', 'jest', 'storybook', 'expo', 'flutter', 'kotlin', 'java',
  'php', 'laravel', 'ruby', 'rails', 'supabase', 'firebase', 'graphql', 'bun', 'github',
  'figma', 'vercel',
]);

const LABELS: Record<string, string> = {
  nextjs: 'Next.js', react: 'React', typescript: 'TypeScript', javascript: 'JavaScript',
  nodejs: 'Node.js', python: 'Python', rust: 'Rust', go: 'Go', postgresql: 'PostgreSQL',
  mongodb: 'MongoDB', redis: 'Redis', docker: 'Docker', kubernetes: 'Kubernetes',
  tailwind: 'Tailwind', vue: 'Vue', svelte: 'Svelte', prisma: 'Prisma', stripe: 'Stripe',
  vite: 'Vite', jest: 'Jest', storybook: 'Storybook', expo: 'Expo', flutter: 'Flutter',
  kotlin: 'Kotlin', java: 'Java', php: 'PHP', laravel: 'Laravel', ruby: 'Ruby', rails: 'Rails',
  supabase: 'Supabase', firebase: 'Firebase', graphql: 'GraphQL', bun: 'Bun', github: 'GitHub',
  figma: 'Figma', vercel: 'Vercel',
};

export function normalizeStack(stack: string): string {
  const key = String(stack || '').trim().toLowerCase();
  return ALIASES[key] ?? key;
}

export function stackLabel(stack: string): string {
  const key = normalizeStack(stack);
  return LABELS[key] ?? String(stack || '').slice(0, 12);
}

export default function StackIcon({
  stack,
  size = 14,
  tile = false,
  className,
}: {
  stack: string;
  size?: number;
  /** Wrap the mark in a light tile — brand SVGs assume a light surface. */
  tile?: boolean;
  className?: string;
}) {
  const key = normalizeStack(stack);
  const known = ICONS.has(key);
  const mark = known ? (
    <img
      src={`/stacks/${key}.svg`}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      draggable={false}
      className="select-none"
      style={{ width: size, height: size, objectFit: 'contain' }}
    />
  ) : (
    <span
      aria-hidden
      className="inline-flex items-center justify-center rounded-[3px] font-mono font-bold"
      style={{
        width: size,
        height: size,
        fontSize: Math.max(6, Math.round(size * 0.42)),
        background: 'color-mix(in srgb, var(--olympus-gold) 16%, transparent)',
        color: 'var(--olympus-gold)',
        lineHeight: 1,
      }}
    >
      {key.slice(0, 2).toUpperCase()}
    </span>
  );

  if (!tile) return <span className={cn('inline-flex shrink-0', className)} title={stackLabel(stack)}>{mark}</span>;

  return (
    <span
      className={cn('inline-flex shrink-0 items-center justify-center rounded-md bg-white/95 ring-1 ring-black/5', className)}
      style={{ width: size + 10, height: size + 10 }}
      title={stackLabel(stack)}
    >
      {mark}
    </span>
  );
}

/** The icon row under a description: at most `max` marks + a +N chip. */
export function StackShelf({ stacks, size = 14, max = 8, tile = true }: { stacks: string[]; size?: number; max?: number; tile?: boolean }) {
  if (!stacks || stacks.length === 0) return null;
  const shown = stacks.slice(0, max);
  const rest = stacks.length - shown.length;
  return (
    <div className="flex items-center gap-1.5 flex-wrap" aria-label={`stacks: ${stacks.join(', ')}`}>
      {shown.map((s) => <StackIcon key={s} stack={s} size={size} tile={tile} />)}
      {rest > 0 && <span className="text-[8px] font-mono text-olympus-text-dim">+{rest}</span>}
    </div>
  );
}
