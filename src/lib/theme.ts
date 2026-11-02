/**
 * theme.ts — v0.0.32: the OLYMPUS appearance system (ONE source of truth).
 *
 * The palette lives in `src/app/globals.css` as `--color-olympus-*` variables.
 * A theme is just a value set for those variables plus the icon and the motion
 * policy; applying it on <html> restyles every surface (brain, chat, panels)
 * without touching a component.
 *
 * Rules:
 *   - 12 presets, 6 dark + 6 light, every key defined.
 *   - Text on background must clear WCAG AA (4.5:1); the suite enforces it.
 *   - The user accent overrides only the primary (`gold`), never the semantic
 *     colors (green/red), so status meaning survives a theme.
 *   - `stable` motion keeps spinners and removes decorative animation.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

export type ThemeMode = 'dark' | 'light';
export type MotionMode = 'full' | 'stable';

export const PALETTE_KEYS = [
  'gold', 'amber', 'blue', 'green', 'amberSoft', 'purple', 'teal', 'red', 'cyan',
  'bg', 'panel', 'card', 'text', 'textDim',
] as const;

export type PaletteKey = (typeof PALETTE_KEYS)[number];
export type OlympusPalette = Record<PaletteKey, string>;

export interface ThemePreset {
  id: string;
  name: string;
  mode: ThemeMode;
  colors: OlympusPalette;
}

export interface ThemeState {
  presetId: string;
  mode: ThemeMode;
  /** v0.0.32 — a full generated palette (wins over the preset). */
  custom?: OlympusPalette;
  /** Optional primary override (#RRGGBB). */
  accent: string | null;
  iconId: string;
  motion: MotionMode;
}

export interface ThemeIcon {
  id: string;
  name: string;
  src: string;
}

export const THEME_ICONS: ThemeIcon[] = [
  { id: 'classic', name: 'Classic peak', src: '/logo.svg' },
  { id: 'orbit', name: 'Orbit', src: '/icons/olympus-orbit.svg' },
  { id: 'peak', name: 'Minimal peak', src: '/icons/olympus-peak.svg' },
  { id: 'monogram', name: 'Monogram', src: '/icons/olympus-monogram.svg' },
];

const dark = (gold: string, extra: Partial<OlympusPalette> = {}): OlympusPalette => ({
  gold,
  amber: '#C4956A',
  blue: '#6B8FB5',
  green: '#7BAE8E',
  amberSoft: '#C4A265',
  purple: '#9B7BAE',
  teal: '#6BAE9B',
  red: '#C4756A',
  cyan: '#6BAEB5',
  bg: '#0A0E16',
  panel: '#0E1320',
  card: '#121826',
  text: '#E4E4E4',
  textDim: '#A3A3A3',
  ...extra,
});

/**
 * Light presets are PASTEL, not white: a tinted paper that does not glow at
 * night, with a genuinely dark ink for contrast. The suite enforces 4.5:1.
 */
const light = (gold: string, extra: Partial<OlympusPalette> = {}): OlympusPalette => ({
  gold,
  amber: '#8A5C26',
  blue: '#3E5F83',
  green: '#3F7553',
  amberSoft: '#96692F',
  purple: '#6A4F86',
  teal: '#2F7A69',
  red: '#94443C',
  cyan: '#2F6F7A',
  bg: '#DDD6C7',
  panel: '#E6E0D2',
  card: '#EFEADD',
  text: '#211C16',
  textDim: '#544B3F',
  ...extra,
});

