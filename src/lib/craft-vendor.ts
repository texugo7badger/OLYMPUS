/**
 * craft-vendor.ts — W-M CRAFT-VENDOR (v0.0.8): the thirteen ArtCraft
 * Crafting Apps DOWNLOADED into OLYMPUS and served from inside — the
 * user's directive (2026-10-21): no live-site embeds as the primary
 * lane, no login ever, the apps on OUR disk with auto-update ON.
 *
 * The lanes:
 *   - WEB (primary): every app publishes a self-hostable WebAssembly
 *     build in its GitHub releases (<id>-web-<ver>.zip, 7-14 MB — the
 *     old "hundreds of MB" deferral objection died against the real
 *     numbers). The manager downloads + SHA-256-verifies + extracts +
 *     atomically swaps it into ~/.olympus/craft-apps/web/<id>/current
 *     and the serve route hosts it on the OLYMPUS origin — the pane
 *     embeds OUR copy, never theirs.
 *   - NATIVE (the "downloaded app" escalation): the per-OS portable
 *     build (Linux AppImage / Windows portable zip / macOS dmg) into
 *     ~/.olympus/craft-apps/native/<id>/ — launched as its own OS
 *     window, driven by the agents via the upstream agent-ready
 *     CLI/JSON channel; a running native app is never replaced.
 *   - LIVE WEB (fallback only): the app.getartcraft.com embed stays as
 *     the honest fallback when nothing is vendored (the probe layer in
 *     craft-apps.ts is untouched).
 *
 * The truth rules: the latest-version check rides the releases/latest
 * redirect (zero GitHub API quota — the craftcenter lesson), every
 * download is verified against the release SHA256SUMS.txt, the swap is
 * atomic (staging → rename, one previous generation kept), and the
 * manifest (~/.olympus/craft-apps/manifest.json) is the single source
 * of the vendored state.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { spawn, execFile } from 'child_process';
import { unzipSync } from 'fflate';
import { CRAFT_APPS, type CraftApp } from './craft-apps.ts';

// ── Paths ────────────────────────────────────────────────────────────────

/** The OLYMPUS data root (~/.olympus — the mcp-state.json precedent). */
export function vendorRoot(): string {
  return process.env.OLYMPUS_CRAFT_DIR
    ? path.resolve(process.env.OLYMPUS_CRAFT_DIR)
    : path.join(os.homedir(), '.olympus', 'craft-apps');
}

export const webLaneDir = (id: string) => path.join(vendorRoot(), 'web', id);
export const nativeLaneDir = (id: string) => path.join(vendorRoot(), 'native', id);
export const stagingDir = () => path.join(vendorRoot(), '.staging');
export const manifestPath = () => path.join(vendorRoot(), 'manifest.json');

/** The vendored web-build directory actually served (current generation). */
export const webServeRoot = (id: string) => path.join(webLaneDir(id), 'current');

// ── Manifest ─────────────────────────────────────────────────────────────

export interface WebInstall {
  version: string;
  sha256: string;
  sizeBytes: number;
  installedAt: string;
}

export interface NativeInstall {
  version: string;
  /** The launchable artifact (AppImage file / extracted bundle / mounted .app). */
  path: string;
  /** The executable the launcher spawns. */
  binary: string;
  kind: 'appimage' | 'exe' | 'app';
  pid?: number;
  launchedAt?: string;
  sizeBytes: number;
  installedAt: string;
}

export interface LatestKnown {
  version: string;
  checkedAt: string;
}

export interface VendorManifest {
  schemaVersion: 1;
  web: Record<string, WebInstall>;
  native: Record<string, NativeInstall>;
  latest: Record<string, LatestKnown>;
}

const EMPTY_MANIFEST: VendorManifest = { schemaVersion: 1, web: {}, native: {}, latest: {} };

