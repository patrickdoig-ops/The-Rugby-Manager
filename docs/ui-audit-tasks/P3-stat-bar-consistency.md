# P3-stat-bar-consistency — Stat bar height: standardise to 5px, remove gap

> **Severity:** Polish
> **Audit reference:** `Design Review.html` → Issues → P3-stat-bar-consistency

## Files to edit

- `style/stats.css`
- `style/matchresult.css`

## Problem

Stat bars are 3px in `.stat-bars` (stats.css) and 4px in `.mr-stat-bars` (matchresult.css), with a 1px gap in the matchresult variant. The same data visualisation looks slightly different across contexts.

Bundled with #M9 — once M9 lands the live variant is 5px. Match the match-result variant to it.

## Fix

Wait for #M9 to land first. Then in `style/matchresult.css`:

```diff
.mr-stat-bars {
- height: 4px;
- gap: 1px;
+ height: 5px;
+ gap: 0;
}
```

If `.mr-stat-bars` has any borders or backgrounds that depended on the gap to visually separate the halves, replace them with a solid `overflow: hidden` parent with rounded corners.

## Expected result

Stat bars on Live Match and Match Result screens look pixel-identical at 5px. No visible artefact between the two halves — they share a flush edge.

## Acceptance

- [ ] Only the files listed above are modified
- [ ] `pnpm typecheck` passes (or equivalent for the toolchain)
- [ ] No new console warnings in browser devtools
- [ ] Visual check matches the "Expected result" block above
- [ ] No regression on other screens that share affected tokens or files
- [ ] `grep` checks (if listed in the fix) return the expected counts

## Suggested commit message

```
polish(stats): standardise bar geometry across contexts (#P3)
```
