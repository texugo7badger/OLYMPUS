/**
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

/**
 * Demigod short-description helper.
 *
 * The dispatch-graph API returns the demigod's full multi-clause "Identity"
 * sentence (e.g. "Build-Resolver resolves build failures across toolchains:
 * cargo, go build, gradle, tsc, pip, bundler. Treats a red build as a
 * defect owned until green across the target matrix."). On the cost dashboard
 * and god-detail screens, that sentence is too wordy for a row label.
 *
 * This module derives a SHORT single-line phrase from the demigod's agent
 * name (e.g. `build-resolver` -> "Fixes build failures"). The full
 * description is still available by clicking the row, which opens the
 * demigod's Identity prompt (.txt) in a modal.
 *
 * The agent names from the dispatch-graph API use UNDERSCORES (because
 * they come from the .txt file names: `build_resolver.txt`). The static
 * catalog uses HYPHENS. We normalize both forms so callers can pass either.
 */

/** Curated short descriptions for the most common demigods. */
const KNOWN_SHORT: Record<string, string> = {
  // apollo
  'planner':              'Task decomposition + planning',
  'architect':            'System architecture planning',
  'spec-author':          'Spec interview + requirements',
  'spec_author':          'Spec interview + requirements',
  'demigod-author':       'Creates new demigod prompts',
  'demigod_author':       'Creates new demigod prompts',
  'rapid-prototyper':     'Rapid prototyping',
  'rapid_prototyper':     'Rapid prototyping',
  'risk-assessor':        'Risk assessment',
  'risk_assessor':        'Risk assessment',
  'scope-gatekeeper':     'Scope enforcement',
  'scope_gatekeeper':     'Scope enforcement',
  'spec-miner':           'Mines spec requirements',
  'spec_miner':           'Mines spec requirements',

  // atlas
  'chief-of-staff':       'Cross-god coordination chief',
  'chief_of_staff':       'Cross-god coordination chief',
  'dag-optimizer':        'Dispatch DAG optimization',
  'dag_optimizer':        'Dispatch DAG optimization',
  'integration-compiler': 'Compiles integration specs',
  'integration_compiler': 'Compiles integration specs',
  'multi-agent-architect':'Multi-agent architecture',
  'multi_agent_architect':'Multi-agent architecture',
  'silent-failure-hunter':'Hunts silent failures',
  'silent_failure_hunter':'Hunts silent failures',
  'git-workflow-master':  'Git workflow mastery',
  'git_workflow_master':  'Git workflow mastery',

  // artemis
  'security-reviewer':    'Security code review',
  'security_reviewer':    'Security code review',
  'pentester':            'Penetration testing',
  'compliance-auditor':   'Compliance auditing',
  'compliance_auditor':   'Compliance auditing',
  'threat-analyst':       'Threat modeling + ATT&CK',
  'threat_analyst':       'Threat modeling + ATT&CK',
  'security-architect':   'Security architecture',
  'security_architect':   'Security architecture',
  'appsec-engineer':      'Application security engineering',
  'appsec_engineer':      'Application security engineering',
  'ai-code-auditor':      'AI code auditing',
  'ai_code_auditor':      'AI code auditing',
  'supply-chain-auditor': 'Supply chain auditing',
  'supply_chain_auditor': 'Supply chain auditing',
  'privacy-engineer':     'Privacy engineering',
  'privacy_engineer':     'Privacy engineering',
  'cloud-security-auditor':'Cloud security auditing',
  'cloud_security_auditor':'Cloud security auditing',
  'blockchain-security-auditor':'Blockchain security auditing',
  'blockchain_security_auditor':'Blockchain security auditing',

  // athena
  'frontend-reviewer':    'Frontend code review',
  'frontend_reviewer':    'Frontend code review',
  'ui-designer':          'UI design + design systems',
  'ui_designer':          'UI design + design systems',
  'a11y-auditor':         'Accessibility auditing',
  'a11y_auditor':         'Accessibility auditing',
  'visual-verifier':      'Visual UI verification',
  'visual_verifier':      'Visual UI verification',
  'ux-researcher':        'UX research',
  'ux_researcher':        'UX research',
  'mobile-app-builder':   'Mobile app building',
  'mobile_app_builder':   'Mobile app building',
  'i18n-specialist':      'Internationalization',
  'i18n_specialist':      'Internationalization',
  'brand-guardian':       'Brand consistency',
  'brand_guardian':       'Brand consistency',
  'performance-optimizer':'Frontend performance tuning',
  'performance_optimizer':'Frontend performance tuning',
  'state-architect':      'State management architecture',
  'state_architect':      'State management architecture',
  'responsive-tester':    'Responsive layout testing',
  'responsive_tester':    'Responsive layout testing',
  'information-architect':'Information architecture',
  'information_architect':'Information architecture',
  'section-508-specialist':'Section 508 compliance',
  'section_508_specialist':'Section 508 compliance',

  // dionysus
  'tdd-guide':            'TDD workflow guidance',
  'tdd_guide':            'TDD workflow guidance',
  'e2e-runner':           'Playwright E2E testing',
  'e2e_runner':           'Playwright E2E testing',
  'evidence-collector':   'QA evidence collection',
  'evidence_collector':   'QA evidence collection',
  'performance-tester':   'Performance + load testing',
  'performance_tester':   'Performance + load testing',
  'unit-test-author':     'Unit test authoring',
  'unit_test_author':     'Unit test authoring',
  'test-results-analyzer':'Test results analysis',
  'test_results_analyzer':'Test results analysis',
  'flaky-test-resolver':  'Flaky test resolution',
  'flaky_test_resolver':  'Flaky test resolution',
  'gan-planner':          'GAN test planning',
  'gan_planner':          'GAN test planning',
  'api-tester':           'API testing',
  'api_tester':           'API testing',
  'test-automation-engineer':'Test automation',
  'test_automation_engineer':'Test automation',
  'harness-optimizer':    'Test harness optimization',
  'harness_optimizer':    'Test harness optimization',
  'mutation-tester':      'Mutation testing',
  'mutation_tester':      'Mutation testing',
  'reality-checker':      'Reality + sanity checking',
  'reality_checker':      'Reality + sanity checking',

  // hephaestus
  'managed-reviewer':     'Multi-language code review',
  'managed_reviewer':     'Multi-language code review',
  'build-resolver':       'Fixes build failures',
  'build_resolver':       'Fixes build failures',
  'api-designer':         'API design + contracts',
  'api_designer':         'API design + contracts',
  'refactor-engineer':    'Refactoring + dead code removal',
  'refactor_engineer':    'Refactoring + dead code removal',
  'code-verifier':        'Verifies code correctness',
  'code_verifier':        'Verifies code correctness',
  'ts-reviewer':          'TypeScript code review',
  'ts_reviewer':          'TypeScript code review',
  'go-reviewer':          'Go code review',
  'go_reviewer':          'Go code review',
  'rust-reviewer':        'Rust code review',
  'rust_reviewer':        'Rust code review',
  'python-reviewer':      'Python code review',
  'python_reviewer':      'Python code review',
  'comment-analyzer':     'Comment + docstring analysis',
  'comment_analyzer':     'Comment + docstring analysis',
  'type-design-analyzer': 'Type design analysis',
  'type_design_analyzer': 'Type design analysis',
  'systems-reviewer':     'Systems code review',
  'systems_reviewer':     'Systems code review',
  'code-simplifier':      'Code simplification',
  'code_simplifier':      'Code simplification',
  'search-relevance-engineer':'Search relevance engineering',
  'search_relevance_engineer':'Search relevance engineering',
  'script-reviewer':      'Script code review',
  'script_reviewer':      'Script code review',
  'smart-contract-engineer':'Smart contract engineering',
  'smart_contract_engineer':'Smart contract engineering',
  'embedded-firmware-engineer':'Embedded firmware engineering',
  'embedded_firmware_engineer':'Embedded firmware engineering',
  'code-explorer':        'Codebase exploration',
  'code_explorer':        'Codebase exploration',
  'webassembly-engineer': 'WebAssembly engineering',
  'webassembly_engineer': 'WebAssembly engineering',

  // hermes
  'mcp-builder':          'MCP server development',
  'mcp_builder':          'MCP server development',
  'api-integrator':       'External API integration',
  'api_integrator':       'External API integration',
  'researcher':           'Research + docs lookup',
  'llm-architect':        'LLM architecture + routing',
  'llm_architect':        'LLM architecture + routing',
  'realtime-collaboration-engineer':'Realtime collaboration',
  'realtime_collaboration_engineer':'Realtime collaboration',
  'protocol-designer':    'Protocol design',
  'protocol_designer':    'Protocol design',
  'video-streaming-engineer':'Video streaming engineering',
  'video_streaming_engineer':'Video streaming engineering',
  'prompt-engineer':      'Prompt engineering',
  'prompt_engineer':      'Prompt engineering',
  'rag-pipeline-engineer':'RAG pipeline engineering',
  'rag_pipeline_engineer':'RAG pipeline engineering',
  'auth-specialist':      'Auth flow wiring',
  'auth_specialist':      'Auth flow wiring',
  'event-stream-architect':'Event stream architecture',
  'event_stream_architect':'Event stream architecture',
  'email-intelligence-engineer':'Email intelligence engineering',
  'email_intelligence_engineer':'Email intelligence engineering',
  'voice-ai-engineer':    'Voice AI engineering',
  'voice_ai_engineer':    'Voice AI engineering',
  'webhook-engineer':     'Webhook handling',
  'webhook_engineer':     'Webhook handling',
  'ai-engineer':          'AI engineering',
  'ai_engineer':          'AI engineering',
  'payments-billing-engineer':'Payments + billing engineering',
  'payments_billing_engineer':'Payments + billing engineering',

  // persephone
  'schema-reviewer':      'Schema review + index tuning',
  'schema_reviewer':      'Schema review + index tuning',
  'migration-engineer':   'DB migration engineering',
  'migration_engineer':   'DB migration engineering',
  'data-engineer':        'Data engineering + ETL',
  'data_engineer':        'Data engineering + ETL',
  'dbre':                 'Database reliability (HA, PITR)',
  'cache-architect':      'Cache architecture',
  'cache_architect':      'Cache architecture',
  'query-optimizer':      'Query optimization',
  'query_optimizer':      'Query optimization',
  'etl-pipeline-architect':'ETL pipeline architecture',
  'etl_pipeline_architect':'ETL pipeline architecture',
  'gaussdb-expert':       'GaussDB expertise',
  'gaussdb_expert':       'GaussDB expertise',
  'data-migration-specialist':'Data migration',
  'data_migration_specialist':'Data migration',
  'orm-specialist':       'ORM specialization',
  'orm_specialist':       'ORM specialization',
  'clickhouse-specialist':'ClickHouse specialization',
  'clickhouse_specialist':'ClickHouse specialization',

  // prometheus
  'docker-expert':        'Dockerfile + image optimization',
  'docker_expert':        'Dockerfile + image optimization',
  'terraform-engineer':   'Terraform IaC authoring',
  'terraform_engineer':   'Terraform IaC authoring',
  'sre':                  'SRE + monitoring + runbooks',
  'incident-responder':   'Incident response + RCA',
  'incident_responder':   'Incident response + RCA',
  'release-engineer':     'Release engineering + CI/CD',
  'release_engineer':     'Release engineering + CI/CD',
  'homelab-architect':    'Homelab architecture',
  'homelab_architect':    'Homelab architecture',
  'network-architect':    'Network architecture',
  'network_architect':    'Network architecture',
  'network-troubleshooter':'Network troubleshooting',
  'network_troubleshooter':'Network troubleshooting',
  'network-engineer':     'Network engineering',
  'network_engineer':     'Network engineering',
  'network-config-reviewer':'Network config review',
  'network_config_reviewer':'Network config review',
  'k8s-engineer':         'Kubernetes engineering',
  'k8s_engineer':         'Kubernetes engineering',
  'iot-fleet-engineer':   'IoT fleet engineering',
  'iot_fleet_engineer':   'IoT fleet engineering',
  'finops-analyst':       'FinOps + cost analysis',
  'finops_analyst':       'FinOps + cost analysis',

  // callimachus
  'instinct-curator':     'Instinct curation',
  'instinct_curator':     'Instinct curation',
  'brain-backup':         'Vault snapshot + backup',
  'brain_backup':         'Vault snapshot + backup',
  'brain-restore':        'Vault restore + verification',
  'brain_restore':        'Vault restore + verification',
  'docs-verifier':        'Docs verification',
  'docs_verifier':        'Docs verification',
  'skill-indexer':        'Skill indexing',
  'skill_indexer':        'Skill indexing',
  'opensource-packager':  'Open-source packaging',
  'opensource_packager':  'Open-source packaging',
  'technical-writer':     'Technical writing',
  'technical_writer':     'Technical writing',
  'conversation-analyzer':'Conversation analysis',
  'conversation_analyzer':'Conversation analysis',
  'pattern-extractor':    'Pattern extraction',
  'pattern_extractor':    'Pattern extraction',
};

