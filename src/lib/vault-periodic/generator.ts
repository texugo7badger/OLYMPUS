/**
 * Olympus Vault Periodic — Daily / Weekly Summary Generator
 * =============================================================
 *
 * Generates per-god daily and weekly session summaries. The Callimachus
 * agent calls `generateDaily(god, date)` at the end of each session and
 * `generateWeekly(god, weekStart)` on Sundays.
 *
 * Both functions are idempotent — calling twice for the same god+date
 * overwrites the file with fresh content (no duplicate entries).
 *
 * Output paths:
 *   daily:  `01_Gods/<God>/activity/YYYY-MM-DD.md`
 *   weekly: `01_Gods/<God>/activity/week-YYYY-MM-DD.md`
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import type { VaultAPI } from '../vault';
import type {
  ActivityEvent,
  DailySummary,
  PeriodicNoteResult,
  SessionEntry,
  WeeklySummary,
} from './types';
import { readActivityFeed, readWorkingMemory } from './aggregator';
import { getDailyNotePath, getWeeklyNotePath } from './index-helpers';

/** Normalize a god name to Olympus path convention (Capitalized). */
function capitalizeGod(god: string): string {
  return god.charAt(0).toUpperCase() + god.slice(1).toLowerCase();
}

/** Format a Date as YYYY-MM-DD (UTC, to avoid TZ drift). */
function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Compute the Monday of the week containing `date` (UTC). */
function mondayOfWeek(date: Date): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const delta = day === 0 ? -6 : 1 - day; // shift back to Monday
  d.setUTCDate(d.getUTCDate() + delta);
  return d;
}

/** Compute the Sunday of the week containing `date` (UTC). */
function sundayOfWeek(monday: Date): Date {
  const d = new Date(monday);
  d.setUTCDate(d.getUTCDate() + 6);
  return d;
}

/** Aggregate a list of activity events + session entries into a DailySummary. */
function aggregateDaily(
  god: string,
  date: string,
  events: ActivityEvent[],
  sessions: SessionEntry[],
): DailySummary {
  let totalTokensIn = 0;
  let totalTokensOut = 0;
  let totalDurationSeconds = 0;
  const subAgents = new Set<string>();
  const instinctsFormed: string[] = [];
  const instinctsReinforced: string[] = [];
  let escalations = 0;

  for (const e of events) {
    if (e.tokensIn) totalTokensIn += e.tokensIn;
    if (e.tokensOut) totalTokensOut += e.tokensOut;
    if (e.durationSeconds) totalDurationSeconds += e.durationSeconds;
    if (e.subAgent) subAgents.add(e.subAgent);
    if (e.outcome && /escalat/i.test(e.outcome)) escalations++;
  }

  let tasksCompleted = 0;
  for (const s of sessions) {
    if (s.subAgent) subAgents.add(s.subAgent);
    if (s.outcome && /escalat/i.test(s.outcome)) escalations++;
    if (s.instinctFormed) {
      // Strip the parenthetical "(confidence 0.92, samples 14)".
      const name = s.instinctFormed.replace(/\s*\(.*\)\s*$/, '').trim();
      if (name) instinctsFormed.push(name);
    }
    // A session is counted as a completed task if outcome mentions "success".
    if (s.outcome && /success/i.test(s.outcome)) tasksCompleted++;
  }

  return {
    god,
    date,
    events,
    sessions,
    tasksCompleted,
    totalTokensIn,
    totalTokensOut,
    totalDurationSeconds,
    subAgentsDispatched: [...subAgents].sort(),
    instinctsFormed,
    instinctsReinforced,
    escalations,
  };
}

/**
 * Render a `DailySummary` to Markdown. Uses Handlebars-compatible
 * `{{var}}` placeholders rendered directly via string interpolation
 * (no need for the full Handlebars engine — the template is simple).
 */
