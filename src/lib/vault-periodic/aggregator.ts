/**
 * Olympus Vault Periodic — Activity Aggregator
 * ===============================================
 *
 * Parses `06_Activity_Feed/live.jsonl` and each god's `working-memory.md`
 * to extract structured activity data for daily / weekly summaries.
 *
 * Both files use Markdown headings + bullet-list entries. The parsers
 * are tolerant — they skip malformed entries rather than throwing.
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import type { VaultAPI } from '../vault';
import type { ActivityEvent, SessionEntry } from './types';

// Heading patterns:
//   `## 2026-07-14 10:30 — Hephaestus` (activity feed)
//   `## 2026-07-14 — JWT auth implementation` (working-memory)
const RE_ACTIVITY_HEADING = /^##\s+(\d{4}-\d{2}-\d{2})(?:\s+(\d{2}:\d{2}))?\s*[—–-]\s*(.+?)\s*$/;
const RE_SESSION_HEADING = /^##\s+(\d{4}-\d{2}-\d{2})\s*[—–-]\s*(.+?)\s*$/;

// Bullet patterns:
const RE_TASK = /^[-*]\s+Task:\s*(.+?)\s*$/i;
const RE_TOKENS_IN = /^[-*]\s+Tokens in:\s*([\d,]+)\s*$/i;
const RE_TOKENS_OUT = /^[-*]\s+Tokens out:\s*([\d,]+)\s*$/i;
const RE_TOKENS_TOTAL = /^[-*]\s+Tokens:\s*([\d,]+)\s*$/i;
const RE_DURATION = /^[-*]\s+Duration:\s*([\d.]+)\s*s?\s*$/i;
const RE_OUTCOME = /^[-*]\s+Outcome:\s*(.+?)\s*$/i;
const RE_SUBAGENT = /^[-*]\s+Sub-agent:\s*(.+?)\s*$/i;
const RE_SKILLS = /^[-*]\s+Skills loaded:\s*(.+?)\s*$/i;
const RE_FILES = /^[-*]\s+Files:\s*(.+?)\s*$/i;
const RE_INSTINCT = /^[-*]\s+Instinct formed:\s*(.+?)\s*$/i;

/** Parse a comma-or-space-separated list of skills/files. */
function parseList(s: string): string[] {
  return s
    .split(/[,;]/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/** Parse a numeric value with optional comma thousands separators. */
function parseNumber(s: string): number | undefined {
  const n = Number.parseFloat(s.replace(/,/g, ''));
  return Number.isFinite(n) ? n : undefined;
}

/** Parse a confidence value from a string like "Success (confidence 0.94)". */
function parseConfidence(s: string): number | undefined {
  const m = /confidence\s+([\d.]+)/i.exec(s);
  return m ? parseNumber(m[1]) : undefined;
}

/** Parse a demigod string like "go-reviewer (score 0.91)" → { name, score }. */
function parseSubAgent(s: string): { name: string; score?: number } {
  const m = /^(.+?)\s*\(score\s+([\d.]+)\s*\)$/i.exec(s);
  if (m) {
    return { name: m[1].trim(), score: parseNumber(m[2]) };
  }
  return { name: s.trim() };
}

/**
 * Parse `06_Activity_Feed/live.jsonl` for all events, optionally filtered by god + date.
 *
 * @param content The raw Markdown content of the activity feed.
 * @param godFilter If set, only return events for this god (case-insensitive).
 * @param dateFilter If set, only return events on this date (YYYY-MM-DD).
 */
export function parseActivityFeed(
  content: string,
  godFilter?: string,
  dateFilter?: string,
): ActivityEvent[] {
  const events: ActivityEvent[] = [];
  const lines = content.split('\n');

  let current: ActivityEvent | null = null;
  for (const line of lines) {
    const headingMatch = RE_ACTIVITY_HEADING.exec(line);
    if (headingMatch) {
      // Flush the previous event.
      if (current) events.push(current);
      const [, date, time, godRaw] = headingMatch;
      const god = godRaw.toLowerCase().trim();
      current = {
        date,
        time: time || undefined,
        god,
      };
      continue;
    }
    if (!current) continue;

    let m: RegExpExecArray | null;
    if ((m = RE_TASK.exec(line))) current.task = m[1];
    else if ((m = RE_TOKENS_IN.exec(line))) current.tokensIn = parseNumber(m[1]);
    else if ((m = RE_TOKENS_OUT.exec(line))) current.tokensOut = parseNumber(m[1]);
    else if ((m = RE_DURATION.exec(line))) current.durationSeconds = parseNumber(m[1]);
    else if ((m = RE_OUTCOME.exec(line))) current.outcome = m[1];
    else if ((m = RE_SUBAGENT.exec(line))) {
      const sa = parseSubAgent(m[1]);
      current.subAgent = sa.name;
      current.subAgentScore = sa.score;
    }
  }
  if (current) events.push(current);

  return events.filter((e) => {
    if (godFilter && e.god !== godFilter.toLowerCase()) return false;
    if (dateFilter && e.date !== dateFilter) return false;
    return true;
  });
}

/**
 * Parse a god's `working-memory.md` for session entries, optionally filtered by date.
 *
 * @param content The raw Markdown content of the working-memory note.
 * @param dateFilter If set, only return sessions on this date (YYYY-MM-DD).
 */
export function parseWorkingMemory(
  content: string,
  dateFilter?: string,
): SessionEntry[] {
  const sessions: SessionEntry[] = [];
  const lines = content.split('\n');

  let current: SessionEntry | null = null;
  for (const line of lines) {
    const headingMatch = RE_SESSION_HEADING.exec(line);
    if (headingMatch) {
      if (current) sessions.push(current);
      const [, date, title] = headingMatch;
      current = { date, title: title.trim() };
      continue;
    }
    if (!current) continue;

    let m: RegExpExecArray | null;
    if ((m = RE_TASK.exec(line))) current.task = m[1];
    else if ((m = RE_TOKENS_TOTAL.exec(line))) current.tokens = parseNumber(m[1]);
    else if ((m = RE_OUTCOME.exec(line))) {
      current.outcome = m[1];
      current.confidence = parseConfidence(m[1]);
    } else if ((m = RE_SUBAGENT.exec(line))) {
      const sa = parseSubAgent(m[1]);
      current.subAgent = sa.name;
      current.subAgentScore = sa.score;
    } else if ((m = RE_SKILLS.exec(line))) {
      current.skillsLoaded = parseList(m[1]);
    } else if ((m = RE_FILES.exec(line))) {
      current.files = parseList(m[1]);
    } else if ((m = RE_INSTINCT.exec(line))) {
      // Format: "rust-jwt-auth (confidence 0.92, samples 14)"
      current.instinctFormed = m[1];
      const confMatch = /confidence\s+([\d.]+)/i.exec(m[1]);
      const sampMatch = /samples\s+(\d+)/i.exec(m[1]);
      if (confMatch) current.instinctConfidence = parseNumber(confMatch[1]);
      if (sampMatch) current.instinctSamples = parseNumber(sampMatch[1]);
    }
  }
  if (current) sessions.push(current);

  return sessions.filter((s) => {
    if (dateFilter && s.date !== dateFilter) return false;
    return true;
  });
}

/**
 * Read + parse the activity feed via the VaultAPI.
 *
 * @param api The VaultAPI instance.
 * @param godFilter Optional god filter (case-insensitive).
 * @param dateFilter Optional date filter (YYYY-MM-DD).
 */
export async function readActivityFeed(
  api: VaultAPI,
  godFilter?: string,
  dateFilter?: string,
): Promise<ActivityEvent[]> {
  const note = await api.readIfExists('06_Activity_Feed/live.jsonl');
  if (!note) return [];
  return parseActivityFeed(note.content, godFilter, dateFilter);
}

/**
 * Read + parse a god's working-memory note.
 *
 * @param api The VaultAPI instance.
 * @param god God name (case-insensitive — path is normalized to `01_Gods/<Capitalized>/working-memory.md`).
 * @param dateFilter Optional date filter (YYYY-MM-DD).
 */
export async function readWorkingMemory(
  api: VaultAPI,
  god: string,
  dateFilter?: string,
): Promise<SessionEntry[]> {
  const godName = god.charAt(0).toUpperCase() + god.slice(1).toLowerCase();
  const note = await api.readIfExists(`01_Gods/${godName}/working-memory.md`);
  if (!note) return [];
  return parseWorkingMemory(note.content, dateFilter);
}