function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/** Capitalize each word in a hyphen/underscore-separated agent name. */
function capitalizeName(agent: string): string {
  return agent.split(/[-_]/).map(capitalize).join(' ');
}

/**
 * Derive a SHORT single-line phrase from a demigod's agent name.
 *
 * Order of preference:
 *   1. The curated `KNOWN_SHORT` map (covers all demigods currently on disk).
 *   2. A verb-prefix pattern based on the last token
 *      (e.g. `*-reviewer` -> "X code review", `*-resolver` -> "Resolves X").
 *   3. The capitalized name as a fallback.
 *
 * Works with both hyphen (`build-resolver`) and underscore (`build_resolver`)
 * variants because the dispatch-graph API returns the form matching the .txt
 * filename on disk (underscore), while the static catalog uses hyphens.
 */
export function demigodShortDescription(agent: string): string {
  if (!agent) return '';
  const key = agent.toLowerCase();
  if (KNOWN_SHORT[key]) return KNOWN_SHORT[key];

  // Split on hyphens OR underscores so both forms produce the same output.
  const tokens = key.split(/[-_]/);
  const last = tokens[tokens.length - 1];
  const head = tokens.slice(0, -1).join(' ');
  const headCap = head.split(' ').map(capitalize).join(' ');

  switch (last) {
    case 'reviewer':  return head ? `${headCap} code review` : 'Code review';
    case 'resolver':  return head ? `Resolves ${head} failures` : 'Resolves failures';
    case 'tester':    return head ? `Tests ${head}` : 'Testing';
    case 'auditor':   return head ? `Audits ${head}` : 'Auditing';
    case 'analyzer':  return head ? `Analyzes ${head}` : 'Analysis';
    case 'engineer':  return head ? `${headCap} engineering` : 'Engineering';
    case 'designer':  return head ? `Designs ${head}` : 'Design';
    case 'architect': return head ? `${headCap} architecture` : 'Architecture';
    case 'curator':   return head ? `Curates ${head}` : 'Curation';
    case 'author':    return head ? `Authors ${head}` : 'Authoring';
    case 'scanner':   return head ? `Scans for ${head}` : 'Scanning';
    case 'specialist':return head ? `${headCap} specialist` : 'Specialist';
    case 'expert':    return head ? `${headCap} expert` : 'Expert';
    case 'guide':     return head ? `${headCap} guidance` : 'Guidance';
    case 'master':    return head ? `${headCap} mastery` : 'Mastery';
    case 'hunter':    return head ? `Hunts ${head}` : 'Hunter';
    case 'guardian':  return head ? `Guards ${head}` : 'Guardian';
    case 'builder':   return head ? `Builds ${head}` : 'Builder';
    case 'integrator':return head ? `Integrates ${head}` : 'Integration';
    default:          return capitalizeName(agent);
  }
}

/**
 * Build the URL for fetching a demigod's full Identity prompt .txt via the
 * existing `/api/olympus/fs/read` route. The path is relative to the Olympus
 * app root (the default safe root for fs/read). The .txt filename uses the
 * UNDERSCORE form (e.g. `build_resolver.txt`); we normalize the agent name
 * (which may arrive in hyphen form from the static catalog) so the lookup
 * always hits a real file on disk.
 */
export function demigodPromptUrl(god: string, agent: string): string {
  const fileAgent = agent.replace(/-/g, '_');
  const relPath = `.opencode/prompts/agents/demigods/${god}/${fileAgent}.txt`;
  return `/api/olympus/fs/read?path=${encodeURIComponent(relPath)}`;
}