function renderDaily(summary: DailySummary): string {
  const { god, date, events, sessions } = summary;
  const godCapitalized = capitalizeGod(god);
  const lines: string[] = [];

  lines.push('---');
  lines.push(`up: "[[01_Gods/${godCapitalized}/working-memory]]"`);
  lines.push('type: session-summary');
  lines.push(`god: ${god.toLowerCase()}`);
  lines.push(`date: ${date}`);
  lines.push('tags: [session-summary, activity]');
  lines.push(`generated_at: ${new Date().toISOString()}`);
  lines.push('---');
  lines.push('');
  lines.push(`# 📝 Session Summary — ${godCapitalized} — ${date}`);
  lines.push('');
  lines.push('## Overview');
  lines.push('');
  lines.push(`- **Tasks completed:** ${summary.tasksCompleted}`);
  lines.push(`- **Tokens in:** ${summary.totalTokensIn.toLocaleString()}`);
  lines.push(`- **Tokens out:** ${summary.totalTokensOut.toLocaleString()}`);
  lines.push(`- **Total tokens:** ${(summary.totalTokensIn + summary.totalTokensOut).toLocaleString()}`);
  lines.push(`- **Duration:** ${summary.totalDurationSeconds.toFixed(1)}s`);
  lines.push(`- **Sub-agents dispatched:** ${summary.subAgentsDispatched.length}`);
  if (summary.subAgentsDispatched.length > 0) {
    for (const sa of summary.subAgentsDispatched) {
      lines.push(`  - ${sa}`);
    }
  }
  lines.push(`- **Instincts formed:** ${summary.instinctsFormed.length}`);
  if (summary.instinctsFormed.length > 0) {
    for (const i of summary.instinctsFormed) {
      lines.push(`  - ${i}`);
    }
  }
  lines.push(`- **Escalations:** ${summary.escalations}`);
  lines.push('');

  if (sessions.length > 0) {
    lines.push('## Sessions');
    lines.push('');
    for (const s of sessions) {
      lines.push(`### ${s.title}`);
      lines.push('');
      if (s.task) lines.push(`- **Task:** ${s.task}`);
      if (s.subAgent) {
        let sa = `- **Sub-agent:** ${s.subAgent}`;
        if (s.subAgentScore !== undefined) sa += ` (score ${s.subAgentScore})`;
        lines.push(sa);
      }
      if (s.outcome) {
        let oc = `- **Outcome:** ${s.outcome}`;
        if (s.confidence !== undefined) oc += ` (confidence ${s.confidence})`;
        lines.push(oc);
      }
      if (s.tokens !== undefined) lines.push(`- **Tokens:** ${s.tokens.toLocaleString()}`);
      if (s.skillsLoaded && s.skillsLoaded.length > 0) {
        lines.push(`- **Skills loaded:** ${s.skillsLoaded.join(', ')}`);
      }
      if (s.files && s.files.length > 0) {
        lines.push(`- **Files:** ${s.files.join(', ')}`);
      }
      if (s.instinctFormed) {
        let inst = `- **Instinct formed:** ${s.instinctFormed}`;
        if (s.instinctConfidence !== undefined) inst += ` (confidence ${s.instinctConfidence}`;
        if (s.instinctSamples !== undefined) inst += `, samples ${s.instinctSamples}`;
        if (s.instinctConfidence !== undefined) inst += ')';
        lines.push(inst);
      }
      lines.push('');
    }
  }

  if (events.length > 0) {
    lines.push('## Activity Feed Events');
    lines.push('');
    lines.push('| Time | Task | Tokens in | Tokens out | Duration | Sub-agent |');
    lines.push('|---|---|---|---|---|---|');
    for (const e of events) {
      const time = e.time || '—';
      const task = e.task || '—';
      const ti = e.tokensIn !== undefined ? e.tokensIn.toLocaleString() : '—';
      const to = e.tokensOut !== undefined ? e.tokensOut.toLocaleString() : '—';
      const dur = e.durationSeconds !== undefined ? `${e.durationSeconds}s` : '—';
      const sa = e.subAgent || '—';
      lines.push(`| ${time} | ${task} | ${ti} | ${to} | ${dur} | ${sa} |`);
    }
    lines.push('');
  }

  if (events.length === 0 && sessions.length === 0) {
    lines.push('_No activity recorded for this god on this date._');
    lines.push('');
  }

  lines.push('---');
  lines.push('');
  lines.push(`*Generated by vault-periodic v2.0.0 at ${new Date().toISOString()}.*`);
  lines.push('');

  return lines.join('\n');
}