export const THEME_PRESETS: ThemePreset[] = [
  { id: 'olympus', name: 'Olympus', mode: 'dark', colors: dark('#D4A574') },
  { id: 'obsidian', name: 'Obsidian', mode: 'dark', colors: dark('#67C9E8', {
    amber: '#5AA9C4', amberSoft: '#5AA9C4', purple: '#8E9BD6', cyan: '#67C9E8',
    bg: '#07090C', panel: '#0B0E13', card: '#10141A', text: '#D6DEE5', textDim: '#9AA6B2',
  }) },
  { id: 'ember', name: 'Ember', mode: 'dark', colors: dark('#E8A45C', {
    amber: '#D18A45', amberSoft: '#E8A45C', red: '#D96C5F',
    bg: '#120D0A', panel: '#18110D', card: '#1F1611', text: '#E6DAD0', textDim: '#B0A296',
  }) },
  { id: 'violet', name: 'Violet', mode: 'dark', colors: dark('#B79BE0', {
    amber: '#9B7BAE', purple: '#B79BE0', blue: '#8E9BD6',
    bg: '#0D0A14', panel: '#120E1C', card: '#181224', text: '#E0D6EC', textDim: '#A99CB8',
  }) },
  { id: 'forest', name: 'Forest', mode: 'dark', colors: dark('#9CC48E', {
    green: '#9CC48E', teal: '#7FB59B',
    bg: '#08110C', panel: '#0C1711', card: '#101D16', text: '#D6E6DB', textDim: '#9CB3A2',
  }) },
  { id: 'ice', name: 'Ice', mode: 'dark', colors: dark('#8FC7E8', {
    amber: '#6B9FB5', amberSoft: '#A9C4D1', blue: '#8FC7E8', cyan: '#8FC7E8', teal: '#7FB5C4',
    bg: '#080D12', panel: '#0C131A', card: '#101923', text: '#D9E5EE', textDim: '#9AABB6',
  }) },
  { id: 'parchment', name: 'Parchment', mode: 'light', colors: light('#B07A3C') },
  { id: 'paper', name: 'Paper', mode: 'light', colors: light('#7E5F33', {
    gold: '#7E5F33', amber: '#6E522B', amberSoft: '#8E6E3E',
    bg: '#DCDCD6', panel: '#E6E6E0', card: '#EFEFE9', text: '#1A1A1C', textDim: '#4F4F54',
  }) },
  { id: 'mist', name: 'Mist', mode: 'light', colors: light('#2A727E', {
    gold: '#2A727E', amber: '#25636E', amberSoft: '#3E8590', cyan: '#2A727E',
    bg: '#D3E3E4', panel: '#DFECEC', card: '#EAF4F4', text: '#152225', textDim: '#475C5F',
  }) },
  { id: 'blossom', name: 'Blossom', mode: 'light', colors: light('#6E4C8C', {
    gold: '#6E4C8C', amber: '#7C5270', amberSoft: '#866A9C', purple: '#6E4C8C',
    bg: '#E4D6E3', panel: '#EDE1EC', card: '#F6ECF5', text: '#221829', textDim: '#584862',
  }) },
  { id: 'sand', name: 'Sand', mode: 'light', colors: light('#96631F', {
    gold: '#96631F', amber: '#84561D', amberSoft: '#A2763A',
    bg: '#DFD3BD', panel: '#E9DFCC', card: '#F2EADA', text: '#201A12', textDim: '#574C3C',
  }) },
  { id: 'mint', name: 'Mint', mode: 'light', colors: light('#2A7C6B', {
    gold: '#2A7C6B', amber: '#2F725F', amberSoft: '#418E7C', green: '#2A7C6B', teal: '#2A7C6B',
    bg: '#D2E4DC', panel: '#DEEDE6', card: '#E9F5EF', text: '#15231E', textDim: '#455C55',
  }) },
];

export const DEFAULT_THEME: ThemeState = {
  presetId: 'olympus',
  mode: 'dark',
  accent: null,
  iconId: 'classic',
  motion: 'full',
};

const HEX = /^#[0-9a-fA-F]{6}$/;

export function isThemeMode(value: unknown): value is ThemeMode {
  return value === 'dark' || value === 'light';
}

export function isMotionMode(value: unknown): value is MotionMode {
  return value === 'full' || value === 'stable';
}

export function presetById(id: string | null | undefined): ThemePreset {
  return THEME_PRESETS.find((p) => p.id === id) ?? THEME_PRESETS[0];
}

export function iconById(id: string | null | undefined): ThemeIcon {
  return THEME_ICONS.find((i) => i.id === id) ?? THEME_ICONS[0];
}

