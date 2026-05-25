# P6-round-pulse-timing — Round results pending pulse: tighter timing

> **Severity:** Polish
> **Audit reference:** `Design Review.html` → Issues → P6-round-pulse-timing

## Files to edit

- `style/roundresults.css`

## Problem

`.rr-pending` (the "···" for in-progress fixtures) uses the `rmPulse` keyframe at 1.8s with `ease-in-out`. The slow, mushy pulse reads as "the simulation has hung" rather than "actively computing."

## Fix

In `style/roundresults.css`, override the animation on `.rr-pending`:

```css
.rr-pending {
  animation: rrPulse 1.2s ease infinite;
}

@keyframes rrPulse {
  0%, 100% { opacity: 0.4; }
  50% { opacity: 1; }
}
```

If `rmPulse` is already shared with other elements that need the slow breathing rhythm, define `rrPulse` as a separate keyframe specifically for the "actively computing" rhythm.

## Expected result

Round results screen mid-simulation — the "···" markers pulse with a crisp 1.2s rhythm that reads as "working" rather than "idling."

## Acceptance

- [ ] Only the files listed above are modified
- [ ] `pnpm typecheck` passes (or equivalent for the toolchain)
- [ ] No new console warnings in browser devtools
- [ ] Visual check matches the "Expected result" block above
- [ ] No regression on other screens that share affected tokens or files
- [ ] `grep` checks (if listed in the fix) return the expected counts

## Suggested commit message

```
polish(round-results): tighten pending pulse timing (#P6)
```
