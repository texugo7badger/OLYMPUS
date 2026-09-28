/**
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { NO_CACHE_HEADERS } from '@/app/api/olympus/_lib/no-cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VAULT_ROOT = process.env.OLYMPUS_VAULT || path.join(os.homedir(), 'OLYMPUS-VAULT');
const ACTIVITY_FEED = path.join(VAULT_ROOT, '06_Activity_Feed', 'live.jsonl');
const COST_FEED = path.join(os.homedir(), '.olympus', 'metrics', 'cost.jsonl');
const OLYMPUS_ROOT = process.env.OLYMPUS_ROOT || process.cwd();

/**
 * God → dispatchable demigods + skill arsenal + MCP allowlist.
 *
 * Agency-agents integration.
 *
 * Redesigned drawing from the msitarzewski/agency-agents repository (230+
 * specialized AI agents). Each Olympus god now has 4-5 DEEPLY SPECIALIZED
 * demigods — each with personality, mission, critical rules, deliverables,
 * workflow, clv2 learning integration, and a god-review protocol.
 *
 * DESIGN PRINCIPLES (agency-agents patterns):
 *   1. Phase-gated pipeline: god dispatches → demigod executes → god
 *      reviews/approves → task complete. No phase advances without review.
 *   2. Each demigod has a CLEAR specialty (no overlap between demigods
 *      within a god, and no overlap between gods).
 *   3. Sub-agents have NO pre-set skills — gods equip dynamically at
 *      dispatch time based on task + instinct matches (clv2 learning).
 *   4. Every demigod prompt includes: identity, mission, critical rules,
 *      deliverables, workflow, clv2 instinct querying, god-review protocol.
 *   5. No emojis in prompts (OpenCode GO plan compatibility).
 *   6. Gods have 4-7 skills (healthy range, max 8).
 *
 * SPECIALTY MAP:
 *   Apollo       — Planning & architecture: specs, ADRs, task DAG, risk assessment
 *   Atlas        — Orchestration & execution: wave dispatch, integration, coordination
 *   Artemis      — Security & auditing: SAST, pentesting, compliance, threats
 *   Athena       — Frontend & design: React, Next.js, a11y, design systems
 *   Dionysus     — QA & testing: TDD, E2E, evidence, performance
 *   Hephaestus   — Backend CODE: multi-language review, build, API, refactor
 *   Hermes       — Integrations & MCPs: MCP building, API wiring, research
 *   Persephone   — Database & persistence: schema, migration, data, DBRE
 *   Prometheus   — DevOps & CI-CD: Docker, Terraform, SRE, incident, release
 *   Callimachus  — Vault curation: instinct lifecycle, backup, docs
 */
