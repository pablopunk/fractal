---
name: design-system
description: The single source of truth for Fractal's UI — design principles, theme tokens, the material/glass system, component primitives, motion, and the opinions behind them. Use whenever you touch anything visual in this app: adding or restyling a component, building a modal/dialog/popover/menu, working in src/styles/global.css, adjusting colors/spacing/radii/typography, wiring a new theme, tuning the glass (opacity + blur) mode, fixing visual seams or washed-out surfaces, or deciding how a surface should look in light/dark/glass. Triggers include design system, design tokens, theme, dark mode, light mode, glass, glassmorphism, liquid glass, backdrop blur, translucent, modal, dialog, popover, command menu, card, button, input, surface, material, accent color, spacing, radius, hover/active/focus states, terminal theme, and "make this look better / more polished / more consistent".
---

# Fractal Design System

Fractal is a Linear/Raycast-flavoured dark-first desktop app (Electron) for driving terminal agents on a board. This skill is the source of truth for how it looks and why. All UI lives in one stylesheet: `src/styles/global.css`. Read it before editing — the system is token-driven, so most changes are token edits, not new component CSS.

## Prime directives

1. **Token-first, never hardcode.** Every color, surface, border, radius, and font comes from a CSS variable. If you're typing a hex value or a raw `px` radius into a component rule, stop — there is almost certainly a token for it. New visual concepts get a new token, not a one-off literal.
2. **One material system, three modes.** Light, dark, and glass are the *same* components swapping token *values*. Never fork component styling per mode. A component should not know whether glass is on — it reads `--material-*` / `--state-*` tokens that the root rewrites.
3. **Separate material from state.** Surface tokens (`--material-*`) describe a resting surface. Affordance tokens (`--state-*`) describe active/focus/hover/drag. Active and focus states must stay visible in every mode, including glass.
4. **Calm by default, accent on purpose.** Neutral surfaces and muted text carry the UI; the single accent (`--accent`, an orange) marks the one thing that matters in a view. Don't spray accent or add decorative gradients/glows that aren't a semantic state.
5. **Crisp text always.** Typography and icons stay sharp. Blur belongs to *surfaces*, never to content or the text on a focused surface.

## Token foundation (`global.css` `:root`)

Themes are driven by `html[data-theme="light"|"dark"]` (and `prefers-color-scheme` fallback). Dark is the default identity.

**Surfaces** — a 4-step elevation ladder. Each has a paired `-rgb` triple for alpha composition:
- `--bg` (app background, darkest) → `--surface` (panels/chrome) → `--surface-2` (cards/controls) → `--surface-3` (hover/raised).
- Use the `-rgb` variants with `rgb(var(--surface-rgb) / <alpha>)` for any translucency. **Prefer this over `color-mix()`/`calc()` nesting** when the alpha is user-driven (glass mode is).

**Text** — `--text` (primary) → `--text-muted` (secondary) → `--text-faint` (labels/captions). Don't invent intermediate greys.

**Lines** — `--border` (hairline dividers, control edges) and `--border-strong` (hover/emphasis edges).

**Accent** — `--accent` (orange: `#ff6a3d` dark / `#ea580c` light) + `--accent-soft` (low-alpha fill for active backgrounds). Semantic: `--success`, `--danger`.

**Geometry** — radii `--radius` (10px, panels/modals), `--radius-sm` (6px, controls/cards), `--radius-pill` (999px, chips/badges). **Typography** — `--font-sans` (Inter stack, UI) and `--font-mono` (JetBrains Mono Nerd Font, terminal/code/identifiers). Base size 13.5px.

When adding a theme: define the full surface ladder + `-rgb` triples + text + border + accent under a new `html[data-theme="..."]` block. Everything downstream inherits.

## The material / glass system

This is the heart of the system. Components never reference raw surfaces directly for their backgrounds — they reference **semantic material roles**, and the root decides what those resolve to per mode.

**Material roles** (resting surfaces), each with `-bg`, optional `-border`, optional `-filter`:
`layout` (app shell) · `chrome` (sidebar/topbar/tab bars) · `panel` (columns, composer, cmdk) · `card` · `popover` · `modal` (floating dialogs) · `control` (buttons/inputs) · `hover` · `overlay` (modal backdrop) · `terminal-tab`.

**State tokens** (affordances, mode-independent intent): `--state-active-bg/-border/-shadow/-color/-accent-color`, `--state-focus-border/-bg`, `--state-drag-bg`.

### Opaque mode (light/dark, default)
`--material-*-bg` map straight to the surface ladder, `--material-*-filter: none`, borders are real `--border`, panels get soft drop shadows (`--material-shadow-panel/-floating`). Standard solid UI.

### Glass mode (`html[data-glass="true"]`)
Toggled from the Appearance modal; driven by two root vars the React layer writes: `--glass-opacity` (0.45–1.0) and `--glass-blur` (0–40px). The glass block rewrites the material roles to translucent + blurred:
- Backgrounds become `rgb(var(--surface*-rgb) / <role-alpha>)`, where each role's alpha is a multiplier on `--glass-opacity` (a tight ladder, e.g. chrome densest → control lightest).
- Filters become `blur(<multiplier> × --glass-blur) saturate(--material-saturate)`, assigned **per role** — not every layer blurs equally.
- Panel/strong borders go `transparent` (clean glass), shadows are replaced by semantic glows where needed.

