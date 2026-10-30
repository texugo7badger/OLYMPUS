/**
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 *
 * Shared MCP API-key requirements — single source of truth for:
 *   - /api/olympus/mcp/route.ts        (single-MCP lookup)
 *   - /api/olympus/mcp/list/route.ts   (full MCP list)
 *   - components/olympus/api-config-dialog.tsx (UI)
 *
 * Only lists MCPs that ship with OLYMPUS and require API keys.
 * MCPs with multiple env vars (e.g. grafana needs GRAFANA_URL +
 * GRAFANA_API_KEY) are grouped into one entry so the dialog renders them
 * as a card with all fields together.
 *
 * Users can add third-party MCPs to their .mcp.json and configure their
 * env vars via shell exports or .env files directly — those are not
 * listed here.
 */

export interface McpEnvVarRequirement {
  /** The env var name (e.g. GITHUB_PERSONAL_ACCESS_TOKEN). */
  key: string;
  /** Human-readable label for the input field. */
  label: string;
  /** URL to docs/console where the user can obtain the value. */
  url: string;
  /** Optional helper note shown under the input. */
  note?: string;
}

export interface McpApiRequirement {
  /** MCP names covered by this requirement (usually 1, but can be 2+
   *  when MCPs share the same env vars, e.g. awslabs-s3 + awslabs-iam). */
  names: string[];
  /** Human-readable label for the group (e.g. "AWS (S3 + IAM)"). */
  label: string;
  /** The env vars this MCP requires. */
  envVars: McpEnvVarRequirement[];
  /** Optional MCP-level note. */
  note?: string;
}

/**
 * The canonical list of MCP API-key requirements for shipped MCPs.
 *
 * Order matters for the UI — single-field MCPs first, then multi-field
 * MCPs grouped at the end.
 */
export const MCP_API_REQUIREMENTS: McpApiRequirement[] = [
  {
    names: ['github'],
    label: 'GitHub',
    envVars: [
      { key: 'GITHUB_PERSONAL_ACCESS_TOKEN', label: 'GitHub Token', url: 'https://github.com/settings/tokens' },
    ],
    note: 'PR / issue / workflow sync. Used by Apollo.',
  },
  {
    names: ['figma'],
    label: 'Figma',
    envVars: [
      { key: 'FIGMA_API_KEY', label: 'Figma API Key', url: 'https://www.figma.com/developers/api#access-tokens' },
    ],
    note: 'Figma design import. Used by Athena.',
  },
  // ── Multi-field MCPs (grouped together visually in the dialog) ──────
  {
    names: ['grafana'],
    label: 'Grafana',
    envVars: [
      { key: 'GRAFANA_URL', label: 'Grafana URL', url: 'https://grafana.com/docs/grafana/latest/http_api/', note: 'Grafana instance URL.' },
      { key: 'GRAFANA_API_KEY', label: 'Grafana API Key', url: 'https://grafana.com/docs/grafana/latest/administration/api-keys/', note: 'Grafana service account token.' },
    ],
    note: 'Grafana metrics. Used by Prometheus.',
  },
  // ── OpenCode-native (opencode.json mcp block) BYOK MCPs — the merged
  // registry (src/lib/mcp-registry.ts) consults this SAME map so the panel
  // renders them locked until the key lands (W-E + W-B IMAGE-GEN). ────────
  {
    names: ['originkit'],
    label: 'OriginKit (free key)',
    envVars: [
      { key: 'ORIGINKIT_API_KEY', label: 'OriginKit API Key', url: 'https://www.originkit.dev', note: 'Free key (Settings > API Integration; 10 component fetches/day). Browse is unlimited + key-free.' },
    ],
    note: 'Remote MCP (mcp.originkit.dev) — the animated-component library. Used by Athena + Hephaestus (the design + forge lanes).',
  },
  {
    names: ['brave-search'],
    label: 'Brave Search (free tier)',
    envVars: [
      { key: 'BRAVE_API_KEY', label: 'Brave Search API Key', url: 'https://api-dashboard.search.brave.com/app/documentation', note: 'Free plan: 2,000 queries/month. Register at api-dashboard.search.brave.com → API Keys.' },
    ],
    note: 'The websearch lane for OpenRouter/NVIDIA custom strategies (on GO the websearch tool rides Exa free). Used by Hermes + the researcher lane.',
  },
  {
    names: ['fal'],
    label: 'fal.ai (BYOK)',
    envVars: [
      { key: 'FAL_KEY', label: 'fal.ai API Key', url: 'https://fal.ai/dashboard/keys', note: 'The BYOK generation/editing MCP (FLUX, Nano Banana edit). ~$0.0002-0.02/img on your fal account.' },
    ],
    note: 'Remote MCP (mcp.fal.ai) — generation + editing lanes. Used by Hephaestus (the image-generator forge lane).',
  },
];