const GOD_DISPATCH_CATALOG: Record<string, {
  demigods: { task: string; agent: string }[];
  skills: string[];
  mcps: string[];
}> = {
  apollo: {
    // Apollo = PLANNING & ARCHITECTURE. He owns planning, spec, architecture.
    // He creates the task DAG and hands execution to Atlas. He dispatches his
    // own planning demigods in parallel for non-trivial tasks.
    demigods: [
      { task: 'Complex feature planning + implementation strategy + task DAG', agent: 'planner' },
      { task: 'System architecture + ADRs + trade-off analysis (parallel planning)', agent: 'architect' },
      { task: 'Spec interview + requirements gathering + user story authoring', agent: 'spec-author' },
      { task: 'Create new demigod prompt files on demand', agent: 'demigod-author' },
      { task: 'Risk assessment + dependency analysis + mitigation planning', agent: 'risk-assessor' },
      { task: 'Scope boundary enforcement + feature creep defense', agent: 'scope-gatekeeper' },
      { task: 'Rapid prototyping + proof-of-concept implementation', agent: 'rapid-prototyper' },
      { task: 'Spec mining + requirements discovery from existing code/docs', agent: 'spec-miner' },
    ],
    skills: ['dispatching-parallel-agents', 'writing-plans', 'brainstorming', 'executing-plans', 'using-superpowers'],
    mcps: ['github', 'mcp-gateway'],
  },
  atlas: {
    // Atlas = ORCHESTRATION & EXECUTION DISPATCH. He receives the task DAG
    // from Apollo and executes it wave by wave, dispatching to specialist
    // gods. He owns 6 demigods that handle the mechanical complexity of
    // multi-agent orchestration.
    demigods: [
      { task: 'Dispatch DAG optimization + parallel wave planning + critical path analysis', agent: 'dag-optimizer' },
      { task: 'Multi-god output synthesis + contradiction detection + resolution dispatch', agent: 'integration-compiler' },
      { task: 'Cross-god coordination + thread tracking + escalation management', agent: 'chief-of-staff' },
      { task: 'Git workflow coordination + multi-branch change orchestration', agent: 'git-workflow-master' },
      { task: 'Multi-agent dispatch pattern optimization + agent interaction architecture', agent: 'multi-agent-architect' },
      { task: 'Silent failure detection + retry probing + failure pattern recognition', agent: 'silent-failure-hunter' },
    ],
    skills: ['dispatching-parallel-agents', 'executing-plans', 'using-superpowers', 'verification-before-completion', 'subagent-driven-development'],
    mcps: ['sequential-thinking'],
  },
  artemis: {
    // Artemis = SECURITY & AUDITING. All security work goes here.
    // 4 specialized demigods covering the full security lifecycle.
    demigods: [
      { task: 'Security code review (OWASP Top 10, secrets, auth, input validation)', agent: 'security-reviewer' },
      { task: 'Penetration testing + exploit verification', agent: 'pentester' },
      { task: 'Compliance auditing (SOC2, GDPR, HIPAA, PCI-DSS)', agent: 'compliance-auditor' },
      { task: 'Threat modeling + ATT&CK mapping + attack surface analysis', agent: 'threat-analyst' },
    ],
    skills: ['security-review', 'production-audit', 'systematic-debugging', 'verification-before-completion', 'dispatching-parallel-agents'],
    // Sentry + langfuse removed (paid MCPs, not in the
    // free base build). sequential-thinking kept (free). Artemis can still
    // do security review + production audit without the paid observability
    // MCPs -- the gods use their skills + the LLM to analyze code. Users
    // who want Sentry/Langfuse integration can add them back via .mcp.json.
    mcps: ['sequential-thinking'],
  },
  athena: {
    // Athena = FRONTEND & DESIGN. React, Next.js, a11y, design systems.
    // 4 demigods: code review, UI design, accessibility, visual verification.
    demigods: [
      { task: 'Frontend code review (React/Next.js patterns, performance, hooks)', agent: 'frontend-reviewer' },
      { task: 'UI design + design system + component library authoring', agent: 'ui-designer' },
      { task: 'Accessibility audit (WCAG 2.1, Section 508, ARIA, keyboard nav)', agent: 'a11y-auditor' },
      { task: 'Vision-based UI verification (click-to-element, visual regression)', agent: 'visual-verifier' },
    ],
    skills: ['frontend-patterns', 'frontend-a11y', 'impeccable', 'design-system', 'brand-guidelines', 'verification-before-completion', 'dispatching-parallel-agents'],
    mcps: ['chrome-devtools', 'playwright', 'nakkas', 'figma', 'opendesign', 'shadcn'],
  },
  dionysus: {
    // Dionysus = QA & TESTING. TDD, E2E, evidence collection, performance.
    // 4 demigods covering the full testing lifecycle.
    demigods: [
      { task: 'TDD workflow guidance (write tests first, red-green-refactor)', agent: 'tdd-guide' },
      { task: 'Playwright E2E test authoring + execution + flaky test resolution', agent: 'e2e-runner' },
      { task: 'Evidence collection (screenshots, logs, reproduction steps for QA)', agent: 'evidence-collector' },
      { task: 'Performance benchmarking + load testing + profiling', agent: 'performance-tester' },
    ],
    skills: ['test-driven-development', 'e2e-testing', 'eval-harness', 'verification-before-completion', 'dispatching-parallel-agents'],
    mcps: ['playwright'],
  },
  hephaestus: {
    // Hephaestus = BACKEND CODE. Multi-language review + build + API + refactor.
    // 5 demigods. Consolidated the 15+ language-specific reviewers into
    // a single smart reviewer that adapts to the language detected.
    demigods: [
      { task: 'Multi-language code review (Rust, Python, Go, C++, Java, Kotlin, PHP, TS/JS)', agent: 'managed-reviewer' },
      { task: 'Multi-language build error resolution (compiler + linker + type errors)', agent: 'build-resolver' },
      { task: 'API design + contract authoring + OpenAPI/Protobuf schemas', agent: 'api-designer' },
      { task: 'Refactor + dead code removal + minimal-change engineering', agent: 'refactor-engineer' },
      { task: 'Backend code verification (logic correctness, edge cases, error paths)', agent: 'code-verifier' },
    ],
    skills: ['backend-patterns', 'api-design', 'coding-standards', 'error-handling', 'verification-before-completion', 'dispatching-parallel-agents'],
    mcps: ['serena', 'context7', 'postgres'],
  },
  hermes: {
    // Hermes = INTEGRATIONS & MCPs. MCP building, API wiring, research, LLM arch.
    // 4 demigods covering the full integration lifecycle.
    demigods: [
      { task: 'MCP server development + tool definitions + transport (stdio/SSE)', agent: 'mcp-builder' },
      { task: 'External API integration + webhook handling + auth flow wiring', agent: 'api-integrator' },
      { task: 'Research + docs lookup + Context7 + deep multi-source research', agent: 'researcher' },
      { task: 'LLM architecture + model routing + prompt chain design + cost optimization', agent: 'llm-architect' },
    ],
    skills: ['intent-driven-development', 'api-design', 'tool-routing-pattern', 'search-first', 'deep-research', 'dispatching-parallel-agents'],
    // Firecrawl + tavily + langfuse removed (paid MCPs).
    // context7 kept (free, open source). Hermes can still research + build
    // integrations using context7 (library docs) + the LLM. Users who want
    // web scraping (firecrawl) or web search (tavily) can add them back.
    mcps: ['context7'],
  },
  persephone: {
    // Persephone = DATABASE & PERSISTENCE. Schema, migration, data, DBRE.
    // 4 demigods covering the full database lifecycle.
    demigods: [
      { task: 'Schema review + normalization + index optimization + query plans', agent: 'schema-reviewer' },
      { task: 'Migration writing + execution + rollback strategy + zero-downtime deploys', agent: 'migration-engineer' },
      { task: 'Data engineering + ETL pipelines + data lake + streaming', agent: 'data-engineer' },
      { task: 'Database reliability (HA, replication, PITR backups, failover)', agent: 'dbre' },
    ],
    skills: ['backend-patterns', 'error-handling', 'systematic-debugging', 'verification-before-completion', 'dispatching-parallel-agents'],
    // Awslabs-s3 + awslabs-iam removed (paid AWS MCPs).
    // postgres + kubernetes kept (free, open source). Persephone can still
    // do schema review + migrations + DBRE with postgres + kubernetes.
    // Users who need AWS S3/IAM integration can add them back.
    mcps: ['postgres', 'kubernetes'],
  },
  prometheus: {
    // Prometheus = DEVOPS & CI-CD. Docker, Terraform, SRE, incident, release.
    // 5 demigods covering the full DevOps lifecycle.
    demigods: [
      { task: 'Dockerfile + docker-compose authoring + image optimization', agent: 'docker-expert' },
      { task: 'Terraform IaC authoring + state management + module design', agent: 'terraform-engineer' },
      { task: 'SRE engineering + monitoring + alerting + runbooks + error budgets', agent: 'sre' },
      { task: 'Incident response + postmortem + root cause analysis', agent: 'incident-responder' },
      { task: 'Release engineering + CI/CD pipelines + deployment strategies', agent: 'release-engineer' },
    ],
    skills: ['docker-patterns', 'kubernetes-patterns', 'deployment-patterns', 'production-audit', 'using-git-worktrees', 'finishing-a-development-branch', 'dispatching-parallel-agents'],
    // Vercel removed (paid MCP). Docker + kubernetes +
    // grafana kept (free). Prometheus can still do Docker + k8s + SRE +
    // monitoring with the free MCPs. Users who want Vercel deploy integration
    // can add it back.
    mcps: ['docker', 'kubernetes', 'grafana'],
  },
  callimachus: {
    // Callimachus = VAULT CURATION. Instinct lifecycle, backup, docs.
    // 4 demigods. Consolidated the 3 instinct agents into one curator.
    demigods: [
      { task: 'Instinct curation (archive stale, dedup similar, promote high-confidence)', agent: 'instinct-curator' },
      { task: 'Vault snapshot + tar.gz backup (disaster recovery)', agent: 'brain-backup' },
      { task: 'Vault restore from snapshot + integrity verification', agent: 'brain-restore' },
      { task: 'Docs verification (link integrity, frontmatter validation, orphan detection)', agent: 'docs-verifier' },
    ],
    skills: ['continuous-learning-v2', 'writing-skills', 'using-superpowers', 'dispatching-parallel-agents'],
    mcps: [],
  },
};

