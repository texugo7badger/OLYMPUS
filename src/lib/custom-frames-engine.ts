/**
 * Custom Frames Engine -- URL-only.
 *
 * Frames tab is URL-only. The VSCodium and
 * OpenCode TUI built-in presets were removed — code editing now happens
 * in the user's external editor (Zed, VSCode, VSCodium, Cursor, etc.)
 * launched from the Editor Bridge tab. The OpenCode TUI is accessible
 * via the Terminal tab's mode toggle + the IDE's TerminalTabs
 * "+ > OpenCode TUI" option.
 *
 * What remains:
 *   - isValidFrameUrl(url): boolean
 *   - defaultSandboxFor(url): string
 *   - GOD_TABS: readonly array (kept for backwards compat, unused now)
 *   - PRESET_CATALOG: FramePreset[] (empty array -- no built-in presets)
 *   - presetIdToConfigKey(id): string | null (always returns null)
 *   - getCliPreset(cliId): FramePreset | null (always returns null)
 *
 * Users add URL frames via the UI's "Add Frame" dialog. User frames are
 * persisted to ~/.olympus/user-frames.json by /api/olympus/user-frames.
 *
 * Inspired by Ellpeck/ObsidianCustomFrames (MIT) -- our reference design only.
 * The implementation is original and tailored to Olympus's UI tab system.
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

export function isValidFrameUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  try {
    const p = new URL(url);
    // Allow only http: and https: -- no file:, no javascript:, no data:.
    return (p.protocol === 'http:' || p.protocol === 'https:') && !!p.hostname;
  } catch { return false; }
}

export function defaultSandboxFor(url: string): string {
  try {
    const p = new URL(url);
    const isLocal = p.hostname === '127.0.0.1' || p.hostname === 'localhost' || p.hostname === '::1' || p.hostname === '[::1]';
    if (isLocal || p.protocol === 'https:') {
      return 'allow-scripts allow-same-origin allow-forms allow-popups allow-downloads allow-modals allow-presentation';
    }
    return 'allow-scripts allow-forms allow-popups';
  } catch {
    return 'allow-scripts allow-same-origin allow-forms allow-popups';
  }
}

export interface FramePreset {
  id: string;
  displayName: string;
  url: string;
  probe: number | null;
  sandbox: string;
  requiresDocker: boolean;
  installHint: { platform: string; command: string; note?: string }[];
  icon: string;
  ttydCommand?: string;
  launchEndpoint?: string;
  cliId?: string;
  status?: 'stable' | 'beta' | 'planned';
}

/**
 * PRESET_CATALOG -- EMPTY.
 * Built-in presets (VSCodium, OpenCode TUI) were removed. The Frames tab
 * is now URL-only. Users add their own frames via the "Add Frame" dialog.
 */
export const PRESET_CATALOG: FramePreset[] = [];

/**
 * Always returns null (no built-in presets).
 * Kept for backwards compat with custom-frames.tsx.
 */
export function presetIdToConfigKey(_id: string): string | null {
  return null;
}

/**
 * Always returns null (no CLI presets).
 * Kept for backwards compat.
 */
export function getCliPreset(_cliId: string): FramePreset | null {
  return null;
}

/**
 * GOD_TABS -- the filter chips at the top of the Frames tab.
 * Kept for backwards compat but the Frames tab no longer
 * renders them (URL-only frames don't need god filtering).
 */
export const GOD_TABS = [
  { id: 'all', label: 'All' }, { id: 'apollo', label: 'Apollo' }, { id: 'hephaestus', label: 'Hephaestus' },
  { id: 'athena', label: 'Athena' }, { id: 'hermes', label: 'Hermes' }, { id: 'artemis', label: 'Artemis' },
  { id: 'dionysus', label: 'Dionysus' }, { id: 'persephone', label: 'Persephone' }, { id: 'prometheus', label: 'Prometheus' },
] as const;
