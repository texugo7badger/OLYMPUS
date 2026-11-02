/**
 * task-sigil.tsx — v0.0.34: a procedural animated SVG sigil per task/build.
 *
 * The Plan panel used to be a plain checklist. Each task is now a build card
 * with its own mark: a Nakkas-style animated SVG (linework, orbit, core) that
 * identifies the work at a glance — planning, code, tests, security, design,
 * data, deploy, research, integration or general.
 *
 * Local, dependency-free SVG. Animations use transform/opacity only and stop
 * in stable mode. The Nakkas MCP remains the upstream lane for generated
 * artwork; these are the always-available sigils for the task surface.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

'use client';

import { useTheme } from '@/lib/theme-store';
import { cn } from '@/lib/utils';

export type SigilKind = 'plan' | 'code' | 'test' | 'security' | 'design' | 'data' | 'deploy' | 'research' | 'integrate' | 'general';

const RULES: Array<[SigilKind, RegExp]> = [
  ['security', /security|auth|permission|secret|vulnerab|audit|threat|pentest/i],
  ['test', /test|qa|e2e|coverage|lint|verify|verification|benchmark/i],
  ['design', /design|ui|ux|layout|color|theme|style|asset|logo|animation|motion|atelier|art/i],
  ['data', /database|schema|migration|query|sql|postgres|prisma|cache|index|vault/i],
  ['deploy', /deploy|release|docker|ci|cd|build|ship|publish|infra|k8s|terraform/i],
  ['research', /research|investigate|explore|read|document|spec|plan|architecture/i],
  ['integrate', /integrat|api|mcp|webhook|connect|contract|route|endpoint/i],
  ['code', /code|implement|feature|fix|refactor|component|function|module|handler/i],
  ['plan', /plan|task|step|scope|goal|acceptance|campaign|dispatch/i],
];

export function sigilFor(text: string, god?: string): SigilKind {
  const hay = `${text} ${god || ''}`;
  for (const [kind, re] of RULES) if (re.test(hay)) return kind;
  return 'general';
}

const COLOR: Record<SigilKind, string> = {
  plan: 'var(--olympus-gold)',
  code: 'var(--olympus-blue)',
  test: 'var(--olympus-green)',
  security: 'var(--olympus-red)',
  design: 'var(--olympus-purple)',
  data: 'var(--olympus-amber-soft)',
  deploy: 'var(--olympus-cyan)',
  research: 'var(--olympus-teal)',
  integrate: 'var(--olympus-amber)',
  general: 'var(--olympus-text-dim)',
};

export default function TaskSigil({
  kind,
  size = 24,
  active = false,
  className,
}: {
  kind: SigilKind;
  size?: number;
  active?: boolean;
  className?: string;
}) {
  const [theme] = useTheme();
  const stable = theme.motion === 'stable';
  const spin = stable ? '' : 'origin-center animate-spin [animation-duration:9s]';
  const spinFast = stable ? '' : 'origin-center animate-spin [animation-duration:5s]';
  const pulse = stable ? '' : 'animate-pulse';
  const c = COLOR[kind];

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      role="img"
      aria-label={`${kind} task sigil`}
      className={cn('shrink-0', className)}
      style={{ color: c }}
    >
      {/* the frame every sigil shares */}
      <circle cx="24" cy="24" r="20" stroke="currentColor" strokeWidth="0.8" opacity={active ? 0.55 : 0.28} />
      <g className={spin} opacity="0.75">
        <circle cx="24" cy="4.5" r="1.7" fill="currentColor" />
        <circle cx="24" cy="43.5" r="1" fill="currentColor" opacity="0.55" />
      </g>

      {kind === 'plan' && (
        <>
          <g className={spinFast}>
            <circle cx="24" cy="24" r="12" stroke="currentColor" strokeWidth="1" strokeDasharray="3 5" opacity="0.7" />
          </g>
          <path d="M24 14v11l7 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="24" cy="24" r="2.2" fill="currentColor" className={pulse} />
        </>
      )}

      {kind === 'code' && (
        <>
          <path d="M17 17l-6 7 6 7M31 17l6 7-6 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M26.5 14.5l-5 19" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.75" />
          <circle cx="24" cy="24" r="2" fill="currentColor" className={pulse} />
        </>
      )}

      {kind === 'test' && (
        <>
          <circle cx="24" cy="24" r="13" stroke="currentColor" strokeWidth="1.1" opacity="0.55" />
          <path d="M17 24.5l4.5 4.5L32 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          <g className={spinFast}>
            <circle cx="37" cy="24" r="2.2" fill="currentColor" />
          </g>
        </>
      )}

      {kind === 'security' && (
        <>
          <path d="M24 10l11 4v9c0 7-4.8 12.2-11 15-6.2-2.8-11-8-11-15v-9l11-4z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
          <rect x="19" y="21" width="10" height="8" rx="2" stroke="currentColor" strokeWidth="1.4" />
          <path d="M21.5 21v-2.5a2.5 2.5 0 015 0V21" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          <circle cx="24" cy="25" r="1.4" fill="currentColor" className={pulse} />
        </>
      )}

      {kind === 'design' && (
        <>
          <g className={spinFast}>
            <path d="M24 12l4 8 8 4-8 4-4 8-4-8-8-4 8-4 4-8z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
          </g>
          <circle cx="24" cy="24" r="3" fill="currentColor" opacity="0.85" />
          <circle cx="24" cy="24" r="7" stroke="currentColor" strokeWidth="0.7" opacity="0.5" />
        </>
      )}

      {kind === 'data' && (
        <>
          <ellipse cx="24" cy="15" rx="11" ry="4" stroke="currentColor" strokeWidth="1.3" />
          <path d="M13 15v9c0 2.2 4.9 4 11 4s11-1.8 11-4v-9" stroke="currentColor" strokeWidth="1.3" />
          <path d="M13 24v9c0 2.2 4.9 4 11 4s11-1.8 11-4v-9" stroke="currentColor" strokeWidth="1.3" opacity="0.6" />
          <circle cx="24" cy="15" r="1.8" fill="currentColor" className={pulse} />
        </>
      )}

      {kind === 'deploy' && (
        <>
          <path d="M24 9c5 4 7 9 7 15l-7 6-7-6c0-6 2-11 7-15z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
          <circle cx="24" cy="20" r="2.6" stroke="currentColor" strokeWidth="1.2" />
          <path d="M18 31l-3 7 6-2M30 31l3 7-6-2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" opacity="0.8" />
          <circle cx="24" cy="37" r="1.6" fill="currentColor" className={pulse} />
        </>
      )}

      {kind === 'research' && (
        <>
          <circle cx="24" cy="24" r="10" stroke="currentColor" strokeWidth="1.2" opacity="0.7" />
          <g className={spinFast}>
            <ellipse cx="24" cy="24" rx="17" ry="6" stroke="currentColor" strokeWidth="1" opacity="0.7" transform="rotate(-28 24 24)" />
            <circle cx="39" cy="16" r="2.2" fill="currentColor" />
          </g>
          <circle cx="24" cy="24" r="2.4" fill="currentColor" className={pulse} />
        </>
      )}

      {kind === 'integrate' && (
        <>
          <circle cx="19" cy="24" r="7.5" stroke="currentColor" strokeWidth="1.5" />
          <circle cx="29" cy="24" r="7.5" stroke="currentColor" strokeWidth="1.5" opacity="0.75" />
          <circle cx="24" cy="24" r="2" fill="currentColor" className={pulse} />
        </>
      )}

      {kind === 'general' && (
        <>
          <path d="M24 12l10.4 6v12L24 36l-10.4-6V18L24 12z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
          <path d="M24 18l5.2 3v6L24 30l-5.2-3v-6L24 18z" stroke="currentColor" strokeWidth="1" opacity="0.7" />
          <circle cx="24" cy="24" r="2" fill="currentColor" className={pulse} />
        </>
      )}
    </svg>
  );
}
