# H6-hub-badges — Add notification badges to Hub Squad and Contracts tiles

> **Severity:** High
> **Audit reference:** `Design Review.html` → Issues → H6-hub-badges

## Files to edit

- `src/ui/HubScreen.ts`
- `style/hub.css`
- `style/main.css`

## Problem

The Squad tile shows no badge when players are injured. The Contracts tile shows no badge when contracts are expiring this season. Football Manager's hub equivalent has clear notification dots on every section that needs attention. Today these states are buried in screen content the user has to navigate to in order to discover.

## Fix

**Step 1 — Add shared badge class to `style/main.css`:**

```css
.notification-badge {
  position: absolute;
  top: -4px;
  right: -4px;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 9px;
  background: var(--rm-danger);
  color: var(--rm-chalk);
  font-family: var(--font-mono);
  font-size: 9px;
  font-weight: 700;
  line-height: 16px;
  text-align: center;
  border: 2px solid var(--rm-bg);
  box-shadow: 0 0 0 1px var(--rm-danger);
  z-index: 2;
}
```

**Step 2 — In `HubScreen.ts`, compute counts on render:**

```ts
const injuredCount = state.career.squad.filter(p => p.injury?.weeksOut > 0).length;
const expiringCount = state.career.squad.filter(p => p.contract.yearsLeft <= 1).length;
```

**Step 3 — Inject badges into the Squad and Contracts tile templates:**

```ts
`<button class="hub-tile" data-tile="squad" style="position: relative">
  ${injuredCount > 0 ? `<span class="notification-badge">${injuredCount}</span>` : ''}
  ...existing tile content
</button>`
```

(Apply the same pattern to the Contracts tile with `expiringCount`.)

**Step 4 — Ensure the tile has `position: relative`** in `style/hub.css` (it probably already does for the icon — confirm).

The treatment-room line below the grid can stay; the badge is the primary signal, the line is supporting detail for users who want it.

## Expected result

Hub screen — when the player squad has at least one injury, the Squad tile shows a red badge in its top-right with the count. When at least one contract expires this season, Contracts shows a similar badge. Counts update live as the squad state changes.

## Acceptance

- [ ] Only the files listed above are modified
- [ ] `pnpm typecheck` passes (or equivalent for the toolchain)
- [ ] No new console warnings in browser devtools
- [ ] Visual check matches the "Expected result" block above
- [ ] No regression on other screens that share affected tokens or files
- [ ] `grep` checks (if listed in the fix) return the expected counts

## Suggested commit message

```
feat(hub): notification badges on Squad and Contracts tiles (#H6)
```
