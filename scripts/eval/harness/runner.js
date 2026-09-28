#!/usr/bin/env node
/**
 * OLYMPUS Eval Harness — Runner
 *
 * Executes a set of golden tasks against OLYMPUS via the OpenCode CLI and
 * captures metrics (token cost, latency, dispatch graph correctness, short-
 * circuit rate). The harness is self-contained Node.js (no TS build needed)
 * so it can run in CI without compilation.
 *
 * Usage:
 *   node scripts/eval/harness/runner.js                      # run all tasks
 *   node scripts/eval/harness/runner.js --task security-audit-01   # run one
 *   node scripts/eval/harness/runner.js --report html         # emit HTML report
 *   node scripts/eval/harness/runner.js --report json         # emit JSON report
 *   node scripts/eval/harness/runner.js --timeout 120000      # per-task timeout (ms)
 *
 * Output:
 *   - JSON report at scripts/eval/results/<timestamp>.json
 *   - HTML report at scripts/eval/results/<timestamp>.html (with --report html)
 *   - Console summary always
 *
 * The runner spawns `opencode run --format json --auto "<task.prompt>"` for
 * each task, captures the JSONL output stream, and feeds it to metrics.js for
 * aggregation. Tasks are defined in scripts/eval/tasks/*.json.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const OLYMPUS_ROOT = join(__dirname, '..', '..', '..');
const TASKS_DIR = join(__dirname, '..', 'tasks');
const RESULTS_DIR = join(__dirname, '..', 'results');

// CLI args
const args = process.argv.slice(2);
const taskFilter = (args[args.indexOf('--task') + 1]) || null;
const reportFormat = (args[args.indexOf('--report') + 1]) || 'console';
const timeoutMs = parseInt(args[args.indexOf('--timeout') + 1] || '120000', 10);

function log(msg) { console.log(`[eval:runner] ${msg}`); }
function ok(msg) { console.log(`[eval:runner] ✓ ${msg}`); }
function warn(msg) { console.warn(`[eval:runner] ! ${msg}`); }
function err(msg) { console.error(`[eval:runner] X ${msg}`); }

// ─── Task loading ────────────────────────────────────────────────────────────

function loadTasks() {
  const tasks = [];
  if (!existsSync(TASKS_DIR)) {
    err(`Tasks directory not found: ${TASKS_DIR}`);
    process.exit(1);
  }
  for (const file of readdirSync(TASKS_DIR).sort()) {
    if (!file.endsWith('.json')) continue;
    try {
      const task = JSON.parse(readFileSync(join(TASKS_DIR, file), 'utf-8'));
      // Basic validation.
      if (!task.id || !task.prompt) {
        warn(`Task in ${file} missing required fields (id, prompt) — skipping`);
        continue;
      }
      tasks.push(task);
    } catch (e) {
      warn(`Failed to parse ${file}: ${e.message}`);
    }
  }
  return tasks;
}

// ─── OpenCode runner ─────────────────────────────────────────────────────────

/**
 * Run a single task via `opencode run --format json --auto`.
 * Returns the captured JSONL events + metadata.
 */
