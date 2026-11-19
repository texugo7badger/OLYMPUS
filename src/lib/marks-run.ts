/**
 * marks-run.ts — v0.0.94: a mark batch is a durable background plan.
 *
 * The v0.0.92 route ran the god turn synchronously for 300s. A slow preview
 * (AIME next dev at 4GB) made Apollo miss the deadline; the user lost the
 * batch and had to copy it into the chat. The turn now runs in the background
 * with a 20-minute budget, the inbox is the source of truth, and the UI polls
 * the plan. The 5-mark AIME batch measured 593s on 2026-11-19, so 600s was a
 * 7-second margin; 1200s leaves room for a longer batch.
 *
 * The preview health is checked first: if the page is slow/unreachable, the
 * god is told to plan from the marks and the project source instead of
 * waiting on a dead preview.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import fs from 'node:fs';
import path from 'node:path';
import { runGodTurn, GO_FALLBACK_MODEL } from './god-run';
import { appendGodInbox, updateGodInbox } from './god-inbox';
import { marksPrompt, type PreviewMark } from './marks-format';
import { resolveDispatchCwd } from './opencode-spawn';
import { getVaultRoot } from './vault-root';

export type MarkTarget = 'apollo' | 'athena';

/** The turn budget; the plan route treats a `running` batch older than this as dead. */
export const MARK_TURN_TIMEOUT_MS = 1_200_000;

/** A process-lifetime id; a batch `running` under another boot is dead. */
export const MARK_BOOT_ID = `boot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export interface MarkRunOptions {
  target: MarkTarget;
  slug: string;
  marks: PreviewMark[];
  previewUrl?: string;
  inboxId: string;
  dispatchId: string;
}

/** A short, honest note for the god when the preview cannot be inspected. */
export async function previewHealthNote(previewUrl?: string): Promise<string> {
  if (!previewUrl) {
    return '\n\n[PREVIEW HEALTH] No preview URL was supplied. Plan from the marks and the project source; do not wait on a live page.';
  }
  try {
    const res = await fetch(previewUrl, {
      method: 'GET',
      redirect: 'manual',
      signal: AbortSignal.timeout(2_500),
    });
    // Any answer below 500 means the server is reachable; a 5xx is a sick
    // preview and the god must not wait on it.
    if (res.status < 500) return '';
    return `\n\n[PREVIEW HEALTH] The preview returned HTTP ${res.status}. Plan from the marks and the project source; do not wait on the live page.`;
  } catch {
    return '\n\n[PREVIEW HEALTH] The preview is slow or unreachable right now. Plan from the marks and the project source; do not wait on the live page. This is a plan, not a live inspection.';
  }
}

async function execute(opts: MarkRunOptions): Promise<void> {
  const { target, slug, marks, previewUrl, inboxId, dispatchId } = opts;
  let lane = '';
  try {
    lane = resolveDispatchCwd(slug);
    const note = await previewHealthNote(previewUrl);
    const prompt = marksPrompt(slug, marks, previewUrl, target) + note;
    const turn = await runGodTurn(
      target,
      prompt,
      lane,
      MARK_TURN_TIMEOUT_MS,
      target === 'athena' ? { model: GO_FALLBACK_MODEL } : {},
    );
    if (!turn.ok) {
      appendGodInbox(target, {
        role: 'system',
        text: `mark batch failed: ${turn.error}`,
        source: 'mark',
        status: 'failed',
        replyTo: inboxId,
        meta: { dispatchId, slug, count: marks.length, target },
      });
      updateGodInbox(target, inboxId, { status: 'failed' });
      return;
    }
    appendGodInbox(target, {
      role: 'god',
      text: turn.text,
      source: 'mark',
      status: 'done',
      replyTo: inboxId,
      meta: { dispatchId, slug, count: marks.length, durationMs: turn.durationMs, target },
    });
    updateGodInbox(target, inboxId, { status: 'done' });
    try {
      const feed = path.join(getVaultRoot(), '06_Activity_Feed', 'live.jsonl');
      fs.mkdirSync(path.dirname(feed), { recursive: true });
      fs.appendFileSync(feed, JSON.stringify({
        ts: new Date().toISOString(),
        god: target,
        action: 'delegation',
        msg: `${marks.length} mark(s) planned by ${target} in the background`,
        project: slug,
        meta: { dispatchId, inboxId, count: marks.length, lane, durationMs: turn.durationMs },
      }) + '\n', 'utf-8');
    } catch { /* non-fatal */ }
  } catch (e: any) {
    appendGodInbox(target, {
      role: 'system',
      text: `mark batch failed: ${e?.message || String(e)}`,
      source: 'mark',
      status: 'failed',
      replyTo: inboxId,
      meta: { dispatchId, slug, count: marks.length, target },
    });
    updateGodInbox(target, inboxId, { status: 'failed' });
  }
}

/** Fire-and-forget: the route returns an inbox id immediately. */
export function startMarkPlan(opts: MarkRunOptions): void {
  void execute(opts);
}
