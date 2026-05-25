# M6-team-selector-grid — Team selector: add 3-column and 5-column grid breakpoints

> **Severity:** Medium
> **Audit reference:** `Design Review.html` → Issues → M6-team-selector-grid

## Files to edit

- `style/teamselector.css`

## Problem

`#ts-grid` is locked to `grid-template-columns: 1fr 1fr` on all viewports. With 10 Premiership clubs that's 5 rows of 2 cards on tablet and desktop — wasted horizontal space. Football Manager's equivalent uses a wider grid on larger viewports.

## Fix

In `style/teamselector.css`, after the existing `#ts-grid` rule:

```css
@media (min-width: 700px) {
  #ts-inner { max-width: 700px; }
  #ts-grid { grid-template-columns: repeat(3, 1fr); }
}

@media (min-width: 1000px) {
  #ts-inner { max-width: 1000px; }
  #ts-grid { grid-template-columns: repeat(5, 1fr); }
}
```

If team cards have any fixed aspect ratio or padding that would break at narrower per-card widths, adjust them in the same media queries.

## Expected result

On mobile (≤699px): 2 columns. On tablet (700–999px): 3 columns. On desktop (≥1000px): 5 columns. The grid stays centred and uses the available width without growing each card to awkward proportions.

## Acceptance

- [ ] Only the files listed above are modified
- [ ] `pnpm typecheck` passes (or equivalent for the toolchain)
- [ ] No new console warnings in browser devtools
- [ ] Visual check matches the "Expected result" block above
- [ ] No regression on other screens that share affected tokens or files
- [ ] `grep` checks (if listed in the fix) return the expected counts

## Suggested commit message

```
feat(team-selector): tablet/desktop responsive grid (#M6)
```
