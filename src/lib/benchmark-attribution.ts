/**
 * benchmark-attribution.ts — WHO spent the tokens (v0.0.26).
 *
 * THE SPECIMEN (BENCHMARKS.md "Attribution limit (v1)"): every app-side
 * benchmark row was written as `god: "multi"`, `demigod: null`, so `per_god`
 * and the Top-10 demigod breakdowns were structurally empty. The claim that
 * the stream carries no agent name was only half true: `message.updated`
 * carries none, but the run KNOWS its topic god (`opts.agent`) and child
 * sessions carry `info.agent` (the demigod). The writer simply never used it.
 *
 * This module is the pure resolver: session id → (agentName, god, scope).
 * A god turn buckets under the god; a child session buckets under the
 * demigod with the parent god stamped; an unknown session stays `multi`
 * (honest, never guessed).
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

export type AgentScope = 'god' | 'demigod' | 'multi';

export interface SessionAgent {
  /** The agent the session runs as (god for the topic session, demigod for a child). */
  agent: string;
  /** The topic god that owns the turn. */
  god: string;
}

export interface AgentIdentity {
  /** Bucket key + `demigod` value for a child session. */
  agentName: string;
  /** The row's `god`. */
  god: string;
  scope: AgentScope;
}

export const MULTI_AGENT = 'multi';

/**
 * Resolve the identity for a session. `fallbackGod` lets a caller stamp the
 * known topic god when the session map has no entry yet (the first step of a
 * run can arrive before `session.created`).
 */
export function identityFor(
  sessions: Map<string, SessionAgent>,
  sessionID: string | null | undefined,
  fallbackGod?: string | null,
): AgentIdentity {
  const known = sessionID ? sessions.get(sessionID) : undefined;
  if (known && known.agent) {
    const scope: AgentScope = known.agent === known.god ? 'god' : 'demigod';
    return { agentName: known.agent, god: known.god || known.agent, scope };
  }
  if (fallbackGod) {
    return { agentName: fallbackGod, god: fallbackGod, scope: 'god' };
  }
  return { agentName: MULTI_AGENT, god: MULTI_AGENT, scope: 'multi' };
}

/** Bound the session map — a long-lived server must not leak session ids. */
export function rememberSessionAgent(
  sessions: Map<string, SessionAgent>,
  sessionID: string,
  value: SessionAgent,
  maxEntries = 500,
): void {
  if (!sessionID) return;
  sessions.set(sessionID, value);
  if (sessions.size <= maxEntries) return;
  const overflow = sessions.size - maxEntries;
  let i = 0;
  for (const key of sessions.keys()) {
    if (i++ >= overflow) break;
    sessions.delete(key);
  }
}
