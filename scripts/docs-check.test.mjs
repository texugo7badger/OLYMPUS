#!/usr/bin/env node
/**
 * docs-check.test.mjs — v0.0.72.
 *
 * The docs gate must pass on a coherent set and FAIL on the two drifts the
 * v3 analysis found: a version that lags the code and a refuted 97% claim.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

let failures = 0;
function expect(name, cond, detail) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : ' — ' + String(detail).slice(0, 240)}`);
  if (!cond) failures++;
}

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'olympus-docs-'));
const V = '9.9.9';
const write = (rel, body) => {
  const file = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, body);
};
const base = () => {
  write('VERSION', V + '\n');
  write('package.json', JSON.stringify({ version: V }));
  write('src/components/olympus/status-bar.tsx', `const v = process.env.NEXT_PUBLIC_VERSION || '${V}';\n`);
  write('README.md', `# OLYMPUS\n\n## Latest\n\n**v${V} — the honest release.**\n`);
  write('CHANGELOG.md', `# Changelog\n\n## [v${V}] — 2026-11-04\n\n- shipped.\n`);
  write('ROADMAP.md', `# Roadmap\n\n**v${V} is the current release**.\n`);
  write('STABILITY.md', `# Stability\n\n> v${V} · the harness.\n`);
  write('TOKEN-ECONOMY.md', '# Token Economy\n\nMeasured tokens/hop; invoice unknown.\n');
};
const run = () => {
  try {
    execFileSync(process.execPath, [path.join(process.cwd(), 'scripts', 'docs-check.mjs'), '--root', ROOT], { stdio: 'pipe' });
    return { code: 0, out: '' };
  } catch (e) {
    return { code: e.status ?? 1, out: String(e.stdout ?? '') + String(e.stderr ?? '') };
  }
};

base();
const ok = run();
expect('DC-1: a coherent doc set passes', ok.code === 0, ok.out);

write('CHANGELOG.md', '# Changelog\n\n## [v0.0.1] — old\n');
const stale = run();
expect('DC-2: a missing changelog entry fails', stale.code === 1 && /D-4/.test(stale.out), stale.out);

base();
write('TOKEN-ECONOMY.md', '# Token Economy\n\nThat is a 97% input reduction.\n');
const claim = run();
expect('DC-3: the refuted 97% claim fails the gate', claim.code === 1 && /D-7/.test(claim.out), claim.out);

base();
write('README.md', '# OLYMPUS\n\n## Latest\n\n**v0.0.1 — old.**\n');
const readme = run();
expect('DC-4: a README lagging the version fails', readme.code === 1 && /D-3/.test(readme.out), readme.out);

base();
write('src/components/olympus/status-bar.tsx', "const v = process.env.X || '0.0.1';\n");
const bar = run();
expect('DC-5: a stale status-bar fallback fails', bar.code === 1 && /D-2/.test(bar.out), bar.out);

fs.rmSync(ROOT, { recursive: true, force: true });
console.log(`\ndocs-check: ${failures === 0 ? 'PASS' : failures + ' FAIL'}`);
process.exit(failures === 0 ? 0 : 1);