/** Render a `WeeklySummary` to Markdown. */
function renderWeekly(summary: WeeklySummary): string {
  const { god, weekStart, weekEnd, daily } = summary;
  const godCapitalized = capitalizeGod(god);
  const lines: string[] = [];

  lines.push('---');
  lines.push(`up: "[[01_Gods/${godCapitalized}/working-memory]]"`);
  lines.push('type: weekly-summary');
  lines.push(`god: ${god.toLowerCase()}`);
  lines.push(`week_start: ${weekStart}`);
  lines.push(`week_end: ${weekEnd}`);
  lines.push('tags: [weekly-summary, activity]');
  lines.push(`generated_at: ${new Date().toISOString()}`);
  lines.push('---');
  lines.push('');
  lines.push(`# 📊 Weekly Summary — ${godCapitalized} — ${weekStart} to ${weekEnd}`);
  lines.push('');

  lines.push('## Weekly Totals');
  lines.push('');
  lines.push(`- **Tasks completed:** ${summary.totalTasksCompleted}`);
  lines.push(`- **Tokens in:** ${summary.totalTokensIn.toLocaleString()}`);
  lines.push(`- **Tokens out:** ${summary.totalTokensOut.toLocaleString()}`);
  lines.push(`- **Total tokens:** ${(summary.totalTokensIn + summary.totalTokensOut).toLocaleString()}`);
  lines.push(`- **Duration:** ${summary.totalDurationSeconds.toFixed(1)}s`);
  lines.push(`- **Sub-agents dispatched:** ${summary.subAgentsDispatched.length}`);
  if (summary.subAgentsDispatched.length > 0) {
    for (const sa of summary.subAgentsDispatched) {
      lines.push(`  - ${sa}`);
    }
  }
  lines.push(`- **Instincts formed:** ${summary.instinctsFormed.length}`);
  if (summary.instinctsFormed.length > 0) {
    for (const i of summary.instinctsFormed) {
      lines.push(`  - ${i}`);
    }
  }
  lines.push(`- **Escalations:** ${summary.escalations}`);
  lines.push('');

  // Trend vs last week.
  lines.push('## Trend vs Last Week');
  lines.push('');
  const taskTrend = summary.trend.tasksCompletedDelta;
  const tokenTrend = summary.trend.tokensDelta;
  const escTrend = summary.trend.escalationsDelta;
  lines.push(`- **Tasks completed:** ${taskTrend >= 0 ? '+' : ''}${taskTrend}`);
  lines.push(`- **Tokens:** ${tokenTrend >= 0 ? '+' : ''}${tokenTrend.toLocaleString()}`);
  lines.push(`- **Escalations:** ${escTrend >= 0 ? '+' : ''}${escTrend}`);
  lines.push('');

  // Per-day breakdown.
  lines.push('## Per-Day Breakdown');
  lines.push('');
  lines.push('| Date | Tasks | Tokens in | Tokens out | Duration | Sub-agents | Escalations |');
  lines.push('|---|---|---|---|---|---|---|');
  for (const d of daily) {
    lines.push(
      `| ${d.date} | ${d.tasksCompleted} | ${d.totalTokensIn.toLocaleString()} | ${d.totalTokensOut.toLocaleString()} | ${d.totalDurationSeconds.toFixed(1)}s | ${d.subAgentsDispatched.length} | ${d.escalations} |`,
    );
  }
  lines.push('');

  // Daily note links.
  lines.push('## Daily Notes');
  lines.push('');
  for (const d of daily) {
    if (d.events.length > 0 || d.sessions.length > 0) {
      lines.push(`- [[${getDailyNotePath(god, new Date(d.date + 'T00:00:00Z'))}|${d.date}]]`);
    }
  }
  lines.push('');

  lines.push('---');
  lines.push('');
  lines.push(`*Generated by vault-periodic v2.0.0 at ${new Date().toISOString()}.*`);
  lines.push('');

  return lines.join('\n');
}

/**
 * Generate a daily session summary for a god.
 *
 * @param api The VaultAPI instance.
 * @param god God name (case-insensitive).
 * @param date The date to summarize. Defaults to today (UTC).
 */
export async function generateDailySummary(
  api: VaultAPI,
  god: string,
  date: Date = new Date(),
): Promise<PeriodicNoteResult> {
  const ds = toDateString(date);
  const godLower = god.toLowerCase();

  const [events, sessions] = await Promise.all([
    readActivityFeed(api, godLower, ds),
    readWorkingMemory(api, godLower, ds),
  ]);

  const summary = aggregateDaily(godLower, ds, events, sessions);
  const content = renderDaily(summary);
  const outPath = getDailyNotePath(god, date);

  await api.write(outPath, content);

  return { path: outPath, content, size: Buffer.byteLength(content, 'utf-8') };
}

/**
 * Aggregate the previous week's data for trend comparison.
 * Reads the weekly note from the prior Monday if it exists; otherwise
 * returns zero baseline.
 */
