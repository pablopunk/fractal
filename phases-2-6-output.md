All clean. Here's the complete loop summary:

---

## Final Summary — Plan 013: Remote Mode Implementation

### All 6 implementation phases complete (Phase 7 deferred per plan)

| Commit | Phase | What |
|---|---|---|
| `e7f654c` | 1 | Terminal WS on main origin at `/api/terminal/ws` |
| `e69536c` | Fix | 5 post-review fixes (autostart, upgrade routing, race, dead code) |
| `5ca4a21` | 2 | Auth middleware, `/api/health`, `/connect` page, token generation |
| `4a26849` | 3 | Remote access settings panel, tailscale status, QR code |
| `7da5685` | 4 | PWA manifest, browser fallbacks, reconnect banner, terminal WS reconnect |
| `a4645bc` | 5+6 | Electron remote mode, mode picker, keep-awake toggle (`caffeinate -is`) |
| `67dc5c0` | Chore | Lint fixes |
| `77b8157` | Chore | CSS for new components |

### Files changed: 27 files, +1,332 / −112 lines

**New files (12):**
- `src/middleware.ts` — Bearer token auth middleware (localhost bypass, WS query param support)
- `src/pages/api/health.ts` — Lightweight GET endpoint returning `{ name, version }`
- `src/pages/api/settings/remote-token.ts` — POST generates + stores a random token
- `src/pages/api/tailscale/status.ts` — Shells out to `tailscale status --json`
- `src/pages/connect.astro` — Reads token from URL fragment, stores in localStorage, redirects
- `public/manifest.json` — PWA manifest
- `src/components/RemoteAccessSettings.tsx` — Enable toggle, QR code, copyable URL, token management
- `src/components/AppSettingsModal.tsx` — Global settings modal (remote access + keep-awake)
- `src/components/ReconnectBanner.tsx` — Exponential backoff health-check banner
- `src/components/KeepAwakeToggle.tsx` — IPC-based keep-awake toggle (Electron-only)
- `electron/remote-config.cjs` — JSON config at `~/.fractal/remote-config.json`

**Modified files (12):**
- `electron/main.cjs` — Host/remote mode, unified server, dev proxy, keep-awake, IPC handlers
- `electron/preload.cjs` — Removed `terminalPort`, added `setKeepAwake`, `getConfig`, `setMode`
- `electron/terminal-server.cjs` — `noServer: true` WS, `/api/terminal/ws` path, exported `handleUpgrade`
- `src/lib/server/store.ts` — `remoteAccessEnabled`, `remoteAccessToken`, `keepAwakeEnabled` in AppSettings
- `src/components/TerminalPane.tsx` — WS URL from `window.location`, browser fallbacks, reconnect logic
- `src/components/Board.tsx` — AppSettingsModal trigger, ReconnectBanner
- `src/pages/index.astro` — PWA manifest link
- `src/styles/global.css` — Styles for reconnect banner, remote access, QR
- `package.json` / `pnpm-lock.yaml` — Added `qrcode` + `@types/qrcode`

### Validation
- **TypeScript**: 0 errors
- **Tests**: 43/43 pass (no regressions)
- **Lint**: 0 new errors (32 pre-existing warnings unchanged)

### Deferred
- Phase 7: Mobile layout pass (explicitly "separate plan")
- Icon assets for PWA manifest (`/icon-192.png`, `/icon-512.png`)
- Service worker for advanced PWA caching
- Linux keep-awake (`systemd-inhibit`)