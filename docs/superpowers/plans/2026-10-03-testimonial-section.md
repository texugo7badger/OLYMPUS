# Testimonial Section Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a tiny, clean, minimal drop-in testimonial section (three short quotes with author names) for a landing page, as a standalone self-contained HTML file.

**Architecture:** One static HTML file with a clearly marked two-region drop-in (scoped CSS in `<head>`, semantic markup in `<body>`). A disposable Node verification harness asserts the acceptance criteria structurally (TDD: harness written first, must fail red, then pass green). Zero JS in the artifact, zero external requests, all styles scoped under `.testimonials`/`.testimonial*`.

**Tech Stack:** Vanilla HTML5 + CSS (custom properties, `auto-fit` grid, `clamp()` fluid spacing). Verification: Node ESM + `htmlparser2`/`domutils`/`css-select` (already in repo `node_modules`).

## Global Constraints

- Deliverable: `testimonial-section.html` at repo root (untracked; unattended run).
- Tokens (verbatim): `--t-paper: #fbfaf7`, `--t-ink: #1c1c1a`, `--t-muted: #6e6e66`, `--t-hairline: #e9e8e2`, `--t-glyph: #d8d5cc`.
- Contrast: ink-on-paper ≈ 16.3:1 (AAA), muted-on-paper ≈ 4.9:1 (AA) — do not lighten muted beyond `#6e6e66`.
- Zero `<script>` elements; zero `http://`/`https://` references; zero `@import`/`url(` in CSS.
- Every stylesheet selector must contain `.testimonial` (section root is `.testimonials`).
- Semantics: `section[aria-labelledby]` → `figure > blockquote + figcaption`, `h2#testimonials-title`.
- Content: exactly 3 testimonials; quotes/authors are FICTIONAL placeholders flagged in-file (must contain the word "fictional", case-insensitive).
- NO git commits — unattended run + repo git policy (commit only on explicit request).
- Verification harness lives in `tmp/` (gitignored; disposable by design).

---

### Task 1: Verification harness (red)

**Files:**
- Create: `tmp/verify-testimonials.mjs`

**Interfaces:**
- Consumes: nothing (runs standalone against repo-root `node_modules`).
- Produces: exit code 0 = all acceptance criteria structurally verified; exit 1 + failure list otherwise. Reads `testimonial-section.html` from repo root.

- [ ] **Step 1: Write the harness**