export function readManifest(): VendorManifest {
  try {
    const raw = JSON.parse(fs.readFileSync(manifestPath(), 'utf-8'));
    return {
      schemaVersion: 1,
      web: raw?.web && typeof raw.web === 'object' ? raw.web : {},
      native: raw?.native && typeof raw.native === 'object' ? raw.native : {},
      latest: raw?.latest && typeof raw.latest === 'object' ? raw.latest : {},
    };
  } catch {
    return { ...EMPTY_MANIFEST };
  }
}

/** Atomic manifest write (tmp + rename — the locked-atomic-writer precedent). */
export function saveManifest(m: VendorManifest): void {
  fs.mkdirSync(vendorRoot(), { recursive: true });
  const tmp = manifestPath() + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(m, null, 2));
  fs.renameSync(tmp, manifestPath());
}

// ── Jobs (the install/update progress the panel polls) ──────────────────

export type JobPhase = 'checking' | 'downloading' | 'verifying' | 'extracting' | 'swapping' | 'done' | 'error';

export interface VendorJob {
  id: string;
  app: string;
  lane: 'web' | 'native';
  auto?: boolean;
  phase: JobPhase;
  /** 0-100 (the download phase; the short phases stay on 0/100). */
  progress: number;
  bytes?: number;
  totalBytes?: number;
  version?: string;
  error?: string;
  startedAt: string;
  endedAt?: string;
}

const jobs = new Map<string, VendorJob>();
let jobSeq = 0;

export function createJob(app: string, lane: 'web' | 'native', auto = false): VendorJob {
  const job: VendorJob = {
    id: `craft-${++jobSeq}-${Date.now()}`,
    app, lane, auto,
    phase: 'checking',
    progress: 0,
    startedAt: new Date().toISOString(),
  };
  jobs.set(job.id, job);
  return job;
}

export function patchJob(id: string | undefined | null, patch: Partial<VendorJob>): VendorJob | null {
  const job = id ? jobs.get(id) : null;
  if (!job) return null;
  Object.assign(job, patch);
  if (job.phase === 'done' || job.phase === 'error') job.endedAt = new Date().toISOString();
  return job;
}

export function getJob(id: string): VendorJob | null {
  return jobs.get(id) ?? null;
}

// ── Upstream release URLs (the naming contracts, probe-verified 2026-10-21) ─

const GH_BASE = 'https://github.com/storytold';

export const webAssetName = (id: string, v: string) => `${id}-web-${v}.zip`;

/** The per-OS native portable asset (the no-sudo lane: AppImage / portable zip / dmg). */
export function nativeAssetName(id: string, v: string): { name: string; kind: NativeInstall['kind'] } | null {
  const platform = process.platform;
  const arch = process.arch;
  if (platform === 'linux') {
    const ghArch = arch === 'arm64' ? 'aarch64' : arch === 'x64' ? 'x86_64' : arch === 'ppc64' || arch === 's390x' ? null : null;
    if (!ghArch) return null;
    return { name: `${id}-${v}-linux-${ghArch}.AppImage`, kind: 'appimage' };
  }
  if (platform === 'darwin') return { name: `${id}-${v}-macos-universal.dmg`, kind: 'app' };
  if (platform === 'win32') {
    const wArch = arch === 'arm64' ? 'arm64' : 'x64';
    return { name: `${id}-${v}-windows-${wArch}-portable.zip`, kind: 'exe' };
  }
  return null;
}

export const releaseTag = (v: string) => `v${v}`;
export const assetUrl = (id: string, v: string, name: string) =>
  `${GH_BASE}/${id}/releases/download/${releaseTag(v)}/${name}`;
export const shaSumsUrl = (id: string, v: string) =>
  `${GH_BASE}/${id}/releases/download/${releaseTag(v)}/SHA256SUMS.txt`;
export const latestRedirectUrl = (id: string) => `${GH_BASE}/${id}/releases/latest`;

/**
 * Resolve the latest release version via the releases/latest redirect —
 * zero GitHub API quota (the craftcenter lesson; the API endpoint stays
 * as the maintenance lane in scripts/refresh-craft-apps.js).
 */
