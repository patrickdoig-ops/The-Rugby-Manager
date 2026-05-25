# C2-hardcoded-amber — Replace hardcoded #d8a14a with --rm-amber

> **Severity:** Critical
> **Audit reference:** `Design Review.html` → Issues → C2-hardcoded-amber

## Files to edit

- `style/transfermarket.css`

## Problem

The `.tm-cappill--tight` state uses `background: color-mix(in oklch, #d8a14a 14%, transparent)`. This is an undocumented amber colour that differs from `--rm-amber` (oklch 0.74 0.16 62) and `--rm-stat-2` (oklch 0.68 0.16 55). It won't update if the amber token is adjusted and it breaks in light mode.

## Fix

In `style/transfermarket.css`, find every occurrence of `#d8a14a` and replace with `var(--rm-amber)`. The contracts screen already uses `--rm-amber` / `--rm-amber-deep` for its tight-cap gradient — match that pattern.

```diff
- background: color-mix(in oklch, #d8a14a 14%, transparent);
- color: #d8a14a;
+ background: color-mix(in oklch, var(--rm-amber) 14%, transparent);
+ color: var(--rm-amber);
```

If the contracts file uses `--rm-amber-deep` for borders or shadows, mirror that token here.

## Expected result

`grep "#d8a14a" style/transfermarket.css` returns zero results. The tight-cap pill renders identically in dark mode and now adapts correctly in light mode.

## Acceptance

- [ ] Only the files listed above are modified
- [ ] `pnpm typecheck` passes (or equivalent for the toolchain)
- [ ] No new console warnings in browser devtools
- [ ] Visual check matches the "Expected result" block above
- [ ] No regression on other screens that share affected tokens or files
- [ ] `grep` checks (if listed in the fix) return the expected counts

## Suggested commit message

```
fix(transfer): replace hardcoded #d8a14a with --rm-amber (#C2)
```
