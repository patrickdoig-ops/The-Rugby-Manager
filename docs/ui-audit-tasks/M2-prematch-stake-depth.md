# M2-prematch-stake-depth — Pre-match stake card background: rm-bg → rm-surface-2

> **Severity:** Medium
> **Audit reference:** `Design Review.html` → Issues → M2-prematch-stake-depth

## Files to edit

- `style/prematch.css`

## Problem

The three `.pm-stake-card` elements (Round, Week, Spread) use `background: var(--rm-bg)` on a parent that is `--rm-surface`. Since `--rm-bg` is darker than `--rm-surface`, the cards appear inset rather than elevated — an inverted depth cue that fights the elevation system used everywhere else.

## Fix

In `style/prematch.css`:

```diff
.pm-stake-card {
- background: var(--rm-bg);
- border: 1px solid var(--rm-hairline);
+ background: var(--rm-surface-2);
+ border: 1px solid var(--rm-border-soft);
}
```

This lifts the cards above the surrounding `#pm-header` surface, matching the card elevation pattern used in the Hub Next Match card and the Match Result KPI strip.

## Expected result

Pre-Match screen header — the three stake cards now sit visibly elevated above the header band, rather than appearing recessed into it. Depth cues now match the rest of the product.

## Acceptance

- [ ] Only the files listed above are modified
- [ ] `pnpm typecheck` passes (or equivalent for the toolchain)
- [ ] No new console warnings in browser devtools
- [ ] Visual check matches the "Expected result" block above
- [ ] No regression on other screens that share affected tokens or files
- [ ] `grep` checks (if listed in the fix) return the expected counts

## Suggested commit message

```
fix(prematch): stake card background to --rm-surface-2 (#M2)
```
