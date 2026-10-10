# H5 decision — #88: the browser-automation path for the D20-live class (CDP vs Playwright)

> The #88 ask: an inventory + a DECISION — which becomes the click/DOM-verification lane
> for the live-viewer class of proofs. This is the decision doc.

## The inventory (the candidates, honestly weighed)

| Dimension | CDP (Chrome DevTools Protocol) | Playwright |
|---|---|---|
| Shape | Raw WebSocket protocol; zero npm deps; headless-capable; the exact machinery Electron/Chromium exposes | Batteries-included: multi-browser, auto-waiting, selectors, traces, screenshots |
| Ergonomics | Hand-rolled everything (sessions, targets, events); verbose for click/assert flows | `page.click()`, `expect(locator)` — the flow the D20-live proofs need |
| Evidence doctrine | Raw protocol dumps (powerful, but the assembly is ours to build) | Built-in TRACES + screenshots — the evidence-first doctrine's native fit |
| Ecosystem fit in OLYMPUS | The `browser-qa` skill already speaks CDP-adjacent (claude-in-chrome) | The SAME skill already lists "Playwright via `mcp__browserbase__*`" + Puppeteer scripts |
| Multi-app cover | Chromium-family only (the Electron app ✓; the generated projects' browsers vary) | Chromium + Firefox + WebKit — the generated projects render anywhere |
| Minimal-dep fallback class | The winner: no installs, the headless-box class, raw introspection (network, performance) | The loser (an install per box) |

## The decision

**Playwright is the click/DOM-verification lane** for the D20-live class (the live-viewer
clicks, the e2e proofs, the athena browser lane): the auto-wait semantics kill the
timing-flake class, the trace/screenshot output IS the evidence artifact the house demands,
and the skill surface (browser-qa) already names the integration path.

**CDP stays the fallback + the introspection lane**: the minimal-dep headless-box class
(no installs), the raw protocol needs (network/performance introspection the click proofs
do not need), and the Electron app's own protocol surface (the CDP shape it exposes
natively).

## The follow-on wiring scope (the future arc, NOT this batch)

The athena dispatcher gaining a browser lane (an e2e demigod wired to Playwright with
declared evidence artifacts — the E4 shape) is a DEMIGOD-WIRING night, not a hygiene
item; this doc unblocks it. The `browser-qa` skill needs no change (already agnostic,
already lists the winner).