```js
// tmp/verify-testimonials.mjs — structural verification for testimonial-section.html
// Acceptance criteria from docs/superpowers/specs/2026-10-03-testimonial-section-design.md
import { readFile } from 'node:fs/promises';
import { parseDocument } from 'htmlparser2';
import { selectAll, selectOne } from 'css-select';
import { getText } from 'domutils';

const failures = [];
const ok = (cond, msg) => { if (!cond) failures.push(msg); };
const text = (el) => (el ? getText(el).trim() : '');

let html;
try {
  html = await readFile('testimonial-section.html', 'utf8');
} catch (e) {
  console.error(`FAIL: testimonial-section.html not found or unreadable (${e.code ?? e.message})`);
  process.exit(1);
}

// 1 — Parses without error
let doc;
try {
  doc = parseDocument(html);
} catch (e) {
  console.error(`FAIL: HTML parse error — ${e.message}`);
  process.exit(1);
}

// 2 — Exactly three testimonials, complete structure each
const figures = selectAll('figure.testimonial', doc);
ok(figures.length === 3, `expected 3 figure.testimonial, found ${figures.length}`);
const names = new Set();
for (const fig of figures) {
  const quote = text(selectOne('blockquote p', fig));
  const name = text(selectOne('.testimonial-name', fig));
  const role = text(selectOne('.testimonial-role', fig));
  ok(quote.length >= 20, `quote too short/missing: "${quote.slice(0, 40)}"`);
  ok(name.length > 0, 'author name missing');
  ok(role.length > 0, 'author role missing');
  names.add(name);
}
ok(names.size === 3, `expected 3 distinct author names, found ${names.size}`);

// 3 — Zero scripts, zero external references
ok(selectAll('script', doc).length === 0, 'artifact must contain no <script>');
ok(!/https?:\/\//.test(html), 'no external http(s) references allowed');

// 4 — CSS scoped under .testimonials / .testimonial*
const styles = selectAll('style', doc);
const scoped = styles.map((s) => text(s)).find((t) => t.includes('--t-paper'));
ok(!!scoped, 'scoped .testimonials style block (--t-paper) not found');
if (scoped) {
  const css = scoped.replace(/\/\*[\s\S]*?\*\//g, '');
  ok(!/@import/.test(css), 'no @import allowed in scoped CSS');
  ok(!/url\(/.test(css), 'no url() allowed in scoped CSS');
  for (const token of ['--t-paper', '--t-ink', '--t-muted', '--t-hairline', '--t-glyph', '--t-serif', '--t-sans']) {
    ok(css.includes(token), `token ${token} not defined`);
  }
  const selectors = css
    .split('}')
    .map((chunk) => (chunk.includes('{') ? chunk.slice(0, chunk.indexOf('{')).trim() : ''))
    .filter(Boolean);
  ok(selectors.length > 0, 'no CSS rules found in scoped block');
  for (const sel of selectors) ok(sel.includes('.testimonial'), `unscoped selector: "${sel}"`);
}

// 5 — Semantics and a11y wiring
const section = selectOne('section.testimonials', doc);
ok(!!section, 'section.testimonials not found');
ok(section?.attribs?.['aria-labelledby'] === 'testimonials-title',
  'section aria-labelledby must reference testimonials-title');
const h2 = selectOne('h2#testimonials-title', doc);
ok(!!h2, 'h2#testimonials-title not found');
ok(text(h2).length > 0, 'h2 text is empty');
ok(text(selectOne('.testimonials-eyebrow', doc)) === 'Testimonials', 'eyebrow text must be "Testimonials"');
const marks = selectAll('.testimonial-mark', doc);
ok(marks.length === 3, `expected 3 decorative quote marks, found ${marks.length}`);
for (const m of marks) ok(m.attribs?.['aria-hidden'] === 'true', 'quote mark must be aria-hidden="true"');
const avatars = selectAll('.testimonial-avatar', doc);
ok(avatars.length === 3, `expected 3 avatars, found ${avatars.length}`);
for (const a of avatars) ok(a.attribs?.['aria-hidden'] === 'true', 'avatar must be aria-hidden="true"');

// 6 — Placeholder content flagged as fictional
ok(/fictional/i.test(html), 'file must flag placeholder quotes as fictional');

if (failures.length > 0) {
  console.error(`FAIL (${failures.length}):`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('PASS: all structural acceptance criteria verified.');
```

- [ ] **Step 2: Run harness — expect RED**

Run: `node tmp/verify-testimonials.mjs`
Expected: `FAIL: testimonial-section.html not found or unreadable (ENOENT)` — exit code 1.

### Task 2: Build the artifact (green)

**Files:**
- Create: `testimonial-section.html` (repo root)

**Interfaces:**
- Consumes: Task 1 harness (must exit 0).
- Produces: self-contained demo page with two marked drop-in regions (CSS + markup).

