"use strict";
/**
 * instinct-gate.ts — Instinct-gated dispatch (the cost killer).
 *
 * Before doing any embedding search, a god queries its instincts.
 * If confidence >= 0.85, dispatch DIRECTLY — no embedding search needed.
 *
 * MIT License — see CREDITS.md
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CONFIDENCE_THRESHOLD = void 0;
exports.queryInstincts = queryInstincts;
exports.isScopeAllowed = isScopeAllowed;
exports.getActiveScopeAndAgent = getActiveScopeAndAgent;
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const node_os_1 = require("node:os");
exports.CONFIDENCE_THRESHOLD = 0.85;
const VAULT_ROOT = process.env.OLYMPUS_VAULT_ROOT ?? (0, node_path_1.join)((0, node_os_1.homedir)(), "OLYMPUS-VAULT");
const INSTINCTS_ROOT = (0, node_path_1.join)(VAULT_ROOT, "05_Auto_Learning", "instincts");
function parseFrontmatter(content) {
    const match = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
    if (!match)
        return { frontmatter: {}, body: content };
    const yamlText = match[1];
    const body = match[2];
    const frontmatter = {};
    for (const line of yamlText.split("\n")) {
        const m = line.match(/^(\w+):\s*(.*)$/);
        if (!m)
            continue;
        const [, key, rawValue] = m;
        let value = rawValue;
        if (rawValue.startsWith("[") && rawValue.endsWith("]")) {
            value = rawValue.slice(1, -1).split(",").map((s) => s.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
        }
        else if (rawValue.startsWith('"') && rawValue.endsWith('"')) {
            value = rawValue.slice(1, -1);
        }
        else if (rawValue === "null") {
            value = null;
        }
        else if (/^-?\d+(\.\d+)?$/.test(rawValue)) {
            value = Number(rawValue);
        }
        frontmatter[key] = value;
    }
    return { frontmatter, body };
}
function loadInstincts(scope, agentName) {
    const agentDir = scope === "god"
        ? (0, node_path_1.join)(INSTINCTS_ROOT, agentName)
        : (0, node_path_1.join)(INSTINCTS_ROOT, "sub-agents", agentName);
    if (!(0, node_fs_1.existsSync)(agentDir))
        return [];
    const instincts = [];
    for (const kind of ["seed", "empirical"]) {
        const kindDir = (0, node_path_1.join)(agentDir, kind);
        if (!(0, node_fs_1.existsSync)(kindDir))
            continue;
        for (const file of (0, node_fs_1.readdirSync)(kindDir)) {
            if (!file.endsWith(".md"))
                continue;
            const filePath = (0, node_path_1.join)(kindDir, file);
            try {
                const content = (0, node_fs_1.readFileSync)(filePath, "utf8");
                const { frontmatter, body } = parseFrontmatter(content);
                instincts.push({
                    id: String(frontmatter.id ?? file.replace(/\.md$/, "")),
                    agent: String(frontmatter.agent ?? agentName),
                    scope: frontmatter.scope ?? scope,
                    tags: frontmatter.tags ?? [],
                    confidence: Number(frontmatter.confidence ?? 1.0),
                    dispatch_count: Number(frontmatter.dispatch_count ?? 0),
                    last_invoked_at: frontmatter.last_invoked_at ?? null,
                    type: frontmatter.type ?? kind,
                    body: body.trim(),
                    source_path: filePath,
                });
            }
            catch { /* skip unreadable */ }
        }
    }
    return instincts;
}
function tagSimilarity(queryTags, instinctTags) {
    if (queryTags.length === 0 || instinctTags.length === 0)
        return 0;
    const instinctSet = new Set(instinctTags.map((t) => t.toLowerCase()));
    let hits = 0;
    for (const tag of queryTags) {
        if (instinctSet.has(tag.toLowerCase()))
            hits++;
    }
    return hits / Math.max(queryTags.length, instinctTags.length);
}
function extractTags(query) {
    const stopwords = new Set(["the", "a", "an", "is", "are", "was", "were", "be", "been", "being", "have", "has", "had", "do", "does", "did", "will", "would", "could", "should", "may", "might", "must", "can", "shall", "to", "of", "in", "for", "on", "with", "as", "by", "at", "from", "up", "about", "into", "through", "during", "before", "after", "above", "below", "and", "or", "but", "not", "no", "yes", "this", "that", "these", "those", "i", "you", "he", "she", "it", "we", "they", "me", "him", "her", "us", "them", "my", "your", "his", "its", "our", "their", "what", "which", "who", "when", "where", "why", "how", "all", "each", "every", "both", "few", "more", "most", "other", "some", "such", "only", "own", "same", "so", "than", "too", "very", "just", "now"]);
    const words = query.toLowerCase().split(/[^a-z0-9-]+/).filter((w) => w.length > 2 && !stopwords.has(w));
    return [...new Set(words)];
}
function queryInstincts(scope, agentName, query, topK = 3) {
    const instincts = loadInstincts(scope, agentName);
    const queryTags = query.includes(",")
        ? query.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean)
        : extractTags(query);
    const scored = instincts.map((instinct) => {
        const sim = tagSimilarity(queryTags, instinct.tags);
        const score = sim * instinct.confidence;
        return { instinct, sim, score };
    });
    scored.sort((a, b) => b.score - a.score);
    const top = scored[0];
    const matching = top && top.sim > 0 ? top.instinct : null;
    const confidence = matching ? top.score : 0;
    const alternatives = scored.slice(1, 1 + topK).filter((s) => s.sim > 0).map((s) => s.instinct);
    return {
        confidence,
        matching_instinct: matching,
        alternatives,
        scope,
        agent_name: agentName,
        short_circuit: confidence >= exports.CONFIDENCE_THRESHOLD,
    };
}
function isScopeAllowed(callerScope, callerAgentName, requestedScope, requestedAgent) {
    if (callerScope === "god")
        return true;
    return requestedScope === "sub-agent" && requestedAgent === callerAgentName;
}
function getActiveScopeAndAgent(_sessionID) {
    return { scope: "god", agent: "apollo" };
}
// Assign to a const before exporting as default (eslint import/no-anonymous-
// default-export requires a named binding for `export default`).
const instinctGate = { CONFIDENCE_THRESHOLD: exports.CONFIDENCE_THRESHOLD, queryInstincts, isScopeAllowed, getActiveScopeAndAgent };
exports.default = instinctGate;
//# sourceMappingURL=instinct-gate.js.map