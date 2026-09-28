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
