/**
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { NextRequest, NextResponse } from 'next/server';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VAULT = process.env.OLYMPUS_VAULT || path.join(os.homedir(), 'OLYMPUS-VAULT');

// God metadata. Models match the go-balanced strategy in model-strategies.ts.
// GLM-5.2 is reserved for Apollo alone.
const GOD_META: Record<string, { icon: string; domain: string; model: string; caveman: string; army: number }> = {
  apollo:      { icon: 'apollo',     domain: 'Planner — Architecture, Spec',       model: 'opencode-go/glm-5.2',         caveman: 'never', army: 8 },
  atlas:       { icon: 'git-fork',   domain: 'Orchestrator — Dispatch, Execution', model: 'opencode-go/hy3',              caveman: 'never', army: 6 },
  hephaestus:  { icon: 'hephaestus', domain: 'Backend / Infrastructure',           model: 'opencode-go/deepseek-v4-pro', caveman: 'full',  army: 30 },
  athena:      { icon: 'athena',     domain: 'Frontend / UX-UI / Design',          model: 'opencode-go/qwen3.7-plus',    caveman: 'never', army: 7 },
  hermes:      { icon: 'hermes',     domain: 'Integrations / APIs / MCPs',         model: 'opencode-go/qwen3.7-plus',    caveman: 'full',  army: 2 },
  artemis:     { icon: 'artemis',    domain: 'Security / Auditing',                model: 'opencode-go/qwen3.7-plus',    caveman: 'lite',  army: 3 },
  dionysus:    { icon: 'dionysus',   domain: 'QA / Testing / Edge Cases',          model: 'opencode-go/deepseek-v4-pro', caveman: 'full',  army: 6 },
  persephone:  { icon: 'persephone', domain: 'Database / Persistence',             model: 'opencode-go/deepseek-v4-pro', caveman: 'full',  army: 2 },
  prometheus:  { icon: 'prometheus', domain: 'DevOps / CI-CD / Deploy',            model: 'opencode-go/qwen3.7-plus',    caveman: 'full',  army: 6 },
  callimachus: { icon: 'callimachus', domain: 'Vault curator — Instincts, Compaction', model: 'opencode-go/deepseek-v4-flash', caveman: 'full', army: 0 },
};

const GOD_SKILLS: Record<string, string[]> = {
  apollo: ['planner', 'architect', 'parallel-execution-optimizer', 'autonomous-loops'],
  atlas: ['dag-optimizer', 'integration-compiler', 'chief-of-staff', 'multi-agent-architect'],
  hephaestus: ['backend-patterns', 'python-patterns', 'rust-patterns', 'api-design'],
  athena: ['frontend-patterns', 'react-performance', 'liquid-glass-design'],
  hermes: ['mcp-server-patterns', 'websearch', 'webfetch', 'fal-ai-media'],
  artemis: ['security-review', 'security-scan'],
  dionysus: ['tdd-guide', 'e2e-testing', 'eval-harness'],
  persephone: ['database-migrations', 'postgres-patterns', 'clickhouse-io'],
  prometheus: ['deployment-patterns', 'docker-patterns', 'bun-runtime'],
};

// Pastel palette (Issue 11)
const SKILL_BLUE = '#6B8FB5';
const COLORS = {
  god: '#D4A574', instinctHigh: '#7BAE8E', instinctLow: '#C4A265',
  project: '#9B7BAE', knowledge: '#6BAEB5',
};

/**
 * GET /api/olympus/snapshot?commit=<index>
 *
 * v0.0.1: NO simulated instincts/projects/knowledge are added. The snapshot
 * only loads REAL entities from the .opencode/ config. Cold-start: all gods show
 * historical_success_rate: 0 / historical_sample_size: 0.
 *
 * Issue 5: `glyph` field replaced with `icon` (lucide icon key string).
 */
