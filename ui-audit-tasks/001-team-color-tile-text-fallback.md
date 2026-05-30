# UI Audit — `--team-color-tile-text` fallback anti-pattern

**Priority:** Address soon
**Files:** `style/hub.css:415`, `style/modepicker.css:127`
**DESIGN.md ref:** §2.1 — never use `var(--token, #hardcoded-fallback)`

## Context

`--team-color-tile-text` is intentionally dynamic — `src/ui/teamColors.ts:21` sets it via
luminance check (`luminance(tileColor) > 0.4 ? '#1a1a1a' : '#ffffff'`) as an inline style on
the element. The token is real and works correctly at runtime.

The violation is the `#ffffff` fallback in the CSS call sites:

```css
/* hub.css:415 */
color: color-mix(in srgb, var(--team-color-tile-text, #ffffff) 60%, transparent);

/* modepicker.css:127 */
color: color-mix(in srgb, var(--team-color-tile-text, #ffffff) 80%, transparent);
```

## Fix

Declare `--team-color-tile-text: #ffffff` in `:root` in `style/main.css` (alongside the other
team-color tokens) and document it in DESIGN.md. Then remove the `#ffffff` fallback from both
call sites:

```css
color: color-mix(in srgb, var(--team-color-tile-text) 60%, transparent);
```

The JS override takes precedence over the `:root` default at runtime; the root declaration is
only a safe pre-JS fallback and a documentation anchor.
