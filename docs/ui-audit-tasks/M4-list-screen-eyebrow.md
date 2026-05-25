# M4-list-screen-eyebrow — Add season-week eyebrow to shared list-screen headers

> **Severity:** Medium
> **Audit reference:** `Design Review.html` → Issues → M4-list-screen-eyebrow

## Files to edit

- `src/ui/FixtureListScreen.ts`
- `src/ui/LeagueTableScreen.ts`
- `src/ui/ContractsScreen.ts`

## Problem

When navigating from the Hub to Fixtures, League Table, or Contracts, the header shows only the screen title. There's no "Week 14 / 22" or "Season 2025-26" context. The Hub's nice `hub-eyebrow` showing temporal context disappears on every sub-screen. Users lose grounding.

## Fix

The shared header uses `.app-eyebrow` (already defined in `main.css` at 10px mono pitch-green). It's just not being populated on these three screens.

In each of the three `.ts` files, locate the header render. After the title, inject:

```ts
const season = state.calendar.seasonLabel; // e.g. "2025/26"
const week = state.calendar.week;
const total = state.calendar.totalRounds;

`<div class="app-eyebrow">${season} · WK ${week} / ${total}</div>`
```

Match the exact format the Hub uses (look at `HubScreen.ts` for the canonical string format and ensure it's identical).

## Expected result

Navigate from Hub to Fixtures — the same "2025/26 · WK 14 / 22" pitch-green eyebrow appears below the title. Same on League Table and Contracts. The temporal context now carries through the entire flow.

## Acceptance

- [ ] Only the files listed above are modified
- [ ] `pnpm typecheck` passes (or equivalent for the toolchain)
- [ ] No new console warnings in browser devtools
- [ ] Visual check matches the "Expected result" block above
- [ ] No regression on other screens that share affected tokens or files
- [ ] `grep` checks (if listed in the fix) return the expected counts

## Suggested commit message

```
feat(header): season week eyebrow on list screens (#M4)
```
