/**
 * narration.ts — v0.0.81: speech gets the ANSWER, never the transcript.
 *
 * The terminal and the studio used to hand whole turns to the voice lane.
 * A turn can be 200 lines of JSON, stack traces, shell commands, file paths
 * and tool output; read aloud, it sounds like a machine reciting a log. This
 * module keeps the prose a human would say and drops everything that is not
 * speech: code fences, JSON blobs, log prefixes, stack frames, paths, commands,
 * box-drawing tables and hashes.
 *
 * Pure TypeScript (no node imports) so the browser and the route share it.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

const LOG_PREFIX = /^\s*[\[(]?(?:info|warn|error|debug|trace|verbose|olympus|next|webpack|vite|npm|pnpm|yarn|bun)\b/i;
const HTTP_LINE = /^(?:GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)\s+\//;
const STACK_FRAME = /^\s*at\s+(?:[^\s]+\s+\(|\/|[A-Za-z]:\\)/;
const SHELL_LINE = /^\s*(?:\$|>|#|✓|✗|✔|✖)\s/;
const BOX_DRAWING = /[│┌└├┬┴┼]/;
const PATH_LIKE = /(?:node_modules|\/home\/|\/Users\/|[A-Za-z]:\\|\.(?:tsx?|jsx?|mjs|cjs|py|rs|go|sh|css|scss|yml|yaml):\d+)/;
const FILE_LINE = /^[\w./-]+\.(?:tsx?|jsx?|mjs|cjs|json|md|css|py|rs|go|sh|yml|yaml)\b/;
const HASH_LINE = /^[a-f0-9]{16,}$/i;
const TIMESTAMP_LINE = /^\s*\d{4}-\d{2}-\d{2}[T ]/;
const JSONISH_LINE = /^\s*[{[].*[}\]]\s*$/;

function isNoise(line: string): boolean {
  const t = line.trim();
  if (!t) return true;
  if (JSONISH_LINE.test(t)) {
    try { JSON.parse(t); return true; } catch { /* not JSON */ }
  }
  if (TIMESTAMP_LINE.test(t)) return true;
  if (LOG_PREFIX.test(t)) return true;
  if (HTTP_LINE.test(t)) return true;
  if (STACK_FRAME.test(t)) return true;
  if (SHELL_LINE.test(t)) return true;
  if (BOX_DRAWING.test(t)) return true;
  if (PATH_LIKE.test(t)) return true;
  if (FILE_LINE.test(t)) return true;
  if (HASH_LINE.test(t)) return true;
  if (t.length > 8 && !/[a-zA-ZÀ-ÿ]/.test(t)) return true;
  return false;
}

export interface NarrationOptions {
  max?: number;
  fallback?: string;
}

/**
 * Turn a turn into something a person would say out loud.
 * Short conversational replies pass through untouched.
 */
export function toNarration(text: string, opts: NarrationOptions = {}): string {
  const max = opts.max ?? 360;
  const fallback = opts.fallback ?? 'The task finished. Open OLYMPUS for the details.';
  const original = String(text || '').trim();
  if (!original) return '';

  // A short, single-line reply is already speech; do not filter the life out
  // of "Done — the build is green."
  if (original.length < 240 && !original.includes('\n')) {
    return original.length <= max ? original : cutAtSentence(original, max);
  }

  let s = original;
  s = s.replace(/```[\s\S]*?```/g, ' ');
  s = s.replace(/`[^`]*`/g, ' ');
  s = s.replace(/!\[[^\]]*\]\([^)]*\)/g, ' ');
  s = s.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
  s = s.replace(/https?:\/\/\S+/g, ' ');
  s = s.replace(/^\s{0,3}#{1,6}\s+/gm, '');
  s = s.replace(/^\s*[-*+]\s+/gm, '');
  s = s.replace(/^\s*\d+[.)]\s+/gm, '');

  const kept = s.split(/\r?\n/).filter((line) => !isNoise(line));
  s = kept.join(' ');
  s = s.replace(/[*_~>|]/g, '');
  s = s.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '');
  s = s.replace(/\s+/g, ' ').trim();

  const words = s ? s.split(/\s+/).filter(Boolean) : [];
  if (words.length < 3) return fallback;
  if (s.length <= max) return s;
  return cutAtSentence(s, max);
}

function cutAtSentence(text: string, max: number): string {
  const cut = text.slice(0, max);
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '), cut.lastIndexOf('; '));
  if (end > max * 0.45) return cut.slice(0, end + 1).trim();
  const space = cut.lastIndexOf(' ');
  return `${cut.slice(0, space > 0 ? space : max).trim()}…`;
}
