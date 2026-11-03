/**
 * mcp-market.ts — v0.0.53: a curated, honest MCP marketplace seed.
 *
 * mcpservers.org indexes 9,800+ servers but exposes no documented free JSON
 * API. OLYMPUS ships a small, verified seed (free/no-key first) and links to
 * the live directory search for everything else. Adding a server writes the
 * same `opencode.json` shape the runtime reads; the user can always edit the
 * command/url and key.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
export interface MarketMcp {
  id: string;
  name: string;
  description: string;
  category: string;
  free: boolean;
  needsKey: string | null;
  type: 'local' | 'remote';
  /** Local command (tokens; [PATH] is replaced by the active project). */
  command?: string[];
  /** Remote endpoint. */
  url?: string;
  env?: string[];
  docs: string;
}

export const MCP_MARKET: MarketMcp[] = [
  { id: 'filesystem', name: 'Filesystem', description: 'Read/write files inside a chosen directory — the safest local file lane.', category: 'files', free: true, needsKey: null, type: 'local', command: ['npx', '-y', '@modelcontextprotocol/server-filesystem', '[PATH]'], docs: 'https://mcpservers.org/servers/modelcontextprotocol/filesystem' },
  { id: 'memory', name: 'Memory', description: 'A persistent knowledge graph for entities and relations.', category: 'memory', free: true, needsKey: null, type: 'local', command: ['npx', '-y', '@modelcontextprotocol/server-memory'], docs: 'https://mcpservers.org/servers/modelcontextprotocol/memory' },
  { id: 'sequential-thinking', name: 'Sequential Thinking', description: 'A structured step-by-step reasoning scratchpad.', category: 'reasoning', free: true, needsKey: null, type: 'local', command: ['npx', '-y', '@modelcontextprotocol/server-sequential-thinking'], docs: 'https://mcpservers.org/servers/modelcontextprotocol/sequentialthinking' },
  { id: 'context7', name: 'Context7', description: 'Up-to-date library documentation and code examples.', category: 'docs', free: true, needsKey: null, type: 'local', command: ['npx', '-y', '@upstash/context7-mcp'], docs: 'https://mcpservers.org/servers/context7-mcp-server' },
  { id: 'playwright', name: 'Playwright', description: 'Browser automation, screenshots and page inspection.', category: 'browser', free: true, needsKey: null, type: 'local', command: ['npx', '-y', '@playwright/mcp@latest'], docs: 'https://mcpservers.org/servers/playwright-mcp-server' },
  { id: 'chrome-devtools', name: 'Chrome DevTools', description: 'Inspect and control a live Chrome from the agent.', category: 'browser', free: true, needsKey: null, type: 'local', command: ['npx', '-y', 'chrome-devtools-mcp@latest'], docs: 'https://mcpservers.org/servers/chrome-devtools-mcp-server' },
  { id: 'github', name: 'GitHub', description: 'Repos, issues, pull requests and code context.', category: 'code', free: false, needsKey: 'GITHUB_PERSONAL_ACCESS_TOKEN', type: 'local', command: ['npx', '-y', '@modelcontextprotocol/server-github'], env: ['GITHUB_PERSONAL_ACCESS_TOKEN'], docs: 'https://mcpservers.org/servers/github-mcp-server' },
  { id: 'exa', name: 'Exa Search', description: 'Neural web search built for AI agents.', category: 'search', free: false, needsKey: 'EXA_API_KEY', type: 'local', command: ['npx', '-y', 'exa-mcp-server'], env: ['EXA_API_KEY'], docs: 'https://mcpservers.org/servers/exa-labs/exa-mcp-server' },
  { id: 'firecrawl', name: 'Firecrawl', description: 'Scrape, crawl and extract structured web data.', category: 'web', free: false, needsKey: 'FIRECRAWL_API_KEY', type: 'local', command: ['npx', '-y', 'firecrawl-mcp'], env: ['FIRECRAWL_API_KEY'], docs: 'https://mcpservers.org/servers/firecrawl-mcp-server' },
  { id: 'supabase', name: 'Supabase', description: 'Projects, SQL, auth, storage and edge functions.', category: 'database', free: false, needsKey: 'SUPABASE_ACCESS_TOKEN', type: 'local', command: ['npx', '-y', '@supabase/mcp-server-supabase@latest'], env: ['SUPABASE_ACCESS_TOKEN'], docs: 'https://mcpservers.org/servers/supabase-mcp-server' },
];

export function searchMarket(query: string): MarketMcp[] {
  const q = query.trim().toLowerCase();
  if (!q) return MCP_MARKET;
  return MCP_MARKET.filter((m) => `${m.id} ${m.name} ${m.description} ${m.category}`.toLowerCase().includes(q));
}

export function marketSearchUrl(query: string): string {
  return `https://mcpservers.org/search?query=${encodeURIComponent(query.trim() || 'mcp')}`;
}
