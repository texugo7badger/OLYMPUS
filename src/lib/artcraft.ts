/**
 * artcraft.ts — v0.0.32 (Epic Q): the style contract for a project.
 *
 * THE PROBLEM: "make it premium" is not an instruction a god can execute.
 * A reference screenshot is pretty but unusable without tokens; a token list
 * without a reference is arbitrary. ArtCraft joins both into ONE copyable
 * prompt (and a DESIGN.md export), so the direction the user chose survives
 * the trip from the Craft panel to the project.
 *
 * Pure by design: no I/O, no React, no network — the UI, the API and the
 * suite share the same shape.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

export type PaletteId = 'olympus' | 'editorial' | 'technical' | 'soft';
export type TypographyId = 'geometric-sans' | 'humanist-sans' | 'serif-display' | 'mono-technical';
export type DensityId = 'compact' | 'comfortable' | 'spacious';
export type RadiusId = 'sharp' | 'soft' | 'pill';
export type MotionId = 'none' | 'subtle' | 'expressive';

export interface StylePalette {
  bg: string;
  surface: string;
  accent: string;
  text: string;
  muted: string;
}

export interface StyleTokens {
  palette: PaletteId;
  /** Optional override of the accent only (the user's color pick). */
  accent?: string;
  /** v0.0.32 — a generated palette for THIS project (wins over the preset). */
  custom?: StylePalette;
  typography: TypographyId;
  density: DensityId;
  radius: RadiusId;
  motion: MotionId;
}

export interface StyleReference {
  name: string;
  category?: string;
  demoUrl: string;
  library?: string;
}

export const STYLE_PRESETS: Record<PaletteId, { label: string; colors: StylePalette; typography: TypographyId; density: DensityId; radius: RadiusId; motion: MotionId }> = {
  olympus: {
    label: 'OLYMPUS (dark, precise, gold)',
    colors: { bg: '#0B0B0D', surface: '#141418', accent: '#D4A574', text: '#E8E6E1', muted: '#8A8780' },
    typography: 'geometric-sans',
    density: 'comfortable',
    radius: 'soft',
    motion: 'subtle',
  },
  editorial: {
    label: 'Warm editorial (paper, serif display)',
    colors: { bg: '#F7F3EC', surface: '#FFFFFF', accent: '#B4552D', text: '#1F1B16', muted: '#6E655B' },
    typography: 'serif-display',
    density: 'spacious',
    radius: 'sharp',
    motion: 'subtle',
  },
  technical: {
    label: 'Cool technical (terminal, mono)',
    colors: { bg: '#0A0F14', surface: '#101820', accent: '#4FD1C5', text: '#D7E2EA', muted: '#6B7C8A' },
    typography: 'mono-technical',
    density: 'compact',
    radius: 'sharp',
    motion: 'none',
  },
  soft: {
    label: 'Soft product (light, airy, rounded)',
    colors: { bg: '#F8FAFC', surface: '#FFFFFF', accent: '#6366F1', text: '#0F172A', muted: '#64748B' },
    typography: 'humanist-sans',
    density: 'comfortable',
    radius: 'pill',
    motion: 'expressive',
  },
};

/**
 * v0.0.32 — the PROJECT default. The Style Board belongs to the open project,
 * not to OLYMPUS: a neutral slate until the user generates or edits a palette.
 */
export const PROJECT_NEUTRAL: StylePalette = {
  bg: '#0F1115', surface: '#151922', accent: '#6B8FB5', text: '#E2E6EA', muted: '#8792A2',
};

export const DEFAULT_TOKENS: StyleTokens = {
  palette: 'olympus',
  typography: 'geometric-sans',
  density: 'comfortable',
  radius: 'soft',
  motion: 'subtle',
};

const PALETTES: PaletteId[] = ['olympus', 'editorial', 'technical', 'soft'];
const TYPOGRAPHIES: TypographyId[] = ['geometric-sans', 'humanist-sans', 'serif-display', 'mono-technical'];
const DENSITIES: DensityId[] = ['compact', 'comfortable', 'spacious'];
const RADII: RadiusId[] = ['sharp', 'soft', 'pill'];
const MOTIONS: MotionId[] = ['none', 'subtle', 'expressive'];

function pick<T extends string>(value: unknown, allowed: T[], fallback: T): T {
  return typeof value === 'string' && (allowed as string[]).includes(value) ? (value as T) : fallback;
}

