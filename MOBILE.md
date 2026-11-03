# Mobile companion

> v0.0.65 · one screen, voice first; the creative mode is the desktop surface, responsive.

![Mobile companion](public/diagrams/mobile.svg)

OLYMPUS is a desktop app, but the walk does not need the desk. The companion
is **the app itself at `/m`** — no second backend, no second database, no
second secret. A phone on the same network opens the paired URL and sees the
campaign that is running, switches the active project, sends a prompt by text
or voice, reads the campaign aloud, opens the live preview and checks the
project's git remote and last commits.

## Pairing

1. On the desktop, click the **phone icon in the status bar**.
2. The dialog shows a QR, the LAN URL and the session token.
3. Scan the QR with the phone camera. The token rides the URL **fragment**
   (`/m#t=…`), which the browser never sends in a request line; the page
   stores it in `localStorage` and drops it from the address bar.
4. If the mode reads `local`, press **enable LAN** and restart OLYMPUS. The
   bind is chosen at process start (`electron/main.ts`): `local` binds
   loopback, `lan` binds `0.0.0.0`, `tunnel` keeps loopback for
   Tailscale/SSH.

The QR stays valid across restarts because the token lives at
`~/.olympus/session-token` (0600). **Rotate** in the same dialog revokes every
paired phone immediately.

## Outside the house (remote)

The companion also works on mobile data. The desktop starts a **Cloudflare
quick tunnel** (no account, no stored credential):

1. Desktop → phone icon → **start remote tunnel**.
2. The dialog shows the `https://…trycloudflare.com` URL and a **link** button
   that copies `…/m#t=<token>` — open that on the phone.
3. **stop the tunnel** when you are done; the URL is a public door.

The tunnel process is detached and survives app restarts; its URL is stored in
`~/.olympus/mobile-tunnel.json`. A quick tunnel gets a new URL when restarted,
so re-copy the link after a restart. Tailscale/SSH remains the private
alternative (the `tunnel` network mode).

## What the phone can do

| Surface | What it does |
|---|---|
| Voice (the screen) | hold the mic inside the plasma ring → server STT → Apollo in the project's lane; the god row picks the voice/persona |
| Details sheet | campaign, project, live preview, git, cost, theme and language — no cards on the main screen |
| Creative | `/m/studio` — the desktop creative surface, one column on a phone, two on a tablet, progress per god + feed + queue + chat |
| Preview | server-resolved URL: the desktop's LAN IPv4 on the same Wi-Fi, or a per-port HTTPS tunnel away from home; start/stop the server and the tunnel here |
| Studio | `/m/studio` — the same creative mode: progress (overall + per god), the plasma ring, the build crystal, the development feed, the prompt queue and the per-god voice |
| Voice to Apollo | hold the mic inside the ring → server STT → the request goes to Apollo in the project's lane |
| Mirror | the god and voice switches are shared with the desktop (`studio-state.json`); the chat is private per surface |
| Resume | sends the deterministic `Nova tarefa: continue o projeto <slug>` turn |
| Git | remote, branch and the last three commits (read-only) |
| Cost | the 24h step-cost figure |
| Theme | inherits the desktop theme; a choice on the phone changes the PC too |
| Ambient | the creativity page's drifting particle field (44 particles, pauses when hidden) |

## Security model

- **One secret.** The companion uses the existing bearer token; there is no
  mobile-only password that could drift or be weaker.
- **Fragment, not query.** Tokens in a query string land in server logs and
  browser history; the fragment does not.
- **Auth-gated pairing.** `/api/olympus/mobile/pair` calls `requireAuth`:
  loopback-only Host/Origin in `local` mode, bearer token in `lan`/`tunnel`.
- **Explicit network switch.** Nothing leaves loopback until the user presses
  *enable LAN*; the app says a restart is required instead of pretending the
  bind changed live.
- **Revocation is real.** Rotating the token invalidates every paired phone
  and the old QR.
- **Read exposure, stated plainly.** Some read-only Olympus routes predate the
  read-auth gate and answer on the LAN without a token (`run-state`,
  `projects`, `costs`). The *pairing* payload and every *mutation* are
  token-gated; the mobile page always sends the token. A LAN host that knows
  the URL can still read those older GETs until they are migrated to
  `requireReadAuth` — tracked, not hidden.

## Honest limits

- No push notifications: the phone polls every 6s while the tab is visible.
- The minimal `/m` has one canvas (the ring) and no page scroll; the creative
  scrolls natively (the root body no longer blocks it).
- No offline queue: a prompt sent while the desktop is down fails loudly.
- The companion is a web app, not a store-native app; voice depends on the
  browser's speech engine and language.
- Git is read-only on the phone; create/connect/push stay on the desktop.
- The live preview is the project's own dev server; it must be running. The
  preview tunnel is public but unguessable — close it when you are done.
- The phone follows the desktop's language. An explicit choice in the theme
  sheet is the one action that changes the shared language for both surfaces.
- The chat transcript is local to each surface; the shared state is the god,
  the voice switch, the progress, the queue and the feed.
- The mic needs a secure context: the HTTPS tunnel (or localhost). On plain
  HTTP LAN the browser blocks it and the ring says so; the text input still
  works.

## Verification

`scripts/mobile-companion.test.mjs` — 17 assertions: token strength and file
mode, fragment-only URL, QR payload, mode round-trip, auth gates, rotate and
mode guards, campaign/project/prompt/voice/preview/git surfaces, and the
desktop mount.

![Creative mode](public/diagrams/creative.svg)

`scripts/mobile-preview.test.mjs` (v0.0.63) — 15 assertions: the reachability
classifier (public host ⇒ tunnel, loopback/LAN ⇒ direct), tunnel truth for an
unused port, the source pin that forbids rebuilding the URL from
`location.hostname`, the endpoint call, the studio link and the auth gates on
the preview route.
