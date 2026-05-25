# P4-phase-badge-width — Phase badge max-width: increase at ≥700px breakpoint

> **Severity:** Polish
> **Audit reference:** `Design Review.html` → Issues → P4-phase-badge-width

## Files to edit

- `style/main.css`

## Problem

`.phase-badge` has `max-width: 120px; overflow: hidden; text-overflow: ellipsis`. Longer phase names ("BREAKDOWN SLOW BALL", "TMO REVIEW UNDERWAY") truncate. On desktop there's plenty of horizontal space for a wider badge.

## Fix

In `style/main.css`, add to the responsive section:

```css
@media (min-width: 700px) {
  .phase-badge {
    max-width: 180px;
    font-size: 9px;
  }
}
```

The 9px font-size bump (from 8px) improves legibility on large screens where the badge can carry more visual weight without crowding.

## Expected result

On desktop, the phase badge shows full phase text (no truncation on standard names). Mobile remains unchanged at 120px / 8px. No layout reflow elsewhere.

## Acceptance

- [ ] Only the files listed above are modified
- [ ] `pnpm typecheck` passes (or equivalent for the toolchain)
- [ ] No new console warnings in browser devtools
- [ ] Visual check matches the "Expected result" block above
- [ ] No regression on other screens that share affected tokens or files
- [ ] `grep` checks (if listed in the fix) return the expected counts

## Suggested commit message

```
polish(phase-badge): increase max-width and font-size on desktop (#P4)
```
