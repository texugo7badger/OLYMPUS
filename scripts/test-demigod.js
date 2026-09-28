#!/usr/bin/env node
/**
 * olympus test demigod — run a demigod prompt's frontmatter tests.
 *

 *
 * Demigod prompts support optional frontmatter with version + tests:
 *
 *   ---
 *   version: "1.0.0"
 *   tests:
 *     - input: "Plan a React feature"
 *       expectDispatch: "athena→frontend-reviewer"
 *       minConfidence: 0.8
 *       maxTokens: 5000
 *     - input: "Review a Vue component"
 *       expectDispatch: "athena→frontend-reviewer"
 *       minConfidence: 0.7
 *   ---
 *   # Athena — Frontend Specialist
 *   ...
 *
 * This script:
 *   1. Finds the demigod prompt by name (e.g. "frontend-reviewer").
 *   2. Parses the frontmatter for `tests`.
 *   3. For each test: spawns `opencode run --format json --auto "<input>"`
 *      with the demigod's parent god as the active agent.
 *   4. Captures the dispatch graph + token cost + confidence.
 *   5. Checks whether `expectDispatch` matches the actual dispatches.
 *   6. Reports pass/fail per test + an aggregate summary.
 *
 * Usage:
 *   olympus test demigod frontend-reviewer
 *   olympus test demigod frontend-reviewer --verbose
 *   olympus test demigod frontend-reviewer --timeout 60000
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const OLYMPUS_ROOT = join(__dirname, '..', '..');
const DEMIGODS_ROOT = join(OLYMPUS_ROOT, '.opencode', 'prompts', 'agents', 'demigods');

const args = process.argv.slice(2);
const demigodName = args.find(a => !a.startsWith('--'));
const VERBOSE = args.includes('--verbose');
const timeoutMs = parseInt(args[args.indexOf('--timeout') + 1] || '60000', 10);

function log(msg) { console.log(`[test:demigod] ${msg}`); }
function ok(msg) { console.log(`[test:demigod] ✓ ${msg}`); }
function warn(msg) { console.warn(`[test:demigod] ! ${msg}`); }
function err(msg) { console.error(`[test:demigod] X ${msg}`); }

// ─── Find the demigod prompt ─────────────────────────────────────────────────

function findDemigodPrompt(name) {
  // Search .opencode/prompts/agents/demigods/<god>/<name>.txt
  if (!existsSync(DEMIGODS_ROOT)) {
    err(`Demigods directory not found: ${DEMIGODS_ROOT}`);
    process.exit(1);
  }
  for (const god of readdirSync(DEMIGODS_ROOT, { withFileTypes: true })) {
    if (!god.isDirectory()) continue;
    const godDir = join(DEMIGODS_ROOT, god.name);
    // Try exact match: <name>.txt
    const exactPath = join(godDir, `${name}.txt`);
    if (existsSync(exactPath)) {
      return { path: exactPath, god: god.name, name };
    }
    // Try with underscores: <name_with_underscores>.txt
    const underscorePath = join(godDir, `${name.replace(/-/g, '_')}.txt`);
    if (existsSync(underscorePath)) {
      return { path: underscorePath, god: god.name, name };
    }
  }
  err(`Demigod "${name}" not found in ${DEMIGODS_ROOT}`);
  err(`Searched all god subdirectories for ${name}.txt and ${name.replace(/-/g, '_')}.txt`);
  process.exit(1);
}

// ─── Parse frontmatter ───────────────────────────────────────────────────────

function parseFrontmatter(content) {
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n/);
  if (!fmMatch) return { frontmatter: null, body: content };
  const fmText = fmMatch[1];
  const body = content.slice(fmMatch[0].length);
  // Simple YAML parser (handles the subset we use: version + tests array).
  const frontmatter = { version: null, tests: [] };
  const versionMatch = fmText.match(/^version:\s*"?([^"\n]+)"?$/m);
  if (versionMatch) frontmatter.version = versionMatch[1].trim();
  // Parse tests array — each test starts with "- input:" and subsequent
  // indented lines are key: value pairs.
  const testBlocks = fmText.split(/^\s*-\s+input:/m).slice(1);
  for (const block of testBlocks) {
    const test = { input: block.split('\n')[0].trim().replace(/^["']|["']$/g, '') };
    const lines = block.split('\n').slice(1);
    for (const line of lines) {
      const m = line.match(/^\s+(\w+):\s*(.+)$/);
      if (!m) continue;
      const [, key, value] = m;
      if (key === 'expectDispatch') {
        test.expectDispatch = value.trim().replace(/^["']|["']$/g, '');
      } else if (key === 'minConfidence') {
        test.minConfidence = parseFloat(value);
      } else if (key === 'maxTokens') {
        test.maxTokens = parseInt(value, 10);
      }
    }
    frontmatter.tests.push(test);
  }
  return { frontmatter, body };
}

// ─── Run a single test ──────────────────────────────────────────────────────

function runTest(test, god, demigodName) {
  const startTime = Date.now();
  const events = [];
  let stdout = '';

  const opencodeBin = join(OLYMPUS_ROOT, 'node_modules', '.bin', 'opencode');
  if (!existsSync(opencodeBin)) {
    return { ok: false, error: `opencode binary not found at ${opencodeBin}`, duration: 0 };
  }

  return new Promise((resolve) => {
    let timedOut = false;
    const child = spawn(opencodeBin, ['run', '--format', 'json', '--auto', test.input, '--agent', god], {
      cwd: OLYMPUS_ROOT,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    const timer = setTimeout(() => {
      timedOut = true;
      try { child.kill('SIGTERM'); } catch {}
      setTimeout(() => { try { child.kill('SIGKILL'); } catch {} }, 5000);
    }, timeoutMs);

    child.stdout?.on('data', (chunk) => {
      stdout += chunk.toString();
      const lines = stdout.split('\n');
      stdout = lines.pop() || '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try { events.push(JSON.parse(trimmed)); } catch {}
      }
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      const duration = Date.now() - startTime;
      if (stdout.trim()) { try { events.push(JSON.parse(stdout.trim())); } catch {} }

      // Extract dispatches from the events.
      const dispatches = [];
      let tokenCount = 0;
      let confidence = null;
      for (const ev of events) {
        if (ev.type === 'tool-call' || ev.type === 'tool_call') {
          dispatches.push(ev.tool || ev.name || 'unknown');
        }
        if (ev.type === 'olympus-dispatch') {
          dispatches.push(`${ev.god}→${ev.demigod}`);
        }
        if (ev.part?.tokens) tokenCount += ev.part.tokens;
        else if (ev.part?.text) tokenCount += Math.ceil(ev.part.text.length / 4);
        if (ev.confidence !== undefined) confidence = ev.confidence;
      }

      // Check if the expected dispatch appears.
      const expectMatch = test.expectDispatch
        ? dispatches.some(d => d.includes(test.expectDispatch.replace('→', '→')) || d === test.expectDispatch.split('→')[1])
        : true;

      // Check confidence threshold.
      const confidenceOk = test.minConfidence !== undefined
        ? (confidence !== null && confidence >= test.minConfidence)
        : true;

      // Check token budget.
      const tokensOk = test.maxTokens !== undefined
        ? tokenCount <= test.maxTokens
        : true;

      const passed = !timedOut && code === 0 && expectMatch && confidenceOk && tokensOk;

      resolve({
        ok: passed,
        timedOut,
        duration,
        tokenCount,
        confidence,
        dispatches,
        expectMatch,
        confidenceOk,
        tokensOk,
        errors: !expectMatch ? `Expected dispatch containing "${test.expectDispatch}" but got [${dispatches.join(', ')}]` :
                !confidenceOk ? `Confidence ${confidence} < minConfidence ${test.minConfidence}` :
                !tokensOk ? `Tokens ${tokenCount} > maxTokens ${test.maxTokens}` :
                timedOut ? `Timed out after ${timeoutMs}ms` :
                `Exit code ${code}`,
      });
    });

    child.on('error', (e) => {
      clearTimeout(timer);
      resolve({ ok: false, error: e.message, duration: Date.now() - startTime });
    });
  });
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  if (!demigodName) {
    err('Usage: olympus test demigod <name> [--verbose] [--timeout 60000]');
    err('Example: olympus test demigod frontend-reviewer');
    process.exit(1);
  }

  log(`Testing demigod: ${demigodName}`);

  const { path: promptPath, god, name } = findDemigodPrompt(demigodName);
  log(`Prompt: ${promptPath} (parent god: ${god})`);

  const content = readFileSync(promptPath, 'utf-8');
  const { frontmatter, body } = parseFrontmatter(content);

  if (!frontmatter) {
    warn(`No frontmatter found in ${promptPath}. Add frontmatter with \`tests:\` to enable testing.`);
    warn('Example:');
    console.log(`
---
version: "1.0.0"
tests:
  - input: "Plan a React feature"
    expectDispatch: "athena→frontend-reviewer"
    minConfidence: 0.8
    maxTokens: 5000
---
`);
    process.exit(0);
  }

  log(`Version: ${frontmatter.version || 'unknown'}`);
  log(`Tests: ${frontmatter.tests.length}`);

  if (frontmatter.tests.length === 0) {
    warn('No tests defined in frontmatter. Add a `tests:` array with at least one test.');
    process.exit(0);
  }

  log('');

  let passed = 0, failed = 0;
  for (let i = 0; i < frontmatter.tests.length; i++) {
    const test = frontmatter.tests[i];
    log(`▶ Test ${i + 1}: ${test.input.slice(0, 80)}${test.input.length > 80 ? '…' : ''}`);
    if (VERBOSE) {
      log(`  expectDispatch: ${test.expectDispatch || '(any)'}`);
      log(`  minConfidence: ${test.minConfidence || '(any)'}`);
      log(`  maxTokens: ${test.maxTokens || '(any)'}`);
    }

    const result = await runTest(test, god, name);
    if (result.ok) {
      ok(`  ✓ PASS (${result.duration}ms, ${result.tokenCount} tokens, ${result.dispatches.length} dispatches)`);
      if (VERBOSE && result.dispatches.length > 0) {
        log(`  dispatches: ${result.dispatches.join(', ')}`);
      }
      passed++;
    } else {
      warn(`  ✗ FAIL: ${result.errors || result.error || 'unknown'}`);
      if (VERBOSE && result.dispatches.length > 0) {
        warn(`  actual dispatches: ${result.dispatches.join(', ')}`);
      }
      failed++;
    }
    log('');
  }

  log('═══════════════════════════════════════════════════════════');
  log(`Demigod: ${demigodName} (v${frontmatter.version || 'unknown'})`);
  log(`Tests: ${frontmatter.tests.length}  |  Pass: ${passed}  |  Fail: ${failed}`);
  log('═══════════════════════════════════════════════════════════');

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => {
  err(`Unhandled error: ${e.message}`);
  process.exit(2);
});
