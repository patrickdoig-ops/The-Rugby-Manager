# P1-commentary-anim — Commentary entryIn animation: 18ms → 220ms spring

> **Severity:** Polish
> **Audit reference:** `Design Review.html` → Issues → P1-commentary-anim

## Files to edit

- `style/commentary.css`

## Problem

The `@keyframes entryIn` animation has `animation: entryIn 0.18s ease-out`. Wait — re-checking the source, the duration in the CSS is actually `0.18s` = 180ms, not 18ms. Still: ease-out at 180ms for what's intended as a perceptible entry feels snappy but lacks character. Compare with the `sheetUp` modal entry which uses a spring curve at 280ms.

## Fix

In `style/commentary.css`:

```diff
.commentary-entry {
- animation: entryIn 0.18s ease-out;
+ animation: entryIn 0.22s cubic-bezier(0.22, 1, 0.36, 1);
}
```

The 220ms duration is perceptible without being sluggish. The spring easing matches the modal `sheetUp` reference and gives the entries a subtle settle that reads as natural rhythm rather than mechanical insertion.

## Expected result

In a live match, each new commentary entry settles in with a brief slide+fade rather than appearing instantly or with a hard ease-out tail. The motion is now visually consistent with modal entries.

## Acceptance

- [ ] Only the files listed above are modified
- [ ] `pnpm typecheck` passes (or equivalent for the toolchain)
- [ ] No new console warnings in browser devtools
- [ ] Visual check matches the "Expected result" block above
- [ ] No regression on other screens that share affected tokens or files
- [ ] `grep` checks (if listed in the fix) return the expected counts

## Suggested commit message

```
polish(commentary): spring easing on entryIn animation (#P1)
```
