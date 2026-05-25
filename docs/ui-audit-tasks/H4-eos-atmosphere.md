# H4-eos-atmosphere — Add atmospheric team-colour wash to End-of-Season and Rollover

> **Severity:** High
> **Audit reference:** `Design Review.html` → Issues → H4-eos-atmosphere

## Files to edit

- `style/seasonrollover.css`
- `src/ui/EndOfSeasonScreen.ts`
- `src/ui/RolloverScreen.ts`

## Problem

End of Season and Season Rollover are emotionally significant moments — the final standings reveal, the ageing/retirement summary. Both currently use flat `var(--rm-bg)` backgrounds with no atmospheric treatment. Every other key screen (Home, Hub, Match Result) has a distinctive visual moment. These feel like list screens, not culminating events.

## Fix

**Step 1 — In `style/seasonrollover.css`, update the screen root selectors:**

```css
#end-of-season,
#rollover {
  position: relative;
  background: var(--rm-bg);
  /* existing rules... */
}

#end-of-season::before,
#rollover::before {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: radial-gradient(
    ellipse 100% 50% at 50% 0%,
    color-mix(in oklch, var(--team-color, var(--rm-pitch)) 14%, transparent) 0%,
    transparent 65%
  );
  z-index: 0;
}

#end-of-season > *,
#rollover > * {
  position: relative;
  z-index: 1;
}
```

**Step 2 — In both `.ts` files, set the team colour CSS variable on mount:**

```ts
const root = document.getElementById('end-of-season')!;
root.style.setProperty('--team-color', state.career.team.primaryColor);
```

(Use whatever the project's team colour accessor is — match the pattern used by HubScreen.ts for the hero wash.)

**Step 3 — Verify both screens have the same visual rhythm as the Hub hero**, just at lower amplitude (these are culminating moments, not the active season's pulse).

## Expected result

End of Season screen — the top quarter of the viewport carries a soft radial wash in the player team's primary colour, fading to the standard background by the time you reach the standings. Same on Rollover. Test with at least two different teams to confirm the wash adapts.

## Acceptance

- [ ] Only the files listed above are modified
- [ ] `pnpm typecheck` passes (or equivalent for the toolchain)
- [ ] No new console warnings in browser devtools
- [ ] Visual check matches the "Expected result" block above
- [ ] No regression on other screens that share affected tokens or files
- [ ] `grep` checks (if listed in the fix) return the expected counts

## Suggested commit message

```
feat(eos): add atmospheric team-colour wash to End-of-Season + Rollover (#H4)
```