/**
 * Dynamic skill suggestion.
 *
 * When a god dispatches a demigod, they evaluate the task and equip the
 * best-matching skill dynamically. This function returns a SUGGESTED skill
 * for a given task description — the god is free to override it based on
 * instinct matches + context. This is NOT a pre-set assignment; it's a
 * hint that the god's prompt tells them to consider.
 *
 * The god's actual equip decision happens in the OpenCode runtime when
 * they invoke the demigod via `subtask: true`. The god reads the task,
 * queries their instincts, and passes `--skills <best-match>` to the
 * demigod. This function just powers the "suggested skill" column in
 * the dispatch-graph UI so the user can see what the god will likely pick.
 */
function suggestSkillForTask(godId: string, task: string): string | null {
  const t = task.toLowerCase();
  // Simple keyword → skill mapping. The god's prompt overrides this.
  if (t.includes('plan') || t.includes('strategy')) return 'writing-plans';
  if (t.includes('architect') || t.includes('design decision')) return 'brainstorming';
  if (t.includes('security') || t.includes('sast') || t.includes('penetr')) return 'security-review';
  if (t.includes('compliance') || t.includes('audit')) return 'production-audit';
  if (t.includes('a11y') || t.includes('accessib')) return 'frontend-a11y';
  if (t.includes('design') || t.includes('brand')) return 'design-system';
  if (t.includes('e2e') || t.includes('playwright')) return 'e2e-testing';
  if (t.includes('tdd') || t.includes('test-first')) return 'test-driven-development';
  if (t.includes('eval') || t.includes('harness')) return 'eval-harness';
  if (t.includes('rust') || t.includes('python') || t.includes('golang') || t.includes('go code') || t.includes('c++') || t.includes('java') || t.includes('kotlin') || t.includes('php')) return 'backend-patterns';
  if (t.includes('build error') || t.includes('build resol')) return 'error-handling';
  if (t.includes('refactor') || t.includes('dead code')) return 'coding-standards';
  if (t.includes('docker')) return 'docker-patterns';
  if (t.includes('kubernetes') || t.includes(' k8s')) return 'kubernetes-patterns';
  if (t.includes('deploy') || t.includes('terraform')) return 'deployment-patterns';
  if (t.includes('migration') || t.includes('schema')) return 'backend-patterns';
  if (t.includes('mcp') || t.includes('integration')) return 'tool-routing-pattern';
  if (t.includes('docs') || t.includes('document')) return 'search-first';
  if (t.includes('verify') || t.includes('verification')) return 'verification-before-completion';
  if (t.includes('instinct') || t.includes('archive') || t.includes('dedup') || t.includes('promote')) return 'writing-skills';
  if (t.includes('backup') || t.includes('restore') || t.includes('snapshot')) return 'using-superpowers';
  return null;
}

