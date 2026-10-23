/**
 * instinct-gate.ts — Instinct-gated dispatch (the cost killer).
 *
 * Before doing any embedding search, a god queries its instincts.
 * If confidence >= 0.85, dispatch DIRECTLY — no embedding search needed.
 *
 * MIT License — see CREDITS.md
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
export declare const CONFIDENCE_THRESHOLD = 0.85;
export declare function registerSessionAgent(sessionID: string, agent: string): void;
/**
 * W-A RAG-CERT A5: the un-stub. The old form hardcoded
 * {scope:'god', agent:'apollo'} for every session — every god's interactive
 * turn queried APOLLO's instinct pool and the skill hints filtered to
 * apollo's arsenal. Now: the registered agent for the session (scope = god
 * iff one of the 10 GOD_IDS, else sub-agent); an unknown session keeps the
 * honest apollo legacy default.
 */
export declare function getActiveScopeAndAgent(sessionID: string): {
    scope: "god" | "sub-agent";
    agent: string;
};
/**
 * W-A RAG-CERT A5: the shortcircuit-log.jsonl WRITER — the telemetry row the
 * readers (shortcircuit-telemetry.ts, the God Intelligence Dashboard's
 * Short-Circuit Health panel, vault-prune TTL, doctor) always expected and
 * nothing ever wrote. The row shape is the ShortCircuitEntry contract.
 * tokens_saved stays the honest measured 0 until the resonance loop can
 * backfill real dispatch deltas — never a fabricated estimate.
 */
export interface ShortCircuitLogRow {
    god: string;
    session_id?: string;
    confidence: number;
    short_circuited: boolean;
    instinct_id: string | null;
    instinct_tags: string[] | null;
    task_signature: string;
    tokens_saved: number;
}
export declare function logShortCircuitEvaluation(row: ShortCircuitLogRow): boolean;
export interface Instinct {
    id: string;
    agent: string;
    scope: "god" | "sub-agent";
    tags: string[];
    confidence: number;
    dispatch_count: number;
    last_invoked_at: string | null;
    type: "seed" | "empirical";
    body: string;
    source_path: string;
}
export interface InstinctQueryResult {
    confidence: number;
    matching_instinct: Instinct | null;
    alternatives: Instinct[];
    scope: "god" | "sub-agent";
    agent_name: string;
    short_circuit: boolean;
}
export declare function queryInstincts(scope: "god" | "sub-agent", agentName: string, query: string, topK?: number): InstinctQueryResult;
export declare function isScopeAllowed(callerScope: "god" | "sub-agent", callerAgentName: string, requestedScope: "god" | "sub-agent", requestedAgent: string): boolean;
declare const instinctGate: {
    CONFIDENCE_THRESHOLD: number;
    queryInstincts: typeof queryInstincts;
    isScopeAllowed: typeof isScopeAllowed;
    getActiveScopeAndAgent: typeof getActiveScopeAndAgent;
    registerSessionAgent: typeof registerSessionAgent;
    logShortCircuitEvaluation: typeof logShortCircuitEvaluation;
};
export default instinctGate;
