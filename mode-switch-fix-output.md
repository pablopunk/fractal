# Mode Switching UX Fix — Implementation Report

## Summary

Replaced the broken in-settings ModePicker with a proper startup-first-launch picker +
`app.relaunch()` / `app.quit()` for mode changes.

## Changed files

1. **`electron/mode-picker.html`** (new) — Inline startup window UI
   - Dark theme matching Fractal
   - Two screens: pick mode (Host / Remote), remote URL input
   - Validates HTTPS URLs before allowing connect
   - Enter key submits on remote screen
   - Uses `contextBridge` IPC via `preload-startup.cjs`

2. **`electron/preload-startup.cjs`** (new) — Minimal preload for startup window
   - Only exposes `selectMode(payload)` via `ipcRenderer.send`
   - `contextIsolation: true`, `sandbox: true`

3. **`electron/main.cjs`** — Startup flow + mode restart
   - `showStartupWindow()` — creates small (420×480) non-resizable window with mode picker
   - `dismissStartupWindow()` — closes the startup window cleanly
   - `ipcMain.on("select-mode", ...)` — receives mode selection from startup window, stores config, dismisses window, calls `createWindow()`
   - `ipcMain.handle("set-mode", ...)` — now calls `app.relaunch()` + `app.quit()` for restart
   - `app.whenReady()` — uses `hasSavedConfig()` to decide: first launch → show startup, subsequent → go straight to saved mode
   - `app.on("activate")` — respects `hasSavedConfig()` on macOS dock re-activation

4. **`electron/remote-config.cjs`** — Added helpers
   - `hasSavedConfig()` — checks if `remote-config.json` exists on disk (first-launch detection)
   - `getMode()` — returns `{ mode, remoteUrl, keepAwakeEnabled }` with defaults
   - Added `existsSync` import

5. **`src/components/AppSettingsModal.tsx`** — Replaced ModePicker with ModeDisplay
   - No more inline mode editing or broken reload flow
   - Shows current mode + connected URL (if remote)
   - "Switch to Remote Mode" — `window.prompt()` for URL, `window.confirm()` before restart
   - "Switch to Host Mode" — `window.confirm()` before restart
   - Both call `electron.setMode()` which triggers `app.relaunch()` + `app.quit()`

## UX flow

```
First launch (no remote-config.json):
  → 420×480 startup window with [Host] / [Remote] buttons
  → Remote requires valid https:// URL
  → On selection: config saved, startup window closed, main window opens

Normal launch (remote-config.json exists):
  → Straight to saved mode — no prompt

Settings → "Switch to Remote Mode":
  → URL prompt → confirmation dialog → app relaunch → quit

Settings → "Switch to Host Mode":
  → Confirmation dialog → app relaunch → quit
```

## Validation

- TypeScript: 0 errors
- Tests: 5 files, 43 tests, all pass
- Biome lint: 0 errors, 32 pre-existing warnings (none from this change)
- Biome format: applied to changed files
