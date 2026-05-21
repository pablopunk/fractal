---
name: liquid-glass-design
description: Design and implement liquid-glass style interfaces for websites, dashboards, web apps, and design systems. Use when Codex needs to analyze an existing "glass" UI, redesign a generic glassmorphism layout into a more credible liquid-glass system, or build reusable tokens and component patterns for translucent surfaces, blurred backdrops, highlights, gradients, and motion. Especially useful when the request mentions liquid glass, frosted glass, glassmorphism, Apple-style glass, translucent UI, backdrop blur, premium dashboard polish, or when the current effect is only semi-transparent cards and needs a more intentional visual system.
---

# Liquid Glass Design

## Overview

Create credible liquid-glass interfaces as a system, not as isolated `backdrop-blur` utilities. Start by identifying whether the existing UI is pragmatic CSS glass, then decide whether to refine that system or push toward a more expressive liquid look.

Read `references/implementation-patterns.md` when you need token recipes, CSS patterns, or a decision matrix for fake glass versus higher-fidelity liquid behavior.

## Workflow

1. Audit the current implementation.

- Locate the background source first. Check whether glass surfaces sample a real backdrop image, gradient field, or app content layer.
- Find the transparency and blur controls. Look for CSS variables, utility classes, `backdrop-filter`, overlay gradients, border highlights, and shadow tokens.
- Distinguish between surface tiers. Identify which containers are primary glass, secondary glass, solid support surfaces, and non-glass text or data regions.
- State plainly whether the effect is:
  - pragmatic glassmorphism built from transparency plus blur
  - enhanced CSS glass with highlights and atmosphere
  - true optical simulation using SVG filters, canvas, or shaders

2. Choose the target fidelity before editing.

- Use pragmatic CSS glass when the product already relies on utility CSS, needs maintainability, or must stay fast on mid-range devices.
- Use enhanced liquid glass when the interface needs stronger depth, edge glow, dynamic highlights, layered gradients, and more deliberate motion.
- Do not claim true refraction or "Apple-like liquid" if the implementation is only translucent blur. Name the technique accurately.

3. Build the visual system in this order.

- Background plane: create a background worth sampling. Flat fills do not produce convincing glass.
- Surface opacity ladder: define 2-4 surface levels instead of repeating one alpha everywhere.
- Blur scale: assign blur values by layer and interaction state. Keep them deliberate and limited. For glass that must react to tiny, saturated colors behind it, prefer lower blur with higher saturation and contrast before adding more alpha or more glow.
- Edge treatment: add bright inner highlights, soft outer shadows, and subtle contrast on borders.
- Atmosphere: use restrained gradients and local light direction so glass feels embedded in space. If the user wants sensitive backdrop response, do not add decorative color fields that overpower the real backdrop.
- Motion: animate entry, hover, and expansion with slight drift, scale, and opacity shifts rather than generic spring spam.

4. Apply the system selectively.

- Reserve the strongest glass treatment for navigation bars, floating panels, dialogs, media overlays, and emphasis cards.
- Keep dense tables, charts, logs, and long-form reading areas more solid unless there is a clear backdrop and enough contrast.
- Preserve crisp typography. Text should sit on stable contrast layers even when the parent uses blur.

5. Validate the result.

- Check legibility over busy and quiet backgrounds.
- Check whether stacked glass surfaces collapse into mud because their alphas and blur radii are too similar.
- Check mobile performance and battery cost. Large fixed blur surfaces are expensive.
- Check fallback behavior where `backdrop-filter` is weak or unsupported.

## Design Rules

- Design glass as a depth system, not as a single class.
- When the target feel is Apple-flavored rather than speculative "liquid", start by calibrating the base theme tokens first: use restrained system-like neutrals, familiar semantic accents, and moderate radii before adding any blur.
- Give the glass something to refract visually: image, gradient field, noise field, or content behind it.
- Separate materials by role. Not every panel should be equally translucent.
- Pair blur with tint, but keep the tint weak enough that small backdrop colors can still register.
- If the goal is realistic sampling, reduce blur and surface fog before adding more decorative gradients.
- Treat tiny, vivid backdrop details as a validation case. A good glass surface should still hint at them instead of washing them out.
- Add an edge highlight. Glass without an edge usually reads as a washed card.
- Use directional light. A faint top highlight and lower shadow make the pane feel curved and wet.
- Keep data-heavy zones calmer than chrome surfaces.
- Avoid default purple-on-white AI aesthetics unless the product already uses them.
- Avoid using blur to hide poor layout. If spacing and hierarchy are weak, glass will amplify the problem.
- Avoid light pollution. Large artificial glow layers can make the glass feel louder while making the real backdrop less legible.

