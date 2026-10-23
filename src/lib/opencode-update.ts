/**
 * opencode-update — the OLYMPUS-side OpenCode v2 update lane (#212).
 *
 * The vendored CLI is pinned in package.json and every OLYMPUS-spawned
 * process carries OPENCODE_DISABLE_AUTOUPDATE=1 (the v2 CLI otherwise
 * restarts itself mid-flight — the #147 specimen). Updates are therefore
 * OLYMPUS-controlled: this module compares the INSTALLED version against
 * the npm `latest` tag and reports honestly. It never claims "up to date"
 * when the registry could not be reached.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import fs from 'node:fs';
import path from 'node:path';

export interface OpencodeUpdateStatus {
  ok: boolean;
  installed: string | null;
  latest: string | null;
  updateAvailable: boolean;
  checkedAt: string;
  source: 'cache' | 'registry' | 'unavailable';
  error?: string;
  applyCommand: string;
}

const REGISTRY_URL = 'https://registry.npmjs.org/@opencode%2Fcli/latest';
const CACHE_TTL_MS = 60 * 60 * 1000;
const FAILURE_TTL_MS = 5 * 60 * 1000;
const APPLY_COMMAND = 'npm install @opencode/cli@latest @opencode/plugin@latest';

let cache: { status: OpencodeUpdateStatus; at: number } | null = null;

/** Test seam: forget the memoized registry answer. */
export function resetOpencodeUpdateCache(): void {
  cache = null;
}

/** Compare two semver-ish versions. Returns <0, 0, >0. */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string) => {
    const [core, pre] = String(v || '').trim().replace(/^v/, '').split('-', 2);
    const nums = core.split('.').map((n) => parseInt(n, 10) || 0);
    while (nums.length < 3) nums.push(0);
    return { nums: nums.slice(0, 3), pre: pre ?? null };
  };
  const av = parse(a);
  const bv = parse(b);
  for (let i = 0; i < 3; i++) {
    if (av.nums[i] !== bv.nums[i]) return av.nums[i] - bv.nums[i];
  }
  if (av.pre === bv.pre) return 0;
  if (av.pre === null) return 1;
  if (bv.pre === null) return -1;
  return av.pre.localeCompare(bv.pre);
}

/** The installed @opencode/cli version (node_modules first, manifest fallback). */
export function readInstalledOpencodeVersion(root: string = process.cwd()): string | null {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'node_modules', '@opencode', 'cli', 'package.json'), 'utf-8'));
    if (typeof pkg?.version === 'string') return pkg.version;
  } catch { /* fall through to the manifest */ }
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf-8'));
    const dep = manifest?.dependencies?.['@opencode/cli'];
    if (typeof dep === 'string') return dep.replace(/^[~^]/, '');
  } catch { /* unknown */ }
  return null;
}

/** The npm `latest` tag for @opencode/cli (bounded, honest on failure). */
export async function fetchLatestOpencodeVersion(opts?: {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Promise<string> {
  const fetchImpl = opts?.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts?.timeoutMs ?? 4_000);
  try {
    const res = await fetchImpl(REGISTRY_URL, {
      signal: controller.signal,
      headers: { accept: 'application/json' },
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`registry HTTP ${res.status}`);
    const data = await res.json();
    const version = data?.version;
    if (typeof version !== 'string' || !version.trim()) throw new Error('registry returned no version');
    return version.trim();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Check the update lane. Memoized for an hour on success (five minutes on
 * failure, so a transient registry outage is retried) — `force` bypasses.
 */
export async function checkOpencodeUpdate(opts?: {
  root?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  force?: boolean;
}): Promise<OpencodeUpdateStatus> {
  const now = Date.now();
  if (!opts?.force && cache) {
    const ttl = cache.status.ok ? CACHE_TTL_MS : FAILURE_TTL_MS;
    if (now - cache.at < ttl) return { ...cache.status, source: 'cache' };
  }
  const installed = readInstalledOpencodeVersion(opts?.root);
  const checkedAt = new Date().toISOString();
  try {
    const latest = await fetchLatestOpencodeVersion(opts);
    const updateAvailable = !!installed && compareVersions(latest, installed) > 0;
    const status: OpencodeUpdateStatus = {
      ok: true,
      installed,
      latest,
      updateAvailable,
      checkedAt,
      source: 'registry',
      applyCommand: APPLY_COMMAND,
    };
    cache = { status, at: now };
    return status;
  } catch (e: any) {
    const status: OpencodeUpdateStatus = {
      ok: false,
      installed,
      latest: null,
      updateAvailable: false,
      checkedAt,
      source: 'unavailable',
      error: e?.message || String(e),
      applyCommand: APPLY_COMMAND,
    };
    cache = { status, at: now };
    return status;
  }
}