/** Accept anything (old store, a user paste) and return a usable token set. */
export function normalizeStyleTokens(input: unknown): StyleTokens {
  const raw = (input && typeof input === 'object' ? input : {}) as Partial<StyleTokens>;
  const accent = typeof raw.accent === 'string' && /^#[0-9a-fA-F]{6}$/.test(raw.accent) ? raw.accent : undefined;
  const customRaw = (raw as any).custom;
  const custom: StylePalette | undefined =
    customRaw && typeof customRaw === 'object' &&
    ['bg', 'surface', 'accent', 'text', 'muted'].every((k) => typeof customRaw[k] === 'string' && /^#[0-9a-fA-F]{6}$/.test(customRaw[k]))
      ? { bg: customRaw.bg, surface: customRaw.surface, accent: customRaw.accent, text: customRaw.text, muted: customRaw.muted }
      : undefined;
  return {
    palette: pick(raw.palette, PALETTES, DEFAULT_TOKENS.palette),
    ...(accent ? { accent } : {}),
    ...(custom ? { custom } : {}),
    typography: pick(raw.typography, TYPOGRAPHIES, DEFAULT_TOKENS.typography),
    density: pick(raw.density, DENSITIES, DEFAULT_TOKENS.density),
    radius: pick(raw.radius, RADII, DEFAULT_TOKENS.radius),
    motion: pick(raw.motion, MOTIONS, DEFAULT_TOKENS.motion),
  };
}

/** The resolved colors for a token set (accent override wins). */
export function resolveColors(tokens: StyleTokens): StylePalette {
  const base = tokens.custom ?? STYLE_PRESETS[tokens.palette]?.colors ?? STYLE_PRESETS.olympus.colors;
  return { ...base, ...(tokens.accent ? { accent: tokens.accent } : {}) };
}

const DENSITY_RULE: Record<DensityId, string> = {
  compact: 'dense layout: 4/8 px rhythm, 12–13 px body text, 28–32 px controls',
  comfortable: 'balanced layout: 8/16 px rhythm, 14–16 px body text, 36–40 px controls',
  spacious: 'airy layout: 16/32 px rhythm, 16–18 px body text, 44–48 px controls',
};

const RADIUS_RULE: Record<RadiusId, string> = {
  sharp: 'corners 0–4 px; borders carry the structure, no soft shadows',
  soft: 'corners 8–12 px; one soft shadow layer only',
  pill: 'corners 999 px on controls; 16–20 px on cards',
};

const MOTION_RULE: Record<MotionId, string> = {
  none: 'no animation; state changes are instant',
  subtle: '120–180 ms ease-out on opacity/transform; never bounce',
  expressive: '220–320 ms spring on entrance; one focal motion per view',
};

/**
 * The copyable direction. Short enough to paste into an Atelier turn, complete
 * enough that a god never has to guess a color or a spacing scale.
 */
export function buildStylePrompt(opts: {
  project: string;
  tokens: StyleTokens;
  references?: StyleReference[];
}): string {
  const tokens = normalizeStyleTokens(opts.tokens);
  const colors = resolveColors(tokens);
  const refs = (opts.references ?? []).filter((r) => r && r.demoUrl);
  const lines: string[] = [];
  lines.push(`# Design direction — ${opts.project || 'the project'}`);
  lines.push('');
  lines.push('## Tokens (authoritative)');
  lines.push(`- background: ${colors.bg}`);
  lines.push(`- surface: ${colors.surface}`);
  lines.push(`- accent: ${colors.accent}`);
  lines.push(`- text: ${colors.text}`);
  lines.push(`- muted: ${colors.muted}`);
  lines.push(`- typography: ${tokens.typography}`);
  lines.push(`- density: ${DENSITY_RULE[tokens.density]}`);
  lines.push(`- radius: ${RADIUS_RULE[tokens.radius]}`);
  lines.push(`- motion: ${MOTION_RULE[tokens.motion]}`);
  lines.push('');
  if (refs.length) {
    lines.push('## References (visual intent — link only, do not copy assets without a license)');
    for (const r of refs.slice(0, 8)) {
      const meta = [r.category, r.library].filter(Boolean).join(' · ');
      lines.push(`- ${r.name}${meta ? ` (${meta})` : ''} — ${r.demoUrl}`);
    }
    lines.push('');
  }
  lines.push('## Rules');
  lines.push('- Build the tokens above into the design system first; no ad-hoc hex.');
  lines.push('- Prefer composition and spacing over borders and shadows.');
  lines.push('- Every interactive state (hover, focus, disabled, loading, empty) is designed.');
  lines.push('- Reference the visual intent, never clone the asset.');
  return lines.join('\n');
}

/** The DESIGN.md contract (tokens JSON is emitted alongside by the API). */
export function buildDesignMd(opts: { project: string; tokens: StyleTokens; references?: StyleReference[] }): string {
  return `${buildStylePrompt(opts)}\n\n## Tokens JSON\n\n\`\`\`json\n${JSON.stringify(normalizeStyleTokens(opts.tokens), null, 2)}\n\`\`\`\n`;
}

export interface ArtcraftQueueItem {
  id: string;
  ts: string;
  project: string;
  title: string;
  priority: 'now' | 'high' | 'normal';
  prompt: string;
  tokens: StyleTokens;
  references: StyleReference[];
  status: 'queued';
}

/** Build a queue item; the route adds nothing but the file write. */
export function buildQueueItem(input: {
  project: string;
  title: string;
  prompt: string;
  tokens: StyleTokens;
  references?: StyleReference[];
  priority?: 'now' | 'high' | 'normal';
  now?: number;
  id?: string;
}): ArtcraftQueueItem {
  const now = input.now ?? Date.now();
  const priority = input.priority === 'now' || input.priority === 'high' ? input.priority : 'normal';
  return {
    id: input.id ?? `art-${now.toString(36)}`,
    ts: new Date(now).toISOString(),
    project: input.project,
    title: input.title.trim().slice(0, 120) || 'Design direction',
    priority,
    prompt: input.prompt,
    tokens: normalizeStyleTokens(input.tokens),
    references: (input.references ?? []).filter((r) => r && r.demoUrl).slice(0, 12),
    status: 'queued',
  };
}