/**
 * Parse the last N lines of the activity feed for short-circuit events.
 */
function getRecentShortCircuits(godId: string | null, limit = 20): any[] {
  try {
    if (!fs.existsSync(ACTIVITY_FEED)) return [];
    const lines = fs.readFileSync(ACTIVITY_FEED, 'utf-8').trim().split('\n').slice(-limit * 10);
    const events: any[] = [];
    for (const line of lines) {
      try {
        const ev = JSON.parse(line);
        if (ev.type === 'shortcircuit' || (ev.action === 'shortcircuit')) {
          if (!godId || ev.god === godId) {
            events.push(ev);
          }
        }
      } catch {}
    }
    return events.slice(-limit);
  } catch { return []; }
}

/**
 * Count live dispatch events per demigod from the activity feed.
 */
function getLiveAgentUsage(godId: string | null): Record<string, { count: number; tokens: { input: number; output: number }; lastOutcome: string | null }> {
  try {
    if (!fs.existsSync(ACTIVITY_FEED)) return {};
    const lines = fs.readFileSync(ACTIVITY_FEED, 'utf-8').trim().split('\n').slice(-500);
    const usage: Record<string, any> = {};
    for (const line of lines) {
      try {
        const ev = JSON.parse(line);
        if ((ev.type === 'dispatch' || ev.action === 'dispatch') && ev.subagent) {
          if (!godId || ev.god === godId) {
            const agent = ev.subagent;
            if (!usage[agent]) usage[agent] = { count: 0, tokens: { input: 0, output: 0 }, lastOutcome: null };
            usage[agent].count++;
            if (ev.tokens) {
              usage[agent].tokens.input += ev.tokens.input || 0;
              usage[agent].tokens.output += ev.tokens.output || 0;
            }
            if (ev.outcome) usage[agent].lastOutcome = ev.outcome;
          }
        }
      } catch {}
    }
    return usage;
  } catch { return {}; }
}

