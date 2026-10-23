# PAIR-1 phase 1 — the OpenCode v2 pair protocol, probed

> Issue: #200 · Roadmap: v0.0.9 item 6 · Date: 2026-10-23 · CLI: `opencode v2.1.4`
>
> Status: **probe complete, first proof green**. A prompt sent with a paired
> device credential landed in a v2 campaign session and the app credential
> read it back. The OLYMPUS UI wiring is phase 2 (see "What is not wired yet").

## Why this exists

OLYMPUS is desktop-first. The pair protocol is the native v2 lane for a second
device (phone, tablet, another laptop) to reach the same session the campaign
runs in — without a second agent, a second session, or a bespoke tunnel. This
note records what the installed CLI actually does (probe-first, no narration),
then the design for OLYMPUS's feed + gates over that channel.

## Probe environment

- `node_modules/@opencode/cli/bin/opencode.exe` (ELF, run directly — not via
  the `.js` shim).
- A throwaway `HOME` (`/tmp/opencode/pair-proof/home`) so no real user state
  was touched; the server on `127.0.0.1:4210`.
- The probe commands and outputs below are verbatim.

## What the probe proved

### 1. `opencode pair` needs a managed service, not a raw `serve`

```
$ opencode pair --url http://127.0.0.1:4210
Error: Managed service port 49374 on 127.0.0.1 is already in use by another process.
```

`pair` ensures the background **service** (`opencode service start`) and issues
the link from that service. `--url` only overrides the URL printed in the link;
it does not point the command at an arbitrary server. The service config lives at:

- `~/.config/opencode/service.json` — `{ port, password }`, mode `600`
- `~/.local/state/opencode/service.json` — `{ id, version, url, pid, password }`, mode `600`

### 2. The server API is HTTP Basic, username `opencode`

```
$ curl -X POST http://127.0.0.1:4210/api/session
HTTP/1.1 401 Unauthorized
www-authenticate: Basic realm="Secure Area"

$ curl -u "opencode:<service password>" -X POST http://127.0.0.1:4210/api/session \
    -H 'content-type: application/json' -d '{"title":"PAIR-1 campaign"}'
200 {"data":{"id":"ses_…","title":"PAIR-1 campaign", …}}
```

Bearer tokens are **not** accepted on `/api/session` — the device credential is
a cookie (below), and the owner credential is Basic.

### 3. The pair link is one-time, 5 minutes, and has two shapes

```
$ opencode pair --url http://127.0.0.1:4210

  Open a link to connect. Links work once and expire in 5 minutes.

  http://127.0.0.1:4210/auth/connect/aSqxDlnYjTlmBWqip5C3VQ
```

The same link answers differently by `Accept`:

| Client | Response |
|---|---|
| JSON (default) | `200 {"token":"1795376684.<base64url>"}` — a bearer-style token |
| `Accept: text/html` | `302 → /` + `Set-Cookie: opencode_session_<port>=<token>; HttpOnly; SameSite=Lax; Max-Age=2592000` |

The cookie name is **port-scoped** (`opencode_session_4210`) — two instances on
different ports do not collide. The web app also accepts
`/?auth_token=<token>` and strips it from the URL after reading it.

### 4. A paired device can prompt the campaign session

```
$ curl -b device.cookies -X POST \
    http://127.0.0.1:4210/api/session/ses_…/prompt \
    -H 'content-type: application/json' \
    -d '{"text":"PAIR-1 proof: hello from the second device"}'
200 {"data":{"id":"msg_…","type":"user","payload":{"text":"PAIR-1 proof: …"},
     "delivery":"steer"}}
```

`delivery: "steer"` means the prompt joins the session's turn rather than
forking it. The transcript then shows the user message and the assistant reply,
and **both credentials read the same session**:

```
device cookie  → 2 messages (user + assistant)
opencode:<pw>  → 2 messages, same ids
```

This is the phase-1 proof: a second device's prompt reached the campaign
session through the pair channel, and the owner-side client saw it.

## OLYMPUS-side design (feed + gates through the pair channel)

