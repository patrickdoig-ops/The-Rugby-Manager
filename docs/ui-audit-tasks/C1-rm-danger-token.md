# C1-rm-danger-token — Declare --rm-danger token in :root and light-mode

> **Severity:** Critical
> **Audit reference:** `Design Review.html` → Issues → C1-rm-danger-token

## Files to edit

- `style/main.css`

## Problem

Both `style/transfermarket.css` and `style/seasonrollover.css` reference `var(--rm-danger, #d8503e)`. The fallback works today, but the token is never declared in `:root` — meaning the design system treats it as undefined. If anyone later declares it with a different value, the existing fallbacks silently break. The token must exist as a first-class system token.

## Fix

In `style/main.css`, add to the `:root` block (in the colour tokens section, near `--rm-amber`):

```css
--rm-danger: oklch(0.60 0.20 25);
--rm-danger-deep: oklch(0.45 0.18 25);
```

In the `body.light-mode` block (in the light-mode overrides section), add:

```css
--rm-danger: oklch(0.52 0.22 25);
--rm-danger-deep: oklch(0.40 0.20 25);
```

Then in `style/transfermarket.css` and `style/seasonrollover.css`, remove the fallback parameter:

```diff
- color: var(--rm-danger, #d8503e);
+ color: var(--rm-danger);
```

Search both files for `--rm-danger,` (with the comma) and remove the fallback at every occurrence.

## Expected result

`grep -r "var(--rm-danger," style/` returns zero results. The `:root` declaration in `main.css` is the canonical source. Visual: no change (the fallback was already rendering the same colour).

## Acceptance

- [ ] Only the files listed above are modified
- [ ] `pnpm typecheck` passes (or equivalent for the toolchain)
- [ ] No new console warnings in browser devtools
- [ ] Visual check matches the "Expected result" block above
- [ ] No regression on other screens that share affected tokens or files
- [ ] `grep` checks (if listed in the fix) return the expected counts

## Suggested commit message

```
fix(tokens): declare --rm-danger in :root and light-mode (#C1)
```
