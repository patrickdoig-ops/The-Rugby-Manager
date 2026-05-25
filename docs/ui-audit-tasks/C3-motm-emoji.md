# C3-motm-emoji — Replace MOTM ★ emoji with Heroicons SVG

> **Severity:** Critical
> **Audit reference:** `Design Review.html` → Issues → C3-motm-emoji

## Files to edit

- `src/ui/MatchResultScreen.ts`
- `style/matchresult.css`

## Problem

The player ratings table on the Match Result screen uses the Unicode star (★) as the Man of the Match marker. The design system explicitly bans emoji; every other icon in the product uses Heroicons SVG. It also hardcodes `#ffce4f` for the star colour, which is not a system token.

This is documented in `mockups/SCREEN-CHANGES.md` as the one remaining bug from the v2 design pass.

## Fix

In `src/ui/MatchResultScreen.ts`, find the MOTM marker rendering. It will look like:

```ts
`<span class="mr-motm-marker">★</span>`
```

Replace with the Heroicons solid star at 13×13:

```ts
`<svg class="mr-motm-marker" width="13" height="13" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
  <path fill-rule="evenodd" d="M10.868 2.884c-.321-.772-1.415-.772-1.736 0l-1.83 4.401-4.753.381c-.833.067-1.171 1.107-.536 1.651l3.62 3.102-1.106 4.637c-.194.813.691 1.456 1.405 1.02L10 15.591l4.069 2.485c.713.436 1.598-.207 1.404-1.02l-1.106-4.637 3.62-3.102c.635-.544.297-1.584-.536-1.65l-4.752-.382-1.831-4.401z" clip-rule="evenodd" />
</svg>`
```

In `style/matchresult.css`, update `.mr-motm-marker`:

```css
.mr-motm-marker {
  color: var(--rm-amber);
  flex-shrink: 0;
}
```

Remove the old hex `#ffce4f` and any font-size rules (the SVG is intrinsically sized).

## Expected result

Match Result screen — Player Ratings card — the MOTM row shows a solid SVG star in `--rm-amber` next to the player name. No emoji glyph. Pixel-match with `mockups/06-MatchResult.html`.

## Acceptance

- [ ] Only the files listed above are modified
- [ ] `pnpm typecheck` passes (or equivalent for the toolchain)
- [ ] No new console warnings in browser devtools
- [ ] Visual check matches the "Expected result" block above
- [ ] No regression on other screens that share affected tokens or files
- [ ] `grep` checks (if listed in the fix) return the expected counts

## Suggested commit message

```
fix(match-result): replace MOTM ★ emoji with Heroicons SVG (#C3)
```