### The channel

- **One session is the campaign.** The warm session manager already keeps one
  `opencode serve` per app run; the campaign session id is the pair target.
  There is no "pair session" — pairing is only credential handout.
- **Issue links from the app's warm server**, not a second service: reuse the
  service password from `~/.config/opencode/service.json` (mode 600) and the
  warm port. `opencode pair` is the reference implementation; the app can mint
  the same `/auth/connect/<token>` link with the same one-time/5-minute
  semantics.
- **Never `--remote` by default.** It enables OpenTunnel (internet exposure).
  Phase 2 must surface an explicit consent card with the exact exposure and a
  revoke action; the default stays `127.0.0.1` + LAN at most.

### The feed

- The remote prompt arrives as a normal session message (`type: "user"`,
  `delivery: "steer"`). The Terminal feed should render it with a **paired
  device badge** (device label + time), not as if the local user typed it.
- The owner side is already an API reader (`GET /api/session/<id>/message`);
  no new stream is needed for phase 2 — poll/SSE the same endpoint and tag
  messages whose ids were not produced locally.

### The gates (the part that must not be hand-waved)

- The v2 `permission.hook("evaluate")` is the existing gate. A remote prompt
  that triggers a tool still passes through it — **pairing must not add a
  bypass**.
- Provenance is new state: the gate needs to know whether the *current turn*
  was initiated by the owner or a paired device. Remote-initiated dangerous
  actions default to **deny** unless the owner has explicitly granted that
  device a capability (read-only vs full).
- Unattended lanes (hop runtime / overnight queue) must refuse remote
  approvals outright: an absent owner cannot consent, and a paired phone must
  never be able to approve a parked HITL card on the owner's behalf.
- Device tokens are bearer-equivalent for the session: store only hashes if
  OLYMPUS persists them, show last-used, and support revoke (stop trusting the
  cookie; rotate the service password to invalidate all devices at once).

## What is not wired yet (phase 2, exact missing pieces)

1. **Mint links in-app.** A `POST /api/olympus/pair/link` route that reads the
   warm service password and returns the one-time URL (plus a QR for phones).
2. **Device registry + provenance.** Persist paired devices (label, created,
   last-seen, capability), tag session messages by origin, and feed the tag
   into the permission gate.
3. **Remote approval policy.** Deny-by-default for remote-initiated tools in
   unattended mode; an explicit owner grant for interactive mode.
4. **Revoke/rotate.** A UI action that rotates the service password and
   invalidates all device cookies.
5. **Consent for `--remote`/OpenTunnel.** Only behind an explicit card.

## Honest limits of this proof

- The proof ran against a standalone `opencode serve` (v2.1.4) in a throwaway
  `HOME`, not the Electron app's warm session. The protocol is identical (the
  app's warm lane is `opencode serve --service`), but the in-app link minting
  and the badge/gate wiring above are still phase 2.
- The model that answered was the CLI's default (`opencode-go/kimi-k3.1-pro`);
  no OLYMPUS god was dispatched. The proof is about the channel, not the
  campaign's planning quality.

## Reproduction

```bash
export HOME=$(mktemp -d)
OC=node_modules/@opencode/cli/bin/opencode.exe
$OC service set port 4210 && $OC service start
PW=$(python3 -c 'import json;print(json.load(open("'$HOME'/.config/opencode/service.json"))["password"])')
SID=$(curl -s -u "opencode:$PW" -X POST http://127.0.0.1:4210/api/session \
  -H 'content-type: application/json' -d '{"title":"PAIR-1 campaign"}' \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]["id"])')
LINK=$($OC pair --url http://127.0.0.1:4210 | grep -oE 'http://[^ ]+')
curl -s -c device.cookies -H 'Accept: text/html' "$LINK"
curl -s -b device.cookies -X POST "http://127.0.0.1:4210/api/session/$SID/prompt" \
  -H 'content-type: application/json' -d '{"text":"hello from the second device"}'
curl -s -b device.cookies "http://127.0.0.1:4210/api/session/$SID/message"
```
