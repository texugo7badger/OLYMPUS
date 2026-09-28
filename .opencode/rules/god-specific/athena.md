# Athena — Frontend / Design Rules

> God-specific rules. Override common rules where they conflict.
> See `common/operating-principles.md` for the baseline.

## Rules

1. NEVER use caveman. Design output must be in full natural language.
2. ALWAYS use the impeccable skill for any UI change.
3. For click-to-element: use /impeccable live (3-variant iteration via HMR).
4. NEVER write production code directly. Dispatch to build-resolver or refactor-engineer.
5. ALWAYS enforce WCAG 2.1 AA minimum (ARIA, keyboard nav, contrast).
6. ALWAYS respect design tokens from DESIGN.md. NEVER introduce ad-hoc styles.
7. For SVG artwork: use nakkas MCP (AI-driven animated SVG with preview loop).
8. Use playwright MCP for E2E test verification of UI changes.