function runTask(task) {
  const startTime = Date.now();
  const events = [];
  let stdout = '';
  let stderr = '';

  // Resolve the opencode binary.
  const opencodeBin = join(OLYMPUS_ROOT, 'node_modules', '.bin', 'opencode');
  if (!existsSync(opencodeBin)) {
    return {
      ok: false,
      error: `opencode binary not found at ${opencodeBin}`,
      events: [],
      durationMs: 0,
    };
  }

  return new Promise((resolve) => {
    let timedOut = false;
    let killed = false;

    const child = spawn(opencodeBin, ['run', '--format', 'json', '--auto', task.prompt], {
      cwd: OLYMPUS_ROOT,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    const timer = setTimeout(() => {
      timedOut = true;
      try { child.kill('SIGTERM'); } catch {}
      // Force-kill after 5s grace.
      setTimeout(() => {
        if (!killed) { try { child.kill('SIGKILL'); } catch {} }
      }, 5000);
    }, timeoutMs);

    child.stdout?.on('data', (chunk) => {
      stdout += chunk.toString();
      // Parse JSONL lines as they arrive.
      const lines = stdout.split('\n');
      stdout = lines.pop() || ''; // keep the last partial line in the buffer
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const ev = JSON.parse(trimmed);
          events.push(ev);
        } catch {
          // Non-JSON line — log it for debugging.
          events.push({ type: 'non-json-log', msg: trimmed });
        }
      }
    });

    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      const durationMs = Date.now() - startTime;
      // Parse any remaining buffered stdout.
      if (stdout.trim()) {
        try {
          const ev = JSON.parse(stdout.trim());
          events.push(ev);
        } catch {}
      }
      resolve({
        ok: !timedOut && code === 0,
        timedOut,
        exitCode: code,
        events,
        durationMs,
        stderr: stderr.slice(-2000), // keep last 2KB for debugging
      });
    });

    child.on('error', (e) => {
      clearTimeout(timer);
      resolve({
        ok: false,
        error: e.message,
        events,
        durationMs: Date.now() - startTime,
        stderr,
      });
    });
  });
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  log('OLYMPUS Eval Harness');
  log(`Root: ${OLYMPUS_ROOT}`);
  log(`Tasks: ${TASKS_DIR}`);
  log(`Results: ${RESULTS_DIR}`);
  log(`Timeout: ${timeoutMs}ms per task`);
  log('');

  // Find the opencode binary up-front.
  const opencodeBin = join(OLYMPUS_ROOT, 'node_modules', '.bin', 'opencode');
  if (!existsSync(opencodeBin)) {
    err(`opencode binary not found at ${opencodeBin}`);
    err('Run `npm install` in the OLYMPUS root first.');
    process.exit(1);
  }
  ok('opencode binary found');

  // Load tasks.
  const allTasks = loadTasks();
  const tasks = taskFilter ? allTasks.filter(t => t.id === taskFilter) : allTasks;
  if (tasks.length === 0) {
    err(taskFilter ? `Task "${taskFilter}" not found in ${TASKS_DIR}` : `No tasks found in ${TASKS_DIR}`);
    process.exit(1);
  }
  log(`Loaded ${tasks.length} task(s)${taskFilter ? ` (filtered to "${taskFilter}")` : ''}`);
  log('');

  // Run each task.
  const results = [];
  for (const task of tasks) {
    log(`▶ Running task: ${task.id}`);
    log(`  Prompt: ${task.prompt.slice(0, 100)}${task.prompt.length > 100 ? '…' : ''}`);
    const result = await runTask(task);
    const metrics = computeMetrics(task, result);
    results.push({ task, result, metrics });
    if (result.ok) {
      ok(`  ✓ ${task.id}: ${metrics.qualityScore.toFixed(2)} quality, ${metrics.tokenCount} tokens, ${metrics.durationMs}ms`);
    } else if (result.timedOut) {
      warn(`  ! ${task.id}: timed out after ${timeoutMs}ms`);
    } else {
      warn(`  ! ${task.id}: failed (exit ${result.exitCode})`);
    }
    log('');
  }

  // Aggregate.
  const summary = {
    generated_at: new Date().toISOString(),
    task_count: results.length,
    pass_count: results.filter(r => r.result.ok && r.metrics.qualityScore >= (r.task.qualityThreshold || 0.7)).length,
    fail_count: results.filter(r => !r.result.ok || r.metrics.qualityScore < (r.task.qualityThreshold || 0.7)).length,
    total_tokens: results.reduce((n, r) => n + r.metrics.tokenCount, 0),
    total_duration_ms: results.reduce((n, r) => n + r.metrics.durationMs, 0),
    avg_quality: results.length > 0 ? results.reduce((n, r) => n + r.metrics.qualityScore, 0) / results.length : 0,
    avg_short_circuit_rate: results.length > 0 ? results.reduce((n, r) => n + r.metrics.shortCircuitRate, 0) / results.length : 0,
    results: results.map(r => ({
      task_id: r.task.id,
      prompt: r.task.prompt,
      ok: r.result.ok,
      timed_out: r.result.timedOut || false,
      exit_code: r.result.exitCode,
      duration_ms: r.metrics.durationMs,
      token_count: r.metrics.tokenCount,
      quality_score: r.metrics.qualityScore,
      short_circuit_rate: r.metrics.shortCircuitRate,
      expected_dispatches: r.task.expectedDispatches || [],
      actual_dispatches: r.metrics.dispatches,
      dispatch_match: r.metrics.dispatchMatch,
      passed: r.result.ok && r.metrics.qualityScore >= (r.task.qualityThreshold || 0.7),
    })),
  };

  // Save JSON report.
  mkdirSync(RESULTS_DIR, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const jsonPath = join(RESULTS_DIR, `${ts}.json`);
  writeFileSync(jsonPath, JSON.stringify(summary, null, 2));

  // Save HTML report if requested.
  if (reportFormat === 'html') {
    const htmlPath = join(RESULTS_DIR, `${ts}.html`);
    writeFileSync(htmlPath, renderHtmlReport(summary));
    ok(`HTML report: ${htmlPath}`);
  }

  // Console summary.
  log('═══════════════════════════════════════════════════════════');
  log(`Tasks: ${summary.task_count}  |  Pass: ${summary.pass_count}  |  Fail: ${summary.fail_count}`);
  log(`Total tokens: ${summary.total_tokens}  |  Total duration: ${(summary.total_duration_ms / 1000).toFixed(1)}s`);
  log(`Avg quality: ${summary.avg_quality.toFixed(2)}  |  Avg short-circuit rate: ${(summary.avg_short_circuit_rate * 100).toFixed(1)}%`);
  log(`JSON report: ${jsonPath}`);
  log('═══════════════════════════════════════════════════════════');

  // Exit non-zero if any task failed (for CI gating).
  process.exit(summary.fail_count > 0 ? 1 : 0);
}

// ─── Metrics computation (inline for now; will extract to metrics.js if it grows) ──

