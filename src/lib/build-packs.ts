/**
 * build-packs.ts — v0.0.88 (#344): export/import a build, scan before trust.
 *
 * The Builds re-audit gave distribution a 3.0: no export/import, no signature,
 * no scan. This is v0: a signed-by-digest JSON pack of curated/user builds,
 * plus a deterministic ToxicSkills-style scan (prompt injection, exfiltration,
 * command injection, embedded secrets) that runs on import. A high finding
 * blocks the pack unless the caller explicitly allows it.
 *
 * Not a cryptographic identity: the digest proves the bytes were not edited
 * in transit, not that the author is trusted. The docs say so.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import crypto from 'node:crypto';
import type { DesignBuild } from './design-builds';

export interface BuildPack {
  kind: 'olympus-build-pack';
  version: 1;
  exportedAt: string;
  builds: DesignBuild[];
  /** Optional skill bodies (name + markdown) for a future `skills add`. */
  skillFiles?: Array<{ name: string; content: string }>;
  digest: string;
}

export interface ScanFinding {
  severity: 'high' | 'medium' | 'low';
  rule: string;
  where: string;
  evidence: string;
}

const RULES: Array<{ rule: string; severity: ScanFinding['severity']; re: RegExp; why: string }> = [
  { rule: 'prompt-injection', severity: 'high', re: /ignore (all |any )?(previous|prior|above) (instructions|rules)|disregard (the )?(system|developer)|you are now (a|an) /i, why: 'tries to override the agent instructions' },
  { rule: 'system-prompt-exfil', severity: 'high', re: /(print|reveal|dump|leak|show)\s+(the\s+)?(system|developer)\s+(prompt|message|instructions)/i, why: 'asks for the system prompt' },
  { rule: 'credential-exfil', severity: 'high', re: /(curl|wget|fetch|http)\s+[^\n]*(api[_-]?key|token|secret|password)|(api[_-]?key|token|secret|password)[^\n]{0,40}(curl|wget|fetch)/i, why: 'sends a credential to the network' },
  { rule: 'pipe-to-shell', severity: 'high', re: /(curl|wget)[^\n|]{0,200}\|\s*(bash|sh|zsh|node|python)/i, why: 'pipes remote content to a shell' },
  { rule: 'command-injection', severity: 'high', re: /(;|&&|\|\|)\s*(rm\s+-rf|chmod\s+777|mkfs|dd\s+if=|shutdown|reboot)/i, why: 'destructive command injection' },
  { rule: 'eval-remote', severity: 'medium', re: /\beval\s*\(|new Function\s*\(/i, why: 'dynamic code execution' },
  { rule: 'secret-literal', severity: 'high', re: /\b(sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{30,})\b/, why: 'looks like a live secret' },
  { rule: 'base64-blob', severity: 'low', re: /[A-Za-z0-9+/]{120,}={0,2}/, why: 'large opaque blob — inspect before running' },
];

export function scanText(text: string, where: string): ScanFinding[] {
  const out: ScanFinding[] = [];
  const body = String(text ?? '');
  for (const r of RULES) {
    const m = r.re.exec(body);
    if (m) out.push({ severity: r.severity, rule: r.rule, where, evidence: `${m[0].slice(0, 80)} — ${r.why}` });
  }
  return out;
}

export function scanBuildPack(pack: Omit<BuildPack, 'digest'>): ScanFinding[] {
  const out: ScanFinding[] = [];
  for (const b of pack.builds ?? []) {
    out.push(...scanText(b.note ?? '', `build:${b.id}:note`));
    out.push(...scanText(b.signature ?? '', `build:${b.id}:signature`));
    out.push(...scanText(JSON.stringify(b.params ?? {}), `build:${b.id}:params`));
  }
  for (const f of pack.skillFiles ?? []) {
    out.push(...scanText(f.content, `skill:${f.name}`));
  }
  return out;
}

function canonical(pack: Omit<BuildPack, 'digest'>): string {
  return JSON.stringify({ kind: pack.kind, version: pack.version, builds: pack.builds, skillFiles: pack.skillFiles ?? [] });
}
export function packDigest(pack: Omit<BuildPack, 'digest'>): string {
  return crypto.createHash('sha256').update(canonical(pack)).digest('hex');
}

export function exportBuildPack(builds: DesignBuild[], skillFiles?: BuildPack['skillFiles']): BuildPack {
  const base = { kind: 'olympus-build-pack' as const, version: 1 as const, exportedAt: new Date().toISOString(), builds, ...(skillFiles ? { skillFiles } : {}) };
  return { ...base, digest: packDigest(base) };
}

export interface ImportResult {
  ok: boolean;
  builds: DesignBuild[];
  findings: ScanFinding[];
  error?: string;
}

export function importBuildPack(input: unknown, opts: { allowRisky?: boolean } = {}): ImportResult {
  const pack = input as BuildPack;
  if (!pack || pack.kind !== 'olympus-build-pack' || pack.version !== 1 || !Array.isArray(pack.builds)) {
    return { ok: false, builds: [], findings: [], error: 'not an olympus-build-pack v1' };
  }
  const { digest, ...base } = pack;
  if (digest && digest !== packDigest(base)) {
    return { ok: false, builds: [], findings: [], error: 'digest mismatch — the pack was edited after export' };
  }
  const findings = scanBuildPack(base);
  const high = findings.filter((f) => f.severity === 'high');
  const builds = pack.builds.filter((b) => b && typeof b.id === 'string' && typeof b.god === 'string');
  if (high.length > 0 && !opts.allowRisky) {
    return { ok: false, builds, findings, error: `blocked: ${high.length} high-severity finding(s) — pass allowRisky only after reviewing them` };
  }
  return { ok: true, builds, findings };
}
