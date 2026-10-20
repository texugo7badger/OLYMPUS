/**
 * deeplink.ts — #154 DEEPLINK-1 (v0.0.5): the external tools lane. PATH
 * detection of the deep-link targets (ArtCraft, Godot, Krita, Blender,
 * ComfyUI) + the "open in..." action + the WEB FALLBACK for ArtCraft (no
 * Linux desktop binaries yet — app.getartcraft.com carries the lane until
 * they ship). GPL tools stay separate processes (deep-linked, never
 * embedded); ArtCraft is MIT/Apache-2.0 — the license is permissive but the
 * app is still its own runtime: deep-link remains the correct format.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { existsSync } from 'fs';
import { join } from 'path';
import { spawnSync } from 'child_process';
import { homedir } from 'os';

export interface DeeplinkTarget {
  id: string;
  label: string;
  detected: boolean;
  path?: string;
  webFallback?: string;
}

/** ArtCraft's web studio — the Linux lane until desktop binaries ship. */
export const ARTCRAFT_WEB = 'https://app.getartcraft.com/create-image';

function which(bin: string): string | null {
  try {
    const r = spawnSync('which', [bin], { encoding: 'utf-8', timeout: 3000 });
    const p = (r.stdout || '').trim();
    return p && existsSync(p) ? p : null;
  } catch { return null; }
}

/** The detection: which binaries live on this box. */
export function detectDeeplinkTargets(): DeeplinkTarget[] {
  const flatpak = (id: string) => {
    const p = join(homedir(), '.local/share/flatpak', id);
    return existsSync(p) ? p : null;
  };
  const artcraft =
    which('artcraft') ??
    which('ArtCraft') ??
    flatpak('app/getartcraft.ArtCraft');
  // W-G CRAFT-EMBED: the Craft App Launcher (storytold/craft-launcher) — the
  // one install that carries all 13 apps; detected apps are the strongest
  // lane (the agents drive them via the CLI/JSON control channel).
  const craftLauncher =
    which('craft-launcher') ?? which('craftlauncher') ?? flatpak('app/getartcraft.craft-launcher');
  const godot = which('godot') ?? which('godot4');
  const krita = which('krita') ?? flatpak('org.kde.krita/x86_64/master');
  const blender = which('blender') ?? flatpak('org.blender.Blender');
  const comfy = [join(homedir(), 'ComfyUI'), join(homedir(), 'comfyui'), '/opt/ComfyUI'].find((p) => existsSync(p));
  return [
    { id: 'artcraft', label: 'ArtCraft (the compositing studio)', detected: !!artcraft, path: artcraft ?? undefined, webFallback: ARTCRAFT_WEB },
    { id: 'craft-launcher', label: 'Craft App Launcher (all 13 Craft Apps)', detected: !!craftLauncher, path: craftLauncher ?? undefined, webFallback: 'https://github.com/storytold/craft-launcher/releases' },
    { id: 'godot', label: 'Godot (games)', detected: !!godot, path: godot ?? undefined },
    { id: 'krita', label: 'Krita (paint)', detected: !!krita, path: krita ?? undefined },
    { id: 'blender', label: 'Blender (3D)', detected: !!blender, path: blender ?? undefined },
    { id: 'comfyui', label: 'ComfyUI (local generation)', detected: !!comfy, path: comfy },
  ];
}

/** "Open in..." — spawn the detected binary (the ELECTRON-safe shell path
 *  for the desktop app) or hand back the web URL for the renderer to open. */
export function openExternal(
  targetId: string,
  assetPath?: string,
): { kind: 'spawned'; target: DeeplinkTarget; arg?: string } | { kind: 'web'; url: string; target: DeeplinkTarget } | { kind: 'missing'; target: DeeplinkTarget } {
  const target = detectDeeplinkTargets().find((t) => t.id === targetId);
  if (!target) throw new Error(`unknown deeplink target '${targetId}'`);
  if (target.detected && target.path) {
    try {
      // The desktop app's main process owns real spawns; the route shells
      // out (detached) — the electron lane uses the same command shape.
      const { spawn } = require('child_process') as typeof import('child_process');
      const child = spawn(target.path, assetPath ? [assetPath] : [], { detached: true, stdio: 'ignore' });
      child.unref();
      return { kind: 'spawned', target, arg: assetPath };
    } catch {
      // fall through to the web lane
    }
  }
  if (target.webFallback) {
    return { kind: 'web', url: target.webFallback, target };
  }
  return { kind: 'missing', target };
}
