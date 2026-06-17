# Code Context

## Current Behavior

The Fractal Agent is currently a fully floating UI element (fixed-position, rendered via Portal to `document.body`):

- **`.agent-tab`** button: `position: fixed; bottom: 8px; left: 12px; width: 320px; z-index: 201` — floats at viewport bottom-left, independent of the sidebar.
- **`.agent-panel`** chat content: `position: fixed; bottom: 58px; left: 12px; width: 360px; z-index: 200` — floats above the tab.
- The old sidebar-integrated `AgentSidebarEntry` component (in `BoardParts.tsx`) was fully removed in the recent commit `bb21fdc` ("fix: make Fractal Agent a single floating chat tab").
- The old CSS section `/* ---------- Agent sidebar ---------- */` in `global.css` is now empty (lines 505-506).

## Files Retrieved

1. `src/components/AgentPanel.tsx` (lines 1-169) — Main component containing both the `agent-tab` button and the `agent-panel` overlay, rendered together inside a single `<Portal>`.
2. `src/components/Board.tsx` (lines 258, 667, 2033-2041) — Uses `agentPanelOpen` state, renders `<AgentPanel>` at the bottom of `<main>`, handles keyboard shortcut `Meta+G` to toggle.
3. `src/components/BoardParts.tsx` (lines 49-207) — `Sidebar` component that previously had `AgentSidebarEntry`; the prop `onSelectAgent` was removed in `bb21fdc`.
4. `src/styles/global.css` (lines 3117-3500) — All `.agent-*` CSS: `.agent-panel` (fixed overlay), `.agent-tab` (fixed button), `.agent-panel-header`, `.agent-chat`, `.agent-composer`, `.agent-gatekeeper`, `.agent-error`, plus mobile/responsive overrides.
5. `src/components/Portal.tsx` (lines 1-5) — Thin `createPortal` wrapper to `document.body`.
6. `git diff HEAD~1 HEAD` — Shows the recent commit that removed sidebar integration and moved everything to fixed-position floating UI.

## Architecture

### Component Tree (relevant paths)

```
Board (Board.tsx)
├── Sidebar (BoardParts.tsx)
│   ├── project-list (projects + tabs)
│   └── sidebar-resize-handle
├── main
│   ├── workspace
│   │   ├── board (columns + composer)
│   │   └── TerminalPane
│   └── (modals, tackle issue, etc.)
└── AgentPanel (AgentPanel.tsx)  ← Portal to document.body
    ├── .agent-panel (animate presence overlay)
    │   ├── AgentHeader
    │   ├── AgentChat (or AgentGatekeeper)
    │   └── AgentComposer
    └── .agent-tab button (fixed-position toggle)
```

### Layout Variables

- **`--sidebar-width`**: Applied on `.app` element via inline style `{ "--sidebar-width": "${sidebarWidth}px" }`. Default: `204px`. The CSS grid `grid-template-columns: var(--sidebar-width, 204px) 1fr`.
- **`sidebarCollapsed`**: Derived from `isSidebarCollapsed(sidebarWidth)`. When collapsed, sidebar shows only project icons (38px wide).
- **`sidebarWidth`**: Stored/loaded via `loadSidebarWidth()`, savable via `saveSidebarWidth()`. User-resizable via drag handle.
- Glass mode affects backgrounds via `--material-*` CSS custom properties but does not change layout.

### Key State

```typescript
// Board.tsx
const [agentPanelOpen, setAgentPanelOpen] = useState(false);

// Toggle via keyboard shortcut (Meta+G) in useEffect at line 663-668
setAgentPanelOpen((prev) => !prev);

// Rendered at bottom of Board's return, outside activeProject conditional
<AgentPanel
  open={agentPanelOpen}
  onToggle={() => setAgentPanelOpen((prev) => !prev)}
  apiKeys={apiKeys}
  onOpenSettings={() => { setAppSettingsInitialTab("provider"); setAppSettingsOpen(true); }}
/>
```

## Files/Lines That Need Changes

### 1. `src/components/AgentPanel.tsx` (all 169 lines)

**Problem**: The `.agent-tab` button is co-located inside the `<Portal>` with fixed positioning, making it impossible to render in the sidebar.

**Change**: Either:
- (A) Split into two components: `AgentPanel` (the overlay, stays in Portal) and a separate `AgentTab` rendered in the sidebar, OR
- (B) Move the `.agent-tab` button outside the `<Portal>` and render it as a child prop, passing it up to the Sidebar.

**Layout change**: Change `.agent-panel` from `left: 12px` (fixed viewport-relative) to right-relative so it opens overlaying the main area. Panel width should be larger (e.g., `width: 400px`). Position should be computed to align with the sidebar button.

**Key lines**:
- Line 14: `AgentPanelProps` — currently `onToggle` replaces `onClose`
- Lines 25-50: The `<Portal>` wrapper and animated `.agent-panel`
- Lines 51-65: The `.agent-tab` button (needs to move to sidebar)
- Lines 147-168: `AgentComposer` (no changes needed)

### 2. `src/components/BoardParts.tsx` — `Sidebar` component

**Problem**: The `AgentSidebarEntry` component and its usage were removed. The sidebar needs the agent tab back.

**Change**: Add a new entry inside the sidebar's `.project-list` div (after project items, near line 208), or at the bottom of the sidebar in a dedicated section. The added entry should:
- Render the `.agent-tab` button with the same visual style (accent badge, "Fractal Agent" text, chevron icon)
- Call `onToggle` (or `onSelectAgent`) when clicked
- Show active state when `agentPanelOpen` is true

