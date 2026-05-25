# H7-empty-states — Structured empty states for Transfer Market and Squad

> **Severity:** High
> **Audit reference:** `Design Review.html` → Issues → H7-empty-states

## Files to edit

- `src/ui/TransferMarketScreen.ts`
- `src/ui/SquadManagementScreen.ts`
- `style/transfermarket.css`
- `style/squad.css`

## Problem

When the free agent pool or poach list is empty, Transfer Market shows a plain `.tm-empty` mono label: "NO FREE AGENTS AVAILABLE." Squad Management has the same issue with `.sq-empty`. These occur regularly (mid-season transfer windows, filtered views) and the bare text feels broken rather than informative.

## Fix

**Step 1 — Define a shared empty-state pattern in `style/main.css`:**

```css
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 48px 24px;
  gap: 14px;
  color: var(--rm-text-muted);
}
.empty-state__icon {
  color: var(--rm-text-faint);
  flex-shrink: 0;
}
.empty-state__title {
  font-family: var(--font-body);
  font-size: 14px;
  font-weight: 600;
  color: var(--rm-text-muted);
}
.empty-state__desc {
  font-family: var(--font-body);
  font-size: 12px;
  color: var(--rm-text-dim);
  max-width: 280px;
  line-height: 1.55;
}
```

**Step 2 — In `TransferMarketScreen.ts`, replace the empty render branch:**

```ts
if (freeAgents.length === 0) {
  return `<div class="empty-state">
    <svg class="empty-state__icon" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
      <path stroke-linecap="round" stroke-linejoin="round" d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5"/>
    </svg>
    <div class="empty-state__title">No free agents available</div>
    <div class="empty-state__desc">Check back after the next round of fixtures — new players become available as contracts expire across the league.</div>
  </div>`;
}
```

**Step 3 — Same pattern in `SquadManagementScreen.ts`** when a filter returns zero players. Tailor the descriptor to the context (e.g. "No forwards in your squad" / "Try filtering by backs instead").

**Step 4 — Remove the legacy `.tm-empty` and `.sq-empty` rules** from their respective files. They're replaced by the shared pattern.

## Expected result

Transfer Market with zero free agents renders a centred icon + title + descriptor block instead of bare text. Squad management filtered to a position with no players renders the same pattern with context-specific copy.

## Acceptance

- [ ] Only the files listed above are modified
- [ ] `pnpm typecheck` passes (or equivalent for the toolchain)
- [ ] No new console warnings in browser devtools
- [ ] Visual check matches the "Expected result" block above
- [ ] No regression on other screens that share affected tokens or files
- [ ] `grep` checks (if listed in the fix) return the expected counts

## Suggested commit message

```
feat(empty-states): structured empty states for transfer and squad (#H7)
```
