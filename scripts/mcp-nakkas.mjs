#!/usr/bin/env node
/**
 * mcp-nakkas.mjs — v0.0.29: the Nakkas MCP launcher that actually boots.
 *
 * Nakkas 0.5.0 depends on `@resvg/resvg-js`, whose native binary ships as an
 * OPTIONAL platform package. `npx -y nakkas@latest` frequently resolves the
 * JS wrapper without that optional dep, and the server dies on boot with:
 *
 *   code: 'MODULE_NOT_FOUND'
 *   path: '.../@resvg/resvg-js-linux-x64-gnu/package.json'
 *
 * This launcher pins nakkas AND the platform package into the SAME npx
 * environment (`-p <pkg>` twice), so `require('@resvg/resvg-js')` finds its
 * native binding. Stdio is inherited untouched (the MCP transport).
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { spawn } from 'node:child_process';

const NAKKAS_VERSION = process.env.OLYMPUS_NAKKAS_VERSION || '0.5.0';
const RESVG_VERSION = process.env.OLYMPUS_RESVG_VERSION || '2.6.2';

function resvgPackage() {
  const { platform, arch } = process;
  const musl = platform === 'linux' && !process.report?.getReport?.()?.header?.glibcVersionRuntime;
  const key = `${platform}-${arch}${musl ? '-musl' : ''}`;
  const map = {
    'linux-x64': '@resvg/resvg-js-linux-x64-gnu',
    'linux-x64-musl': '@resvg/resvg-js-linux-x64-musl',
    'linux-arm64': '@resvg/resvg-js-linux-arm64-gnu',
    'linux-arm64-musl': '@resvg/resvg-js-linux-arm64-musl',
    'linux-arm': '@resvg/resvg-js-linux-arm-gnueabihf',
    'darwin-x64': '@resvg/resvg-js-darwin-x64',
    'darwin-arm64': '@resvg/resvg-js-darwin-arm64',
    'win32-x64': '@resvg/resvg-js-win32-x64-msvc',
    'win32-ia32': '@resvg/resvg-js-win32-ia32-msvc',
    'win32-arm64': '@resvg/resvg-js-win32-arm64-msvc',
    'android-arm64': '@resvg/resvg-js-android-arm64',
  };
  return map[key] ?? null;
}

const pkg = resvgPackage();
const args = ['-y', '-p', `nakkas@${NAKKAS_VERSION}`];
if (pkg) args.push('-p', `${pkg}@${RESVG_VERSION}`);
args.push('nakkas');

const child = spawn('npx', args, { stdio: 'inherit', env: process.env });
child.on('error', (e) => {
  process.stderr.write(`[mcp-nakkas] could not launch npx: ${e?.message || e}\n`);
  process.exit(1);
});
child.on('exit', (code, signal) => {
  process.exit(code ?? (signal ? 1 : 0));
});
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => { try { child.kill(sig); } catch { /* gone */ } });
}
