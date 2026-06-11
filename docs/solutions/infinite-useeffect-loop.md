# Infinite useEffect loop from plain functions in deps

## Problem

Browser or server logs show hundreds of identical API calls per second — e.g. `POST /api/health-check`, `GET /api/state`, or `GET /api/projects/.../github-issues` — sustained until the app is killed. CPU spikes in both the browser renderer and the dev server.

## Root cause

A plain `async function` or regular function declared inside a React component body, then used as a `useEffect` dependency. Every render creates a new function identity, so the effect re-fires, the function updates state, which triggers a re-render, creating a new function identity, etc.

Example of broken pattern (from `Board.tsx` before fix):

```tsx
async function refresh() {
  const data = await api("/api/state");
  setProjects(data.projects); // triggers re-render
}

useEffect(() => {
  void refresh();
  const interval = setInterval(() => void refresh(), 30000);
  return () => clearInterval(interval);
}, [refresh]); // ⚠️ `refresh` is new on every render
```

## Fix

Wrap the function in `useCallback` with stable dependencies. State setters, refs, and imports are always stable.

```tsx
const refresh = useCallback(async () => {
  const data = await api("/api/state");
  setProjects(data.projects);
}, []); // state setters are stable, no deps needed

useEffect(() => {
  void refresh();
  const interval = setInterval(() => void refresh(), 30000);
  return () => clearInterval(interval);
}, [refresh]); // ✅ stable reference
```

Move the `useEffect` below the `useCallback` declaration — `const` is not hoisted like `function`.

## Specific files fixed

- `src/components/Board.tsx` (commit `c825191`)
  - `refresh` → `useCallback([], [])`, effect moved below declaration
  - `refreshIssues` → `useCallback([activeProjectId, githubRepo, showLinearIssues])`, effect deps reduced to scalars

## Verification

1. Start the app and observe server logs — no repeated `/api/health-check` or `/api/state` calls beyond the mount + 30s interval cadence.
2. `tsc --noEmit` passes, `vitest` passes (38 tests).

## Notes for future debugging

- The same anti-pattern still exists in `Board.tsx` for keyboard-handler functions (`openProjectTerminal`, `selectProject`, `activateTerminal`) — they cause unnecessary listener re-registration but no infinite loop.
- `TerminalPane` has a `[props]` dep on a resize effect that is noisy but also non-looping.
- If similar symptoms appear in a different component, grep for `useEffect` deps that reference locally-defined function names.