### Glass rules (hard-won — follow them)
- **Give glass something to sample.** It samples the real desktop/terminal backdrop. Keep tint weak enough that small vivid backdrop colors still register; if they wash out, the fix is *less blur and less tint*, not more atmosphere.
- **Don't stack translucent surfaces.** A blurred card on a blurred panel on a blurred shell turns to mud. Let regions that should read as one surface share one material; nested elements sit on solid-relative surfaces, not their own glass layer.
- **No hard dark borders or black drop shadows in glass** unless they're a semantic active/focus affordance or deliberate art direction. They create seams. Internal dividers should use a light hairline (`rgba(255,255,255,~0.08–0.12)`), never `--border`, in glass mode.
- **Keep active/focus visible.** When borders go transparent, state tokens carry orientation. Verify selected cards, active tabs, focus rings, and selected swatches survive.
- **Tuning order when glass looks wrong:** lower fill alpha → lower blur radius → raise saturation slightly → raise edge definition slightly → re-check against a busy backdrop. Trust the pixels over the CSS theory.

### Modals/dialogs are SOLID SHEETS, not glass (project opinion)
A floating dialog is the one surface that should read as the *most solid*, not the most washed. Decided direction:
- The **sheet** is near-opaque (high modal alpha), lightly blurred, with a subtle light hairline edge and a soft lift shadow — even in glass mode.
- The **backdrop** carries the blur and dim (overlay gets a real `blur()` + ~0.5 dim), so content behind recedes and the sheet text stays crisp.
- Because the sheet is opaque, internal dividers and input borders keep normal `--border` — they read as structure, not seams, the same as in light/dark mode. The seam problem only existed when the whole modal was translucent.
- This intentionally inverts the generic "avoid overlay blur" guidance — here the modal is opaque, so blurring the backdrop is the clean staging choice. See the `modals-dialogs` skill for entrance/exit motion.
- Tokens (in `global.css`): `--material-modal-border`, `--material-modal-shadow`, `--material-modal-alpha`/`-filter`, `--material-overlay-bg`/`-filter`. In glass the sheet alpha floors near-opaque (`0.85 + glass-opacity × 0.13`) and blur drops to `glass-blur × 0.5`; the overlay gains `blur(6px)` + 0.5 dim.

## Component primitives

All portaled overlays render through `src/components/Portal.tsx` (to `document.body`) so translucency isn't trapped in clipped/blurred ancestors.

- **`.btn`** — surface-2 fill, hairline border, `--radius-sm`, 80ms background/border transition. Variants: `.primary` (accent fill, white text, no border), `.ghost` (transparent), `.block` (full width), `.sm`. Disabled = 0.6 opacity. Has a `.btn-spinner` for pending states.
- **`.icon-btn`** — square icon-only button, faint by default, brightens on hover; `.danger` variant; 14px svg. `.sm` size.
- **`.input` / form controls** — surface-2 fill, hairline border, `--radius-sm`, mono font for value fields.
- **Cards** (`Card.tsx`, `IssueCard.tsx`) — `card` material; selection/drag via state tokens.
- **Modals** — shared `.modal` + `.modal-overlay`; specific modals add a modifier class (`.theme-modal`, `.preset-modal`, `.project-icon-modal`) for size/layout only. Inherit material from the shared rule — don't re-style backgrounds per modal.
- **Popovers / menus** — `popover` material; pickers (`ModelPicker`, `PresetPicker`, `ProjectPicker`), tooltips (`Tooltip.tsx`), URL/image preview popovers. Floating menus follow the **same solid-sheet treatment as modals** in glass: near-opaque sheet (`surface-2` at the modal alpha floor), light blur (`glass-blur × 0.5`), the modal hairline border, and the modal lift shadow — they should never be washed/translucent. The command menu (`CommandMenu.tsx`, cmdk) is `panel` material, not popover. Cards stay flat (no shadow) in glass; popovers do not.
- **Terminal panes** (`TerminalPane.tsx`) — opt OUT of material backgrounds (transparent, no blur) so they merge with the layout and let xterm own its own theme. Terminal themes are previewed via `--theme-preview-bg/-fg/-accent` tokens.

## Scrollbars

Scrollbars are **invisible by default and minimal on interaction** — never chunky always-on bars. Global rule: thin (8px / `scrollbar-width: thin`), transparent track, transparent thumb that reveals a translucent neutral (`color-mix(in oklab, var(--text-faint) 45–70%, transparent)`) only on container hover / thumb hover. The thumb uses a 2px transparent border with `background-clip: padding-box` so the visible bar reads as a slim rounded pill. This applies everywhere including the xterm viewport — don't reintroduce solid-thumb scrollbars on any surface.

## Motion