- [ ] **Step 1: Create `testimonial-section.html` with exactly this content**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <title>Testimonials — drop-in section demo</title>

  <!-- ═══════════ DROP-IN REGION 1 OF 2 — CSS ═══════════
       Paste into your <head> or stylesheet. Everything is scoped
       under .testimonials — retheme via the --t-* tokens. -->

  <style>
    .testimonials {
      --t-paper: #fbfaf7;
      --t-ink: #1c1c1a;
      --t-muted: #6e6e66;
      --t-hairline: #e9e8e2;
      --t-glyph: #d8d5cc;
      --t-serif: Charter, "Bitstream Charter", Cambria, Georgia, serif;
      --t-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;

      background:
        radial-gradient(56rem 32rem at 50% -8rem, rgba(201, 180, 132, 0.05), transparent 70%),
        var(--t-paper);
      color: var(--t-ink);
      font-family: var(--t-sans);
      padding: clamp(4.5rem, 10vw, 8rem) 1.5rem;
    }

    .testimonials-inner {
      max-width: 64rem;
      margin-inline: auto;
    }

    .testimonials-header {
      text-align: center;
      margin: 0 auto clamp(3rem, 6vw, 4.5rem);
    }

    .testimonials-eyebrow {
      margin: 0 0 0.875rem;
      color: var(--t-muted);
      font-size: 0.75rem;
      font-weight: 600;
      letter-spacing: 0.16em;
      text-transform: uppercase;
    }

    .testimonials-title {
      margin: 0;
      color: var(--t-ink);
      font-family: var(--t-serif);
      font-size: clamp(1.625rem, 3vw, 2.125rem);
      font-weight: 500;
      letter-spacing: -0.015em;
      line-height: 1.15;
      text-wrap: balance;
    }

    .testimonials-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
      gap: clamp(2.5rem, 5vw, 4rem);
      align-items: start;
    }

    .testimonial {
      margin: 0;
    }

    .testimonial-mark {
      display: block;
      color: var(--t-glyph);
      font-family: var(--t-serif);
      font-size: 2.75rem;
      line-height: 1;
      margin-bottom: 0.375rem;
    }

    .testimonial blockquote {
      margin: 0;
    }

    .testimonial blockquote p {
      margin: 0;
      color: var(--t-ink);
      font-family: var(--t-serif);
      font-size: 1.1875rem;
      line-height: 1.6;
      letter-spacing: -0.005em;
      text-wrap: pretty;
    }

    .testimonial figcaption {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      margin-top: 1.75rem;
      padding-top: 1.25rem;
      border-top: 1px solid var(--t-hairline);
    }

    .testimonial-avatar {
      flex: none;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 2.5rem;
      height: 2.5rem;
      border-radius: 50%;
      background: var(--t-ink);
      color: var(--t-paper);
      font-size: 0.8125rem;
      font-weight: 600;
      letter-spacing: 0.02em;
    }

    .testimonial-author {
      display: flex;
      flex-direction: column;
      gap: 0.125rem;
      min-width: 0;
    }

    .testimonial-name {
      font-size: 0.9375rem;
      font-weight: 600;
      color: var(--t-ink);
    }

    .testimonial-role {
      font-size: 0.875rem;
      color: var(--t-muted);
    }
  </style>
  <!-- ═══════════ END DROP-IN REGION 1 OF 2 ═══════════ -->
