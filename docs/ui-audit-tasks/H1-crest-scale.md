# H1-crest-scale — Introduce 4-step crest scale and apply across all screens

> **Severity:** High
> **Audit reference:** `Design Review.html` → Issues → H1-crest-scale

## Files to edit

- `style/main.css`
- `style/hub.css`
- `style/leaguetable.css`
- `style/roundresults.css`
- `style/prematch.css`
- `style/matchresult.css`
- `style/squad.css`
- `style/teamselector.css`
- `style/seasonrollover.css`

## Problem

Team crests appear at 7 different sizes (22px, 30px, 32px, 34px, 38px, 44px, 58px) with 6 different border-radii (5–14px) across the product. No shared class, no documented scale. The same team feels different across screens in a way that isn't explained by hierarchy.

## Fix

**Step 1 — Define the scale in `style/main.css`:**

In the `:root` token block, add:

```css
/* Crest size scale */
--crest-xs-size: 22px;
--crest-xs-radius: 5px;
--crest-sm-size: 34px;
--crest-sm-radius: 8px;
--crest-md-size: 44px;
--crest-md-radius: 10px;
--crest-lg-size: 58px;
--crest-lg-radius: 13px;
```

Add shared utility classes (after the typography section):

```css
.team-crest {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  font-family: var(--font-display);
  color: rgba(255, 255, 255, 0.95);
  background: linear-gradient(145deg, var(--team-color, var(--rm-stat-1)), color-mix(in oklch, var(--team-color, var(--rm-stat-1)) 60%, var(--rm-bg-deep)));
  box-shadow: var(--rm-card-shadow);
}
.team-crest--xs { width: var(--crest-xs-size); height: var(--crest-xs-size); border-radius: var(--crest-xs-radius); font-size: 10px; }
.team-crest--sm { width: var(--crest-sm-size); height: var(--crest-sm-size); border-radius: var(--crest-sm-radius); font-size: 15px; }
.team-crest--md { width: var(--crest-md-size); height: var(--crest-md-size); border-radius: var(--crest-md-radius); font-size: 22px; }
.team-crest--lg { width: var(--crest-lg-size); height: var(--crest-lg-size); border-radius: var(--crest-lg-radius); font-size: 28px; }
```

**Step 2 — Apply consistently per the canonical mapping:**

| Context | Size class |
|---|---|
| League table rows, round results, fixture list rows | `--xs` |
| Next-match cards, scoreboard, pre-match summary header | `--sm` |
| Match result hero, pre-match split-screen player columns | `--md` |
| Hub hero | `--lg` |

**Step 3 — Sweep every screen CSS file:**

For each affected file, remove the existing crest sizing rules and add the appropriate `.team-crest--*` class on the corresponding element in the matching `.ts` file. If a screen has bespoke crest decoration (e.g. hub hero glow), keep the decoration but base its sizing on the scale variables.

Do all 8 screens in sequence and commit each as a separate logical commit so reviewers can verify per-screen.

## Expected result

Visual sweep of all 13 screens — every crest matches one of the 4 canonical sizes. No inline `width: 32px; height: 32px` on a crest element anywhere. The scale tokens are the single source of truth.

## Acceptance

- [ ] Only the files listed above are modified
- [ ] `pnpm typecheck` passes (or equivalent for the toolchain)
- [ ] No new console warnings in browser devtools
- [ ] Visual check matches the "Expected result" block above
- [ ] No regression on other screens that share affected tokens or files
- [ ] `grep` checks (if listed in the fix) return the expected counts

## Suggested commit message

```
refactor(crest): introduce 4-step crest scale tokens (#H1)
```
