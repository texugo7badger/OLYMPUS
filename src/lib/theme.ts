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
  text: '#B8B8B8',
  textDim: '#8B8B8B',
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
  bg: '#EFE7D8',
  panel: '#F4EEDF',
  card: '#FBF7EE',
  text: '#241F18',
  textDim: '#5E5346',
  ...extra,
});

export const THEME_PRESETS: ThemePreset[] = [
  { id: 'olympus', name: 'Olympus', mode: 'dark', colors: dark('#D4A574') },
  { id: 'obsidian', name: 'Obsidian', mode: 'dark', colors: dark('#67C9E8', {
    amber: '#5AA9C4', amberSoft: '#5AA9C4', purple: '#8E9BD6', cyan: '#67C9E8',
    bg: '#07090C', panel: '#0B0E13', card: '#10141A', text: '#C3CBD3', textDim: '#7C8794',
  }) },
  { id: 'ember', name: 'Ember', mode: 'dark', colors: dark('#E8A45C', {
    amber: '#D18A45', amberSoft: '#E8A45C', red: '#D96C5F',
    bg: '#120D0A', panel: '#18110D', card: '#1F1611', text: '#D8CEC6', textDim: '#9A8C80',
  }) },
  { id: 'violet', name: 'Violet', mode: 'dark', colors: dark('#B79BE0', {
    amber: '#9B7BAE', purple: '#B79BE0', blue: '#8E9BD6',
    bg: '#0D0A14', panel: '#120E1C', card: '#181224', text: '#CFC6DB', textDim: '#8B7F9A',
  }) },
  { id: 'forest', name: 'Forest', mode: 'dark', colors: dark('#9CC48E', {
    green: '#9CC48E', teal: '#7FB59B',
    bg: '#08110C', panel: '#0C1711', card: '#101D16', text: '#C2D3C7', textDim: '#7F9486',
  }) },
  { id: 'ice', name: 'Ice', mode: 'dark', colors: dark('#8FC7E8', {
    amber: '#6B9FB5', amberSoft: '#A9C4D1', blue: '#8FC7E8', cyan: '#8FC7E8', teal: '#7FB5C4',
    bg: '#080D12', panel: '#0C131A', card: '#101923', text: '#C6D3DC', textDim: '#7F8F9A',
  }) },
  { id: 'parchment', name: 'Parchment', mode: 'light', colors: light('#B07A3C') },
  { id: 'paper', name: 'Paper', mode: 'light', colors: light('#7E5F33', {
    gold: '#7E5F33', amber: '#6E522B', amberSoft: '#8E6E3E',
    bg: '#ECECE7', panel: '#F2F2EE', card: '#F9F9F6', text: '#1B1B1D', textDim: '#57575C',
  }) },
  { id: 'mist', name: 'Mist', mode: 'light', colors: light('#2A727E', {
    gold: '#2A727E', amber: '#25636E', amberSoft: '#3E8590', cyan: '#2A727E',
    bg: '#E6F0F1', panel: '#EFF7F8', card: '#F8FCFC', text: '#162427', textDim: '#506568',
  }) },
  { id: 'blossom', name: 'Blossom', mode: 'light', colors: light('#6E4C8C', {
    gold: '#6E4C8C', amber: '#7C5270', amberSoft: '#866A9C', purple: '#6E4C8C',
    bg: '#F3E8F2', panel: '#FAF1F9', card: '#FFFAFE', text: '#241A2B', textDim: '#63526C',
  }) },
  { id: 'sand', name: 'Sand', mode: 'light', colors: light('#96631F', {
    gold: '#96631F', amber: '#84561D', amberSoft: '#A2763A',
    bg: '#F0E7D6', panel: '#F7F0E2', card: '#FDF9F0', text: '#221C14', textDim: '#635744',
  }) },
  { id: 'mint', name: 'Mint', mode: 'light', colors: light('#2A7C6B', {
    gold: '#2A7C6B', amber: '#2F725F', amberSoft: '#418E7C', green: '#2A7C6B', teal: '#2A7C6B',
    bg: '#E6F1EC', panel: '#F0F8F4', card: '#FAFDFB', text: '#16241F', textDim: '#4E665E',
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
  return {
    presetId: preset,
    // The mode is a property of the preset, never a free-floating flag: a
    // "paper" theme is light even if an old store said dark.
    mode: presetById(preset).mode,
    accent,
    iconId: typeof raw.iconId === 'string' && THEME_ICONS.some((i) => i.id === raw.iconId) ? raw.iconId : 'classic',
    motion: isMotionMode(raw.motion) ? raw.motion : 'full',
  };
}

/** The resolved palette (the user accent wins over the preset's primary). */
export function resolvePalette(state: ThemeState): OlympusPalette {
  const base = { ...presetById(state.presetId).colors };
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
