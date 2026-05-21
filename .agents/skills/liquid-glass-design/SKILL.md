---
name: liquid-glass-design
description: Design and implement liquid-glass style interfaces for websites, dashboards, web apps, and design systems. Use when Codex needs to analyze an existing "glass" UI, redesign a generic glassmorphism layout into a more credible liquid-glass system, or build reusable tokens and component patterns for translucent surfaces, blurred backdrops, highlights, gradients, and motion. Especially useful when the request mentions liquid glass, frosted glass, glassmorphism, Apple-style glass, translucent UI, backdrop blur, premium dashboard polish, Electron transparent windows, xterm transparency, or when the current effect is only semi-transparent cards and needs a more intentional visual system.
---

# Liquid Glass Design

## Overview

Create credible glass interfaces as a material system, not as isolated `backdrop-blur` utilities. Start by identifying the actual rendered layers, then decide whether to refine pragmatic CSS glass or push toward a more expressive liquid look.

Read `references/implementation-patterns.md` when you need token recipes, CSS patterns, or a decision matrix for fake glass versus higher-fidelity liquid behavior.

## Workflow

1. Audit the current implementation and the current pixels.

- If screenshots are available, read them before making CSS guesses. Use the screenshot to identify which exact element owns the offending color, square corner, seam, blur, or shadow.
- Locate the background source first. Check whether glass surfaces sample a real desktop/app backdrop, image, gradient field, or app content layer.
- Find the transparency and blur controls. Look for root CSS variables, persisted settings, root attributes such as `data-glass`, `backdrop-filter`, overlay filters, border tokens, and shadow tokens.
- Distinguish between surface tiers. Identify layout, chrome, panel, card, popover, control, and floating/terminal-tab roles.
- State plainly whether the effect is pragmatic CSS glass, enhanced CSS glass, or true optical simulation using SVG filters, canvas, shaders, or native APIs.

2. Choose the target fidelity before editing.

- Use pragmatic CSS glass when the product is a normal web/Electron app, needs maintainability, and already uses CSS tokens.
- Use native/Electron transparency or vibrancy only when real window translucency is required.
- Use enhanced liquid glass when the interface needs stronger depth, dynamic highlights, layered gradients, and deliberate motion.
- Do not claim true refraction or Apple-like liquid if the implementation is only translucent blur. Name the technique accurately.

3. Build the visual system in this order.

- Root state: keep glass behind an explicit root/class/persisted setting when the app also supports normal opaque UI.
- Semantic materials: define shared material roles (`layout`, `chrome`, `panel`, `card`, `popover`, `control`, `terminal-tab`) and make normal and glass UI use the same role names. Only token values should differ.
- Surface opacity ladder: define a tight alpha ladder by role instead of repeating one alpha everywhere.
- Blur scale: assign blur by role. Do not blur every layer equally, and avoid blur on dense content if it harms readability.
- State tokens: separate active/focus/drag affordances from material surfaces (`state-active-bg`, `state-active-border`, `state-active-shadow`, `state-focus-border`, etc.). Active states must remain visible in glass mode.
- Edge treatment: use borders/highlights only when they help orientation. If the product prefers clean glass, avoid hard borders except active/focus affordances.
- Shadows: avoid black/drop shadows in transparent glass modes unless explicitly desired. They often create seams and muddy the desktop/app backdrop. Prefer no shadow or a semantic active glow.
- Atmosphere: keep decorative gradients optional and restrained. If the user wants minimal/no decorative atmosphere, remove gradients and let real backdrop sampling do the work.
- Motion: animate entry, hover, and expansion with slight drift, scale, and opacity shifts rather than generic spring spam.

4. Apply the system selectively.

- Reserve stronger glass for navigation chrome, floating panels, dialogs, popovers, and emphasis cards.
- Let layout regions that should visually merge share the same material. Do not give embedded panes, boards, or terminals separate backgrounds unless the hierarchy requires it.
- Keep terminal panes practical: xterm needs `allowTransparency`, a transparent theme background, transparent internal xterm layers, and WebGL may need disabling when it fights transparency.
- Keep terminal tab bars transparent when they should merge with the layout; make only individual tabs float if that is the intended hierarchy.
- Keep text crisp. Avoid overlay-level backdrop blur that blurs all UI text behind a modal/command menu. Prefer dimming overlays without blur unless the user explicitly wants background blur.
- Portaled modals/popovers may be required so translucent overlays are not trapped inside blurred/clipped ancestors.

5. Fix seams and rounded-corner artifacts by owning the right layer.

- Do not patch blindly. Identify the exact surface painting the square corner or seam.
- Prefer clipping/masking the owning surface over adding a fake overlay.
- If a practical patch is faster and the user accepts it, put the patch on the element that already owns the relevant material color, behind its children, and keep it glass-only.
- For corner patches, verify orientation visually. A radial patch should put the dark/support color outside the rounded corner and leave the inside transparent.

