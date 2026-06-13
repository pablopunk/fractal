# Fixes for Review Round 1 — Phases 2-6

## 10 fixes applied

### Fix 1 (BLOCKER): Wire auth end-to-end
**Files**: `src/lib/client/api.ts`, `src/components/TerminalPane.tsx`
- `api()` reads `fractal:remoteToken` from localStorage, adds `Authorization: Bearer <token>` header
- Terminal WS reads same token from localStorage, appends `&token=<token>` to WS URL (both initial connect and reconnect)

### Fix 2 (BLOCKER): Terminal WS token validation
**File**: `electron/main.cjs`
- Added `remoteAccessEnabled` and `remoteAccessToken` module-level vars
- Added `loadRemoteAccessSettings()` — reads from SQLite settings table via better-sqlite3
- Added `verifyTerminalToken(req)` — checks token in query params when remote access enabled
- Both `startUnifiedServer()` and `startDevProxy()` check token before `handleUpgrade()`
- Sends `HTTP/1.1 401 Unauthorized` and destroys socket on failure

### Fix 3 (BLOCKER): Fix `/api/health*` auth bypass
**File**: `src/middleware.ts`
- Changed from `startsWith("/api/health")` to exact match `=== "/api/health"`
- Removed unused `PUBLIC_PATHS` Set

### Fix 4 (BLOCKER): Remove X-Forwarded-For trust
**File**: `src/middleware.ts`
- Removed `X-Forwarded-For` header parsing for localhost detection
- Uses only `request.url` hostname — safe because Tailscale serve sets Host based on actual origin

### Fix 5 (BLOCKER): Mode picker UI
**File**: `src/components/AppSettingsModal.tsx`
- Added `ModePicker` component with host/remote mode display
- Host mode: shows URL input + "Switch" button to enter remote mode
- Remote mode: shows "Switch to Host Mode" button
- Uses Electron IPC `getConfig()`/`setMode()` via preload

### Fix 6: Validate remote URL
**File**: `electron/main.cjs`
- `createRemoteWindow()` validates URL starts with `http://` or `https://`, falls back to `about:blank`
- IPC `setMode` handler validates URL before storing

### Fix 7: Remove PWA icon refs
**File**: `public/manifest.json`
- Removed `icons` array until real icon files exist

### Fix 8: Auto-generate token on enable
**File**: `src/components/RemoteAccessSettings.tsx`
- `toggleEnabled()` auto-generates token via POST when enabling and no token exists

### Fix 9: Fix ReconnectBanner timing
**File**: `src/components/ReconnectBanner.tsx`
- Moved `setRetrySeconds()` to after delay doubling, so displayed seconds match actual wait

### Fix 10: Error handling in RemoteAccessSettings
**File**: `src/components/RemoteAccessSettings.tsx`
- Added try/catch to `toggleEnabled()` — reverts state on failure
- Added try/catch to `regenerateToken()` — keeps existing token on failure
- Added try/catch to `fetchSettings()` and `fetchTailscale()` — graceful fallbacks

### Bonus: Fix connect.astro TS errors
**File**: `src/pages/connect.astro`
- Added null guard for `document.getElementById("status")`

## Validation
- `astro check`: 0 errors, 0 warnings, 5 hints
- `vitest run`: 5 files, 43 tests passed
- `biome check`: 0 errors, 32 pre-existing warnings
- `biome format`: 3 files auto-formatted