/**
 * Get live cost per god from cost.jsonl.
 */
function getLiveGodCost(godId: string): { spend: number; requests: number } | null {
  try {
    if (!fs.existsSync(COST_FEED)) return null;
    const lines = fs.readFileSync(COST_FEED, 'utf-8').trim().split('\n').slice(-500);
    let spend = 0;
    let requests = 0;
    for (const line of lines) {
      try {
        const ev = JSON.parse(line);
        if (ev.god === godId) {
          spend += ev.spend_usd || 0;
          requests++;
        }
      } catch {}
    }
    return { spend, requests };
  } catch { return null; }
}

export async function GET(req: NextRequest) {
  const god = new URL(req.url).searchParams.get('god') || '';
  if (!god) {
    return NextResponse.json({ error: 'Missing ?god=' }, { status: 400 });
  }

  // DYNAMIC demigod list. Read the actual .txt files
  // from .opencode/prompts/agents/demigods/<god>/ so the UI always reflects
  // what's on disk. When a god creates a new demigod, it appears here
  // immediately (no manual catalog update needed).
  const GOD_NAMES = new Set([
    'apollo', 'atlas', 'artemis', 'athena', 'dionysus', 'hephaestus',
    'hermes', 'persephone', 'prometheus', 'callimachus',
  ]);
  if (!GOD_NAMES.has(god)) {
    return NextResponse.json({
      god,
      demigods: [],
      skills: [],
      mcps: [],
      recentShortCircuits: [],
      subAgentCount: 0,
      activeDemigodCount: 0,
    }, { headers: NO_CACHE_HEADERS });
  }

  // Read demigod .txt files from disk
  const demigodsDir = path.join(OLYMPUS_ROOT, '.opencode', 'prompts', 'agents', 'demigods', god);
  const diskDemigods: string[] = [];
  try {
    if (fs.existsSync(demigodsDir)) {
      for (const f of fs.readdirSync(demigodsDir)) {
        if (f.endsWith('.txt')) {
          diskDemigods.push(f.replace(/\.txt$/, ''));
        }
      }
    }
  } catch {}

  // Merge disk demigods with the catalog's task descriptions.
  // The catalog provides human-readable task descriptions; the disk provides
  // the canonical list. If a demigod is on disk but not in the catalog, give
  // it a generic task description. If it's in the catalog but not on disk,
  // skip it (the file was deleted).
  const catalog = GOD_DISPATCH_CATALOG[god];
  const catalogMap = new Map((catalog?.demigods ?? []).map(d => [d.agent, d.task]));

  // Read each demigod's one-line description from its .txt file.
  // The demigod prompt's "## Identity" section has the description. We extract
  // the first non-empty line after "## Identity" as the one-line summary.
  // If the catalog has a richer task description, prefer that.
  function readDemigodDescription(godDir: string, agent: string): string | null {
    try {
      // Try both hyphen and underscore variants
      const variants = [`${agent}.txt`, `${agent.replace(/-/g, '_')}.txt`];
      for (const fname of variants) {
        const fp = path.join(godDir, fname);
        if (!fs.existsSync(fp)) continue;
        const content = fs.readFileSync(fp, 'utf-8');
        // Find the "## Identity" section and extract the first non-empty line
        const lines = content.split('\n');
        let inIdentity = false;
        for (const line of lines) {
          if (line.startsWith('## Identity')) { inIdentity = true; continue; }
          if (line.startsWith('## ')) { if (inIdentity) break; continue; }
          if (!inIdentity) continue;
          const trimmed = line.trim();
          if (trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('<!--')) {
            return trimmed;
          }
        }
        return null;
      }
    } catch {}
    return null;
  }

  const demigodList = diskDemigods.map(agent => {
    // Prefer the catalog's task description, then the .txt file's Identity,
    // then a generic fallback.
    const fromCatalog = catalogMap.get(agent);
    const fromFile = readDemigodDescription(demigodsDir, agent);
    const task = fromCatalog || fromFile || `${agent.charAt(0).toUpperCase() + agent.slice(1).replace(/-/g, ' ')} — demigod of ${god}`;
    return { task, agent };
  });

  // Skills + MCPs from the catalog (these are the god's declared arsenal)
  const skills = catalog?.skills ?? [];
  const mcps = catalog?.mcps ?? [];

  const usage = getLiveAgentUsage(god);
  const liveCost = getLiveGodCost(god);
  const recentShortCircuits = getRecentShortCircuits(god);

  // Enrich demigods with live usage data + a SUGGESTED skill (dynamic).
  const demigods = demigodList.map(a => {
    const u = usage[a.agent];
    return {
      ...a,
      suggestedSkill: suggestSkillForTask(god, a.task),
      usage: u || { count: 0, tokens: { input: 0, output: 0 }, lastOutcome: null },
    };
  });

  const activeDemigodCount = demigods.filter(a => a.usage && a.usage.count > 0).length;

  return NextResponse.json({
    god,
    demigods,
    skills: catalog.skills,
    mcps: catalog.mcps,
    recentShortCircuits,
    subAgentCount: catalog.demigods.length,
    activeDemigodCount,
    liveCost,
  }, { headers: NO_CACHE_HEADERS });
}
