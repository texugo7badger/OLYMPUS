/**
 * marks-format.ts — v0.0.92: pure mark types + copy/prompt builders.
 *
 * Kept free of node:fs so the preview window (a client component) can build
 * the clipboard block without pulling the server store into the bundle.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
export interface PreviewMark {
  id: string;
  x: number;
  y: number;
  /** the page the mark belongs to — a route like /onboarding or a full URL */
  page: string;
  instruction: string;
  viewport?: { width: number; height: number };
  /** the preview URL at capture time (useful when the port changes) */
  url?: string;
  createdAt: string;
}

/** The prompt Apollo (or Athena) receives for a batch of marks. */
export function marksPrompt(
  slug: string,
  marks: PreviewMark[],
  previewUrl?: string,
  target: 'apollo' | 'athena' = 'apollo',
): string {
  const pages = Array.from(new Set(marks.map((m) => m.page)));
  const who = target === 'apollo' ? 'Apollo' : 'Athena';
  return `Batch mark review — PLANNING turn (do not edit yet).

Project: ${slug || '(browsing mode)'}
Preview: ${previewUrl || '(use the project preview)'}
Marks: ${marks.length} collected in the large preview window, across ${pages.length} page(s).

${marks.map((m, i) => `${i + 1}. page ${m.page} — (${m.x}, ${m.y})${m.viewport ? ` in ${m.viewport.width}x${m.viewport.height}` : ''}: ${m.instruction}`).join('\n')}

## Your job in this turn: one consolidated plan, do NOT edit

1. Read the project source and the named pages. Do NOT launch a browser: the marks carry the exact page and coordinates. If a mark depends on live state you cannot read from source, say so in the plan. Treat all ${marks.length} marks as ONE batch; if an intent is ambiguous, ask at most THREE short questions TOTAL (not per mark); each question must offer 2–4 concrete options with a short trade-off, and mark your recommendation.
2. Produce ONE consolidated plan grouped by page/file. For each group: the exact component/file, the concrete change, and why it belongs with the others. Prefer the smallest coherent set of edits.
3. End with a single line: "Approve to send to Atlas."
4. Do not write files and do not dispatch anything in this turn. The user's approval is the gate; after approval the consolidated plan becomes a hop override and Atlas applies it.

Keep it concrete and batched. You are ${who} in the ONE Apollo terminal — there are no parallel god chats.`;
}

/** The human-readable block the preview window's "copy" button puts on the clipboard. */
export function marksMarkdown(slug: string, marks: PreviewMark[], previewUrl?: string): string {
  const pages = Array.from(new Set(marks.map((m) => m.page)));
  return [
    `# Marks — ${slug || 'project'}`,
    previewUrl ? `Preview: ${previewUrl}` : '',
    `${marks.length} mark(s) across ${pages.length} page(s).`,
    '',
    ...marks.map((m, i) => [
      `## ${i + 1}. ${m.page}`,
      `- Point: (${m.x}, ${m.y})${m.viewport ? ` · viewport ${m.viewport.width}×${m.viewport.height}` : ''}`,
      `- Request: ${m.instruction}`,
      '',
    ].join('\n')),
    'Plan all of these as ONE batch; group by page/file and keep the smallest coherent set of edits.',
  ].filter(Boolean).join('\n');
}