</head>
<body style="margin:0;background:#ffffff;">

  <!-- ═══════════ DROP-IN REGION 2 OF 2 — MARKUP ═══════════
       Placeholder notice: all quotes and authors below are FICTIONAL
       samples. Replace them with real customer quotes before shipping. -->

  <section class="testimonials" aria-labelledby="testimonials-title">
    <div class="testimonials-inner">
      <header class="testimonials-header">
        <p class="testimonials-eyebrow">Testimonials</p>
        <h2 class="testimonials-title" id="testimonials-title">What people are saying</h2>
      </header>

      <div class="testimonials-grid">

        <figure class="testimonial">
          <span class="testimonial-mark" aria-hidden="true">“</span>
          <blockquote>
            <p>It does exactly what it promises — nothing more, nothing less. That’s rarer than it sounds.</p>
          </blockquote>
          <figcaption>
            <span class="testimonial-avatar" aria-hidden="true">MC</span>
            <span class="testimonial-author">
              <span class="testimonial-name">Maya Chen</span>
              <span class="testimonial-role">Founder, Larkfield</span>
            </span>
          </figcaption>
        </figure>

        <figure class="testimonial">
          <span class="testimonial-mark" aria-hidden="true">“</span>
          <blockquote>
            <p>Our whole team switched in an afternoon. No manual, no training, and nobody has looked back.</p>
          </blockquote>
          <figcaption>
            <span class="testimonial-avatar" aria-hidden="true">DO</span>
            <span class="testimonial-author">
              <span class="testimonial-name">Daniel Okafor</span>
              <span class="testimonial-role">Engineering Lead, Northwind Labs</span>
            </span>
          </figcaption>
        </figure>

        <figure class="testimonial">
          <span class="testimonial-mark" aria-hidden="true">“</span>
          <blockquote>
            <p>Quiet software is underrated. This is the calmest, most dependable tool in our stack.</p>
          </blockquote>
          <figcaption>
            <span class="testimonial-avatar" aria-hidden="true">SM</span>
            <span class="testimonial-author">
              <span class="testimonial-name">Sofía Marín</span>
              <span class="testimonial-role">Head of Product, Tidewater</span>
            </span>
          </figcaption>
        </figure>

      </div>
    </div>
  </section>
  <!-- ═══════════ END DROP-IN REGION 2 OF 2 ═══════════ -->

  <!-- Demo chrome only — not part of the drop-in. -->
  <p style="margin:2rem 0 0;text-align:center;color:#a3a39b;font:400 0.75rem/1.4 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
    Drop-in demo — copy the two marked regions (CSS + markup) into your landing page.
  </p>

</body>
</html>
```

- [ ] **Step 2: Run harness — expect GREEN**

Run: `node tmp/verify-testimonials.mjs`
Expected: `PASS: all structural acceptance criteria verified.` — exit code 0.

- [ ] **Step 3: Craft self-review (frontend-design §6 lens)**

Checklist (manual, against the written file):
- Responsive by CSS review: `auto-fit minmax(16rem, 1fr)` → 3-up ≥ ~50rem content, 1–2-up below; `clamp()` padding; no fixed widths → no overflow at 320px. `min-width: 0` on author column prevents long-name overflow.
- No overlap risk: single flow column per testimonial; `text-wrap: pretty/balance` guards ragged lines.
- No interactive elements → no focus/hover states required; zero motion → `prefers-reduced-motion` safe.
- No AI-slop tropes: no gradients-as-decoration (one ≤0.05-opacity warm radial light spot, permitted by minimalist-ui §6), no glass, no pills, no stock icons, no emoji.
- Honest content: quotes flagged fictional in-file; names realistic, non-"John Doe".
- Memorable quality: oversized warm-gray serif quote glyphs + ink monogram avatars on a bone paper band.

- [ ] **Step 4: No commit** — per Global Constraints (unattended run; git policy: explicit request only).

## Self-Review (plan vs spec)

- **Spec coverage:** AC1→Task 2 Step 1 + standalone file; AC2→harness checks 2; AC3→harness checks 3; AC4→harness check 4; AC5→Task 2 Step 3 (CSS review); AC6→harness check 5 + token contrast table in spec; AC7→harness check 6. No gaps.
- **Placeholder scan:** no TBD/TODO; every code step contains complete code.
- **Name consistency:** CSS classes, markup classes, and harness selectors all use: `testimonials`, `testimonials-inner`, `testimonials-header`, `testimonials-eyebrow`, `testimonials-title`, `testimonials-grid`, `testimonial`, `testimonial-mark`, `testimonial-avatar`, `testimonial-author`, `testimonial-name`, `testimonial-role`, `testimonials-title` id. Verified identical across all three surfaces.

## Execution handoff (self-decided, unattended)

Subagent-driven execution was rejected: two tasks, one dependency chain, single tiny artifact — subagent fan-out adds free-model failure modes with no parallelism gain. **Chosen: inline execution via superpowers:executing-plans.**
