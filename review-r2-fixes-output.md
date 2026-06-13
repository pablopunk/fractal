# Review Round 2 — Fixes Applied

## Changes

### Fix 1: Terminal WS auth stale → fresh DB read each upgrade
- Removed `loadRemoteAccessSettings()` (one-time cache) and module-level `remoteAccessEnabled`/`remoteAccessToken` vars
- New `readRemoteAccessSettings()` reads settings from SQLite synchronously on each call
- `verifyTerminalToken()` now calls `readRemoteAccessSettings()` fresh each time
- Both `startUnifiedServer()` and `startDevProxy()` use the same fresh-read approach

### Fix 2: Connect flow broken → SPA assets are public
- Middleware now only protects `/api/*` paths (via `isApiPath()`)
- SPA root `/`, static assets, manifest, fonts, etc. are now publicly accessible
- `/api/health` remains public (excluded from `isApiPath`)
- This means: connect page → stash token → redirect to `/` → SPA loads → API calls include token

### Fix 3: Local Electron terminal broken → localhost bypass
- `verifyTerminalToken()` now takes `socket` parameter and checks `isLocalConnection(socket)` first
- Localhost connections (127.0.0.1, ::1, ::ffff:127.0.0.1) skip token validation entirely
- Remote connections still require valid token when `remoteAccessEnabled` is true

### Fix 4: Mode switching → actual window reload
- After `setMode()` IPC call completes, `window.location.reload()` is called
- Remote URL validated: requires HTTPS, non-empty
- Switch button disabled when URL is empty
- Message changed from "restarts" to "reloads"

### Fix 5: loadRemoteAccessSettings fail-open → fail-closed
- On DB read error, `readRemoteAccessSettings()` returns `{ enabled: true, token: "" }`
- No token can match empty string → remote connections are denied

### Fix 6: API calls bypass auth → wired end-to-end
- `remoteToken()` exported from `api.ts`
- `ProjectPicker.tsx`: raw `fetch()` → `api()` call
- `Board.tsx` `deletePrompt`: raw `fetch()` → `api()` with `ApiError` catch for 409
- `BoardParts.tsx` `saveIcon`: added `Authorization` header on FormData fetch
- `ReconnectBanner.tsx`: `/api/health` is public, no auth needed

## Validation

- **TypeScript**: 0 errors (`npx tsc --noEmit`)
- **Lint**: 0 errors, 32 pre-existing warnings (`npx biome check`)
- **Format**: auto-formatted 1 file (`npx biome format --write`)
- **Tests**: 5 files, 43 tests, all pass (`npx vitest run`)

## Files changed

| File | Net Δ |
|---|---|
| `electron/main.cjs` | +33/-33 |
| `src/components/AppSettingsModal.tsx` | +22/-8 |
| `src/components/Board.tsx` | +25/-19 |
| `src/components/BoardParts.tsx` | +11/-2 |
| `src/components/ProjectPicker.tsx` | +6/-3 |
| `src/lib/client/api.ts` | +2/-1 |
| `src/middleware.ts` | +8/-4 |