6. Validate the result.

- Check screenshots or runtime UI after each visual change when possible.
- Check legibility over busy and quiet backgrounds.
- Check whether stacked glass surfaces collapse into mud because alphas and blur radii are too similar.
- Check active tabs, selected cards, selected project icons, focus rings, prompts, modals, popovers, terminal tabs, and terminal text.
- Check performance and fallback behavior where `backdrop-filter` is weak or unsupported.

## Design Rules

- Design glass as a depth system, not as a single class.
- Normal and glass modes should share semantic roles; glass should swap token values, not fork component styling everywhere.
- Start by calibrating base theme tokens: semantic colors, neutrals, radii, and control geometry must already support the desired feel before blur is added.
- Separate material tokens from state tokens. Active/focus affordances should survive regardless of material opacity.
- Give the glass something to sample visually: image, gradient field, noise field, real desktop/app backdrop, or content behind it.
- Pair blur with tint, but keep tint weak enough that small backdrop colors can still register.
- If the goal is realistic sampling, reduce blur and surface fog before adding more gradients or glow.
- Treat tiny, vivid backdrop details as a validation case. Good glass should hint at them instead of washing them out.
- Add edge definition when needed. Glass without any edge can read as a washed card, but hard borders can also ruin clean glass.
- Avoid stacking multiple blurred translucent surfaces when one shared layout material should do.
- Avoid using modal overlays to blur all underlying text unless specifically requested.
- Avoid hard borders in glass mode unless they are semantic active/focus affordances or necessary edge definition.
- Avoid black drop shadows in transparent glass mode unless they are deliberately part of the art direction.
- Preserve crisp typography and icon contrast.
- Avoid default purple-on-white AI aesthetics unless the product already uses them.
- Avoid using blur to hide poor layout. Glass amplifies weak hierarchy.

## Implementation Guidance

- Centralize material tokens for alpha, blur, border, shadow, saturation, and role backgrounds.
- Prefer RGB channel plus alpha variables (`rgb(var(--surface-rgb) / var(--alpha))`) over fragile nested `color-mix()`/`calc()` expressions when values are user-controlled.
- Drive transparency and blur from root-level state when the product supports user controls or native transparency.
- Use shared material classes/selectors for shells, cards, sidebars, toolbars, dialogs, popovers, buttons, inputs, and terminal tabs.
- Build intentional exceptions: layout/terminal areas may opt out of blur; dense content may use calmer support surfaces; composer/input panels may be transparent if they should share their column surface.
- For Electron, transparent windows require both browser-window configuration and renderer CSS cooperation. Do not assume CSS opacity alone creates desktop translucency.
- For xterm, configure renderer/theme transparency and audit `.xterm`, viewport, screen, rows, scroll area, and canvas backgrounds.
- When tuning backdrop response, change variables in this order: lower fill alpha, lower blur radius, raise saturation slightly, raise contrast/edge definition slightly, then reassess.
- When fixing a visual artifact, use screenshots and the DOM/CSS ownership model before trying random masks.

## Apple-Flavored Patterns

- Re-skin design-system tokens before touching component CSS. Map semantic colors, neutrals, and radii to an Apple-like palette and control geometry first.
- Use one coherent shared shell across cards, dialogs, toolbars, and sidebars. The visual family should read as the same material in different roles.
- When wallpapers or native transparency are configurable, expose global transparency and blur controls and apply them through shared material roles.
- Add motion that feels like pane movement, not toy springs. Horizontal slide transitions, soft scale-in for dialogs, and restrained opacity changes are often enough.
- Use mobile dock and safe-area cues only when the rest of the chrome follows the same material rules.

## Validation Heuristics

- Test the surface over tiny, high-saturation accents, not only large soft gradients.
- If small vivid colors disappear, the usual fixes are less blur and less tint, not more atmosphere.
- If glass gets brighter but less responsive, you are probably adding light pollution rather than improving sampling.
- For input areas and nested glass, use lower blur than parent chrome when local backdrop variation should survive.
- If screenshots contradict the CSS theory, trust the pixels and adjust the owning layer.

## Output Expectations

- If the user asks for analysis, explain the rendering path from background source to root glass state to semantic material roles to component exceptions.
- If the user asks for redesign, propose a coherent material hierarchy and implement shared tokens first.
- If the user asks for code changes, favor reusable material/state tokens over scattered overrides.
- If the current project only has basic glassmorphism, say so directly and describe what is missing for a more liquid result.
- If screenshots contradict the CSS theory, trust the pixels and adjust the owning layer.
