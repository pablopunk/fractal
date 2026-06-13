# Remote mode troubleshooting: Electron navigation, Tailscale serve, and terminal WebSockets

## Problem

Remote mode can partially work while one part of the flow fails:

- Pasting a `/connect#token=...` URL opens the system browser instead of staying in Electron.
- The remote app loads, but terminal tabs fail with WebSocket close-before-open errors.
- Packaged Electron host enables remote access, but Tailscale serves the wrong local port.

## Context

Fractal remote mode serves the host app over Tailscale. Remote clients should load the same origin for HTTP API calls, static assets, and terminal WebSockets.

Important paths:

- Electron window/navigation: `electron/main.cjs`
- Terminal WS server: `electron/terminal-server.cjs`
- Vite dev WS glue: `electron/terminal-ws-plugin.mjs`
- Terminal client URL building: `src/components/TerminalPane.tsx`
- Tailscale serve endpoint: `src/pages/api/tailscale/serve.ts`
- Pairing page: `src/pages/connect.astro`

## Root causes and fixes

### Connect URL redirected out to the system browser

The remote window originally compared navigation against the full pasted URL. For a connect URL like:

```text
https://host.ts.net/connect#token=...
```

client-side redirect to `/` did not start with that full string, so Electron treated it as external navigation and opened the browser.

Fix: allow same-origin navigation by comparing parsed origins, not string prefixes or the full URL. Also validate schemes before `shell.openExternal`; only `http:` and `https:` should be opened externally.

### Remote terminal WebSockets failed in dev

Tailscale Serve pointed at the Astro dev server port, but terminal WebSocket upgrades were handled by an Electron dev proxy on another port. Remote clients reached HTTP successfully but WebSocket upgrades hit the wrong server.

Fix: in dev, attach the terminal WebSocket handler to Vite/Astro via `electron/terminal-ws-plugin.mjs`, so the same served origin handles:

- pages and API routes
- Vite dev assets/HMR
- `/api/terminal/ws`

The terminal client should derive its WebSocket URL from `window.location`, not from a separate terminal port.

### Packaged host served the wrong local port

In packaged Electron, the unified server listens on an ephemeral local port. The Tailscale endpoint must proxy to that actual port, not a hard-coded dev port.

Fix: after the unified server binds, store the bound port in `process.env.PORT` before the UI can call `/api/tailscale/serve`. The endpoint can then run Tailscale Serve against `http://127.0.0.1:${process.env.PORT}`.

## Verification

- Pairing URL stays inside Electron: `/connect#token=...` stores the token and redirects to `/` without opening the system browser.
- Remote terminal tabs connect to `wss://<tailnet-host>/api/terminal/ws?...` and attach successfully.
- Packaged host uses the actual bound Electron server port for Tailscale Serve.
- `mise exec -- pnpm run typecheck`, `mise exec -- pnpm run lint`, `mise exec -- pnpm run test`, and `mise exec -- pnpm run build` pass.

## Notes for future debugging

- If HTTP works but terminal tabs do not, check which local port Tailscale Serve proxies to and whether that server handles WebSocket upgrades.
- If Electron opens the browser unexpectedly, inspect `will-navigate` and `setWindowOpenHandler` origin/scheme checks.
- Keep remote dev and packaged modes aligned: both should expose one same-origin app surface to remote clients.
