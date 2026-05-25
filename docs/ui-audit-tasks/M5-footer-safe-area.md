# M5-footer-safe-area — Introduce --safe-bottom token, standardise across footers

> **Severity:** Medium
> **Audit reference:** `Design Review.html` → Issues → M5-footer-safe-area

## Files to edit

- `style/main.css`
- `All screen CSS files with footer rules`

## Problem

Footer safe-area padding varies: most screens use `max(env(safe-area-inset-bottom), 28px)`, some use 24px, one uses a flat value. The difference is mostly invisible on modern iPhones (home indicator is 34px so both clamp to 34px) but it's drift, and it makes the codebase inconsistent.

## Fix

**Step 1 — Add the token to `style/main.css :root`:**

```css
--safe-bottom: max(env(safe-area-inset-bottom), 28px);
```

**Step 2 — Sweep every screen CSS file** for footer-padding rules. Find patterns like:

```css
padding-bottom: max(env(safe-area-inset-bottom), 28px);
padding-bottom: max(env(safe-area-inset-bottom), 24px);
padding-bottom: 28px;
```

Replace all with:

```css
padding-bottom: var(--safe-bottom);
```

**Step 3 — Anywhere a flat `bottom` calc uses the safe area** (e.g. toasts, modals), use the same token.

This is also the value the toast component (#H5) uses for its bottom offset.

## Expected result

`grep -E "safe-area-inset-bottom" style/` returns one result in main.css (the token declaration) and zero elsewhere. All footers compute the same safe-area-inclusive padding on every device.

## Acceptance

- [ ] Only the files listed above are modified
- [ ] `pnpm typecheck` passes (or equivalent for the toolchain)
- [ ] No new console warnings in browser devtools
- [ ] Visual check matches the "Expected result" block above
- [ ] No regression on other screens that share affected tokens or files
- [ ] `grep` checks (if listed in the fix) return the expected counts

## Suggested commit message

```
refactor(layout): introduce --safe-bottom token (#M5)
```