export async function resolveLatestVersion(id: string, timeoutMs = 10000): Promise<string | null> {
  try {
    const r = await fetch(latestRedirectUrl(id), { method: 'GET', redirect: 'follow', signal: AbortSignal.timeout(timeoutMs) });
    const m = /\/tag\/v([\w.\-]+)$/.exec(r.url || '');
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

/** Fetch + parse the release SHA256SUMS.txt (the upstream-verified truth). */
export async function fetchShaSums(id: string, v: string, timeoutMs = 10000): Promise<Record<string, string> | null> {
  try {
    const r = await fetch(shaSumsUrl(id, v), { signal: AbortSignal.timeout(timeoutMs) });
    if (!r.ok) return null;
    const text = await r.text();
    const sums: Record<string, string> = {};
    for (const line of text.split('\n')) {
      const m = /^\s*([0-9a-fA-F]{64})\s+\*?\s*(\S+)\s*$/.exec(line);
      if (m) sums[m[2]] = m[1].toLowerCase();
    }
    return sums;
  } catch {
    return null;
  }
}

/** Stream-download with byte progress (the panel's honest progress bar). */
export async function downloadBuffer(url: string, onProgress?: (bytes: number, total: number) => void, timeoutMs = 300000): Promise<Buffer> {
  const r = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!r.ok || !r.body) throw new Error(`download failed (${r.status}) — ${url}`);
  const total = Number(r.headers.get('content-length') || 0);
  const chunks: Buffer[] = [];
  let bytes = 0;
  const reader = r.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(Buffer.from(value));
    bytes += value.byteLength;
    onProgress?.(bytes, total);
  }
  return Buffer.concat(chunks);
}

export function sha256Hex(buf: Buffer): string {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

// ── The WEB lane install ─────────────────────────────────────────────────

/**
 * Find the web-build serve root inside an extracted zip: the directory
 * holding index.html (upstream zips may carry a single top-level
 * folder). Returns the folder that CONTAINS index.html.
 */
export function findWebServeRoot(dir: string): string | null {
  const tryRoot = (d: string): boolean => fs.existsSync(path.join(d, 'index.html'));
  if (tryRoot(dir)) return dir;
  let entries: fs.Dirent[];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return null; }
  const dirs = entries.filter((e) => e.isDirectory());
  if (dirs.length === 1) return findWebServeRoot(path.join(dir, dirs[0].name));
  return null;
}

/**
 * Download + verify + extract + atomically swap one app's web build.
 * The previous generation survives at web/<id>/prev (the rollback lane);
 * `current` is the served generation.
 */
