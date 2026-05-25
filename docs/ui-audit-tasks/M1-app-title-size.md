# M1-app-title-size — Increase shared .app-title to 20px

> **Severity:** Medium
> **Audit reference:** `Design Review.html` → Issues → M1-app-title-size

## Files to edit

- `style/main.css`

## Problem

The shared `.app-title` element (used on Fixtures, League Table, Contracts, Squad, Transfer Market) is Anton at 16px. Anton is a condensed display font designed for large sizes — at 16px it lacks visual authority and can look spindly against the surrounding 22px+ usage.

## Fix

In `style/main.css`:

```diff
.app-title {
- font-size: 16px;
+ font-size: 20px;
  /* ...other rules */
}
```

If `.app-topbar-spacer` references a specific height that depended on the previous title size, increase it proportionally so the topbar's vertical rhythm stays balanced.

Test on all 6 screens that use the shared header.

## Expected result

All shared-header screens (Fixtures, League Table, Contracts, Squad, Transfer Market, etc.) display their title at 20px Anton. The title carries visual weight matching the other display typography in the product. No topbar height regressions.

## Acceptance

- [ ] Only the files listed above are modified
- [ ] `pnpm typecheck` passes (or equivalent for the toolchain)
- [ ] No new console warnings in browser devtools
- [ ] Visual check matches the "Expected result" block above
- [ ] No regression on other screens that share affected tokens or files
- [ ] `grep` checks (if listed in the fix) return the expected counts

## Suggested commit message

```
refactor(header): increase .app-title to 20px (#M1)
```
