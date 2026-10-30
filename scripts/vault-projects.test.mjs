#!/usr/bin/env node
/**
 * vault-projects.test.mjs — PROJECTS LIVE IN THE VAULT (v0.0.24).
 *
 * The pinned directive: every project home, artifact, plan and decision is
 * under ~/OLYMPUS-VAULT/02_Projects/<slug>. The legacy ~/.local/share lane is
 * migrated, not silently preferred.
 *
 *   V1  workspaceLaneDir() defaults to <vault>/02_Projects
 *   V2  resolveProjectHome / resolveDispatchCwd stay inside the vault
 *   V3  resolveWorkspaceLane uses the ACTIVE project home
 *   V4  createProject imports an outside folder into the vault home
 *   V5  the migration dry-run writes nothing; --apply moves + archives
 *   V6  a project is never created inside the OLYMPUS repo
 *
 * Run: npx tsx scripts/vault-projects.test.mjs (exit 0)
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SELF = path.join(ROOT, 'scripts', 'vault-projects.test.mjs');
let passed = 0, failures = 0;
function expect(name, cond, detail) {
  if (cond) { passed++; console.log(`PASS  ${name}`); }
  else { failures++; console.log(`FAIL  ${name}${detail ? ' — ' + String(detail).slice(0, 320) : ''}`); }
}

const WORK = path.join(os.tmpdir(), 'olympus-vault-projects');

if (process.argv[2] === 'child') {
  // Env is set by the parent; import AFTER it so getVaultRoot caches the tmp vault.
  const { workspaceLaneDir, resolveProjectHome, resolveDispatchCwd, resolveWorkspaceLane } = await import('../src/lib/opencode-spawn.ts');
  const { createProject } = await import('../src/lib/project-context.ts');
  const out = {
    laneRoot: workspaceLaneDir(),
    home: resolveProjectHome('demo-project'),
    dispatch: resolveDispatchCwd('demo-project'),
    workspace: resolveWorkspaceLane().dir,
  };
  // V4 — import an outside folder.
  const source = path.join(process.env.HOME, 'outside-src');
  fs.mkdirSync(source, { recursive: true });
  fs.writeFileSync(path.join(source, 'README.md'), '# imported\n');
  fs.mkdirSync(path.join(source, 'node_modules'), { recursive: true });
  fs.writeFileSync(path.join(source, 'node_modules', 'junk.txt'), 'skip me\n');
  const created = createProject({ name: 'demo-project', path: source, description: 'fixture' });
  out.createdPath = created.project.path;
  out.imported = fs.existsSync(path.join(created.project.path, 'README.md'));
  out.skippedHeavy = !fs.existsSync(path.join(created.project.path, 'node_modules', 'junk.txt'));
  out.notePath = fs.readFileSync(path.join(created.project.path, 'project.md'), 'utf-8').match(/^path:\s*(.*)$/m)?.[1] ?? null;
  // V6 — inside the fake OLYMPUS root must throw.
  out.insideRootRejected = (() => {
    try { createProject({ name: 'repo-project', path: process.env.OLYMPUS_ROOT }); return false; }
    catch { return true; }
  })();
  fs.writeFileSync(path.join(process.env.HOME, 'child-result.json'), JSON.stringify(out));
  process.exit(0);
}

// ── the parent fixture ────────────────────────────────────────────────────
fs.rmSync(WORK, { recursive: true, force: true });
const fakeRoot = path.join(WORK, 'fake-root');
const vault = path.join(WORK, 'vault');
const home = path.join(WORK, 'home');
for (const d of [fakeRoot, vault, home, path.join(vault, '02_Projects')]) fs.mkdirSync(d, { recursive: true });
fs.writeFileSync(path.join(fakeRoot, 'opencode.json'), JSON.stringify({ agent: {} }));
fs.mkdirSync(path.join(home, '.olympus'), { recursive: true });
fs.writeFileSync(path.join(home, '.olympus', 'active-project.json'), JSON.stringify({ slug: 'active-project' }));
fs.mkdirSync(path.join(vault, '02_Projects', 'active-project'), { recursive: true });

const env = {
  ...process.env,
  HOME: home,
  OLYMPUS_ROOT: fakeRoot,
  OLYMPUS_VAULT: vault,
  OLYMPUS_HOME: path.join(home, '.olympus'),
  OLYMPUS_WORKSPACE: '',
};
const child = spawnSync('npx', ['tsx', SELF, 'child'], { encoding: 'utf-8', cwd: ROOT, timeout: 180_000, env });
if (child.status !== 0) {
  console.log('FAIL  the child ran', child.stdout?.slice(-500), child.stderr?.slice(-800));
  failures++;
} else {
  const R = JSON.parse(fs.readFileSync(path.join(home, 'child-result.json'), 'utf-8'));
  expect('V1 workspaceLaneDir defaults to <vault>/02_Projects', R.laneRoot === path.join(vault, '02_Projects'), R.laneRoot);
  expect('V2 resolveProjectHome is inside the vault', R.home === path.join(vault, '02_Projects', 'demo-project'), R.home);
  expect('V2 resolveDispatchCwd is inside the vault', String(R.dispatch).startsWith(path.join(vault, '02_Projects')), R.dispatch);
  expect('V3 resolveWorkspaceLane uses the active project home', R.workspace === path.join(vault, '02_Projects', 'active-project'), R.workspace);
  expect('V4 createProject lands in the vault home', R.createdPath === path.join(vault, '02_Projects', 'demo-project'), R.createdPath);
  expect('V4 the outside tree is imported', R.imported === true);
  expect('V4 heavy build dirs are skipped', R.skippedHeavy === true);
  expect('V4 project.md path points at the vault home', R.notePath === path.join(vault, '02_Projects', 'demo-project'), R.notePath);
  expect('V6 a project inside the OLYMPUS root is refused', R.insideRootRejected === true);
}

// ── V5 — migration ─────────────────────────────────────────────────────────
{
  const legacy = path.join(home, '.local', 'share', 'olympus', 'workspace');
  const vault2 = path.join(WORK, 'vault2');
  fs.rmSync(legacy, { recursive: true, force: true });
  fs.rmSync(vault2, { recursive: true, force: true });
  fs.mkdirSync(path.join(legacy, 'new-project'), { recursive: true });
  fs.writeFileSync(path.join(legacy, 'new-project', 'README.md'), '# new\n');
  fs.mkdirSync(path.join(legacy, 'both-project'), { recursive: true });
  fs.writeFileSync(path.join(legacy, 'both-project', 'old.txt'), 'old\n');
  fs.mkdirSync(path.join(vault2, '02_Projects', 'both-project'), { recursive: true });
  fs.writeFileSync(path.join(vault2, '02_Projects', 'both-project', 'project.md'), '---\ntype: project\nslug: both-project\npath: /old\n---\n');
  const migEnv = { ...process.env, HOME: home, OLYMPUS_VAULT: vault2, OLYMPUS_WORKSPACE: legacy };
  const script = path.join(ROOT, 'scripts', 'migrate-projects-to-vault.mjs');

  const dry = spawnSync('node', [script], { encoding: 'utf-8', env: migEnv });
  expect('V5 dry run reports the move', /move|archive-legacy/.test(dry.stdout), dry.stdout);
  expect('V5 dry run does not move anything', fs.existsSync(path.join(legacy, 'new-project')));

  const applied = spawnSync('node', [script, '--apply'], { encoding: 'utf-8', env: migEnv });
  expect('V5 apply moves the new project', fs.existsSync(path.join(vault2, '02_Projects', 'new-project', 'README.md')), applied.stdout);
  expect('V5 the move keeps the vault home canonical on collision', fs.existsSync(path.join(vault2, '02_Projects', 'both-project', 'project.md')));
  expect('V5 the legacy collision is archived', fs.existsSync(path.join(legacy, '_migrated')), applied.stdout);
  expect('V5 the legacy code is merged into the vault home (no clobber)', fs.existsSync(path.join(vault2, '02_Projects', 'both-project', 'old.txt')) && fs.readFileSync(path.join(vault2, '02_Projects', 'both-project', 'project.md'), 'utf-8').includes('slug: both-project'));
}

console.log(`\nvault-projects: ${passed} passed, ${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
