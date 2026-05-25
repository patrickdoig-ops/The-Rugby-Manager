# H2-cta-font-size — Standardise in-flow CTA font size to 20px

> **Severity:** High
> **Audit reference:** `Design Review.html` → Issues → H2-cta-font-size

## Files to edit

- `style/leaguetable.css`
- `style/roundresults.css`
- `style/transfermarket.css`

## Problem

The primary CTA — the green `#007a2a` full-width button — has three different label font sizes: 28px on Home, 20px on Hub/Pre-Match/Match Result/Squad, and 18px on League Table, Round Results, Transfer Market. The 28px is the intentional hero treatment. The 18px outliers are unjustified drift.

## Fix

In each of the three files, find the primary CTA button (`#lt-continue`, `#rr-continue`, `#tm-continue` or similar) and change:

```diff
- font-size: 18px;
+ font-size: 20px;
```

Keep the Home screen button at its current 28px — that is the intentional hero treatment.

## Expected result

League Table → Continue, Round Results → Continue, Transfer Market → Continue all visually match the Hub "Go to Next Match" button label size. Confirm by toggling between screens.

## Acceptance

- [ ] Only the files listed above are modified
- [ ] `pnpm typecheck` passes (or equivalent for the toolchain)
- [ ] No new console warnings in browser devtools
- [ ] Visual check matches the "Expected result" block above
- [ ] No regression on other screens that share affected tokens or files
- [ ] `grep` checks (if listed in the fix) return the expected counts

## Suggested commit message

```
refactor(cta): standardise in-flow CTA font size to 20px (#H2)
```
