# Testimonial Section — Design

- **Date:** 2026-10-03
- **Status:** Self-approved (unattended run — interview/approval gates satisfied by Apollo)
- **Scope:** Tiny — one drop-in testimonial section for a landing page

## Purpose

A clean, minimal testimonial band for a marketing landing page: three short
quotes, each attributed to an author (name + role/company). No landing page
exists in this repo (OLYMPUS is an Electron desktop app; `src/app/page.tsx`
is the app shell), so the deliverable is a **standalone, self-contained HTML
file** with clearly marked copy-paste boundaries for the section markup and
its scoped CSS.

## Decisions (defaults chosen in unattended mode)

| Question | Default chosen |
|---|---|
| Host page | None in repo → portable drop-in file at repo root (`testimonial-section.html`, untracked) |
| Tech | Vanilla HTML + scoped CSS; zero JS, zero external requests (no webfonts, no images) |
| Content | Three short fictional placeholder quotes + author name/role — flagged for replacement with real customer quotes |
| Aesthetic | Editorial minimal: warm off-white band, near-black ink, serif quotes, hairline rules, monogram avatars |
| Layout | Centered eyebrow + heading; 3-column grid on desktop, stacks on small screens; generous whitespace |
| Motion | None (no animation → inherently `prefers-reduced-motion` safe) |

## Approaches considered

1. **Vanilla drop-in HTML file (chosen)** — portable to any stack, renders
   standalone via `file://`, no framework lock-in.
2. React/Tailwind component in `src/components` — rejected: the repo has no
   landing page to host it; couples the artifact to this repo's stack.
3. Mini landing page with hero + testimonials — rejected: scope creep beyond
   the requested "tiny section".

## Structure

```html
<section class="testimonials" aria-labelledby="testimonials-title">
  <header>  eyebrow "Testimonials" + <h2> "What people are saying"
  <div class="testimonial-grid">
    <figure class="testimonial"> ×3
      <blockquote><p>quote</p></blockquote>
      <figcaption> monogram avatar (aria-hidden) + <span class="author"> name + role
```

The section owns a set of CSS custom properties (all prefixed `--t-`) so a
host page can retheme it without editing rules. Every selector is scoped
under `.testimonials` — pasting markup + CSS into another page cannot leak
styles.

## Style tokens

| Token | Value | Use | Contrast on paper |
|---|---|---|---|
| `--t-paper` | `#FBFAF7` | section background | — |
| `--t-ink` | `#1C1C1A` | quote text, names | ≈ 16.3:1 (AAA) |
| `--t-muted` | `#6E6E66` | roles, eyebrow | ≈ 4.9:1 (AA) |
| `--t-hairline` | `#E9E8E2` | rules | decorative |
| `--t-glyph` | `#D8D5CC` | oversized quote glyphs (aria-hidden) | decorative |

Type: quotes in a serif stack (`Charter, Cambria, Georgia, …`) ~1.2rem;
names/roles/eyebrow in the system sans stack; eyebrow uppercase, letter-
spaced. Responsive via `grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr))`
plus `clamp()` padding — no fixed-breakpoint media queries needed.

## Acceptance criteria

1. `testimonial-section.html` exists at repo root and opens standalone in a browser.
2. Contains exactly three testimonials; each has a short quote, author name, role/company.
3. Zero `<script>` tags; zero external network references.
4. All CSS scoped under `.testimonials`; drop-in cannot style-leak.
5. Responsive: 3-up on wide viewports, 1-up on narrow (auto-fit grid).
6. WCAG AA contrast for all text; semantics: `section/figure/blockquote/figcaption`, `aria-labelledby`.
7. Placeholder quotes clearly flagged in-file as fictional.

## Out of scope

Real customer quotes/photos, dark mode, carousel, ratings, JS interactivity.
