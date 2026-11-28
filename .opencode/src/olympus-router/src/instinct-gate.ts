/**
 * instinct-gate.ts — Instinct-gated dispatch (the cost killer).
 *
 * Before doing any embedding search, a god queries its instincts.
 * If confidence >= 0.85, dispatch DIRECTLY — no embedding search needed.
 *
 * MIT License — see CREDITS.md
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { readFileSync, readdirSync, existsSync, mkdirSync, appendFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

// v0.0.53 — 0.85 was mathematically unreachable for a natural-language query
// (the old denominator was max(queryTags, instinctTags)). The gate now scores
// the INSTINCT's coverage and requires at least two matching tags; 0.60 is the
// calibrated floor, not a lowering to make a demo pass.
export const CONFIDENCE_THRESHOLD = 0.6;

const VAULT_ROOT = process.env.OLYMPUS_VAULT_ROOT ?? join(homedir(), "OLYMPUS-VAULT");
const INSTINCTS_ROOT = join(VAULT_ROOT, "05_Auto_Learning", "instincts");

/** The 10 gods — the scope boundary: an agent in this set runs as a god
 *  session; anything else (a demigod id) runs as a sub-agent session. */
const GOD_IDS = new Set([
  "apollo", "atlas", "artemis", "athena", "dionysus",
  "hephaestus", "hermes", "persephone", "prometheus", "callimachus",
]);

/**
 * W-A RAG-CERT A5: the session->agent map. chat.params is the only hook
 * whose input carries the REAL agent id — it registers here on every turn;
 * the session-less hooks (permission.ask, tool.execute.before) consult the
 * map through getActiveScopeAndAgent. In-memory by design (sessions are
 * lanes inside the serve process; a restart re-registers on the first turn).
 */
const sessionAgentMap = new Map<string, string>();
/** v0.0.30 — the parent god for each session. A demigod child inherits the
 *  god of the last registered session; a god session is its own god. */
const sessionGodMap = new Map<string, string>();
/** The last session registered by chat.params — the session-less hooks
 *  (permission.ask) consult it instead of hardcoding Apollo. */
let lastSessionID: string | null = null;
let lastGod: string = "apollo";

export function registerSessionAgent(sessionID: string, agent: string, god?: string): void {
  const sid = String(sessionID ?? "").trim();
  const a = String(agent ?? "").trim().toLowerCase();
  if (!sid || !a) return;
  sessionAgentMap.set(sid, a);
  const parent = String(god ?? "").trim().toLowerCase();
  const resolved = parent || (GOD_IDS.has(a) ? a : lastGod) || "apollo";
  sessionGodMap.set(sid, resolved);
  lastSessionID = sid;
  lastGod = resolved;
}

/**
 * W-A RAG-CERT A5: the un-stub. The old form hardcoded
 * {scope:'god', agent:'apollo'} for every session — every god's interactive
 * turn queried APOLLO's instinct pool and the skill hints filtered to
 * apollo's arsenal. Now: the registered agent for the session (scope = god
 * iff one of the 10 GOD_IDS, else sub-agent); an unknown session keeps the
 * honest apollo legacy default.
 */
export function getActiveScopeAndAgent(sessionID: string): { scope: "god" | "sub-agent"; agent: string; god: string } {
  // v0.0.30 — the session-less permission.ask hook used to pass "" and
  // ALWAYS got Apollo. That made every MCP call in a hop evaluate Apollo's
  // allowlist (github + mcp-gateway, both dead), so Athena/Hephaestus could
  // not use the MCP the plan assigned them. Fall back to the last session
  // registered by chat.params, never to a hardcoded god.
  const sid = String(sessionID ?? "").trim() || lastSessionID || "";
  const known = sid ? sessionAgentMap.get(sid) : undefined;
  if (!known) return { scope: "god", agent: "apollo", god: "apollo" };
  const god = sessionGodMap.get(sid) || (GOD_IDS.has(known) ? known : "apollo");
  return { scope: GOD_IDS.has(known) ? "god" : "sub-agent", agent: known, god };
}

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

export function logShortCircuitEvaluation(row: ShortCircuitLogRow): boolean {
  try {
    const dir = join(VAULT_ROOT, "05_Auto_Learning");
    mkdirSync(dir, { recursive: true });
    appendFileSync(
      join(dir, "shortcircuit-log.jsonl"),
      JSON.stringify({ ...row, ts: new Date().toISOString() }) + "\n",
    );
    return true;
  } catch {
    return false; // telemetry never breaks the gate
  }
}

export interface Instinct {
  id: string;
  agent: string;
  scope: "god" | "sub-agent";
  visibility: "global" | "stack" | "project";
  projects: string[];
  stacks: string[];
  quickCircuit: boolean;
  samples: number;
  successes: number;
  failures: number;
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
  verification_sample?: boolean;
  visibility?: "global" | "stack" | "project" | "seed" | "hidden";
}

