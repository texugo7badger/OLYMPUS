#!/usr/bin/env node
/**
 * lane-config-sync.test.mjs — #LANE-DRIFT: the lane-copy refresh doctrine,
 * asserted as code. Run: npx tsx scripts/lane-config-sync.test.mjs
 *
 * THE SPECIMEN (2026-10-16, the Lumina re-test failure): the interactive
 * planning dispatch rode `nvidia/nvidia/nemotron-3-ultra-550b-a55b` — the
 * BANNED lane — because the #99 workspace lane's opencode.json was a
 * 9-day-old fossil. The copies were CREATED-IF-MISSING, never refreshed
 * ("refresh semantics belong to the #78 drift-detector class" — a class
 * that never fired for lanes). Two rotations updated the root config; the
 * lane never followed; the dispatch hung on the dead pool, burned three
 * transport retries, and died at the 15-minute max runtime with zero
 * tokens out.
 *
 * THE DOCTRINE (this suite's law): lane copies MIRROR the root.
 *   1. syncLaneFile: created / refreshed-on-drift / in-sync — byte-exact.
 *   2. ensureLaneConfig (the walker lane): a stale lane copy is REFRESHED,
 *      never ridden.
 *   3. resolveWorkspaceLane (the interactive lane): both copies flow
 *      through the same sync — the created-if-missing loop is GONE.
 *   4. The call-site tripwires: both call sites USE syncLaneFile (a revert
 *      to created-if-missing fails this suite loudly).
 *   5. The live workspace lane heals: calling resolveWorkspaceLane() syncs
 *      the real lane; afterwards the lane files are byte-identical to the
 *      root's (the battery self-heals the surface it asserts).
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');

let failures = 0;
let checked = 0;
function check(name, ok, detail = '') {
  checked++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  -- ${detail}`}`);
  if (!ok) failures++;
}

const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');

// ── 1. syncLaneFile: the verdict table ───────────────────────────────────────
const { syncLaneFile } = await import(join(ROOT, 'src', 'lib', 'lane-config.ts'));
{
  const lane = join(tmpdir(), `olympus-lane-sync-${Math.random().toString(36).slice(2, 9)}`);
  mkdirSync(lane, { recursive: true });
  const src = join(lane, 'root-opencode.json');
  const dst = join(lane, 'lane-opencode.json');
  writeFileSync(src, '{"v": "the current strategy"}');

  check('syncLaneFile: created when dst absent',
    syncLaneFile(src, dst) === 'created' && existsSync(dst),
    `verdict=${syncLaneFile(src, dst)}`);
  check('syncLaneFile: in-sync when byte-identical',
    syncLaneFile(src, dst) === 'in-sync', 'identical files reported drifted');
  // THE SPECIMEN: a stale fossil under the lane, the root rotated twice.
  writeFileSync(dst, '{"v": "the 2026-10-07 nemotron fossil"}');
  check('syncLaneFile: refreshed on drift (the fossil is overwritten)',
    syncLaneFile(src, dst) === 'refreshed' && sha(src) === sha(dst),
    'drifted dst was left in place');
  check('syncLaneFile: missing-source never crashes',
    syncLaneFile(join(lane, 'no-such-file.json'), join(lane, 'dst-or-not.json')) === 'missing-source',
    'missing src should return missing-source, not throw');
  rmSync(lane, { recursive: true, force: true });
}

// ── 2. ensureLaneConfig: the walker lane heals a stale copy ─────────────────
{
  const { ensureLaneConfig } = await import(join(ROOT, 'src', 'lib', 'hop-runtime', 'walker.ts'));
  const lane = join(tmpdir(), `olympus-lane-walk-${Math.random().toString(36).slice(2, 9)}`);
  mkdirSync(lane, { recursive: true });
  // THE SPECIMEN: a lane bootstrapped in an earlier era, never refreshed.
  writeFileSync(join(lane, 'opencode.json'), '{"agent":{"apollo":{"model":"nvidia/nvidia/nemotron-3-ultra-550b-a55b"}}}');
  ensureLaneConfig(lane);
  const rootCfg = sha(join(ROOT, 'opencode.json'));
  const laneCfg = sha(join(lane, 'opencode.json'));
  check('ensureLaneConfig: a stale walker lane opencode.json is REFRESHED to the root\'s',
    laneCfg === rootCfg,
    'lane still carries a fossil config');
  check('ensureLaneConfig: the demigods registry is in sync',
    sha(join(lane, 'opencode.demigods.json')) === sha(join(ROOT, 'opencode.demigods.json')),
    'demigods copy drifted');
  check('ensureLaneConfig: the .opencode symlink exists (the {file:...} resolution lane)',
    existsSync(join(lane, '.opencode')),
    'the .opencode symlink is missing');
  // Idempotence: a second pass is a no-op (in-sync, not refreshed).
  const before = sha(join(lane, 'opencode.json'));
  ensureLaneConfig(lane);
  check('ensureLaneConfig: idempotent (second pass, same bytes)',
    sha(join(lane, 'opencode.json')) === before,
    'second pass mutated the lane');
  rmSync(lane, { recursive: true, force: true });
}

// ── 3. The call-site tripwires: created-if-missing must be GONE ─────────────
{
  const spawnSrc = readFileSync(join(ROOT, 'src', 'lib', 'opencode-spawn.ts'), 'utf-8');
  const walkerSrc = readFileSync(join(ROOT, 'src', 'lib', 'hop-runtime', 'walker.ts'), 'utf-8');
  check('tripwire: resolveWorkspaceLane flows through syncLaneFile (the #99 lane)',
    /syncLaneFile\(\s*join\(root, f\),\s*join\(dir, f\)\s*\)/.test(spawnSrc),
    'the workspace lane copies reverted to created-if-missing');
  check('tripwire: no created-if-missing copy loop left in opencode-spawn.ts',
    !/existsSync\(dst\)/.test(spawnSrc),
    'a raw created-if-missing copy survived in the spawn lane');
  check('tripwire: ensureLaneConfig flows through syncLaneFile (the walker lane)',
    /syncLaneFile\(join\(root, 'opencode\.json'\), dst\)/.test(walkerSrc)
      && /syncLaneFile\(join\(root, 'opencode\.demigods\.json'\), dstDemigods\)/.test(walkerSrc),
    'the walker lane copies reverted to created-if-missing');
  check('tripwire: no created-if-missing copy loop left in walker.ts',
    !/existsSync\(dst\)/.test(walkerSrc),
    'a raw created-if-missing copy survived in the walker');
}

// ── 4. The live workspace lane heals (the real surface, self-healed) ────────
{
  const { resolveWorkspaceLane } = await import(join(ROOT, 'src', 'lib', 'opencode-spawn.ts'));
  const lane = resolveWorkspaceLane();
  check('live: the workspace lane opencode.json is byte-identical to the root\'s',
    sha(join(lane.dir, 'opencode.json')) === sha(join(ROOT, 'opencode.json')),
    'the interactive lane still carries a drifted config — the next dispatch rides a fossil');
  check('live: the workspace lane demigods registry is byte-identical to the root\'s',
    sha(join(lane.dir, 'opencode.demigods.json')) === sha(join(ROOT, 'opencode.demigods.json')),
    'the interactive lane carries a drifted demigods registry');
  check('live: the lane pins NO banned lane (zero nemotron in the god map)',
    !/nemotron/i.test(readFileSync(join(lane.dir, 'opencode.json'), 'utf-8')),
    'the interactive lane still names a nemotron id — the user\'s ban is violated on the dispatch surface');
}

console.log('');
if (failures > 0) {
  console.error(`lane-config-sync: ${failures} violation(s) — the lane-mirror doctrine is NOT in effect`);
  process.exit(1);
}
console.log(`lane-config-sync: all ${checked} lane-mirror assertions passed (the lane mirrors the root, drift heals loudly)`);
