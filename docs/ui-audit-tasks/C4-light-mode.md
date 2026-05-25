# C4-light-mode — Light mode pass — full audit or gate the toggle

> **Severity:** Critical
> **Audit reference:** `Design Review.html` → Issues → C4-light-mode

## Files to edit

- `All 20 screen-specific CSS files`
- `style/main.css`

## Problem

The light mode toggle exists and persists correctly. `main.css` overrides all `--rm-*` tokens in `body.light-mode`. However, every screen-specific file contains inline hex codes, `rgba()` shadows, and opacities calibrated for the dark theme. In light mode:

- Pitch-line gradient backgrounds (Home, Hub) remain dark and look broken
- Card shadows lose their depth (white-on-light needs different shadow values)
- The Hub hero radial wash uses dark-calibrated opacity
- Match Result background gradients are dark-only
- The frosted glass on ctrl bars is calibrated for dark blur

Shipping a broken light mode is worse than no light mode.

## Fix

**Option A — Full pass (1–2 days):**

For every file in `style/` other than `main.css`:

1. Grep for hardcoded values: `grep -E "#[0-9a-fA-F]{3,6}|rgba\\(|rgb\\(" <file>`
2. For each hit:
   - If it's a colour, replace with a CSS token (declaring new tokens in `main.css` if needed, with both `:root` and `body.light-mode` values)
   - If it's a shadow/glow opacity, parameterise via `color-mix(in oklch, var(--rm-shadow-mix), transparent)` where `--rm-shadow-mix` has different values per mode
3. Test the file in both modes side-by-side
4. Add any new tokens to the design system documentation

**Option B — Gate the toggle (15 min):**

In whichever file renders the settings/toggle, hide it behind a feature flag:

```ts
const LIGHT_MODE_ENABLED = false; // experimental — see CLAUDE.md §X
```

Update `CLAUDE.md` to mark light mode as experimental and add to the policy: "Any new CSS rule that uses a colour MUST work in both modes." Track Option A as a follow-up task.

Recommendation: Option B for the next ship, then Option A as a dedicated multi-day task once PRs 1–3 are merged.

## Expected result

**Option A:** Every screen toggles cleanly between light and dark with no broken gradients, shadows, or contrast failures.

**Option B:** The toggle is hidden from production UI. Existing behaviour preserved for testing via console flag.

## Acceptance

- [ ] Only the files listed above are modified
- [ ] `pnpm typecheck` passes (or equivalent for the toolchain)
- [ ] No new console warnings in browser devtools
- [ ] Visual check matches the "Expected result" block above
- [ ] No regression on other screens that share affected tokens or files
- [ ] `grep` checks (if listed in the fix) return the expected counts

## Suggested commit message

```
feat(theme): gate light-mode behind experimental flag pending full pass (#C4)
```
