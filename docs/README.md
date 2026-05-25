# UI Audit v2.0 — Handoff Package

This folder contains everything needed to take the May 2026 UI audit from "design review" to "merged PRs."

## Files

| Path | Purpose |
|---|---|
| `UI-AUDIT-v2.md` | Master brief. Start here. Indexes all 27 issues and groups them into 3 PRs. |
| `PR-PLAN.md` | Branch names, commit messages, and review checklists for each PR. |
| `CLAUDE-md-additions.md` | Architectural invariants to merge into the root `CLAUDE.md` so these rules survive future sessions. |
| `ui-audit-tasks/*.md` | One file per issue. The unit of work for Claude Code. |

## Visual audit reference

The fully visual audit lives at `/Design Review.html` (project root). Open in a browser to see the screen-by-screen breakdown with mockups, severity badges, and the colour token swatches.

## Quick start

```bash
# Read the brief
cat docs/UI-AUDIT-v2.md

# Work the first task
claude code "Read docs/ui-audit-tasks/C1-rm-danger-token.md and implement the fix."

# When PR 1 is ready
cat docs/PR-PLAN.md  # see commit list and review checklist
```

## Conventions

- Task IDs (`C1`, `H3`, `M5`, `P2`) match the visual audit. Use them in commit messages: `fix(contracts): align injury tag to --rm-danger (#H3)`.
- Severity prefixes: **C**ritical, **H**igh, **M**edium, **P**olish.
- Each task file has an "Acceptance" section. Tick the boxes as you go.
