# UI Audit v2.0 — Implementation Brief

> **Source:** `Design Review.html` at project root (visual audit) — May 2026
> **Scope:** 27 issues across 13 screens, 21 CSS files, 30 UI modules
> **Goal:** Bring the Rugby Manager UI to Football Manager polish level

## How to use this brief

This document is the index. Each issue has its own task file in `docs/ui-audit-tasks/` containing:

- The exact files to edit
- The precise fix (token swap, snippet, or refactor)
- Acceptance criteria
- A suggested commit message

**Workflow with Claude Code:**

```
"Read docs/ui-audit-tasks/C1-rm-danger-token.md and implement.
 Run typecheck. Commit with the suggested message."
```

Each task is scoped to be completable in one focused session. Most criticals are 5-minute changes; the largest single task (H1 crest scale) is ~3 hours.

---

## Recommended PR strategy

Group the 27 issues into 3 PRs + 1 separate branch. Do NOT open 27 PRs.

### PR 1 — Token & quick fixes (~1.5 hrs)
Pure CSS, zero risk, unblocks everything else. Merge first.

| Task | Title | Effort |
|---|---|---|
| C1 | Declare `--rm-danger` in :root | 5 min |
| C2 | Replace hardcoded `#d8a14a` with `--rm-amber` | 5 min |
| C3 | Replace MOTM ★ emoji with Heroicons SVG | 5 min |
| H3 | Fix injury colour (amber → red) | 10 min |
| P1 | Commentary animation 18ms → 220ms | 2 min |
| P5 | Add transition to `.app-back` | 2 min |
| P6 | Round results pulse timing | 2 min |
| M1 | `.app-title` 16px → 20px | 5 min |
| M3 | Section header 8px → 10px | 10 min |
| M5 | Standardise footer safe-area | 15 min |
| P3 | Stat bar height to 4px | 10 min |

### PR 2 — Consistency & polish (~6 hrs)
Touches multiple screens. Land after PR 1.

| Task | Title | Effort |
|---|---|---|
| H1 | 4-step crest scale across 8 screens | 3 hrs |
| H2 | CTA font size: 18px outliers → 20px | 10 min |
| H8 | Hub spread label colour | 5 min |
| M2 | Pre-match stake card depth fix | 5 min |
| M4 | Season week eyebrow on list screens | 30 min |
| M6 | Team selector tablet/desktop grid | 15 min |
| M7 | Training stub treatment | 15 min |
| M8 | League toggle tap target | 5 min |
| M9 | Live stats bars 3px → 5px team colours | 30 min |
| P2 | League row hover state | 5 min |
| P4 | Phase badge max-width breakpoint | 5 min |

### PR 3 — Feature additions (~5 hrs)
New components. Land after PRs 1 & 2.

| Task | Title | Effort |
|---|---|---|
| H4 | Atmospheric wash on End-of-Season + Rollover | 1 hr |
| H5 | Toast/snack feedback system | 2 hrs |
| H6 | Hub notification badges | 1 hr |
| H7 | Empty state treatments | 1 hr |

### Separate branch — C4 Light mode (1–2 days)
Either complete the pass or gate the toggle behind `__experimental`. Do not ship half-done.

---

## Index of task files

### Critical (4)
- [C1 — Declare `--rm-danger` token](./ui-audit-tasks/C1-rm-danger-token.md)
- [C2 — Replace hardcoded `#d8a14a`](./ui-audit-tasks/C2-hardcoded-amber.md)
- [C3 — Replace MOTM emoji](./ui-audit-tasks/C3-motm-emoji.md)
- [C4 — Light mode pass](./ui-audit-tasks/C4-light-mode.md)

### High (8)
- [H1 — Crest size scale](./ui-audit-tasks/H1-crest-scale.md)
- [H2 — CTA font size standardisation](./ui-audit-tasks/H2-cta-font-size.md)
- [H3 — Injury colour semantics](./ui-audit-tasks/H3-injury-colour.md)
- [H4 — Atmospheric wash on EOS/Rollover](./ui-audit-tasks/H4-eos-atmosphere.md)
- [H5 — Toast feedback system](./ui-audit-tasks/H5-toast-system.md)
- [H6 — Hub notification badges](./ui-audit-tasks/H6-hub-badges.md)
- [H7 — Empty state treatments](./ui-audit-tasks/H7-empty-states.md)
- [H8 — Hub spread label colour](./ui-audit-tasks/H8-hub-spread-colour.md)

### Medium (9)
- [M1 — `.app-title` font size](./ui-audit-tasks/M1-app-title-size.md)
- [M2 — Pre-match stake card depth](./ui-audit-tasks/M2-prematch-stake-depth.md)
- [M3 — Section header sizing](./ui-audit-tasks/M3-section-header-size.md)
- [M4 — Season week eyebrow](./ui-audit-tasks/M4-list-screen-eyebrow.md)
- [M5 — Footer safe-area](./ui-audit-tasks/M5-footer-safe-area.md)
- [M6 — Team selector grid](./ui-audit-tasks/M6-team-selector-grid.md)
- [M7 — Training stub](./ui-audit-tasks/M7-training-stub.md)
- [M8 — League toggle tap target](./ui-audit-tasks/M8-league-toggle-tap.md)
- [M9 — Live stats bars](./ui-audit-tasks/M9-live-stats-bars.md)

### Polish (6)
- [P1 — Commentary animation timing](./ui-audit-tasks/P1-commentary-anim.md)
- [P2 — League row hover](./ui-audit-tasks/P2-league-row-hover.md)
- [P3 — Stat bar consistency](./ui-audit-tasks/P3-stat-bar-consistency.md)
- [P4 — Phase badge breakpoint](./ui-audit-tasks/P4-phase-badge-width.md)
- [P5 — Back button transition](./ui-audit-tasks/P5-back-button-transition.md)
- [P6 — Round results pulse](./ui-audit-tasks/P6-round-pulse-timing.md)

---

## Companion docs

- [`CLAUDE-md-additions.md`](./CLAUDE-md-additions.md) — invariants to merge into your root `CLAUDE.md` so these rules survive future sessions
- [`PR-PLAN.md`](./PR-PLAN.md) — branch names, commit messages, review checklists

---

## Acceptance pattern

Each task file ends with an acceptance section in this format:

```
## Acceptance

- [ ] Specified files changed (and no others, unless explicitly listed)
- [ ] `pnpm typecheck` passes (or equivalent)
- [ ] No new console warnings
- [ ] Visual check: <screen> renders as described in the "Expected result" block
- [ ] No regression on other screens that share affected tokens/files
```

Claude Code should tick these boxes as part of each task PR.
