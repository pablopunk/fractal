# Liquid Glass Implementation Patterns

## Decision Matrix

- Use pragmatic CSS glass when:
  - the project is a normal web app
  - the team needs maintainable CSS
  - `backdrop-filter` already exists in the stack
  - the goal is premium polish, not optical simulation

- Use enhanced CSS liquid glass when:
  - the UI needs stronger depth and a more "alive" surface
  - you can add layered gradients, highlights, shadows, and controlled motion
  - you still want the implementation to remain mostly CSS

- Use SVG, canvas, or shaders only when:
  - the product explicitly needs distortion, refraction, displacement, or fluid edges
  - there is time for performance tuning
  - the team can own the rendering complexity

## Minimal System

Define tokens similar to:

```css
:root {
  --glass-bg-1: color-mix(in srgb, white 14%, transparent);
  --glass-bg-2: color-mix(in srgb, white 22%, transparent);
  --glass-border: color-mix(in srgb, white 38%, transparent);
  --glass-highlight: color-mix(in srgb, white 55%, transparent);
  --glass-shadow: 0 10px 30px rgba(0, 0, 0, 0.18);
  --glass-blur-sm: 10px;
  --glass-blur-md: 18px;
  --glass-blur-lg: 28px;
}
```

For Apple-flavored pragmatic glass, also define base theme tokens, not only glass tokens:

```css
:root {
  --app-primary: #0071e3;
  --app-success: #34c759;
  --app-warning: #ff9500;
  --app-error: #ff3b30;
  --app-surface-1: #ffffff;
  --app-surface-2: #f5f5f7;
  --app-surface-3: #d2d2d7;
  --app-text: #1d1d1f;
  --app-radius-box: 0.75rem;
  --app-radius-field: 0.5rem;
}
```

This is important when the project uses a theme system like DaisyUI, Chakra tokens, CSS custom properties, or a design-token pipeline. Apple-like glass usually fails when only the blur layer changes while the underlying semantic theme still feels generic.

Then build shared primitives:

```css
.glass-surface {
  background:
    linear-gradient(
      to bottom,
      color-mix(in srgb, var(--glass-highlight) 55%, transparent),
      transparent 38%
    ),
    var(--glass-bg-1);
  border: 1px solid var(--glass-border);
  box-shadow: var(--glass-shadow);
  backdrop-filter: blur(var(--glass-blur-md)) saturate(1.15);
}

.glass-strong {
  background:
    linear-gradient(
      180deg,
      color-mix(in srgb, white 22%, transparent),
      color-mix(in srgb, white 8%, transparent)
    );
  backdrop-filter: blur(var(--glass-blur-lg)) saturate(1.2);
}
```

## What Makes Glass Read as "Liquid"

- Local light variation across the pane
- Clear edge definition
- Slightly different opacity and blur on nested layers
- Gentle motion that implies mass, not springy toy motion
- A background with enough contrast and color to be sampled through the surface
- Consistent shell primitives shared by cards, sidebars, dialogs, navigation bars, and overlays
- Theme colors and radii that already support the intended platform feel before translucency is applied

## What Breaks the Effect

- Fully flat backgrounds behind the glass
- Identical alpha and blur on every component
- Too many stacked blurred layers
- Weak contrast for text and icons
- Heavy borders without highlight logic
- Random translucent cards with no shared token system

## Upgrade Path from Generic Glassmorphism

1. Add a meaningful background field.
2. Recalibrate the base theme tokens so surfaces, semantic colors, and radii support the target aesthetic.
3. Create named surface tiers instead of raw alpha literals.
4. Tune blur by role, not by guesswork.
5. Add highlight, border, and shadow logic as a matched set.
6. Reduce blur in dense content regions.
7. Add restrained transitions for hover, open, and focus states.

## Shared Shell Pattern

When the app has many panes, create a single shell primitive and let multiple components inherit it:

```css
.shell {
  border-radius: var(--app-radius-box);
  background: color-mix(in srgb, var(--app-surface-1) 78%, transparent);
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.06);
  overflow: hidden;
}

.with-wallpaper .shell {
  background: color-mix(in srgb, var(--app-surface-1) var(--surface-alpha, 72%), transparent);
  backdrop-filter: blur(var(--surface-blur, 16px));
}
```

Apply this shell to cards, floating controls, sidebars, dialogs, and navigation chrome first. Then add deliberate exceptions for dense data areas.

## Global Wallpaper Mapping

If the product supports custom backgrounds, prefer a root-state mapping such as:

- root wallpaper class controls surface alpha for all shared shells
- root blur class controls blur radius for all shared shells
- specific dense components opt out or clamp the blur

This pattern scales better than assigning random `backdrop-blur-*` utilities inside each component.

## Mobile Apple Cues

- Floating bottom dock with translucent fill and safe-area padding
- Dialogs and sheets that scale or slide with restrained easing
- Sticky or fixed top bars that reuse the same shell material as other chrome
- Fewer material types, used more consistently

## Analysis Checklist

When reviewing an existing project, answer these questions:

- Where does the backdrop come from?
- Are the base theme tokens themselves aligned with the target platform feel, or is only the blur layer being styled?
- Which root classes control transparency and blur?
- Which shared containers receive the effect?
- Which components opt out or override it?
- Is the implementation basic CSS glass or true optical simulation?
- What is missing: atmosphere, layer hierarchy, edge light, contrast, motion, or performance discipline?