function parseFrontmatter(content: string): { frontmatter: Record<string, unknown>; body: string } {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  if (!match) return { frontmatter: {}, body: content };
  const yamlText = match[1];
  const body = match[2];
  const frontmatter: Record<string, unknown> = {};
  for (const line of yamlText.split("\n")) {
    const m = line.match(/^(\w+):\s*(.*)$/);
    if (!m) continue;
    const [, key, rawValue] = m;
    let value: unknown = rawValue;
    if (rawValue.startsWith("[") && rawValue.endsWith("]")) {
      value = rawValue.slice(1, -1).split(",").map((s) => s.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
    } else if (rawValue.startsWith('"') && rawValue.endsWith('"')) {
      value = rawValue.slice(1, -1);
    } else if (rawValue === "null") {
      value = null;
    } else if (rawValue === "true" || rawValue === "false") {
      value = rawValue === "true";
    } else if (/^-?\d+(\.\d+)?$/.test(rawValue)) {
      value = Number(rawValue);
    }
    frontmatter[key] = value;
  }
  return { frontmatter, body };
}

function loadInstincts(scope: "god" | "sub-agent", agentName: string, project?: string | null): Instinct[] {
  const agentDir =
    scope === "god"
      ? join(INSTINCTS_ROOT, agentName)
      : join(INSTINCTS_ROOT, "sub-agents", agentName);
  const instincts: Instinct[] = [];
  if (existsSync(agentDir)) {
  for (const kind of ["seed", "empirical"] as const) {
    const kindDir = join(agentDir, kind);
    if (!existsSync(kindDir)) continue;
    for (const file of readdirSync(kindDir)) {
      if (!file.endsWith(".md")) continue;
      const filePath = join(kindDir, file);
      try {
        const content = readFileSync(filePath, "utf8");
        const { frontmatter, body } = parseFrontmatter(content);
        // v0.1.3 — load ALL empirical memory; visibility is decided by the
        // scope filter in queryInstincts. `quick_circuit` gates the
        // short-circuit, not whether the instinct can be a prior.
        const rawConfidence = Number(frontmatter.confidence ?? 1.0);
        const successes = Number(frontmatter.successes ?? NaN);
        const failures = Number(frontmatter.failures ?? NaN);
        const samples = Number(frontmatter.samples ?? NaN);
        const ecc = Number.isFinite(successes) || Number.isFinite(failures)
          ? (() => {
              const succ = Number.isFinite(successes) ? successes : 0;
              const fail = Number.isFinite(failures) ? failures : 0;
              const n = succ + fail;
              if (n <= 0) return rawConfidence;
              const rate = succ / n;
              return Math.max(0, Math.min(0.95, rate * Math.sqrt(n) / (1 + Math.sqrt(n))));
            })()
          : (Number.isFinite(samples) && samples > 0
              ? (() => {
                  const n = samples;
                  return Math.max(0, Math.min(0.95, Math.sqrt(n) / (1 + Math.sqrt(n))));
                })()
              : rawConfidence);
        const visibility = (["global", "stack", "project"].includes(String(frontmatter.scope))
          ? String(frontmatter.scope)
          : "global") as "global" | "stack" | "project";
        instincts.push({
          id: String(frontmatter.id ?? file.replace(/\.md$/, "")),
          agent: String(frontmatter.agent ?? agentName),
          scope: (frontmatter.scope as "god" | "sub-agent") ?? scope,
          visibility,
          projects: Array.isArray(frontmatter.projects) ? frontmatter.projects as string[] : [],
          stacks: Array.isArray(frontmatter.stacks) ? frontmatter.stacks as string[] : [],
          quickCircuit: frontmatter.quick_circuit === true,
          samples: Number.isFinite(samples) ? samples : 0,
          successes: Number.isFinite(successes) ? successes : 0,
          failures: Number.isFinite(failures) ? failures : 0,
          // God instincts carry `trigger`, not `tags`; the old reader left
          // every god's tags empty, so every score was 0 by construction.
          tags: (Array.isArray(frontmatter.tags) && (frontmatter.tags as string[]).length > 0)
            ? (frontmatter.tags as string[])
            : extractTags(`${String(frontmatter.trigger ?? '')} ${String(frontmatter.id ?? file.replace(/\.md$/, ''))}`),
          confidence: ecc,
          dispatch_count: Number(frontmatter.dispatch_count ?? 0),
          last_invoked_at: (frontmatter.last_invoked_at as string) ?? null,
          type: (frontmatter.type as "seed" | "empirical") ?? kind,
          body: body.trim(),
          source_path: filePath,
        });
      } catch { /* skip unreadable */ }
    }
  }
  }
  // v0.1.7 — project memory is a separate lane, visible only in that project.
  // It is a prior/hint, never a global shortcut (quick_circuit stays false).
  if (scope === "god" && project) {
    const projectDir = join(INSTINCTS_ROOT, "..", "project-instincts", String(project), agentName);
    if (existsSync(projectDir)) {
      for (const file of readdirSync(projectDir)) {
        if (!file.endsWith(".md")) continue;
        const filePath = join(projectDir, file);
        try {
          const content = readFileSync(filePath, "utf8");
          const { frontmatter, body } = parseFrontmatter(content);
          const rawConfidence = Number(frontmatter.confidence ?? 0.7);
          const samples = Number(frontmatter.samples ?? 0);
          const visibility = "project" as const;
          instincts.push({
            id: String(frontmatter.id ?? file.replace(/\.md$/, "")),
            agent: String(frontmatter.agent ?? agentName),
            scope,
            visibility,
            projects: Array.isArray(frontmatter.projects) ? frontmatter.projects as string[] : [String(project)],
            stacks: Array.isArray(frontmatter.stacks) ? frontmatter.stacks as string[] : [],
            quickCircuit: false,
            samples: Number.isFinite(samples) ? samples : 0,
            successes: Number(frontmatter.successes ?? 0),
            failures: Number(frontmatter.failures ?? 0),
            tags: (Array.isArray(frontmatter.tags) && (frontmatter.tags as string[]).length > 0)
              ? frontmatter.tags as string[]
              : extractTags(`${String(frontmatter.trigger ?? '')} ${String(frontmatter.id ?? file.replace(/\.md$/, ''))}`),
            confidence: rawConfidence,
            dispatch_count: Number(frontmatter.dispatch_count ?? 0),
            last_invoked_at: typeof frontmatter.last_invoked_at === "string" ? frontmatter.last_invoked_at : null,
            type: "empirical",
            body,
            source_path: filePath,
          });
        } catch { /* one bad project file never breaks the gate */ }
      }
    }
  }
  return instincts;
}

/**
 * v0.0.53 — coverage of the INSTINCT, not the max of both lengths.
 *
 * The old formula divided by max(queryTags, instinctTags): a natural-language
 * query has dozens of tags, so even 100% of the instinct's tags produced
 * ~0.10-0.20 and 0.85 was unreachable. Coverage asks "how much of this proven
 * trigger is present?", which is the question the gate actually needs.
 * At least two hits and half the trigger are required; one generic word is
 * never a short-circuit.
 */
function tagMatch(queryTags: string[], instinctTags: string[]): { sim: number; hits: number; coverage: number } {
  if (queryTags.length === 0 || instinctTags.length === 0) return { sim: 0, hits: 0, coverage: 0 };
  const instinctSet = new Set(instinctTags.map((t) => t.toLowerCase()));
  let hits = 0;
  for (const tag of queryTags) {
    if (instinctSet.has(tag.toLowerCase())) hits++;
  }
  const coverage = hits / instinctTags.length;
  return { sim: hits >= 2 && coverage >= 0.5 ? coverage : 0, hits, coverage };
}

function extractTags(query: string): string[] {
  const stopwords = new Set(["the","a","an","is","are","was","were","be","been","being","have","has","had","do","does","did","will","would","could","should","may","might","must","can","shall","to","of","in","for","on","with","as","by","at","from","up","about","into","through","during","before","after","above","below","and","or","but","not","no","yes","this","that","these","those","i","you","he","she","it","we","they","me","him","her","us","them","my","your","his","its","our","their","what","which","who","when","where","why","how","all","each","every","both","few","more","most","other","some","such","only","own","same","so","than","too","very","just","now"]);
  const words = query.toLowerCase().split(/[^a-z0-9-]+/).filter((w) => w.length > 2 && !stopwords.has(w));
  return [...new Set(words)];
}

function activeContext(): { slug: string | null; stacks: string[] } {
  const envSlug = String(process.env.OLYMPUS_ACTIVE_PROJECT || "").trim();
  const envStacks = String(process.env.OLYMPUS_ACTIVE_STACK || "").split(",").map((s) => s.trim()).filter(Boolean);
  const home = process.env.OLYMPUS_HOME || join(homedir(), ".olympus");
  let slug = envSlug || null;
  if (!slug) {
    try {
      const raw = JSON.parse(readFileSync(join(home, "active-project.json"), "utf8"));
      if (typeof raw?.slug === "string" && raw.slug) slug = raw.slug;
    } catch { /* no active project */ }
  }
  let stacks = envStacks;
  if (slug && stacks.length === 0) {
    try {
      const note = readFileSync(join(VAULT_ROOT, "02_Projects", slug, "project.md"), "utf8");
      const m = note.match(/^stacks:\s*\[([^\]]*)\]/m);
      if (m) stacks = m[1].split(",").map((s) => s.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
    } catch { /* no note yet */ }
  }
  return { slug, stacks };
}

function visibleInContext(instinct: Instinct, ctx: { slug: string | null; stacks: string[] }): boolean {
  if (instinct.type === "seed") return true;
  if (instinct.visibility === "project") return Boolean(ctx.slug && instinct.projects.includes(ctx.slug));
  if (instinct.visibility === "stack") {
    if (ctx.stacks.length === 0) return false;
    return instinct.stacks.some((s) => ctx.stacks.includes(s));
  }
  if (instinct.stacks.length === 0) return true;
  if (ctx.stacks.some((s) => instinct.stacks.includes(s))) return true;
  return instinct.confidence >= 0.85; // cross-stack promotion rule
}

export function queryInstincts(
  scope: "god" | "sub-agent",
  agentName: string,
  query: string,
  topK = 3,
  context?: { project?: string | null; stacks?: string[] | null },
): InstinctQueryResult {
  const ctx = context
    ? { slug: context.project ?? null, stacks: context.stacks ?? [] }
    : activeContext();
  const instincts = loadInstincts(scope, agentName, ctx.slug).filter((i) => visibleInContext(i, ctx));
  // The hop prompt marks its task explicitly; a chat has no marker, so take
  // the tail (the user's ask) rather than the strategy/arsenal preamble.
  const marker = /\[OLYMPUS-TASK\]([\s\S]*?)\[\/OLYMPUS-TASK\]/i.exec(query);
  const task = marker ? marker[1] : query.length > 800 ? query.slice(-800) : query;
  const queryTags = task.includes(",")
    ? task.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean)
    : extractTags(task);
  const scored = instincts.map((instinct) => {
    const match = tagMatch(queryTags, instinct.tags);
    const score = match.sim * instinct.confidence;
    return { instinct, sim: match.sim, score, hits: match.hits };
  });
  scored.sort((a, b) => b.score - a.score);
  const top = scored[0];
  const matching = top && top.sim > 0 ? top.instinct : null;
  const confidence = matching ? top!.score : 0;
  const alternatives = scored.slice(1, 1 + topK).filter((s) => s.sim > 0).map((s) => s.instinct);
  // ECC contract: a short-circuit needs a proven quick circuit, high
  // instinct confidence AND a task/trigger match. The product score remains
  // the ranking signal; it is not the short-circuit gate by itself.
  let qualifies = Boolean(
    matching
    && top!.sim >= 0.6
    && matching.quickCircuit
    && matching.confidence >= 0.85,
  );
  // ECC v3.0 anti-addiction: 1-in-10 would-be short-circuits is forced to
  // deliberate again. The counter is persistent so restarts cannot reset it.
  let verificationSample = false;
  if (qualifies) {
    try {
      const home = process.env.OLYMPUS_HOME || join(homedir(), ".olympus");
      const file = join(home, "shortcircuit-counter.json");
      let count = 0;
      try { count = Number(JSON.parse(readFileSync(file, "utf8"))?.count || 0); } catch { /* first */ }
      count += 1;
      mkdirSync(home, { recursive: true });
      writeFileSync(file, JSON.stringify({ count, updatedAt: new Date().toISOString() }) + "\n", { mode: 0o600 });
      if (count % 10 === 0) { qualifies = false; verificationSample = true; }
    } catch { /* the counter is best-effort; never break the turn */ }
  }
  return {
    confidence,
    matching_instinct: matching,
    alternatives,
    scope,
    agent_name: agentName,
    short_circuit: qualifies,
    verification_sample: verificationSample,
    visibility: matching ? (matching.type === "seed" ? "seed" : matching.visibility) : "hidden",
  };
}

export function isScopeAllowed(
  callerScope: "god" | "sub-agent",
  callerAgentName: string,
  requestedScope: "god" | "sub-agent",
  requestedAgent: string,
): boolean {
  if (callerScope === "god") return true;
  return requestedScope === "sub-agent" && requestedAgent === callerAgentName;
}

// (The old stub lived here: getActiveScopeAndAgent returned
//  {scope:'god', agent:'apollo'} for every session — see the un-stub
//  above, W-A RAG-CERT A5.)

// Assign to a const before exporting as default (eslint import/no-anonymous-
// default-export requires a named binding for `export default`).
const instinctGate = {
  CONFIDENCE_THRESHOLD,
  queryInstincts,
  isScopeAllowed,
  getActiveScopeAndAgent,
  registerSessionAgent,
  logShortCircuitEvaluation,
};
export default instinctGate;
