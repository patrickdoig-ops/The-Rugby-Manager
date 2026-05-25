# M8-league-toggle-tap — League Table toggle: increase tap target padding

> **Severity:** Medium
> **Audit reference:** `Design Review.html` → Issues → M8-league-toggle-tap

## Files to edit

- `style/leaguetable.css`

## Problem

`.lt-toggle__btn` uses `padding: 8px 10px` — total height around 34px including text. Apple HIG recommends 44px minimum touch targets. At 34px it requires precise tapping, particularly problematic in a post-match flow where users are tapping quickly.

## Fix

In `style/leaguetable.css`:

```diff
.lt-toggle__btn {
- padding: 8px 10px;
+ padding: 11px 10px;
  /* ... */
}
```

This brings the tap target to approximately 40px — acceptably close to the 44px guideline without making the toggle bar visually dominant. Re-balance the parent's `gap` or vertical padding if the toggle bar now feels too tall.

## Expected result

League Table → Standard/Form toggle is comfortably tappable on mobile. Visual height of each toggle button is approximately 40px.

## Acceptance

- [ ] Only the files listed above are modified
- [ ] `pnpm typecheck` passes (or equivalent for the toolchain)
- [ ] No new console warnings in browser devtools
- [ ] Visual check matches the "Expected result" block above
- [ ] No regression on other screens that share affected tokens or files
- [ ] `grep` checks (if listed in the fix) return the expected counts

## Suggested commit message

```
fix(league): increase toggle tap target padding (#M8)
```