**Key lines**:
- Line 194: `AgentSidebarEntry` was removed
- Lines 203-207: The `.sidebar-resize-handle` — the agent tab should go before this
- The `Sidebar` props interface needs an `onSelectAgent` prop added back (or `onToggle`)

### 3. `src/components/Board.tsx`

**Problem**: Needs to pass the toggle function and state down to the Sidebar.

**Change**:
- Pass a new prop `onSelectAgent` (or `agentPanelOpen` + `onToggle`) to the `<Sidebar>` component
- The keyboard shortcut at line 663-668 is fine as-is
- The `<AgentPanel>` render at line 2033-2041 is fine as-is (the tab will now render via the sidebar)

### 4. `src/styles/global.css`

**Problem**: All `.agent-*` classes use `position: fixed` with viewport-relative coordinates.

**Changes needed**:
- **`.agent-tab`**: Change from fixed-position to a sidebar item. Remove `position: fixed`, `bottom`, `left`, `width`, `z-index`. Add sidebar-item styling that matches the existing `.project-item` pattern. Handle collapsed state.
- **`.agent-panel`**: Change from fixed `left: 12px` to a position that aligns with the sidebar button. Options:
  - Use `position: fixed; left: var(--sidebar-width, 204px); bottom: auto; top: <calculated>` (will need JS to read tab position)
  - Or `position: fixed; inset: auto 0 0 auto;` with some margin for the tab, plus overlay behavior
  - The panel should overlay the main area, not be constrained to the sidebar width
- Add CSS for the collapsed sidebar state (show only icon, no text)
- Add `.agent-sidebar-entry` CSS back (but redesigned)
- Handle mobile (sidebar is a slide-out drawer)

### 5. `src/styles/global.css` — Agent sidebar section (line 505)

Currently empty. Needs the new CSS for the sidebar-integrated agent tab.

## Layout Constraints

- **Sidebar width variable**: Ranges from ~38px (collapsed) to user-resizable width (default 204px). The agent panel position cannot use a fixed `left` value.
- **Panel overlay**: Must not push/constrain the board layout. The panel should be `position: fixed` (or `absolute` to the `.app` grid) so it floats over the main content.
- **Transform origin**: Currently `bottom left` for the panel entrance animation — this should update to match the tab position.
- **Grid layout**: `.app { display: grid; grid-template-columns: var(--sidebar-width, 204px) 1fr; }` — the main content is the 2nd column. Panel overlays this.
- **Mobile**: Sidebar becomes a slide-out drawer (`position: fixed`, `transform: translateX(-100%)`). The agent tab should only appear when the sidebar is open, or be handled as a bottom-fixed element on mobile (current mobile CSS is probably fine for mobile).

## Risks

1. **Position calculation**: The agent panel needs to track the sidebar button's position. Using `position: fixed` for the panel with a `left` value tied to the sidebar width via CSS var (`var(--sidebar-width)`) works for open sidebar, but the collapsed state needs special handling (narrower width). Best approach: compute position in JS using `getBoundingClientRect()` of the tab button on toggle, or use CSS `left: var(--sidebar-width)` with a transition.
2. **Animation**: The spring animation's `transformOrigin` needs to match the tab position (bottom of sidebar, at the button). This changes when sidebar is collapsed.
3. **Mobile ambiguity**: On mobile, the sidebar is a slide-out drawer. Should the agent tab be inside the drawer (so it closes when the drawer closes) or be visible outside it? The current mobile CSS for `agent-tab` (`position: fixed` at bottom) may still be the right approach for mobile.
4. **Z-index stacking**: The panel currently has `z-index: 200`, which is above the board but below modals (`z-index: 210`). If the panel now overlaps the board columns, ensure column drop-targets and drag overlays still work.
5. **ResizeObserver for board layout**: Board auto-compact/rows detection uses `boardElement.parentElement` width. The floating panel won't affect this since it's fixed-position.

## Open Questions

1. Should the `.agent-tab` be in the sidebar's **project list** (as a project-like item) or at the **bottom of the sidebar** (like the old `AgentSidebarEntry`)? The wireframe suggests it should be a distinct tab/button in the sidebar.
2. On mobile, should the agent tab stay as a fixed bottom button (current approach), or should it be inside the sidebar drawer?
3. Should the panel be fixed to the **right edge of the sidebar** (so it appears to emerge from the sidebar button), or positioned at a fixed offset from the left (e.g., `left: calc(var(--sidebar-width) + 8px)`)?
4. Should the panel have a maximum width constraint or be fully responsive? Current is `360px`, task suggests wider overlay.
5. Is there a need for the `.agent-board-spacer` CSS class (currently vestigial) to be used?

## Validation Commands

```bash
# Build check
pnpm run build

# Type check
pnpm run typecheck

# Lint
pnpm run lint

# Start dev server and verify:
# 1. Sidebar shows Fractal Agent button
# 2. Click opens panel overlay in main area
# 3. Panel width ~360-400px, not constrained to sidebar
# 4. Collapse sidebar → agent icon only
# 5. Toggle via Meta+G keyboard shortcut
# 6. Panel entrance animation originates from tab position
# 7. Mobile: verify behavior
pnpm run dev
```

## Start Here

Open `src/components/AgentPanel.tsx` first to decide the split strategy (option A or B above), then `src/components/BoardParts.tsx` to re-add the sidebar entry, then `src/styles/global.css` for positioning/overlay CSS.
