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
  // The original mark is the priority identity — app bar, window, tray, dock.
  { id: 'classic', name: 'Original OLYMPUS (recommended)', src: '/logo.svg' },
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
  // v0.0.61 — six new families: two celestial/vampire, two deep darks, two
  // clean lights. Every text/dim pair clears WCAG AA on its own background.
  { id: 'vampire', name: 'Vampire', mode: 'dark', colors: dark('#C23A45', {
    gold: '#C23A45', amber: '#A85A3A', amberSoft: '#C47A6A', purple: '#8E5A7A',
    red: '#D64A4A', green: '#7BAE8E', cyan: '#6BAEB5', blue: '#6B8FB5', teal: '#6BAE9B',
    bg: '#080406', panel: '#0F0709', card: '#160A0D', text: '#F0E2E2', textDim: '#BFA6A6',
  }) },
  { id: 'celestial', name: 'Celestial', mode: 'dark', colors: dark('#E8E8E8', {
    gold: '#E8E8E8', amber: '#C9C9C9', amberSoft: '#DADADA', purple: '#B9A7E0',
    blue: '#9DB7D8', green: '#9FCFAF', red: '#E0A0A0', cyan: '#A9D6E5', teal: '#9FD6C7',
    bg: '#000000', panel: '#060606', card: '#0C0C0C', text: '#FFFFFF', textDim: '#BDBDBD',
  }) },
  { id: 'abyss', name: 'Abyss', mode: 'dark', colors: dark('#5FC9D8', {
    gold: '#5FC9D8', amber: '#4FA3B5', amberSoft: '#6FC4CF', purple: '#7A9BD6',
    blue: '#5F9BD8', green: '#6FBF9F', red: '#C47A7A', cyan: '#5FC9D8', teal: '#5FBFB0',
    bg: '#030A0E', panel: '#07141A', card: '#0B1C24', text: '#D6ECF0', textDim: '#94B4BC',
  }) },
  { id: 'rosewood', name: 'Rosewood', mode: 'dark', colors: dark('#D88A9A', {
    gold: '#D88A9A', amber: '#B87A6A', amberSoft: '#D8A0A8', purple: '#A87A9A',
    blue: '#7A8FB5', green: '#8FAE8E', red: '#D86A6A', cyan: '#8FB5B5', teal: '#8FAEA0',
    bg: '#0D0507', panel: '#15090C', card: '#1D0E12', text: '#F0DEE2', textDim: '#C0A2AA',
  }) },
  { id: 'ivory', name: 'Ivory', mode: 'light', colors: light('#8A6A2F', {
    gold: '#8A6A2F', amber: '#7A5A2A', amberSoft: '#9A7A3A', purple: '#6A4F86',
    blue: '#3E5F83', green: '#3F7553', red: '#94443C', cyan: '#2F6F7A', teal: '#2F7A69',
    bg: '#F2EEE6', panel: '#F8F5EF', card: '#FFFFFF', text: '#1A1712', textDim: '#5A5348',
  }) },
  { id: 'arctic', name: 'Arctic', mode: 'light', colors: light('#2A6A7A', {
    gold: '#2A6A7A', amber: '#2A5F6A', amberSoft: '#3A7A8A', purple: '#5A4F86',
    blue: '#2F5F8A', green: '#2F6F55', red: '#8A3F3F', cyan: '#2A6A7A', teal: '#2A6F6A',
    bg: '#E8F0F4', panel: '#F0F6F9', card: '#FFFFFF', text: '#10202A', textDim: '#4A5E68',
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
    // v0.0.34 — the ORIGINAL OLYMPUS mark is the only identity: the icon
    // family selector is gone, and old stores are coerced to classic so the
    // app bar, tray, window, dock and favicon all show the same logo.
    iconId: 'classic',
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
  // v0.0.34 — the boot surface follows the saved mode BEFORE React paints:
  // the .dark class, color-scheme and the browser/PWA theme-color all move.
  try {
    const el = root as unknown as { classList?: { toggle: (c: string, on: boolean) => void }; style: { colorScheme?: string } };
    el.classList?.toggle('dark', normalized.mode === 'dark');
    if (el.style) el.style.colorScheme = normalized.mode;
  } catch { /* non-DOM target */ }
  try {
    if (typeof document !== 'undefined') {
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', palette.bg);
    }
  } catch { /* non-DOM */ }
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

/**
 * The themed favicon — the ORIGINAL mark in the active palette (two rings,
 * the peak, the eight gods in orbit, Callimachus above and Atlas at the
 * base), matching the status bar and the system icon.
 */
export function themedFaviconSvg(state: ThemeState): string {
  const c = resolvePalette(state);
  const dot = (x: number, y: number, r: number, fill: string, opacity = 1) =>
    `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}"${opacity < 1 ? ` opacity="${opacity}"` : ''}/>`;
  // public/logo.svg scaled 0.25 into a 64px badge — CHAMELEON edition:
  // same points/radii; the peak is gold→purple→cyan, the inner ring cyan,
  // and each orbit dot carries its own palette color.
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="olympus-cham" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${c.gold}"/><stop offset="48%" stop-color="${c.purple}"/><stop offset="100%" stop-color="${c.cyan}"/></linearGradient></defs><circle cx="32" cy="32" r="31" fill="${c.bg}"/>`
    + `<circle cx="32" cy="32" r="28" fill="none" stroke="${c.gold}" stroke-width="0.375" opacity=".4"/>`
    + `<circle cx="32" cy="32" r="24" fill="none" stroke="${c.cyan}" stroke-width="0.25" opacity=".28"/>`
    + `<path d="M32 19 L42 42 L36 42 L32 33 L28 42 L22 42 Z" fill="url(#olympus-cham)"/>`
    + dot(32, 15, 0.75, c.purple) + dot(32, 42, 0.75, c.gold)
    + dot(32, 6, 1, c.gold) + dot(50.4, 13.6, 0.875, c.red, 0.85)
    + dot(58, 32, 1, c.cyan) + dot(50.4, 50.4, 0.875, c.green, 0.85)
    + dot(32, 58, 1, c.amberSoft) + dot(13.6, 50.4, 0.875, c.purple, 0.85)
    + dot(6, 32, 1, c.teal) + dot(13.6, 13.6, 0.875, c.blue, 0.85)
    + `<g stroke="${c.gold}" stroke-width="0.125" opacity=".15"><path d="M32 32V6M32 32H58M32 32V58M32 32H6M32 32L50.4 13.6M32 32L50.4 50.4M32 32L13.6 50.4M32 32L13.6 13.6"/></g>`
    + `</svg>`;
}