async function readPreviousWeekTotals(
  api: VaultAPI,
  god: string,
  thisMonday: Date,
): Promise<{ tasksCompleted: number; tokens: number; escalations: number }> {
  const prevMonday = new Date(thisMonday);
  prevMonday.setUTCDate(prevMonday.getUTCDate() - 7);
  const prevPath = getWeeklyNotePath(god, prevMonday);
  const note = await api.readIfExists(prevPath);
  if (!note) return { tasksCompleted: 0, tokens: 0, escalations: 0 };

  // Parse the frontmatter for total counts — but the weekly note doesn't
  // store them in frontmatter. Instead, parse the markdown for the
  // "Weekly Totals" section.
  const taskMatch = /\*\*Tasks completed:\*\*\s*(\d+)/i.exec(note.content);
  const tokensInMatch = /\*\*Tokens in:\*\*\s*([\d,]+)/i.exec(note.content);
  const tokensOutMatch = /\*\*Tokens out:\*\*\s*([\d,]+)/i.exec(note.content);
  const escMatch = /\*\*Escalations:\*\*\s*(\d+)/i.exec(note.content);

  const tasksCompleted = taskMatch ? parseInt(taskMatch[1], 10) : 0;
  const tokensIn = tokensInMatch ? parseInt(tokensInMatch[1].replace(/,/g, ''), 10) : 0;
  const tokensOut = tokensOutMatch ? parseInt(tokensOutMatch[1].replace(/,/g, ''), 10) : 0;
  const escalations = escMatch ? parseInt(escMatch[1], 10) : 0;

  return { tasksCompleted, tokens: tokensIn + tokensOut, escalations };
}

/**
 * Generate a weekly session summary for a god.
 *
 * @param api The VaultAPI instance.
 * @param god God name (case-insensitive).
 * @param weekStart A date within the week to summarize. Defaults to today.
 *                  The Monday of that week is used as the canonical start.
 */
export async function generateWeeklySummary(
  api: VaultAPI,
  god: string,
  weekStart: Date = new Date(),
): Promise<PeriodicNoteResult> {
  const monday = mondayOfWeek(weekStart);
  const sunday = sundayOfWeek(monday);
  const dsMonday = toDateString(monday);
  const dsSunday = toDateString(sunday);
  const godLower = god.toLowerCase();

  // Aggregate 7 daily summaries.
  const dailySummaries: DailySummary[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setUTCDate(d.getUTCDate() + i);
    const ds = toDateString(d);
    const [events, sessions] = await Promise.all([
      readActivityFeed(api, godLower, ds),
      readWorkingMemory(api, godLower, ds),
    ]);
    dailySummaries.push(aggregateDaily(godLower, ds, events, sessions));
  }

  // Aggregate totals.
  let totalTasksCompleted = 0;
  let totalTokensIn = 0;
  let totalTokensOut = 0;
  let totalDurationSeconds = 0;
  const subAgents = new Set<string>();
  const instinctsFormed: string[] = [];
  let escalations = 0;

  for (const d of dailySummaries) {
    totalTasksCompleted += d.tasksCompleted;
    totalTokensIn += d.totalTokensIn;
    totalTokensOut += d.totalTokensOut;
    totalDurationSeconds += d.totalDurationSeconds;
    for (const sa of d.subAgentsDispatched) subAgents.add(sa);
    for (const i of d.instinctsFormed) {
      if (!instinctsFormed.includes(i)) instinctsFormed.push(i);
    }
    escalations += d.escalations;
  }

  // Trend vs last week.
  const prev = await readPreviousWeekTotals(api, godLower, monday);
  const trend = {
    tasksCompletedDelta: totalTasksCompleted - prev.tasksCompleted,
    tokensDelta: (totalTokensIn + totalTokensOut) - prev.tokens,
    escalationsDelta: escalations - prev.escalations,
  };

  const summary: WeeklySummary = {
    god: godLower,
    weekStart: dsMonday,
    weekEnd: dsSunday,
    daily: dailySummaries,
    totalTasksCompleted,
    totalTokensIn,
    totalTokensOut,
    totalDurationSeconds,
    subAgentsDispatched: [...subAgents].sort(),
    instinctsFormed,
    escalations,
    trend,
  };

  const content = renderWeekly(summary);
  const outPath = getWeeklyNotePath(god, monday);

  await api.write(outPath, content);

  return { path: outPath, content, size: Buffer.byteLength(content, 'utf-8') };
}
