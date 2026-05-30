# UI Audit — Half-pixel font sizes below or off the token ladder

**Priority:** Address soon
**Files:** `style/saves.css:29`, `style/teamselector.css:277`, `style/training-results.css:421 & 487`
**DESIGN.md ref:** §3.4 — half-pixel pattern permitted only for off-ladder values; 8px is the floor

## Violations

| File | Line | Value | Issue |
|---|---|---|---|
| `saves.css` | 29 | `calc(12.5px * var(--rm-text-scale))` | Off-ladder — consider `--rm-fs-12` or `--rm-fs-13` |
| `teamselector.css` | 277 | `calc(7.5px * var(--rm-text-scale))` | Below 8px floor — needs scrutiny or redesign |
| `training-results.css` | 421 | `calc(10.5px * var(--rm-text-scale))` | Off-ladder — consider adding `--rm-fs-11` step |
| `training-results.css` | 487 | `calc(10.5px * var(--rm-text-scale))` | Off-ladder — consider adding `--rm-fs-11` step |

## Recommended fix

1. **`teamselector.css:277` (7.5px)** — Priority. Below the 8px floor. Raise to `var(--rm-fs-8)`
   or redesign the tier pill to be larger. The pill currently sits at `font-size: calc(7.5px *
   var(--rm-text-scale))` with `letter-spacing: 0.10em`.

2. **`training-results.css:421 & 487` (10.5px × 2)** — Add `--rm-fs-11` to the token ladder in
   `style/main.css` and use it here. Two call sites already justify a ladder step.

3. **`saves.css:29` (12.5px)** — Use `var(--rm-fs-13)` (one step up) or `var(--rm-fs-12)` (one
   step down) and adjust surrounding layout if needed.