export async function GET(req: NextRequest) {
  const commitIdx = parseInt(req.nextUrl.searchParams.get('commit') || '0', 10);

  let commitCount = 1;
  try {
    const log = execSync('git log --oneline', { cwd: VAULT, encoding: 'utf-8', timeout: 5000 }).trim();
    commitCount = log.split('\n').filter(Boolean).length;
  } catch {}

  const growthFactor = commitCount > 1 ? commitIdx / (commitCount - 1) : 1;

  const nodes: any[] = [];
  const links: any[] = [];

  for (const [id, meta] of Object.entries(GOD_META)) {
    const display = id.charAt(0).toUpperCase() + id.slice(1);
    nodes.push({
      id: `god:${id}`,
      name: display,
      type: 'god', god: id, icon: meta.icon,
      domain: meta.domain, model: meta.model, caveman: meta.caveman,
      army_size: meta.army, val: 28, color: COLORS.god,
      cold_start: true,
      historical_success_rate: 0,
      historical_sample_size: 0,
      description: `${display} — ${meta.domain}. Model class: ${meta.model}. Caveman: ${meta.caveman}. Army: ${meta.army} sub-agents.`,
    });
  }
  for (const id of Object.keys(GOD_META)) {
    if (id === 'apollo') continue;
    links.push({ source: 'god:apollo', target: `god:${id}`, type: 'delegates', color: 'rgba(212,165,116,0.4)', particles: true, width: 2, curvature: 0.15 });
  }

  const skillFraction = 0.6 + 0.4 * growthFactor;
  for (const [god, skills] of Object.entries(GOD_SKILLS)) {
    const skillsToShow = Math.max(1, Math.ceil(skills.length * skillFraction));
    for (let i = 0; i < skillsToShow; i++) {
      const skill = skills[i];
      const sid = `skill:${skill}`;
      if (!nodes.find(n => n.id === sid)) {
        nodes.push({ id: sid, name: skill, type: 'skill', god, importance: 8, val: 10, color: SKILL_BLUE, description: `Skill ${skill} — carried by ${god}.` });
      }
      links.push({ source: `god:${god}`, target: sid, type: 'carries', color: 'rgba(255,255,255,0.15)', width: 1, curvature: 0.2 });
    }
  }

  // Real instincts from vault
  const instinctsDir = path.join(VAULT, '05_Auto_Learning', 'instincts');
  const realInstincts: Array<{ id: string; god: string; conf: number; name: string; desc: string }> = [];
  try {
    if (fs.existsSync(instinctsDir)) {
      for (const f of fs.readdirSync(instinctsDir).filter(f => f.endsWith('.md')).slice(0, 50)) {
        try {
          const raw = fs.readFileSync(path.join(instinctsDir, f), 'utf-8');
          const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
          if (!m) continue;
          const fm: Record<string, string> = {};
          for (const line of m[1].split(/\r?\n/)) {
            const kv = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
            if (kv) fm[kv[1]] = kv[2];
          }
          const god = (fm.god || '').replace(/["']/g, '').toLowerCase();
          const conf = parseFloat(fm.confidence || '0') || 0;
          const name = f.replace(/\.md$/, '');
          if (god && conf > 0) {
            realInstincts.push({
              id: `instinct:${name}`,
              god, conf, name,
              desc: (fm.description || '').replace(/["']/g, '') || `Instinct ${name}`,
            });
          }
        } catch {}
      }
    }
  } catch {}

  const instinctCount = Math.round(realInstincts.length * growthFactor);
  for (let i = 0; i < instinctCount; i++) {
    const inst = realInstincts[i];
    const color = inst.conf >= 0.7 ? COLORS.instinctHigh : COLORS.instinctLow;
    nodes.push({ id: inst.id, name: inst.name, type: 'instinct', god: inst.god, confidence: inst.conf, val: 6 + inst.conf * 8, color, description: inst.desc });
    links.push({ source: `god:${inst.god}`, target: inst.id, type: 'carries', color: 'rgba(123,174,142,0.25)', width: 1, curvature: 0.25 });
  }

  return NextResponse.json({
    graph: { nodes, links },
    commitIndex: commitIdx,
    commitCount,
    growthFactor: Math.round(growthFactor * 100) / 100,
    stats: {
      nodes: nodes.length,
      links: links.length,
      instincts: instinctCount,
      skills: nodes.filter(n => n.type === 'skill').length,
    },
  });
}
