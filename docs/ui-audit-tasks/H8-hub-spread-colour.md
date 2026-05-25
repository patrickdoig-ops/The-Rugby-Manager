# H8-hub-spread-colour — Hub spread label colour: stat-4 → text-muted

> **Severity:** High
> **Audit reference:** `Design Review.html` → Issues → H8-hub-spread-colour

## Files to edit

- `style/hub.css`

## Problem

The `.hub-nm-spread` element uses `color: var(--rm-stat-4)` which is `oklch(0.76 0.20 144)` — nearly identical to `--rm-pitch` (`oklch(0.76 0.21 144)`). The spread label visually competes with every other pitch-green accent on the card. It's meant to be an analytical/predictive note, which warrants differentiated treatment.

## Fix

In `style/hub.css`, change `.hub-nm-spread`:

```diff
.hub-nm-spread {
- color: var(--rm-stat-4);
+ color: var(--rm-text-muted);
}
```

The trending-up SVG icon next to the label should remain coloured `var(--rm-stat-5)` (cyan) — that's the analytical signal. The text itself becomes supporting copy, deferring to the icon as the colour cue.

## Expected result

Hub Next Match card — the spread label (e.g. "Bath +3") is muted grey-green, with a cyan trending-up icon. Visually distinct from the pitch-green primary accents on the same card.

## Acceptance

- [ ] Only the files listed above are modified
- [ ] `pnpm typecheck` passes (or equivalent for the toolchain)
- [ ] No new console warnings in browser devtools
- [ ] Visual check matches the "Expected result" block above
- [ ] No regression on other screens that share affected tokens or files
- [ ] `grep` checks (if listed in the fix) return the expected counts

## Suggested commit message

```
polish(hub): spread label colour to --rm-text-muted (#H8)
```
