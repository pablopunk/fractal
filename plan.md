# Implementation Plan

## Goal
Restore the Fractal Agent control as a sidebar-bottom button/tab while making the chat itself a separate, wider overlay panel that opens above that button and extends into the main workspace.

## Intended behavior
- The **only visible Fractal Agent toggle** lives in the sidebar, in the old bottom-entry position.
- Clicking that sidebar entry toggles the agent panel open/closed.
- `Cmd+G` toggles the exact same open state.
- When open, the chat panel is **not constrained to sidebar width**. It should feel visually attached to the sidebar button but extend rightward into the workspace, matching the wireframe.
- The panel should not render its own second floating tab/button.
- The panel remains available even when there is **no active project** selected.
- Existing gatekeeper/chat content inside `AgentPanel` stays the same; only placement/toggle ownership changes.

## Files / areas to change

### 1) `src/components/AgentPanel.tsx`
- Remove the embedded `.agent-tab` button entirely.
- Narrow `AgentPanel` responsibilities so it only renders the overlay panel.
- Keep props focused on:
  - `open`
  - `apiKeys`
  - `onOpenSettings`
- Drop `onToggle` from this component unless animation/state coupling still needs it.
- Keep animation origin bottom-left so the panel still appears to grow from the sidebar entry.
- Preserve current gatekeeper/chat/tool-call UI.

### 2) `src/components/BoardParts.tsx`
- Reintroduce a dedicated sidebar-bottom Fractal Agent entry/button (the old placement concept), but keep the updated icon/styling as needed.
- Add sidebar props for agent state and toggle callback, likely something like:
  - `agentOpen: boolean`
  - `onToggleAgent: () => void`
- Render the button near the bottom of the sidebar, separate from project list items and add-project flow.
- Ensure collapsed-sidebar mode has a compact icon-only version.
- Ensure mobile sidebar mode still exposes the button when the drawer is open.

### 3) `src/components/Board.tsx`
- Keep `agentPanelOpen` as the single source of truth.
- Continue owning the `Cmd+G` shortcut here.
- Pass `agentOpen` / `onToggleAgent` into `Sidebar`.
- Keep rendering `AgentPanel` near the root of the app so it is not tied to `activeProject` branches.
- Remove any now-unused toggle plumbing from the current floating-tab implementation.

### 4) `src/styles/global.css`
- Delete the current floating `.agent-tab` styles.
- Add sidebar-entry styles for the Fractal Agent button/tab at the bottom of the sidebar.
- Update `.agent-panel` positioning so it:
  - anchors from the lower-left area near the sidebar button,
  - opens above it,
  - extends into the workspace with a wider fixed width on desktop,
  - does **not** look like it lives inside the sidebar.
- Keep mobile overrides, but adapt them to a bottom-sheet-like panel with no floating tab.
- Ensure z-index keeps the panel above workspace content but below modals when needed.

## Approach / key design decisions
- **Single toggle owner:** sidebar entry + `Cmd+G` only. No second toggle in `AgentPanel`.
- **Panel remains portal-based:** keep it rendered through `Portal` so it can overlap the workspace freely.
- **Visual attachment without layout coupling:** use fixed positioning for the panel, but derive its left/bottom placement to align with the sidebar button area instead of constraining its width to the sidebar.
- **Sidebar owns affordance, panel owns content:** sidebar renders the button; `AgentPanel` renders only the panel.

## Edge cases
- **Collapsed sidebar:** sidebar button must still exist and remain clickable in icon-only form; panel should still open at a sensible left offset instead of collapsing to tiny width.
- **Mobile:** sidebar button remains in the mobile drawer, but the panel should behave like a bottom sheet overlay and not rely on desktop left anchoring.
- **No active project:** panel must still toggle and render, since Fractal Agent is global.
- **Project picker open in sidebar:** button should not overlap or break the add-project picker/footer area.
- **Terminal open / workspace crowded:** panel must overlay above workspace content rather than pushing layout.

## Validation strategy
- Manual UI validation in the running browser:
  1. Sidebar expanded: click Fractal Agent button → panel opens above button and extends into workspace.
  2. Click same button again → panel closes.
  3. Press `Cmd+G` with sidebar/project view active → toggles same panel state.
  4. No active project selected → sidebar button still available and panel still opens.
  5. Collapsed sidebar → icon-only button still works and panel placement is sane.
  6. Mobile viewport → button is only in sidebar/drawer; panel behaves as bottom sheet.
  7. Open Settings from gatekeeper → still works above panel.
- Focused checks:
  - `mise exec -- pnpm run typecheck`
  - `mise exec -- pnpm exec biome check src/components/AgentPanel.tsx src/components/Board.tsx src/components/BoardParts.tsx src/styles/global.css`

## Non-goals
- No chat backend/tool changes.
- No provider/model settings redesign in this task.
- No thread/history UX changes.
- No broader sidebar/board layout redesign beyond the agent toggle placement.

## Risks / mitigations
- **Risk: duplicate toggle paths remain** if the floating tab is not fully removed.
  - Mitigation: remove `.agent-tab` markup/styles and make sidebar button the only toggle source.
- **Risk: panel placement breaks in collapsed/mobile modes.**
  - Mitigation: handle collapsed-sidebar and mobile in explicit CSS branches instead of one shared desktop rule.
- **Risk: panel accidentally disappears when no project is active.**
  - Mitigation: keep `AgentPanel` mounted at the app root, not inside active-project-only rendering.
- **Risk: z-index regressions with settings/project modals.**
  - Mitigation: preserve modal > panel stacking order and re-test gatekeeper → settings flow.