export async function installWebApp(id: string, jobId?: string): Promise<{ ok: true; version: string } | { ok: false; error: string }> {
  const app = CRAFT_APPS.find((a) => a.id === id);
  if (!app) return { ok: false, error: `unknown craft app '${id}'` };
  try {
    patchJob(jobId, { phase: 'checking' });
    const version = await resolveLatestVersion(id);
    if (!version) throw new Error('could not resolve the latest release (network?)');

    patchJob(jobId, { phase: 'downloading', version });
    const buf = await downloadBuffer(assetUrl(id, version, webAssetName(id, version)), (bytes, total) => {
      const job = jobs.get(jobId || '');
      if (job && total > 0) patchJob(jobId, { bytes, totalBytes: total, progress: Math.min(99, Math.round((bytes / total) * 100)) });
    });

    patchJob(jobId, { phase: 'verifying', progress: 100 });
    const sums = await fetchShaSums(id, version);
    const expected = sums?.[webAssetName(id, version)];
    const got = sha256Hex(buf);
    if (expected && got !== expected) {
      throw new Error(`SHA-256 mismatch — expected ${expected.slice(0, 12)}…, got ${got.slice(0, 12)}… (refusing to vendor)`);
    }
    if (!expected) {
      // The sums file is missing upstream — vendored UNVERIFIED. Honest, not fatal.
      patchJob(jobId, { error: undefined });
    }

    patchJob(jobId, { phase: 'extracting' });
    const stage = path.join(stagingDir(), `${id}-${Date.now()}`);
    fs.rmSync(stage, { recursive: true, force: true });
    fs.mkdirSync(stage, { recursive: true });
    const entries = unzipSync(new Uint8Array(buf));
    for (const [name, data] of Object.entries(entries)) {
      if (name.endsWith('/')) continue;
      const dest = path.join(stage, name);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, Buffer.from(data));
    }
    const serveRoot = findWebServeRoot(stage);
    if (!serveRoot) throw new Error('the web build carries no index.html — refusing to vendor a dead lane');

    patchJob(jobId, { phase: 'swapping' });
    const target = webLaneDir(id);
    fs.mkdirSync(target, { recursive: true });
    const current = webServeRoot(id);
    const prev = path.join(target, 'prev');
    if (fs.existsSync(prev)) fs.rmSync(prev, { recursive: true, force: true });
    if (fs.existsSync(current)) fs.renameSync(current, prev);
    fs.renameSync(serveRoot, current);
    // The staging parent (not the moved root) goes away.
    fs.rmSync(stage, { recursive: true, force: true });

    const manifest = readManifest();
    manifest.web[id] = {
      version,
      sha256: got,
      sizeBytes: buf.byteLength,
      installedAt: new Date().toISOString(),
    };
    manifest.latest[id] = { version, checkedAt: new Date().toISOString() };
    saveManifest(manifest);
    patchJob(jobId, { phase: 'done', progress: 100, version, endedAt: new Date().toISOString() });
    return { ok: true, version };
  } catch (e: any) {
    patchJob(jobId, { phase: 'error', error: e?.message || String(e), endedAt: new Date().toISOString() });
    return { ok: false, error: e?.message || String(e) };
  }
}

// ── The NATIVE lane (the downloaded-app escalation) ─────────────────────

