/**
 * skill-index.ts — Runtime cosine-search for the per-god skill index.
 *
 * Opens the sqlite-vec database built by scripts/build-skill-index.js
 * and answers search(query, god, k) calls.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
export interface SkillHit {
    skill_id: string;
    god_scope: string;
    kind: "skill" | "instinct" | "sub-agent-instinct";
    title: string;
    description: string | null;
    body: string;
    source_path: string;
    similarity: number;
}
export declare class SkillIndex {
    private db;
    private searchStmt;
    private getStmt;
    private statsStmt;
    private vocab;
    private df;
    private numDocs;
    private vocabSize;
    constructor(dbPath?: string);
    /**
     * Build a TF-IDF query vector from the search text.
     * Only used when the index was built with TF-IDF (not OpenAI embeddings).
     */
    private buildQueryVector;
    search(queryEmbedding: number[] | string, god: string, k?: number): SkillHit[];
    stats(): {
        count: number;
    };
    close(): void;
}
export declare function getSkillIndex(): SkillIndex | null;
