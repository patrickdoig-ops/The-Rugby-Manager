# M9-live-stats-bars — Live match stat bars: 3px → 5px, team-coloured, no gap

> **Severity:** Medium
> **Audit reference:** `Design Review.html` → Issues → M9-live-stats-bars

## Files to edit

- `style/stats.css`
- `src/ui/StatsPanel.ts`

## Problem

The live match stats panel has a 3px dual comparison bar below each stat. In the live dashboard, the panel is squeezed into a 2fr/3fr grid, making the bars nearly invisible. FM's live stats use coloured team bars as the primary data-viz, not secondary decoration.

## Fix

**Step 1 — In `style/stats.css`, update bar geometry:**

```diff
.stat-bars {
- height: 3px;
- gap: 1px;
+ height: 5px;
+ gap: 0;
  display: flex;
  border-radius: 3px;
  overflow: hidden;
}

.stat-bars__half--home {
  background: var(--team-home-color, var(--rm-pitch-deep));
}
.stat-bars__half--away {
  background: var(--team-away-color, var(--rm-stat-1));
  opacity: 0.85;
}
```

**Step 2 — In `StatsPanel.ts`, inject team colours as CSS variables:**

```ts
const panel = document.querySelector('.stats-panel');
panel.style.setProperty('--team-home-color', state.match.home.primaryColor);
panel.style.setProperty('--team-away-color', state.match.away.primaryColor);
```

**Step 3 — Match-result variant** (`.mr-stat-bars` in matchresult.css) — apply the same 5px height + no gap rules so the visualisation is consistent.

## Expected result

Live match stats panel — bars are clearly visible at a glance, coloured in each team's primary, and read as a proportional split rather than two thin coloured lines.

## Acceptance

- [ ] Only the files listed above are modified
- [ ] `pnpm typecheck` passes (or equivalent for the toolchain)
- [ ] No new console warnings in browser devtools
- [ ] Visual check matches the "Expected result" block above
- [ ] No regression on other screens that share affected tokens or files
- [ ] `grep` checks (if listed in the fix) return the expected counts

## Suggested commit message

```
refactor(stats): live bars 5px team-coloured no gap (#M9)
```
