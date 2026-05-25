# UI Audit v2.0 — PR Plan

## PR 1 — Token & quick fixes

**Branch:** `ui-audit/pr1-tokens-and-quick-fixes`
**Base:** `main`
**Estimated:** 1.5 hours
**Risk:** Very low

### Commits (in order)

```
fix(tokens): declare --rm-danger in :root and light-mode (#C1)
fix(transfer): replace hardcoded #d8a14a with --rm-amber (#C2)
fix(match-result): replace MOTM ★ emoji with Heroicons SVG (#C3)
fix(contracts): align injury tag to --rm-danger (#H3)
polish(commentary): increase entryIn duration to 220ms (#P1)
polish(main): add transition to .app-back hover (#P5)
polish(round-results): tighten pending pulse timing (#P6)
refactor(header): increase .app-title to 20px (#M1)
refactor(labels): standardise section header to 10px mono (#M3)
refactor(layout): introduce --safe-bottom token (#M5)
polish(stats): standardise bar height to 4px (#P3)
```

### Files touched
`style/main.css`, `style/transfermarket.css`, `style/matchresult.css`,
`style/contracts.css`, `style/commentary.css`, `style/roundresults.css`,
`style/prematch.css`, `style/squad.css`, `style/stats.css`, `src/ui/MatchResultScreen.ts`

### Review checklist
- [ ] All 13 screens load without console warnings
- [ ] Light-mode toggle (if active) does not produce visual regressions in modified files
- [ ] MOTM badge renders identically to mockup at `mockups/06-MatchResult.html`
- [ ] No remaining `var(--rm-danger, ...)` fallbacks anywhere in `style/`
- [ ] `grep -r "#d8" style/` returns no results outside main.css `:root` declarations

---

## PR 2 — Consistency & polish

**Branch:** `ui-audit/pr2-consistency`
**Base:** `main` (after PR 1 merges)
**Estimated:** 6 hours
**Risk:** Medium — touches 8+ screens

### Commits (in order)

```
refactor(crest): introduce 4-step crest scale tokens (#H1)
refactor(crest): apply --crest-xs to league/round/fixture (#H1 cont.)
refactor(crest): apply --crest-sm to next-match/scoreboard (#H1 cont.)
refactor(crest): apply --crest-md to pre-match/match-result (#H1 cont.)
refactor(crest): apply --crest-lg to hub hero (#H1 cont.)
refactor(cta): standardise in-flow CTA font size to 20px (#H2)
polish(hub): spread label colour to --rm-text-muted (#H8)
fix(prematch): stake card background to --rm-surface-2 (#M2)
feat(header): season week eyebrow on list screens (#M4)
feat(team-selector): tablet/desktop responsive grid (#M6)
polish(hub): improve training stub treatment (#M7)
fix(league): increase toggle tap target padding (#M8)
refactor(stats): live match bars 3px → 5px team-coloured (#M9)
polish(league): add row hover state for desktop (#P2)
polish(phase-badge): increase max-width at >=700px (#P4)
```

### Files touched
All 21 CSS files + `HubScreen.ts`, `FixtureListScreen.ts`, `LeagueTableScreen.ts`,
`ContractsScreen.ts`, `TeamSelectorScreen.ts`, `StatsPanel.ts`

### Review checklist
- [ ] All crest sizes match the canonical scale (visual spot-check on each of 8 affected screens)
- [ ] No regressions in screens where `--crest-*` was already implicitly correct
- [ ] Tablet (768px viewport) shows 3-column team selector
- [ ] Desktop (1280px viewport) shows 5-column team selector
- [ ] CTA buttons across League, Round Results, Transfer Market all visually match Hub/Pre-Match

---

## PR 3 — Feature additions

**Branch:** `ui-audit/pr3-features`
**Base:** `main` (after PR 2 merges)
**Estimated:** 5 hours
**Risk:** Higher — new components

### Commits (in order)

```
feat(eos): add atmospheric team-colour wash to End-of-Season (#H4)
feat(rollover): add atmospheric team-colour wash to Season Rollover (#H4 cont.)
feat(toast): introduce showToast helper and shared component (#H5)
feat(squad): emit toast on squad save (#H5 cont.)
feat(transfer): emit toast on player signing (#H5 cont.)
feat(renewals): emit toast on contract renewal (#H5 cont.)
feat(hub): notification badge on Squad tile (injuries count) (#H6)
feat(hub): notification badge on Contracts tile (expiring count) (#H6 cont.)
feat(empty-states): icon + descriptor for transfer market (#H7)
feat(empty-states): icon + descriptor for squad (#H7 cont.)
```

### Files touched
`style/main.css`, `style/seasonrollover.css`, `style/hub.css`, `style/transfermarket.css`, `style/squad.css`,
`src/ui/EndOfSeasonScreen.ts`, `src/ui/RolloverScreen.ts`, `src/ui/HubScreen.ts`,
`src/ui/TransferMarketScreen.ts`, `src/ui/SquadManagementScreen.ts`, `src/ui/RenewalsScreen.ts`,
new file `src/ui/Toast.ts`

### Review checklist
- [ ] Toast appears on three actions: save squad, sign FA, renew contract
- [ ] Toast auto-dismisses at 1.8s, can be tapped to dismiss early
- [ ] Hub badges show correct counts (verify against test fixture with 2 injuries, 3 expiring)
- [ ] Empty states render when free agent pool is genuinely empty (not just filtered)
- [ ] EOS / Rollover wash respects the player team colour, not a hardcoded green

---

## Separate branch — Light mode pass

**Branch:** `ui-audit/light-mode-pass`
**Base:** `main`
**Estimated:** 1–2 days
**Risk:** High — touches every screen

### Approach

Either:

**Option A (recommended) — Full pass.** Audit every screen-specific CSS file. Replace inline hex/rgba/opacity values calibrated for dark mode with tokens that have light-mode counterparts. Add new tokens where needed. Test every screen in both modes.

**Option B — Gate the toggle.** Add `__experimental.lightMode` flag in `CLAUDE.md` invariants. Hide the toggle from production UI. Ship dark-only until Option A is complete.

Do not merge a half-finished light mode pass to main.

### Files touched (Option A)
All 20 screen-specific CSS files. `main.css` for new tokens.

### Review checklist (Option A)
- [ ] Toggle light/dark on every screen — no broken gradients
- [ ] Card shadows visible in light mode (currently calibrated for dark)
- [ ] Pitch line gradients on Home screen work in both modes
- [ ] Hub hero radial wash works in both modes
- [ ] No CSS rule contains a hardcoded `rgba(0,0,0,*)` or `rgba(255,255,255,*)`

---

## Working session pattern with Claude Code

For each task file:

```
1. cd ~/code/rugby-simulator
2. git checkout -b ui-audit/pr1-tokens-and-quick-fixes  (or current PR branch)
3. claude code "Read docs/ui-audit-tasks/<TASK>.md and implement the fix.
                Run pnpm typecheck. Stage changes."
4. Verify the change visually against the audit's expected result
5. claude code "Commit with the suggested message in the task file"
6. Repeat for next task in PR
7. Push and open PR using docs/PR-PLAN.md commit list as PR description
```