function computeMetrics(task, result) {
  const durationMs = result.durationMs || 0;

  // Token count — sum input + output across all JSONL events.
  let tokenCount = 0;
  let shortCircuitCount = 0;
  let dispatchCount = 0;
  const dispatches = [];

  for (const ev of result.events) {
    if (ev.type === 'part' && ev.part?.type === 'text') {
      // Rough token estimate if no explicit token field.
      if (ev.part.tokens) {
        tokenCount += ev.part.tokens;
      } else if (ev.part.text) {
        tokenCount += Math.ceil(ev.part.text.length / 4);
      }
    }
    if (ev.type === 'tool-call' || ev.type === 'tool_call') {
      dispatchCount++;
      const tool = ev.tool || ev.name || 'unknown';
      dispatches.push(tool);
    }
    if (ev.short_circuited === true || ev.shortCircuit === true) {
      shortCircuitCount++;
    }
  }

  // Dispatch match — did the actual dispatches include the expected ones?
  const expected = task.expectedDispatches || [];
  const expectedSet = new Set(expected);
  const actualSet = new Set(dispatches);
  const matched = expected.filter(d => actualSet.has(d)).length;
  const dispatchMatch = expected.length > 0 ? matched / expected.length : 1;

  // Quality score — weighted blend:
  //   - 50% dispatch match (did Apollo dispatch to the right gods?)
  //   - 30% success (did the task complete without error?)
  //   - 20% short-circuit rate (did the brain save tokens via instincts?)
  const successScore = result.ok ? 1 : 0;
  const shortCircuitRate = dispatchCount > 0 ? shortCircuitCount / dispatchCount : 0;
  const qualityScore = (dispatchMatch * 0.5) + (successScore * 0.3) + (shortCircuitRate * 0.2);

  return {
    durationMs,
    tokenCount,
    dispatchCount,
    dispatches,
    dispatchMatch,
    shortCircuitRate,
    qualityScore,
  };
}

// ─── HTML report renderer ────────────────────────────────────────────────────

function renderHtmlReport(summary) {
  const rows = summary.results.map(r => `
    <tr class="${r.passed ? 'pass' : 'fail'}">
      <td>${r.task_id}</td>
      <td>${r.passed ? '✓ PASS' : '✗ FAIL'}</td>
      <td>${r.duration_ms}ms</td>
      <td>${r.token_count}</td>
      <td>${r.quality_score.toFixed(2)}</td>
      <td>${(r.short_circuit_rate * 100).toFixed(0)}%</td>
      <td>${r.dispatch_match.toFixed(2)}</td>
      <td><code>${r.actual_dispatches.join(', ') || '(none)'}</code></td>
    </tr>`).join('\n');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>OLYMPUS Eval Report — ${summary.generated_at}</title>
  <style>
    body { font-family: ui-monospace, Menlo, Monaco, Consolas, monospace; background: #0A0E16; color: #B8B8B8; padding: 24px; }
    h1 { color: #D4A574; }
    .summary { background: #0E1320; border: 1px solid #D4A57440; border-radius: 6px; padding: 12px 16px; margin-bottom: 16px; }
    .summary div { margin: 4px 0; }
    table { width: 100%; border-collapse: collapse; background: #0E1320; border: 1px solid #D4A57440; border-radius: 6px; }
    th, td { padding: 8px 12px; text-align: left; border-bottom: 1px solid #D4A57420; font-size: 12px; }
    th { color: #D4A574; font-weight: 600; text-transform: uppercase; font-size: 10px; letter-spacing: 0.05em; }
    tr.pass { background: #7BAE8E10; }
    tr.fail { background: #C4756A10; }
    code { background: #0A0E16; padding: 2px 6px; border-radius: 3px; color: #D4A574; }
  </style>
</head>
<body>
  <h1>OLYMPUS Eval Report</h1>
  <div class="summary">
    <div><strong>Generated:</strong> ${summary.generated_at}</div>
    <div><strong>Tasks:</strong> ${summary.task_count}  |  <strong>Pass:</strong> ${summary.pass_count}  |  <strong>Fail:</strong> ${summary.fail_count}</div>
    <div><strong>Total tokens:</strong> ${summary.total_tokens}  |  <strong>Total duration:</strong> ${(summary.total_duration_ms / 1000).toFixed(1)}s</div>
    <div><strong>Avg quality:</strong> ${summary.avg_quality.toFixed(2)}  |  <strong>Avg short-circuit rate:</strong> ${(summary.avg_short_circuit_rate * 100).toFixed(1)}%</div>
  </div>
  <table>
    <thead>
      <tr>
        <th>Task ID</th>
        <th>Status</th>
        <th>Duration</th>
        <th>Tokens</th>
        <th>Quality</th>
        <th>Short-Circuit</th>
        <th>Dispatch Match</th>
        <th>Dispatches</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>
</body>
</html>`;
}

main().catch(e => {
  err(`Unhandled error: ${e.message}`);
  console.error(e);
  process.exit(2);
});