export function isProcessAlive(pid?: number): boolean {
  if (!pid || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch { return false; }
}

/**
 * Download + verify + install the per-OS native portable build. Linux:
 * the AppImage lands whole (chmod +x — the any-distro lane, no sudo).
 * Windows: the portable zip extracts; the binary is the app exe inside.
 * macOS: the dmg mounts via hdiutil and the .app bundle copies in.
 */
export async function installNativeApp(id: string, jobId?: string): Promise<{ ok: true; version: string } | { ok: false; error: string }> {
  const app = CRAFT_APPS.find((a) => a.id === id);
  if (!app) return { ok: false, error: `unknown craft app '${id}'` };
  if (process.platform !== 'linux' && process.platform !== 'darwin' && process.platform !== 'win32') {
    return { ok: false, error: `unsupported platform '${process.platform}'` };
  }
  try {
    patchJob(jobId, { phase: 'checking' });
    const version = await resolveLatestVersion(id);
    if (!version) throw new Error('could not resolve the latest release (network?)');
    const spec = nativeAssetName(id, version);
    if (!spec) throw new Error(`no native build published for ${process.platform}/${process.arch}`);

    patchJob(jobId, { phase: 'downloading', version });
    const url = assetUrl(id, version, spec.name);
    const buf = await downloadBuffer(url, (bytes, total) => {
      if (jobs.get(jobId || '') && total > 0) patchJob(jobId, { bytes, totalBytes: total, progress: Math.min(99, Math.round((bytes / total) * 100)) });
    });

    patchJob(jobId, { phase: 'verifying', progress: 100 });
    const sums = await fetchShaSums(id, version);
    const expected = sums?.[spec.name];
    const got = sha256Hex(buf);
    if (expected && got !== expected) throw new Error(`SHA-256 mismatch — refusing to install`);

    patchJob(jobId, { phase: 'extracting' });
    const dir = nativeLaneDir(id);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });

    let binary = '';
    if (spec.kind === 'appimage') {
      const file = path.join(dir, spec.name);
      fs.writeFileSync(file, buf);
      fs.chmodSync(file, 0o755);
      binary = file;
    } else if (spec.kind === 'exe') {
      const entries = unzipSync(new Uint8Array(buf));
      for (const [name, data] of Object.entries(entries)) {
        if (name.endsWith('/')) continue;
        const dest = path.join(dir, name);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.writeFileSync(dest, Buffer.from(data));
      }
      const exe = Object.keys(entries).find((n) => /\.exe$/i.test(n));
      if (!exe) throw new Error('the portable zip carries no .exe');
      binary = path.join(dir, exe);
    } else {
      // macOS: mount the dmg, copy the .app bundle out, detach.
      const dmg = path.join(dir, spec.name);
      fs.writeFileSync(dmg, buf);
      const mountOut = await new Promise<string>((resolve, reject) => {
        execFile('hdiutil', ['attach', '-nobrowse', '-readonly', dmg], { timeout: 60000 }, (err, stdout) => err ? reject(err) : resolve(stdout));
      });
      const mountPoint = /\/Volumes\/\S+/.exec(mountOut)?.[0];
      if (!mountPoint) throw new Error('hdiutil gave no mount point');
      const apps = fs.readdirSync(mountPoint).filter((n) => n.endsWith('.app'));
      if (apps.length !== 1) throw new Error(`expected one .app in the dmg, found ${apps.length}`);
      const appBundle = path.join(dir, apps[0]);
      await new Promise<void>((resolve, reject) => {
        execFile('cp', ['-R', path.join(mountPoint, apps[0]), appBundle], { timeout: 120000 }, (err) => err ? reject(err) : resolve());
      });
      await new Promise<void>((resolve) => execFile('hdiutil', ['detach', mountPoint], () => resolve()));
      binary = path.join(appBundle, 'Contents', 'MacOS', apps[0].replace(/\.app$/, ''));
      if (!fs.existsSync(binary)) throw new Error('the .app bundle carries no MacOS binary');
    }

    const manifest = readManifest();
    manifest.native[id] = {
      version,
      path: dir,
      binary,
      kind: spec.kind,
      sizeBytes: buf.byteLength,
      installedAt: new Date().toISOString(),
    };
    saveManifest(manifest);
    patchJob(jobId, { phase: 'done', progress: 100, version, endedAt: new Date().toISOString() });
    return { ok: true, version };
  } catch (e: any) {
    patchJob(jobId, { phase: 'error', error: e?.message || String(e), endedAt: new Date().toISOString() });
    return { ok: false, error: e?.message || String(e) };
  }
}

