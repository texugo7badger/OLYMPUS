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
export declare function getActiveScopeAndAgent(_sessionID: string): {
    scope: "god" | "sub-agent";
    agent: string;
};
declare const instinctGate: {
    CONFIDENCE_THRESHOLD: number;
    queryInstincts: typeof queryInstincts;
    isScopeAllowed: typeof isScopeAllowed;
    getActiveScopeAndAgent: typeof getActiveScopeAndAgent;
};
export default instinctGate;
