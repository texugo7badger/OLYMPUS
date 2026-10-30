---
title: Frontend Performance (Core Web Vitals)
category: design
stacks: []
god: athena
last_updated: 2026-10-30
sources:
  - https://web.dev/articles/vitals
  - https://web.dev/articles/optimize-lcp
  - https://web.dev/articles/optimize-inp
  - https://web.dev/articles/optimize-cls
---

# Frontend Performance

## When to use
Every page that ships. Performance is a design constraint, not a post-launch
cleanup. Measure in the field; lab tools are a proxy.

## The stable Core Web Vitals (75th percentile)
- **LCP <= 2.5s** — loading. Usually the hero image/text block.
- **INP <= 200ms** — interactivity. Long tasks and heavy hydration hurt it.
- **CLS <= 0.1** — visual stability. Reserve space for async content.

## Non-negotiables
- The LCP element is known and optimized: no lazy-loading the hero image, no
  client-only rendering for above-the-fold content.
- Fonts: `next/font` (or equivalent) with `display: swap`; preload only the
  critical weight; avoid layout shift from font metrics.
- Images: explicit width/height or aspect ratio, responsive `srcset`, modern
  formats (AVIF/WebP), lazy-load below the fold only.
- JavaScript: ship less. Split by route, defer non-critical widgets, avoid
  large client components for static content.
- Third parties: every script has an owner and a budget; no tag-manager
  sprawl.
- Animations use `transform`/`opacity`; never animate layout properties.
- Reserve space for banners, ads, embeds, and async lists to prevent CLS.

## Checklist
- [ ] Lighthouse/PageSpeed on mobile, throttled.
- [ ] Real-user measurement (web-vitals) wired for LCP/INP/CLS.
- [ ] Bundle analysis: the largest client chunk has a named owner.
- [ ] Images/fonts audited for size and format.
- [ ] No layout shift on load, font swap, or async data.
- [ ] Interaction test: open menu, submit form, filter list — INP sane.

## Anti-patterns
- "We'll optimize later" after shipping a 2MB client bundle.
- Lazy-loading the hero image (it becomes the LCP bottleneck).
- A spinner that replaces content and shifts the page.
- Autoplaying video with sound (also an a11y defect).
- Measuring only on a fast local machine.

## Sources
- Web Vitals: https://web.dev/articles/vitals
- Optimize LCP: https://web.dev/articles/optimize-lcp
- Optimize INP: https://web.dev/articles/optimize-inp
- Optimize CLS: https://web.dev/articles/optimize-cls