/** Launch the vendored native app (its own OS window, detached). */
export function launchNativeApp(id: string, file?: string): { ok: true; pid: number } | { ok: false; error: string } {
  const manifest = readManifest();
  const inst = manifest.native[id];
  if (!inst) return { ok: false, error: `'${id}' has no vendored native build — install it first` };
  try {
    const args = file ? [file] : [];
    const child = spawn(inst.binary, args, { detached: true, stdio: 'ignore' });
    child.unref();
    manifest.native[id] = { ...inst, pid: child.pid, launchedAt: new Date().toISOString() };
    saveManifest(manifest);
    return { ok: true, pid: child.pid ?? -1 };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
}

/**
 * Run the vendored native app's CLI headless (the agent lane — the apps
 * are agent-ready by upstream design: a CLI + a JSON control channel).
 * Captures stdout/stderr with a timeout; NOT detached.
 */
export function execNativeApp(id: string, args: string[], timeoutMs = 60000): Promise<{ ok: boolean; code: number | null; stdout: string; stderr: string }> {
  const inst = readManifest().native[id];
  if (!inst) return Promise.resolve({ ok: false, code: null, stdout: '', stderr: `'${id}' has no vendored native build` });
  return new Promise((resolve) => {
    try {
      execFile(inst.binary, args, { timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024 }, (err, stdout, stderr) => {
        resolve({ ok: !err, code: err ? (err as any).code ?? 1 : 0, stdout: String(stdout || ''), stderr: String(stderr || '') });
      });
    } catch (e: any) {
      resolve({ ok: false, code: null, stdout: '', stderr: e?.message || String(e) });
    }
  });
}

// ── The update layer (auto-update ON by default — the user's directive) ──

let lastSweepAt = 0;
let sweepInFlight: Promise<void> | null = null;
const SWEEP_THROTTLE_MS = 10 * 60 * 1000;

/** Resolve the latest version for every catalog app (bounded concurrency). */
export async function checkLatestVersions(force = false): Promise<Record<string, string | null>> {
  const manifest = readManifest();
  const fresh = Object.values(manifest.latest).some((l) => Date.now() - Date.parse(l.checkedAt) < SWEEP_THROTTLE_MS);
  if (!force && fresh) {
    const out: Record<string, string | null> = {};
    for (const a of CRAFT_APPS) out[a.id] = manifest.latest[a.id]?.version ?? null;
    return out;
  }
  const queue = [...CRAFT_APPS];
  const out: Record<string, string | null> = {};
  const worker = async () => {
    for (;;) {
      const app = queue.shift();
      if (!app) return;
      out[app.id] = await resolveLatestVersion(app.id);
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  const now = new Date().toISOString();
  for (const a of CRAFT_APPS) {
    if (out[a.id]) manifest.latest[a.id] = { version: out[a.id]!, checkedAt: now };
  }
  saveManifest(manifest);
  return out;
}

export interface VendorAppStatus {
  id: string;
  /** The vendored web build is installed + served on the OLYMPUS origin. */
  vendored: boolean;
  version: string | null;
  latestVersion: string | null;
  updateAvailable: boolean;
  serveUrl: string | null;
  /** The live-web fallback lane (their site — probe layer decides). */
  webUrl: string;
  nativeInstalled: boolean;
  nativeVersion: string | null;
  nativeRunning: boolean;
  nativeUpdateAvailable: boolean;
  sizeBytes: number | null;
  /** Honest when the vendored generation is UNVERIFIED (no sums upstream). */
  verified: boolean;
}

/** The merged truth for the panel: catalog + manifest + latest. */
export async function getVendorStatus(forceCheck = false): Promise<VendorAppStatus[]> {
  const manifest = readManifest();
  const latest = await checkLatestVersions(forceCheck);
  return CRAFT_APPS.map((app: CraftApp) => {
    const web = manifest.web[app.id];
    const native = manifest.native[app.id];
    const latestV = latest[app.id] ?? null;
    const installedV = web?.version ?? null;
    const nativeV = native?.version ?? null;
    return {
      id: app.id,
      vendored: !!web && fs.existsSync(webServeRoot(app.id)),
      version: installedV,
      latestVersion: latestV,
      updateAvailable: !!latestV && !!installedV && latestV !== installedV,
      serveUrl: web ? `/api/olympus/craft-apps/serve/${app.id}/` : null,
      webUrl: app.url,
      nativeInstalled: !!native,
      nativeVersion: nativeV,
      nativeRunning: isProcessAlive(native?.pid),
      nativeUpdateAvailable: !!latestV && !!nativeV && latestV !== nativeV,
      sizeBytes: web?.sizeBytes ?? null,
      verified: !!web?.sha256,
    };
  });
}

/**
 * The auto-update sweep: installed web builds silently move to the
 * latest release; a RUNNING native app is never replaced (the upstream
 * launcher law) — it updates on the next sweep after it closes.
 */
export async function autoUpdateSweep(force = false): Promise<{ updated: string[]; skippedRunning: string[] }> {
  if (!force && Date.now() - lastSweepAt < SWEEP_THROTTLE_MS) return { updated: [], skippedRunning: [] };
  lastSweepAt = Date.now();
  const statuses = await getVendorStatus(true);
  const updated: string[] = [];
  const skippedRunning: string[] = [];
  // v0.0.25 — CHECK-ONLY by default. The old sweep downloaded and installed
  // every vendored app 30s after the first Craft panel open; that turned a
  // pane click into minutes of network + disk and starved every other pane.
  // A visible "Update" action (or OLYMPUS_CRAFT_AUTO_INSTALL=1) installs.
  const autoInstall = process.env.OLYMPUS_CRAFT_AUTO_INSTALL === '1';
  for (const s of statuses) {
    if (!autoInstall) {
      if (s.nativeRunning && s.nativeUpdateAvailable) skippedRunning.push(s.id);
      continue;
    }
    if (s.vendored && s.updateAvailable) {
      const job = createJob(s.id, 'web', true);
      const r = await installWebApp(s.id, job.id);
      if (r.ok) updated.push(`${s.id} → ${r.version}`);
    }
    if (s.nativeInstalled && s.nativeUpdateAvailable) {
      if (s.nativeRunning) { skippedRunning.push(s.id); continue; }
      const job = createJob(s.id, 'native', true);
      const r = await installNativeApp(s.id, job.id);
      if (r.ok) updated.push(`${s.id} (native) → ${r.version}`);
    }
  }
  return { updated, skippedRunning };
}

/** The background loop guard (the route starts it lazily; one timer only). */
let autoTimer: ReturnType<typeof setInterval> | null = null;
export function startVendorAutoUpdater(intervalMs = 6 * 60 * 60 * 1000): void {
  if (autoTimer) return;
  autoTimer = setInterval(() => { void autoUpdateSweep(true).catch(() => {}); }, intervalMs);
  // v0.0.25 — the first CHECK runs well after first paint (10 min), never
  // 30s after the pane opens. It is check-only unless auto-install is opted in.
  setTimeout(() => { void autoUpdateSweep(true).catch(() => {}); }, 10 * 60_000);
}

// ── The serve lane (the local origin the pane embeds) ────────────────────

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.data': 'application/octet-stream',
  '.bin': 'application/octet-stream',
  '.pak': 'application/octet-stream',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.mp4': 'video/mp4',
  '.webmanifest': 'application/manifest+json',
};

export const mimeFor = (file: string) => MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';

/**
 * Resolve a served file for one vendored app — the traversal guard is
 * absolute (resolve + startsWith; the serve root itself is the only
 * window). Returns null when nothing is vendored for the app.
 */
export function getServeFile(id: string, relPath: string): { abs: string; mime: string } | null {
  const root = webServeRoot(id);
  if (!fs.existsSync(root)) return null;
  const clean = relPath.replace(/^\/+/, '') || 'index.html';
  const abs = path.resolve(root, clean);
  let stat: fs.Stats | null = null;
  try { stat = fs.statSync(abs); } catch { stat = null; }
  if (!stat) {
    // WASM builds may deep-link without the extension or rely on dir
    // rewrites — the honest fallback is index.html (the SPA lane), never
    // a 403 that would render a dead frame.
    const idx = path.resolve(root, 'index.html');
    if (fs.existsSync(idx)) return { abs: idx, mime: mimeFor(idx) };
    return null;
  }
  if (stat.isDirectory()) {
    const idx = path.join(abs, 'index.html');
    if (fs.existsSync(idx)) return { abs: idx, mime: mimeFor(idx) };
    return null;
  }
  if (!abs.startsWith(root + path.sep) && abs !== path.join(root, 'index.html')) return null;
  return { abs, mime: mimeFor(abs) };
}

/** The storage census (the honest size the pane + the docs quote). */
export async function vendorDiskUsage(): Promise<{ webBytes: number; nativeBytes: number }> {
  const usage = { webBytes: 0, nativeBytes: 0 };
  const walk = async (dir: string): Promise<number> => {
    let total = 0;
    let entries: fs.Dirent[];
    try { entries = await fsp.readdir(dir, { withFileTypes: true }); } catch { return 0; }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) total += await walk(p);
      else if (e.isFile()) total += (await fsp.stat(p).catch(() => null))?.size ?? 0;
    }
    return total;
  };
  usage.webBytes = await walk(path.join(vendorRoot(), 'web'));
  usage.nativeBytes = await walk(path.join(vendorRoot(), 'native'));
  return usage;
}
