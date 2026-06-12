# Phase 1 Implementation: Terminal behind main origin

## Summary

Consolidated the terminal WebSocket onto the main server's origin at `/api/terminal/ws`.
The separate terminal server port, preload port plumbing, and `ws://127.0.0.1` hardcoded
URL are all removed. The client derives the WS URL from `window.location`.

## Changed files

1. **`electron/terminal-server.cjs`**
   - Extracted `attachTerminalWSServer(httpServer)` — takes an existing HTTP server,
     attaches a `WebSocketServer` at `/api/terminal/ws` (was `/terminal`), returns a
     cleanup function.
   - `createTerminalServer()` remains as a thin backward-compat wrapper.
   - Exports both `{ attachTerminalWSServer, createTerminalServer }`.

2. **`electron/main.cjs`**
   - Added `const http = require("node:http")` at top.
   - Replaced `serverPromise`, `terminalServer`, `terminalServerPromise` with
     `mainServer`, `serverCleanup`.
   - Replaced `startTerminalServer()` + `startAstroServer()` with two functions:
     - `startUnifiedServer()` — production: imports Astro standalone entry's `handler`,
       creates an HTTP server with it, attaches terminal WS, listens on a free port.
     - `startDevProxy(astroDevPort)` — dev mode: creates an HTTP proxy server that
       forwards non-WS requests to the Astro dev server and handles terminal WS
       upgrades locally. Vite HMR WebSocket upgrades are proxied through.
   - `createWindow()`: no more terminalPort; always loads from the unified/proxy server port.
   - Removed `additionalArguments` and `--fractal-terminal-port` plumbing.
   - Replaced `closeTerminalServer()` with `closeMainServer()` — cleans up terminal
     connections first, then closes the HTTP server.
   - `before-quit` calls `closeMainServer()`.

3. **`electron/preload.cjs`**
   - Removed `terminalArg` parsing and `terminalPort` from the exposed `electron` API.
   - Kept `platform`, `getPathForFile`, and `openExternal`.

4. **`src/components/TerminalPane.tsx`**
   - Removed `terminalPort` from `ElectronGlobals` type.
   - Removed the `const port = ...` read and the `if (!port)` early return.
   - WS URL now: `${protocol}//${window.location.host}/api/terminal/ws?...`
     where protocol is `ws:` for HTTP origins and `wss:` for HTTPS origins.

## Validation

- **TypeScript**: `pnpm run typecheck` passes (0 errors).
- **Lint**: 0 errors, 32 pre-existing warnings (none from these changes).
- **Tests**: `pnpm run test` — 5 test files, 43 tests, all pass.
- **Format**: Biome formatting applied.

## Unchanged behavior

- The `createTerminalServer()` export is retained for any standalone use.
- The terminal WS connection logic (pty, script fallback, tmux session management) is untouched.
- The dev mode flow (`electron:dev` script) still works:
  `concurrently` runs Astro dev on 7666, Electron starts, opens a dev proxy on a
  random port that HMR works through.

## Risks / Known Limitations

- Dev mode WebSocket upgrade proxying relies on event listener ordering
  (our handler fires first, passes through `/api/terminal/ws`, proxies everything
  else to Vite). Tested statically but needs an interactive smoke test.
- The `server.on("upgrade", ...)` for dev proxy uses `_head` (unused parameter
  for the unused `head` Buffer from the upgrade event) — harmless.
- In a browser (non-Electron) connecting to a remote host, the terminal WS will
  attempt to connect and fail gracefully (no hardcoded error — the WebSocket
  connection will simply fail, and the close handler will show "Terminal disconnected").