/**
 * Lookup a requirement by MCP name. Returns undefined if the MCP doesn't
 * require any API keys.
 */
export function findMcpRequirement(name: string): McpApiRequirement | undefined {
  return MCP_API_REQUIREMENTS.find(r => r.names.includes(name));
}

/**
 * Get the list of env var keys for an MCP name (empty array if none).
 * Convenience for route handlers that only need the key names (not the
 * full metadata).
 */
export function getMcpEnvVarKeys(name: string): string[] {
  return findMcpRequirement(name)?.envVars.map(v => v.key) ?? [];
}

/**
 * Get the MCP-level note for an MCP name (undefined if none).
 */
export function getMcpNote(name: string): string | undefined {
  return findMcpRequirement(name)?.note;
}

/**
 * v0.0.24 — the HONEST NEED per shipped MCP.
 *
 * The panel no longer renders a bare red dot. Every server is either:
 *   - enabled + healthy,
 *   - enabled + dead (a real bug),
 *   - locked (API key missing),
 *   - off because it needs a service/app/binary the machine may not have,
 *   - opt-in (heavy/domain-specific).
 *
 * Key requirements are DERIVED from MCP_API_REQUIREMENTS so there is one
 * source of truth for the env var names. Service/app/binary entries are
 * declared here.
 */
import type { McpServerRequirement } from './mcp-shape';

const OPTIONAL = (label: string): McpServerRequirement => ({ kind: 'optional', label });
const SERVICE = (label: string): McpServerRequirement => ({ kind: 'service', label });
const APP = (label: string): McpServerRequirement => ({ kind: 'app', label });
const BINARY = (label: string): McpServerRequirement => ({ kind: 'binary', label });

const SERVICE_AND_APP: Record<string, McpServerRequirement> = {
  godot: APP('needs the Godot editor + a project'),
  blender: APP('needs Blender running with the blender-mcp addon'),
  comfyui: SERVICE('needs a local ComfyUI server (default :8188)'),
  rea: APP('needs REAPER + the REAPER MCP bridge (207 tools — heavy)'),
  kubernetes: SERVICE('needs a reachable cluster + kubeconfig'),
  docker: SERVICE('needs the Docker daemon'),
  postgres: SERVICE('needs a DATABASE_URL for the target database'),
  grafana: SERVICE('needs a Grafana URL + service-account token'),
  'chrome-devtools': OPTIONAL('heavy browser automation (opt-in)'),
  playwright: OPTIONAL('heavy browser automation (opt-in)'),
  serena: OPTIONAL('LSP symbol editing — activate a project first'),
  'mcp-gateway': BINARY('needs the `mcp-gateway` binary'),
  tamp: OPTIONAL('output compression (opt-in)'),
  nakkas: OPTIONAL('animated SVG generation (opt-in)'),
  shadcn: OPTIONAL('shadcn component registry (opt-in)'),
  opendesign: OPTIONAL('design-system references (opt-in)'),
  pollinations: OPTIONAL('free image/text/audio generation (opt-in)'),
  'brave-search': OPTIONAL('web search — needs a Brave API key'),
  fal: OPTIONAL('remote image generation — needs FAL_KEY'),
  originkit: OPTIONAL('remote UI references — needs ORIGINKIT_API_KEY'),
  figma: OPTIONAL('Figma import — needs FIGMA_API_KEY'),
  github: OPTIONAL('GitHub tools — needs GITHUB_PERSONAL_ACCESS_TOKEN'),
  filesystem: OPTIONAL('curated — filesystem tools (14)'),
  memory: OPTIONAL('curated — knowledge-graph memory (9)'),
  git: OPTIONAL('curated — git tools (12)'),
  context7: OPTIONAL('curated — live library docs (2)'),
  'sequential-thinking': OPTIONAL('curated — structured reasoning (1)'),
  'olympus-craft': OPTIONAL('curated — Craft Apps control (6)'),
};

export function findMcpServerRequirement(name: string): McpServerRequirement {
  const keyReq = findMcpRequirement(name);
  if (keyReq) {
    return {
      kind: 'key',
      label: `needs ${keyReq.envVars.map(v => v.key).join(', ')}`,
      envVars: keyReq.envVars.map(v => v.key),
      url: keyReq.envVars[0]?.url,
    };
  }
  return SERVICE_AND_APP[name] ?? { kind: 'optional', label: 'optional' };
}
