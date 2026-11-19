/**
 * marks-plan.ts — v0.0.94: read the durable inbox view of a mark batch.
 *
 * The user entry is the batch identity; the latest god reply is the plan; a
 * later system entry with status failed is the honest error. `latestBatch`
 * can recover a legacy batch that predates the `meta.slug` field.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { readGodInbox, type GodInboxEntry } from './god-inbox';
import { MARK_BOOT_ID, MARK_TURN_TIMEOUT_MS, type MarkTarget } from './marks-run';

export interface MarkPlanView {
  inboxId: string;
  target: MarkTarget;
  slug: string | null;
  status: string;
  count: number;
  user: GodInboxEntry;
  plan: string | null;
  error: string | null;
  updatedAt: string | null;
}

function targetFor(entry: GodInboxEntry): MarkTarget {
  return entry.god === 'athena' ? 'athena' : 'apollo';
}

function findIn(god: MarkTarget, inboxId: string): MarkPlanView | null {
  const list = readGodInbox(god, 500);
  const user = list.find((e) => e.id === inboxId && e.role === 'you' && e.source === 'mark');
  if (!user) return null;
  const replies = list.filter((e) => e.replyTo === inboxId);
  const godReply = [...replies].reverse().find((e) => e.role === 'god') ?? null;
  const failed = [...replies].reverse().find((e) => e.role === 'system' && e.status === 'failed') ?? null;
  // A server restart can leave a `running` entry without a live turn. Two
  // independent signals make it retryable: a different boot id (the process
  // that owned the turn is gone) or a turn older than its 600s budget.
  const startedAt = typeof user.meta?.startedAt === 'string' ? user.meta.startedAt : user.ts;
  const parsedStart = Date.parse(startedAt);
  const ageMs = Date.now() - (Number.isFinite(parsedStart) ? parsedStart : Date.parse(user.ts));
  const rawStatus = user.status ?? 'pending';
  const active = rawStatus === 'running' || rawStatus === 'pending';
  const bootId = typeof user.meta?.bootId === 'string' ? user.meta.bootId : null;
  const rebooted = active && Boolean(bootId) && bootId !== MARK_BOOT_ID;
  const stale = active && Number.isFinite(ageMs) && ageMs > MARK_TURN_TIMEOUT_MS + 60_000;
  const status = rebooted || stale ? 'failed' : rawStatus;
  const error = status === 'failed'
    ? (failed?.text ?? (rebooted
      ? 'The app restarted while this batch was running. The marks are safe; retry the plan.'
      : stale
        ? 'The background turn did not settle within its budget. The batch is safe; retry it.'
        : 'The batch failed; retry it.'))
    : null;
  return {
    inboxId,
    target: targetFor(user),
    slug: typeof user.meta?.slug === 'string' ? user.meta.slug : (typeof user.meta?.projectSlug === 'string' ? user.meta.projectSlug : null),
    status,
    count: Number(user.meta?.count ?? 1) || 1,
    user,
    plan: godReply?.text ?? null,
    error,
    updatedAt: godReply?.ts ?? failed?.ts ?? user.ts,
  };
}

export function planFor(inboxId: string, target?: MarkTarget | null): MarkPlanView | null {
  if (target) return findIn(target, inboxId);
  return findIn('apollo', inboxId) ?? findIn('athena', inboxId);
}

export function latestBatch(slug: string, target: MarkTarget = 'apollo'): MarkPlanView | null {
  const list = readGodInbox(target, 500);
  const users = list.filter((e) => e.role === 'you' && e.source === 'mark');
  const exact = [...users].reverse().find((e) => {
    const metaSlug = typeof e.meta?.slug === 'string' ? e.meta.slug : (typeof e.meta?.projectSlug === 'string' ? e.meta.projectSlug : '');
    return !slug || metaSlug === slug;
  });
  // A legacy batch (v0.0.92) had no meta.slug. It is still the user's batch
  // for the current project and must be recoverable — but a batch that names
  // a DIFFERENT project is not.
  const legacy = [...users].reverse().find((e) => {
    const metaSlug = typeof e.meta?.slug === 'string' ? e.meta.slug : (typeof e.meta?.projectSlug === 'string' ? e.meta.projectSlug : '');
    return !metaSlug;
  });
  const user = exact ?? (!slug ? [...users].reverse()[0] : legacy) ?? null;
  return user ? planFor(user.id, target) : null;
}
