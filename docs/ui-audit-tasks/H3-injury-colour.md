# H3-injury-colour — Align injury tag to --rm-danger (not amber)

> **Severity:** High
> **Audit reference:** `Design Review.html` → Issues → H3-injury-colour

## Files to edit

- `style/contracts.css`

## Problem

Injuries are signalled three ways across the product: `.injury-badge` in main.css uses red (`#d8503e`); `.ct-tag--injury` in contracts uses amber (`--rm-amber`); `.mr-card--injuries` uses red again. Amber is also used for MOTM, creating false visual equivalence between "won an award" and "is injured." Red is correct.

Depends on **C1** being merged first (`--rm-danger` token must exist).

## Fix

In `style/contracts.css`, find the `.ct-tag--injury` rule and replace all amber colour references with `--rm-danger`:

```diff
.ct-tag--injury {
- background: color-mix(in oklch, var(--rm-amber) 16%, transparent);
- color: var(--rm-amber);
- border: 1px solid color-mix(in oklch, var(--rm-amber) 35%, transparent);
+ background: color-mix(in oklch, var(--rm-danger) 16%, transparent);
+ color: var(--rm-danger);
+ border: 1px solid color-mix(in oklch, var(--rm-danger) 35%, transparent);
}
```

Confirm visually that no other contracts-screen element conflates injury with amber.

## Expected result

Contracts screen — any player with an active injury shows a red/danger tag, not an amber one. The amber colour is now reserved exclusively for performance rewards (MOTM, top performer milestones).

## Acceptance

- [ ] Only the files listed above are modified
- [ ] `pnpm typecheck` passes (or equivalent for the toolchain)
- [ ] No new console warnings in browser devtools
- [ ] Visual check matches the "Expected result" block above
- [ ] No regression on other screens that share affected tokens or files
- [ ] `grep` checks (if listed in the fix) return the expected counts

## Suggested commit message

```
fix(contracts): align injury tag to --rm-danger (#H3)
```
