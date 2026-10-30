---
title: Threat Modeling
category: security
stacks: []
god: artemis
last_updated: 2026-10-30
sources:
  - https://owasp.org/Top10/2025/
  - https://owasp.org/www-project-application-security-verification-standard/
  - https://learn.microsoft.com/en-us/security/engineering/threat-modeling
---

# Threat Modeling

## When to use
Before a new trust boundary, a new data flow, an auth/permission change, or
any feature that touches money, identity, or user content. A short model
before code beats a pentest after launch.

## The method (STRIDE on a data-flow diagram)
1. Draw the flow: users, clients, APIs, queues, stores, third parties.
2. Mark trust boundaries (where data/authority changes hands).
3. For each boundary, ask: **S**poofing, **T**ampering, **R**epudiation,
   **I**nformation disclosure, **D**enial of service, **E**levation.
4. Rank by impact × likelihood; write a mitigation or an explicit acceptance.
5. Add a verification (test, config check, monitoring) per mitigation.

## OWASP Top 10:2025 anchors
- A01 Broken Access Control (SSRF is folded in here)
- A02 Security Misconfiguration
- A03 Software Supply Chain Failures
- A04 Cryptographic Failures
- A05 Injection
- A06 Insecure Design
- A07 Authentication Failures
- A08 Software or Data Integrity Failures
- A09 Security Logging & Alerting Failures
- A10 Mishandling of Exceptional Conditions

## Non-negotiables
- Authorization is enforced server-side on every request, not hidden in the
  UI. Deny by default.
- Validate at the boundary (schema), encode at the sink (SQL/HTML/shell).
- Secrets never in code, logs, client bundles, or error bodies.
- Errors fail closed; do not leak stack traces or internal topology.
- Log security events with alerting — a log nobody reads is not a control.
- Supply chain: lockfiles, provenance, dependency review, least-privilege
  tokens in CI.

## Checklist
- [ ] Trust boundaries and data flows are drawn.
- [ ] Each STRIDE category has a mitigation or an accepted risk.
- [ ] Authn/authz tested on the server, including IDOR.
- [ ] Input validation + output encoding at every boundary.
- [ ] Secrets/scanning checks in CI.
- [ ] Security events logged + alerted.
- [ ] Dependency/supply-chain gate green.

## Anti-patterns
- A checklist signed without a diagram or a data flow.
- "Internal only" as an authorization model.
- Trusting a client-provided role/tenant id.
- Catching all errors and returning 200 with an empty body.
- A pentest as the only security activity.

## Sources
- OWASP Top 10:2025: https://owasp.org/Top10/2025/
- OWASP ASVS: https://owasp.org/www-project-application-security-verification-standard/
- Microsoft Threat Modeling: https://learn.microsoft.com/en-us/security/engineering/threat-modeling
