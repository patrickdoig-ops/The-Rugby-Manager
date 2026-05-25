# M3-section-header-size — Standardise section header font size to 10px across screens

> **Severity:** Medium
> **Audit reference:** `Design Review.html` → Issues → M3-section-header-size

## Files to edit

- `style/prematch.css`
- `style/squad.css`

## Problem

Section label headers use inconsistent sizes: `.pm-section-header` and `.sq-section-label` are 8px, while `.eos-h3`, `.roll-h3`, `.mr-card-title`, and `.hub-nm-label` use 9–10px. 8px feels too small on desktop and doesn't meet minimum readable size guidance.

## Fix

In both `style/prematch.css` and `style/squad.css`:

```diff
.pm-section-header,
.sq-section-label {
- font-size: 8px;
- letter-spacing: 0.14em;
+ font-size: 10px;
+ letter-spacing: 0.16em;
  font-weight: 700;
  text-transform: uppercase;
  font-family: var(--font-mono);
  color: var(--rm-text-dim);
}
```

The standard going forward (also being added to CLAUDE.md as an invariant): all section labels are 10px mono uppercase 0.16em.

## Expected result

Pre-Match section labels ("STARTING XV", "BENCH", "TACTICS") and Squad section labels render at 10px instead of 8px. Spacing and proportions around them remain balanced — minor layout reflow expected.

## Acceptance

- [ ] Only the files listed above are modified
- [ ] `pnpm typecheck` passes (or equivalent for the toolchain)
- [ ] No new console warnings in browser devtools
- [ ] Visual check matches the "Expected result" block above
- [ ] No regression on other screens that share affected tokens or files
- [ ] `grep` checks (if listed in the fix) return the expected counts

## Suggested commit message

```
refactor(labels): standardise section header to 10px mono (#M3)
```