Restrained and purposeful: short eases (80–180ms), opacity + slight scale/drift, never springy toy bounces. Modal entrances scale `~0.96→1.0` with a backdrop fade. Always honor `prefers-reduced-motion`. Use the installed `modals-dialogs` skill for overlay entrance/exit recipes.

### Library

**Motion** (`motion` v12, which wraps `framer-motion`) is installed. React components import from `motion/react`:

```ts
import { motion, AnimatePresence } from "motion/react";
```

The vanilla-DOM entry (`motion`) is also available but unused in this app.

### What gets motion

Only these layers use Motion. Everything else uses CSS transitions or keyframes (see below). Do not introduce Motion into a layer already animated by CSS unless you replace the CSS entirely — never double-animate.

#### Card presence (enter / exit)

Both issue cards (GitHub/Linear) and prompt cards animate in and out of column lists via `AnimatePresence` with `mode="popLayout"` (surrounding cards shift smoothly into vacated space). Each card wraps in `<motion.div>`:

| Phase | Values |
|-------|--------|
| `initial` | `opacity: 0, y: 8, scale: 0.98` |
| `animate` | `opacity: 1, y: 0, scale: 1` |
| `exit` | `opacity: 0, scale: 0.98` |
| `transition` | `spring`, duration 0.3s, bounce 0 |

Location: `src/components/BoardParts.tsx` → `ColumnView`, two `AnimatePresence` blocks inside the column body — one for issue items, one for prompt cards.

#### Drag overlay spring

The card shown while dragging (the `DragOverlay` from dnd-kit) uses `<motion.div>` with a spring that tilts and lifts on pick-up:

```ts
initial={{ rotate: 0, scale: 1 }}
animate={{ rotate: -1.2, scale: 1.03 }}
transition={{ type: "spring", duration: 0.4, bounce: 0.2 }}
```

Location: `src/components/Board.tsx` → inside `<DragOverlay>`. The CSS rule `.overlay-card` no longer carries a static `transform` — motion owns the rotate/scale.

### What does NOT use Motion (by conscious decision)

These layers already animate well via pure CSS and should not be touched:

| Layer | Method | Why not Motion |
|-------|--------|----------------|
| Modals (enter/exit) | `@keyframes modal-scale-in` + `overlay-fade-in` | Already smooth; respects `prefers-reduced-motion` |
| Tooltips | `@keyframes tooltip-in` (120ms) | Short-lived; CSS handles it |
| Command palette | cmdk built-in | Library-owned; don't fight it |
| Drop indicators | `@keyframes pulse` (1.2s) | Simple opacity pulse; CSS is fine |
| Glass opacity/blur changes | CSS `transition` on root vars | User slider is real-time; transition is enough |
| Card hover states | CSS `transition` (80ms) | Instant enough; Motion overkill |
| Theme toggle icon | CSS `transition` (120ms) | Simple slide+fade |
| Scrollbar reveal | CSS `:hover` target | Subtle reveal; no animation needed |
| Toast notifications | sonner library built-in | Library-owned |
| Sidebar project items | CSS `transition` (80ms) on `.project-item` | Hover-only state change |
| Terminal tab active state | CSS `transition` on `.terminal-tab` | State swap, no enter/exit |
| Active state glow (glass mode) | CSS `transition: box-shadow 300ms ease` | Single-element state toggle; pure CSS |

### Rules for adding new motion

- Prefer **spring with bounce 0** for UI transitions — smooth deceleration without overshoot.
- Keep durations at or below **0.3–0.4s** for springs, **80–180ms** for CSS transitions.
- Use `AnimatePresence` whenever elements **appear or disappear from a list** (cards, tabs, sidebar items). Set `mode="popLayout"` for list items.
- Never animate scale below `0.96` or y-shift beyond `±8px` — subtle, not playful.
- Avoid y-shift on exit animations — the exiting element is pulled out of flow by `popLayout`, so a vertical drift can visually overlap adjacent cards before unmount. Exit with opacity + subtle scale only.
- Never add Motion to a draggable/sortable element that dnd-kit owns the transform on. Wrap a **child** `<motion.div>` inside the sortable element instead.
- Always verify in all three modes (light, dark, glass) and with `prefers-reduced-motion: reduce` active.
- If it feels like an "effect," it's too much. The user should notice *smoothness*, not animation.

## Workflow when changing UI

1. **Locate the owning layer first.** Read `global.css` and find which token/role/selector actually paints the thing. Use screenshots — trust pixels over theory.
2. **Change the token, not the component**, whenever the concept already exists. Add a token if it's genuinely new.
3. **Check all three modes** (light, dark, glass) and over both busy and quiet backdrops. Glass amplifies weak hierarchy — if it looks bad in glass, the layout/contrast is usually the real problem.
4. **Verify states**: hover, active, focus, drag, disabled, selected. Confirm they survive glass.
5. **Run the app and screenshot** the change before calling it done.

## Companion skills

- `modals-dialogs` — overlay entrance/exit animation recipes (motion only).
- `ui-ux-polish` — iterative web UI polish passes and accessibility audits.

Naming: prefer long descriptive identifiers over explanatory comments. Match the surrounding code's idiom in `global.css` (grouped sections with `/* ---------- Section ---------- */` headers).