## Implementation Guidance

- Centralize tokens for surface alpha, blur radius, border color, highlight opacity, shadow strength, and saturation.
- Prefer a shared shell primitive such as `base-container`, `glass-surface`, or `panel` that every card, modal, sidebar, toolbar, and menu can inherit. Apple-like polish usually comes from a coherent shell system, not isolated hero components.
- Attach backdrop styling at shared container classes or component primitives so the effect remains coherent across the app.
- Drive transparency and blur from root-level state when the product supports custom wallpapers or backgrounds. A global `background alpha -> shared surfaces` map and a `blur intensity -> shared surfaces` map usually produces a more credible material system than per-component blur guesses.
- Build exceptions intentionally. Some panels should opt out of blur, use lower transparency, or receive extra local backgrounds for readability.
- Keep data-heavy tables and charts on calmer support surfaces even if the surrounding chrome stays translucent. Apple-flavored glass works best when content density drops as material strength rises.
- Prefer CSS variables and reusable utility or component classes over inline values unless the state is truly dynamic.
- When tuning glass that should react to small colorful backdrop areas, change variables in this order: lower fill alpha, lower blur radius, raise saturation slightly, raise contrast slightly, then reassess.
- If a surface still looks dead, first verify the backdrop under that exact area has enough local variation. Only after that should you consider adding restrained support gradients.
- When the interface already has a working glass system, improve it by:
  - rationalizing blur and alpha scales
  - introducing clearer layer tiers
  - improving edge and light treatment
  - removing accidental transparency from surfaces that should be solid
  - removing decorative glow layers that overpower real backdrop sampling

## Apple-Flavored Patterns

- Re-skin the design system tokens before touching component CSS. In practice this means mapping `primary`, `secondary`, semantic status colors, neutrals, and radii to an Apple-like palette and control geometry first.
- Use one low-shadow, rounded shared shell across cards, collapses, dialogs, toolbars, and sidebars. The visual family should read as the same material appearing in different roles.
- When wallpapers are user-configurable, expose both transparency and blur as global controls and apply them to all shared shells. This matches how Apple materials feel like system-level layers rather than isolated components.
- Use mobile dock patterns carefully: floating bottom navigation, translucent fill, backdrop blur, and safe-area spacing can create an iOS feel quickly, but only if the rest of the chrome follows the same material rules.
- Add motion that feels like pane movement, not toy springs. Horizontal slide transitions, soft scale-in for dialogs, and restrained opacity changes are often enough.
- If the product lets users upload backgrounds, optionally infer whether the background is overall light or dark and suggest a matching theme. This is a practical way to keep translucent surfaces legible without hand-tuning every wallpaper.

## Validation Heuristics

- Test the surface over tiny, high-saturation accents, not only over large soft gradients.
- If small vivid colors disappear, the usual fixes are less blur and less tint, not more atmosphere.
- If the glass starts to feel brighter but less responsive, you are probably adding light pollution rather than improving sampling.
- For input areas and nested glass, use even lower blur than the parent chrome so local backdrop variation survives.
- If the UI claims an Apple-like material system, verify that theme tokens, shared shell classes, navigation chrome, dialogs, and mobile safe-area handling all agree. One glassy card inside an otherwise generic theme does not qualify.

## Output Expectations

- If the user asks for analysis, explain the rendering path from background source to shared surface classes to component exceptions.
- If the user asks for a redesign, provide a coherent art direction and implement the shared tokens first.
- If the user asks for code changes, favor a reusable system over scattered one-off blur utilities.
- If the current project only has basic glassmorphism, say that directly and describe what is missing for a more liquid result.