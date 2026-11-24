/**
 * stream-answer.ts — v0.0.99: read a god turn's SSE without losing the answer.
 *
 * The action route streams `text` parts (each part is the FULL text of that
 * part), `log` progress lines, `error` frames and a final `action_done`. The
 * old phone parser overwrote the answer with the LAST frame carrying any
 * `msg`/`text` — so a progress line or a late error replaced the answer, and
 * only one part of a multi-part reply survived. This accumulator:
 *   - only merges `type:'text'` parts (never logs, never errors),
 *   - handles cumulative and per-part text without duplicating,
 *   - keeps the first real error separately,
 *   - exposes the final `walk_summary` as a fallback answer for control turns.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

export interface AnswerAccumulator {
  feed(chunk: string): void;
  readonly text: string;
  readonly error: string | null;
  readonly summary: string | null;
  readonly done: boolean;
}

function mergePart(parts: string[], raw: string): void {
  const clean = raw.trim();
  if (!clean) return;
  const last = parts[parts.length - 1] ?? '';
  if (!last) parts.push(clean);
  else if (clean === last) return;
  // Cumulative snapshot of the same text part: keep the longer one.
  else if (clean.startsWith(last)) parts[parts.length - 1] = clean;
  else if (last.startsWith(clean)) return;
  else parts.push(clean);
}

export function createAnswerAccumulator(onText?: (text: string) => void): AnswerAccumulator {
  const parts: string[] = [];
  let answer = '';
  let error: string | null = null;
  let summary: string | null = null;
  let done = false;
  let buffer = '';

  const handle = (ev: any): void => {
    if (!ev || typeof ev !== 'object') return;
    if (ev.type === 'text' && typeof ev?.part?.text === 'string') {
      const before = parts.length;
      mergePart(parts, ev.part.text);
      if (parts.length !== before || parts.length > 0) {
        answer = parts.join('\n\n');
        onText?.(answer);
      }
      return;
    }
    if (ev.type === 'error' && typeof ev.msg === 'string' && !error) error = ev.msg;
    else if (ev.type === 'walk_summary' && typeof ev.msg === 'string') summary = ev.msg;
    else if (ev.type === 'action_done') done = true;
  };

  const feed = (chunk: string): void => {
    buffer += chunk;
    const frames = buffer.split('\n\n');
    buffer = frames.pop() ?? '';
    for (const frame of frames) {
      const dataLines = frame
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).replace(/^ /, ''));
      if (!dataLines.length) continue;
      const payload = dataLines.join('\n');
      if (!payload.trim()) continue;
      try { handle(JSON.parse(payload)); } catch { /* torn frame: the next chunk completes it */ }
    }
  };

  return {
    feed,
    get text() { return answer; },
    get error() { return error; },
    get summary() { return summary; },
    get done() { return done; },
  };
}
