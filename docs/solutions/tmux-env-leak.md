# Tmux env leak makes Fractal attach to the wrong terminal context

## Problem

Opening an existing Fractal prompt or terminal tab can look like a brand new tmux session, fail to show the expected running process, or otherwise behave like nested tmux when Fractal was launched from inside another tmux session.

Useful symptoms and keywords:

- The target session exists in `tmux list-sessions`.
- `tmux capture-pane -pt <session>` shows the expected running agent or shell.
- Fractal still appears to attach to the wrong/empty context.
- The app was started from a terminal already inside tmux.

## Root cause

Fractal inherited `TMUX` and `TMUX_PANE` from the shell that launched `pnpm run electron:dev`. When Fractal later spawned tmux client commands, tmux interpreted them as commands from inside the current tmux client instead of as a clean external client.

This affected both:

- server-side tmux helpers in `src/lib/server/tmux.ts`
- terminal WebSocket attachment in `electron/terminal-server.cjs`

The issue was not that pi sessions needed special handling, and it was not a session-name namespace problem. Adding arbitrary prefixes such as `fx-` to Fractal session names was a red herring because it prevents Fractal from attaching to the intended existing tmux session.

## Fix

Before running tmux client commands from Fractal, remove inherited tmux context variables:

```ts
const env = { ...process.env };
delete env.TMUX;
delete env.TMUX_PANE;
```

Use that env for `tmux has-session`, `list-sessions`, `new-session`, `send-keys`, and terminal attach/spawn paths.

## Verification

1. Launch Fractal from inside tmux.
2. Confirm the prompt session exists:

   ```sh
   tmux list-sessions -F '#{session_name}' | grep '<session-name>'
   tmux capture-pane -pt '<session-name>' -S -20
   ```

3. Open the prompt/terminal tab in Fractal.
4. It should attach to the existing session contents instead of creating or displaying a fresh-looking shell.
5. `mise exec -- pnpm run typecheck`, `mise exec -- pnpm run lint`, and `mise exec -- pnpm run test` pass.

## Notes for future debugging

- If a tmux session clearly exists but Fractal behaves as if it does not, inspect environment inheritance before changing session naming.
- Avoid fixes that rename or prefix existing session names unless the product behavior explicitly changes; prompt rows persist `tmuxSession` values and should be honored.
