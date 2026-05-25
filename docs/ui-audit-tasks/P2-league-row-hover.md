# P2-league-row-hover — Add hover state to .lt-row on desktop

> **Severity:** Polish
> **Audit reference:** `Design Review.html` → Issues → P2-league-row-hover

## Files to edit

- `style/leaguetable.css`

## Problem

`.lt-row` elements are not interactive (they don't navigate anywhere), so hover isn't strictly required. But every other card/row element in the system has a desktop hover state. League table rows being completely static feels inconsistent.

## Fix

In `style/leaguetable.css`, add:

```css
@media (hover: hover) {
  .lt-row:hover {
    background: color-mix(in oklch, var(--rm-surface) 80%, var(--rm-surface-2));
  }
  .lt-row--me:hover {
    background: color-mix(in oklch, var(--rm-pitch) 22%, var(--rm-surface));
  }
}
```

This gives a subtle lift on hover for desktop users, with a slightly brighter version of the existing pitch-green base for the player's own team row.

## Expected result

Desktop — hovering any league table row produces a subtle background lightening. The player team row (`.lt-row--me`) brightens slightly more on hover, maintaining its existing visual primacy.

## Acceptance

- [ ] Only the files listed above are modified
- [ ] `pnpm typecheck` passes (or equivalent for the toolchain)
- [ ] No new console warnings in browser devtools
- [ ] Visual check matches the "Expected result" block above
- [ ] No regression on other screens that share affected tokens or files
- [ ] `grep` checks (if listed in the fix) return the expected counts

## Suggested commit message

```
polish(league): hover state on rows for desktop (#P2)
```
