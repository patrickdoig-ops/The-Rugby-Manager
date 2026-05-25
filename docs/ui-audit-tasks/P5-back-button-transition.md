# P5-back-button-transition — Add transition to .app-back hover state

> **Severity:** Polish
> **Audit reference:** `Design Review.html` → Issues → P5-back-button-transition

## Files to edit

- `style/main.css`

## Problem

`.app-back` defines a `:hover` colour but has no `transition` property. Every other interactive element in the system has `transition: color 0.12s` or similar. The back button hover snaps instantly.

## Fix

In `style/main.css`:

```diff
.app-back {
  color: var(--rm-text-muted);
+ transition: color 0.15s;
  /* ... */
}
```

One-line change.

## Expected result

Hovering the shared back button on any screen produces a smooth colour fade instead of an instant snap. Matches the transition behaviour of every other interactive element.

## Acceptance

- [ ] Only the files listed above are modified
- [ ] `pnpm typecheck` passes (or equivalent for the toolchain)
- [ ] No new console warnings in browser devtools
- [ ] Visual check matches the "Expected result" block above
- [ ] No regression on other screens that share affected tokens or files
- [ ] `grep` checks (if listed in the fix) return the expected counts

## Suggested commit message

```
polish(main): add transition to .app-back hover (#P5)
```
