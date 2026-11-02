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

const light = (gold: string, extra: Partial<OlympusPalette> = {}): OlympusPalette => ({
  gold,
  amber: '#9A6A33',
  blue: '#4E6F93',
  green: '#4F8563',
  amberSoft: '#A87E45',
  purple: '#7D6395',
  teal: '#3F8A79',
  red: '#A5524A',
  cyan: '#3F7F8A',
  bg: '#F6F0E4',
  panel: '#FBF7EE',
  card: '#FFFDF7',
  text: '#2E2A24',
  textDim: '#6B6156',
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
  { id: 'paper', name: 'Paper', mode: 'light', colors: light('#8A6A3B', {
    gold: '#8A6A3B', amber: '#7A5C32', amberSoft: '#9A7A48',
    bg: '#FFFFFF', panel: '#F7F7F7', card: '#FFFFFF', text: '#1D1D1F', textDim: '#6B6B70',
  }) },
  { id: 'mist', name: 'Mist', mode: 'light', colors: light('#2F7F8C', {
    gold: '#2F7F8C', amber: '#2A6F7A', amberSoft: '#4A8F99', cyan: '#2F7F8C',
    bg: '#F2F7F8', panel: '#FAFCFC', card: '#FFFFFF', text: '#1E2A2E', textDim: '#5F7076',
  }) },
  { id: 'blossom', name: 'Blossom', mode: 'light', colors: light('#7D5A9A', {
    gold: '#7D5A9A', amber: '#8A5F7A', amberSoft: '#9A7AAE', purple: '#7D5A9A',
    bg: '#FBF5FA', panel: '#FFF9FE', card: '#FFFFFF', text: '#2B2230', textDim: '#6E5F75',
  }) },
  { id: 'sand', name: 'Sand', mode: 'light', colors: light('#A8742F', {
    gold: '#A8742F', amber: '#92652A', amberSoft: '#B0854A',
    bg: '#F8F2E8', panel: '#FCF8F1', card: '#FFFFFF', text: '#2B251C', textDim: '#6F6555',
  }) },
  { id: 'mint', name: 'Mint', mode: 'light', colors: light('#2F8A78', {
    gold: '#2F8A78', amber: '#357F6A', amberSoft: '#4F9A88', green: '#2F8A78', teal: '#2F8A78',
    bg: '#F1F8F5', panel: '#F9FDFB', card: '#FFFFFF', text: '#1E2E29', textDim: '#5D726B',
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
  for (const key of PALETTE_KEYS) root.style.setProperty(cssVarName(key), palette[key]);
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