/** Accept anything (an old store, a paste) and return a usable state. */
export function normalizeThemeState(input: unknown): ThemeState {
  const raw = (input && typeof input === 'object' ? input : {}) as Partial<ThemeState>;
  const preset = typeof raw.presetId === 'string' && THEME_PRESETS.some((p) => p.id === raw.presetId)
    ? raw.presetId
    : DEFAULT_THEME.presetId;
  const accent = typeof raw.accent === 'string' && HEX.test(raw.accent) ? raw.accent : null;
  const customRaw = (raw as any).custom;
  const custom: OlympusPalette | undefined =
    customRaw && typeof customRaw === 'object' && PALETTE_KEYS.every((k) => typeof customRaw[k] === 'string' && HEX.test(customRaw[k]))
      ? Object.fromEntries(PALETTE_KEYS.map((k) => [k, String(customRaw[k]).toUpperCase()])) as OlympusPalette
      : undefined;
  return {
    presetId: preset,
    // The mode is a property of the preset, never a free-floating flag: a
    // "paper" theme is light even if an old store said dark.
    mode: presetById(preset).mode,
    accent,
    ...(custom ? { custom } : {}),
    iconId: typeof raw.iconId === 'string' && THEME_ICONS.some((i) => i.id === raw.iconId) ? raw.iconId : 'classic',
    motion: isMotionMode(raw.motion) ? raw.motion : 'full',
  };
}

/** The resolved palette (the user accent wins over the preset's primary). */
export function resolvePalette(state: ThemeState): OlympusPalette {
  const base = { ...(state.custom ?? presetById(state.presetId).colors) };
  if (state.accent) base.gold = state.accent;
  return base;
}

/** CSS variable name for a palette key (`gold` → `--color-olympus-gold`). */
export function cssVarName(key: PaletteKey): string {
  // The runtime variables the Tailwind utilities reference (globals.css:
  // :root + @theme inline). Setting these repaints every utility.
  return key === 'amberSoft' ? '--olympus-amber-soft'
    : key === 'textDim' ? '--olympus-text-dim'
    : `--olympus-${key}`;
}

/** The aliased Tailwind name (kept in sync for direct readers). */
export function cssColorVarName(key: PaletteKey): string {
  return key === 'amberSoft' ? '--color-olympus-amber-soft'
    : key === 'textDim' ? '--color-olympus-text-dim'
    : `--color-olympus-${key}`;
}

export interface ApplyTarget {
  setAttribute(name: string, value: string): void;
  style: { setProperty(name: string, value: string): void };
}

/**
 * Apply a theme to a document root. Pure over the target so the suite can
 * assert every variable without a browser.
 */
export function applyTheme(state: ThemeState, root: ApplyTarget): ThemeState {
  const normalized = normalizeThemeState(state);
  const palette = resolvePalette(normalized);
  for (const key of PALETTE_KEYS) {
    root.style.setProperty(cssVarName(key), palette[key]);
    root.style.setProperty(cssColorVarName(key), palette[key]);
  }
  root.setAttribute('data-theme', normalized.presetId);
  root.setAttribute('data-mode', normalized.mode);
  root.setAttribute('data-motion', normalized.motion);
  root.setAttribute('data-icon', normalized.iconId);
  return normalized;
}

/** WCAG relative luminance (for the contrast test and the docs). */
export function luminance(hex: string): number {
  const v = hex.replace('#', '');
  const channel = (i: number) => {
    const c = parseInt(v.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
}

export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** The public theme payload (API + client). */
export interface ThemePayload extends ThemeState {
  presets: Array<{ id: string; name: string; mode: ThemeMode; colors: OlympusPalette }>;
  icons: ThemeIcon[];
}

/** A tiny themed favicon (the peak in the accent) for the browser/window tab. */
export function themedFaviconSvg(state: ThemeState): string {
  const c = resolvePalette(state);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="${c.bg}"/><circle cx="32" cy="32" r="24" fill="none" stroke="${c.gold}" stroke-width="1.5" opacity=".5"/><path d="M32 18 L46 46 L39 46 L32 32 L25 46 L18 46 Z" fill="${c.gold}"/><circle cx="32" cy="15" r="2.4" fill="${c.purple}"/></svg>`;
}
