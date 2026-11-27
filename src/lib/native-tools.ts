/**
 * native-tools.ts — v0.1.2: the Craft Hub's external-app registry.
 *
 * ArtCraft stays the self-hosted web/native suite. This registry is the bridge
 * to the tools a project already uses — Blender, Godot, OBS, Inkscape, Krita,
 * a video editor — without bundling any of them and without a shell string.
 * Detection is read-only; launch is an explicit whitelist + project cwd.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export interface NativeTool {
  id: string;
  name: string;
  bins: string[];
  kind: '3d' | 'game' | 'video' | 'vector' | 'paint';
  note: string;
}

export const NATIVE_TOOLS: NativeTool[] = [
  { id: 'blender', name: 'Blender', bins: ['blender'], kind: '3d', note: '3D, animation and game assets' },
  { id: 'godot', name: 'Godot', bins: ['godot', 'godot4', 'godot3'], kind: 'game', note: 'game engine and scene editor' },
  { id: 'obs', name: 'OBS Studio', bins: ['obs'], kind: 'video', note: 'capture and streaming' },
  { id: 'inkscape', name: 'Inkscape', bins: ['inkscape'], kind: 'vector', note: 'SVG and vector illustration' },
  { id: 'krita', name: 'Krita', bins: ['krita'], kind: 'paint', note: 'digital painting and texture' },
  { id: 'davinci', name: 'DaVinci Resolve', bins: ['davinci-resolve', 'resolve'], kind: 'video', note: 'video editing and color' },
  { id: 'shotcut', name: 'Shotcut', bins: ['shotcut'], kind: 'video', note: 'open-source video editor' },
];

function which(bin: string): string | null {
  try {
    const r = spawnSync('which', [bin], { encoding: 'utf-8', timeout: 2500 });
    const out = String(r.stdout || '').trim().split('\n')[0];
    return r.status === 0 && out ? out : null;
  } catch { return null; }
}

export interface DetectedNativeTool extends NativeTool {
  installed: boolean;
  path: string | null;
}

export function detectNativeTools(): DetectedNativeTool[] {
  return NATIVE_TOOLS.map((t) => {
    const found = t.bins.map(which).find(Boolean) || null;
    return { ...t, installed: Boolean(found), path: found };
  });
}

/** Launch one detected tool in the project directory. No shell, no free args. */
export function launchNativeTool(id: string, projectPath: string): { ok: boolean; pid?: number; error?: string } {
  const tool = NATIVE_TOOLS.find((t) => t.id === id);
  if (!tool) return { ok: false, error: `unknown native tool: ${id}` };
  if (!projectPath || !fs.existsSync(projectPath) || !fs.statSync(projectPath).isDirectory()) {
    return { ok: false, error: 'project path is not a readable directory' };
  }
  const bin = tool.bins.map(which).find(Boolean);
  if (!bin) return { ok: false, error: `${tool.name} is not installed` };
  try {
    const child = spawn(bin, [], { cwd: projectPath, detached: true, stdio: 'ignore' });
    child.unref();
    return { ok: true, pid: child.pid ?? undefined };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
}
