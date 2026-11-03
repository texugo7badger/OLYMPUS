# Responsive OLYMPUS — one machine, any screen

> The desk, the lap, the tablet, the phone and the TV are the same machine.
> Responsiveness is not a stylesheet at the end; it is a product rule.

## Targets

| Class | Width | Surface | Rule |
|---|---|---|---|
| **Phone** | < 640px | `/m` companion | one column, 44px touch targets, safe areas, voice, theme |
| **Tablet** | 640–1024px | shell + `/m` | single active pane, bottom tabs, no hover-only actions |
| **Desktop** | 1024–1920px | full shell | resizable split, brain + terminal, status bar collapses |
| **TV** | ≥ 1920px / 4K | full shell | scale type and hit areas, no tiny chrome, remote-friendly focus |

## Rules

- **Fluid first.** Spacing and type scale with the viewport; no fixed 1600px
  assumptions. Minimum body text 12px at 1x; TV scales up, never down.
- **One primary action per surface.** The narrow layout never shows two
  competing CTAs.
- **Touch is first-class.** Every action reachable by hover is also a button;
  targets ≥ 44×44 on touch, visible focus ring on keyboard.
- **Motion is optional.** `prefers-reduced-motion` and the theme's `stable`
  mode keep the app usable; decorative particles stop.
- **Performance mode.** Low-end phones/PCs switch the brain to
  `batterySaver`, drop the particle field, and keep spinners/status. Toggle in
  Settings (and `?safe=1` for a crash-loop start).
- **Hibernation is explicit.** “Work alone for N hours” (1–12h, up to 24h via
  the API) keeps the campaign alive while you play or sleep; auto-resume is
  bounded by the window, and a pre-hibernation artifact is byte-identical on
  resume.

## What ships today

- The **mobile companion** at `/m`: 390×844 verified, LAN + Cloudflare tunnel,
  theme both ways, ambient field, voice, preview, git.
- The **desktop shell** is resizable; the status bar collapses its brain
  labels below 1680px and its cost detail below 1800px.
- The **boot gate** waits for critical data, fonts and SSE, then reveals the
  shell once; pane chunks preload after boot.
- **Performance mode** (first slice) and **safe mode** (`?safe=1`).

## The queue

1. **Narrow shell** — below 900px, one active pane + bottom tab bar; below
   640px, hand off to `/m`.
2. **Tablet split** — left rail collapses to icons; the terminal becomes a
   sheet, not a column.
3. **TV scale** — a `data-display="tv"` scale for 4K (type, hit areas, rail).
4. **Performance mode v2** — FPS meter, automatic suggestion on low memory,
   per-surface budgets.
5. **Hibernation UX** — a first-class “night shift” panel with hours, a
   progress line and a morning digest.
6. **Device tests** — 320 / 768 / 1280 / 1920 / 3840 widths in the local
   suite, plus a real phone pass over the tunnel.

## Honest limits

- The shell is still desktop-first; the narrow layout is the next slice.
- Fullscreen on Linux is opt-in until the renderer crash is cured.
- The TV profile is a design target, not a tested surface yet.
