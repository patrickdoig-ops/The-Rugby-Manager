# M7-training-stub — Improve Training stub treatment on Hub

> **Severity:** Medium
> **Audit reference:** `Design Review.html` → Issues → M7-training-stub

## Files to edit

- `src/ui/HubScreen.ts`
- `style/hub.css`

## Problem

The Training tile is dimmed to 0.32 opacity with a "Soon" badge. At that opacity, the icon is barely legible. The tile communicates nothing about what Training will do, creating dead space on the hub.

## Fix

**Step 1 — In `style/hub.css`, update the disabled tile rule:**

```diff
.hub-tile--disabled {
- opacity: 0.32;
+ opacity: 0.45;
  cursor: not-allowed;
}
.hub-tile--disabled .hub-tile-sub {
  display: block;
}
.hub-tile-sub {
  font-family: var(--font-mono);
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.08em;
  color: var(--rm-text-dim);
  text-transform: uppercase;
  margin-top: 2px;
  display: none;
}
```

**Step 2 — In `HubScreen.ts`, update the Training tile template:**

```ts
`<button class="hub-tile hub-tile--disabled" disabled>
  <!-- existing icon -->
  <span class="hub-tile-label">Training</span>
  <span class="hub-tile-sub">Drills & fitness</span>
  <span class="hub-tile-badge">Coming</span>
</button>`
```

**Step 3 — If `.hub-tile-badge` uses "Soon", change to "Coming"** — feels less dismissive.

## Expected result

Training tile on the Hub is readable (icon visible at 0.45), shows a secondary "Drills & fitness" descriptor, and the badge reads "Coming." The tile feels like a placeholder for an upcoming feature, not a broken or abandoned element.

## Acceptance

- [ ] Only the files listed above are modified
- [ ] `pnpm typecheck` passes (or equivalent for the toolchain)
- [ ] No new console warnings in browser devtools
- [ ] Visual check matches the "Expected result" block above
- [ ] No regression on other screens that share affected tokens or files
- [ ] `grep` checks (if listed in the fix) return the expected counts

## Suggested commit message

```
polish(hub): improve training stub treatment (#M7)
```
