#!/usr/bin/env node
/**
 * setup-sub-agent-instincts.js -- Creates sub-agent instinct folders + 5 seed instincts each.
 *
 * Creates ~/OLYMPUS-VAULT/05_Auto_Learning/instincts/sub-agents/<name>/{seed,empirical,_archive}
 * for all 12 OLYMPUS-Extensions sub-agents (Arsenal Patch v0.0.1).
 *
 * Usage:
 *   node scripts/setup-sub-agent-instincts.js
 *   node scripts/setup-sub-agent-instincts.js --dry-run
 *   node scripts/setup-sub-agent-instincts.js --agent verifier-code
 *
 * MIT License -- see CREDITS.md
 
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const VAULT_ROOT = process.env.OLYMPUS_VAULT || join(homedir(), "OLYMPUS-VAULT");
const SUB_AGENTS_ROOT = join(VAULT_ROOT, "05_Auto_Learning", "instincts", "sub-agents");
const dryRun = process.argv.includes("--dry-run");
const agentFilter = (() => {
  const i = process.argv.indexOf("--agent");
  return i > 0 ? process.argv[i+1] : null;
})();

const SEED_INSTINCTS = {
  "instinct-archiver": [
    { id: "01-stale-detection", tags: ["archival","stale"], body: "Instincts not invoked in 30+ days are archival candidates." },
    { id: "02-low-confidence", tags: ["archival","low-confidence"], body: "Instincts with confidence < 0.50 after 10+ dispatches are archival candidates." },
    { id: "03-superseded", tags: ["archival","superseded"], body: "Instincts covered by higher-confidence match (cosine > 0.85) are archival candidates." },
    { id: "04-contradicted", tags: ["archival","contradicted"], body: "Instincts with success rate < 30% over last 5 uses are archival candidates." },
    { id: "05-tombstone", tags: ["archival","logging"], body: "Always log archival to tombstones.jsonl. Never delete." },
  ],
  "instinct-promoter": [
    { id: "01-confidence", tags: ["promotion","threshold"], body: "Promotion requires confidence >= 0.95." },
    { id: "02-dispatch-count", tags: ["promotion","sample"], body: "Promotion requires dispatch_count >= 10." },
    { id: "03-success-rate", tags: ["promotion","outcomes"], body: "Promotion requires success_rate >= 0.90." },
    { id: "04-tag-overlap", tags: ["promotion","domain"], body: "Promotion requires tag overlap with parent god's domain." },
    { id: "05-no-dup", tags: ["promotion","dedup"], body: "Don't promote if god-level instinct already covers (cosine < 0.85)." },
  ],
  "instinct-deduper": [
    { id: "01-threshold", tags: ["dedup","threshold"], body: "Merge instincts with cosine > 0.92." },
    { id: "02-same-scope", tags: ["dedup","scope"], body: "Only merge within same scope. Cross-scope is promotion." },
    { id: "03-keep-highest", tags: ["dedup","merge"], body: "Keep highest-confidence instinct as merge target." },
    { id: "04-merge-tags", tags: ["dedup","merge"], body: "Union tags, sum dispatch counts, weighted-average confidence." },
    { id: "05-archive-absorbed", tags: ["dedup","archive"], body: "Move absorbed to archive/ with reason='merged'." },
  ],
  "brain-backup": [
    { id: "01-snapshot-path", tags: ["backup","path"], body: "Snapshots: ~/OLYMPUS-VAULT-Backups/olympus-vault-<UTC>.tar.gz" },
    { id: "02-exclude-backups", tags: ["backup","exclude"], body: "Never backup the backups dir. Exclude node_modules, .git." },
    { id: "03-verify", tags: ["backup","verify"], body: "Always verify size + file count after snapshot." },
    { id: "04-prune", tags: ["backup","retention"], body: "Keep last 10 snapshots." },
    { id: "05-manifest", tags: ["backup","manifest"], body: "Always append to manifest.jsonl." },
  ],
  "brain-restore": [
    { id: "01-verify-snapshot", tags: ["restore","verify"], body: "Verify snapshot exists and tar tzf succeeds." },
    { id: "02-pre-restore-backup", tags: ["restore","safety"], body: "Always backup current vault before overwriting." },
    { id: "03-evacuate-then-extract", tags: ["restore","procedure"], body: "Move current to evacuated-<ts>, then extract." },
    { id: "04-verify-critical", tags: ["restore","verify"], body: "Verify instincts/, 06_Activity_Feed/, 10_Design_Systems/ exist." },
    { id: "05-clean-evacuated", tags: ["restore","cleanup"], body: "Only delete evacuated vault AFTER verification passes." },
  ],
  "verifier-code": [
    { id: "01-clean-context", tags: ["verify","context"], body: "Never see the producing conversation." },
    { id: "02-silent-on-pass", tags: ["verify","contract"], body: "On pass: return ONLY 'PASS -- no issues found.'" },
    { id: "03-evidence", tags: ["verify","evidence"], body: "Every sub-5 score MUST cite file:line." },
    { id: "04-react-checklist", tags: ["verify","react"], body: "React: check prop-types, hooks deps, render cycles, keys." },
    { id: "05-api-checklist", tags: ["verify","api"], body: "APIs: check status codes, error envelopes, idempotency." },
  ],
  "verifier-design": [
    { id: "01-three-breakpoints", tags: ["verify","responsive"], body: "Screenshot desktop, tablet, mobile." },
    { id: "02-wcag-aa", tags: ["verify","accessibility"], body: "Contrast must be WCAG-AA (4.5:1 normal, 3:1 large)." },
    { id: "03-design-system-ref", tags: ["verify","design-system"], body: "Cross-reference DESIGN.md if provided." },
    { id: "04-annotate", tags: ["verify","annotation"], body: "Draw boxes around issues in screenshots." },
    { id: "05-tap-targets", tags: ["verify","mobile"], body: "Mobile: tap targets >= 44x44px." },
  ],
  "verifier-infra": [
    { id: "01-run-plan", tags: ["verify","terraform"], body: "Always run terraform plan before scoring." },
    { id: "02-tags", tags: ["verify","tags"], body: "All resources must have Environment, Owner, CostCenter tags." },
    { id: "03-encryption", tags: ["verify","security"], body: "Encryption at rest (KMS) + in transit (TLS)." },
    { id: "04-least-privilege", tags: ["verify","iam"], body: "IAM scoped to minimum actions." },
    { id: "05-no-plaintext-secrets", tags: ["verify","secrets"], body: "No secrets in plaintext. Fail Security 1/5 if any." },
  ],
  "verifier-docs": [
    { id: "01-run-vale", tags: ["verify","prose"], body: "Always run Vale." },
    { id: "02-test-examples", tags: ["verify","examples"], body: "Extract + run code blocks. Broken example is worse than none." },
    { id: "03-check-links", tags: ["verify","links"], body: "Run markdown-link-check." },
    { id: "04-api-sigs", tags: ["verify","api"], body: "Cross-reference docs with source. API sigs must match." },
    { id: "05-quickstart", tags: ["verify","readme"], body: "README quickstart must work in < 5 minutes." },
  ],
  "sub-agent-author": [
    { id: "01-check-existing", tags: ["meta","dedup"], body: "Query existing catalog first. Don't create duplicates." },
    { id: "02-cheapest-model", tags: ["meta","cost"], body: "Pick cheapest model tier. Flash > inherit > GLM-5.3." },
    { id: "03-five-seeds", tags: ["meta","instincts"], body: "Always create 5 seed instincts." },
    { id: "04-register", tags: ["meta","routing"], body: "Always register in agent index." },
    { id: "05-prompt-defense", tags: ["meta","security"], body: "Every sub-agent inherits Prompt Defense Baseline." },
  ],
  "mlops-engineer": [
    { id: "01-seed", tags: ["ml","reproducibility"], body: "Always seed everything." },
    { id: "02-checkpoint", tags: ["ml","checkpointing"], body: "Always checkpoint." },
    { id: "03-log-langfuse", tags: ["ml","logging"], body: "Always log to Langfuse." },
    { id: "04-no-modeling", tags: ["ml","scope"], body: "Never make modeling decisions. That's Prometheus's job." },
    { id: "05-containerize", tags: ["ml","docker"], body: "Always containerize." },
  ],
  "sast-scanner": [
    { id: "01-multiple-tools", tags: ["security","tools"], body: "Always run multiple SAST tools." },
    { id: "02-dedup", tags: ["security","dedup"], body: "Dedup by file:line + rule similarity." },
    { id: "03-cvss", tags: ["security","priority"], body: "Prioritize by CVSS. Critical first." },
    { id: "04-no-fixes", tags: ["security","scope"], body: "Never fix. Find and report, don't fix." },
    { id: "05-write-vault", tags: ["security","audit"], body: "Always write full report to vault." },
  ],
};

function setup(name, seeds) {
  const root = join(SUB_AGENTS_ROOT, name);
  console.log(`\n  ${name}:`);
  if (dryRun) { console.log(`    (dry-run) would create ${root}/{seed,empirical,_archive}`); return; }
  mkdirSync(join(root, "seed"), { recursive: true });
  mkdirSync(join(root, "empirical"), { recursive: true });
  mkdirSync(join(root, "_archive"), { recursive: true });
  for (const s of seeds) {
    const content = `---\nid: ${s.id}\nagent: ${name}\nscope: sub-agent\ntags: ${JSON.stringify(s.tags)}\nconfidence: 1.0\ndispatch_count: 0\nlast_invoked_at: null\ncreated_at: ${new Date().toISOString()}\ntype: seed\n---\n\n# ${s.id} -- ${name}\n\n${s.body}\n`;
    writeFileSync(join(root, "seed", `${s.id}.md`), content);
  }
  console.log(`    OK Created ${root} + ${seeds.length} seeds`);
}

console.log("Olympus Arsenal Patch -- Sub-agent instinct setup");
console.log(`Mode: ${dryRun ? "DRY RUN" : "LIVE"}`);

if (!existsSync(VAULT_ROOT)) { console.error(`Vault not found: ${VAULT_ROOT}`); process.exit(1); }

const logDir = join(VAULT_ROOT, "05_Auto_Learning");
mkdirSync(logDir, { recursive: true });
for (const f of ["promotion-log.jsonl", "tombstones.jsonl"]) {
  const p = join(logDir, f);
  if (!existsSync(p)) writeFileSync(p, "");
}

console.log("\nSetting up sub-agent instincts:");
for (const [name, seeds] of Object.entries(SEED_INSTINCTS)) {
  if (agentFilter && name !== agentFilter) continue;
  setup(name, seeds);
}
console.log("\nOK Done.");
