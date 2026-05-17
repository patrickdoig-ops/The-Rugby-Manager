# Design Guide

This guide documents the current Rugby Simulator UI. It is specific to this repo's DOM and CSS implementation.

For engine behaviour, formulas, and phase rules, use `engine.md`. For contributor workflow, versioning, and architecture constraints, use `CLAUDE.md`.

## Design Principles

- Keep the game readable during a live simulation.
- Prioritise stable, compact information over decorative layout.
- Use the same visual language across home, pre-match, match, commentary, stats, and modal surfaces.
- Keep numeric values steady with monospace, tabular numbers.
- Use team colour only where it clarifies identity or possession.
- Avoid visual changes that make live updates jump, wrap unexpectedly, or obscure match state.

## Architecture Implications

The UI is split into small modules under `src/ui/`. Each module owns one surface and updates in response to `eventBus` events.

| Module | UI responsibility |
|---|---|
| `AppShell.ts` | Static match shell injected into `#app` |
| `HomeScreen.ts` | Home overlay, version display, theme toggle, start button |
| `PreMatchScreen.ts` | Match preview, team tabs, player attribute rows |
| `Scoreboard.ts` | Team names, scores, clock, phase badge |
| `PitchStrip.ts` | Pitch zones, ball marker, end labels, attack direction |
| `CommentaryFeed.ts` | Live commentary entries, possession tint, phase colour accents |
| `StatsPanel.ts` | Match stats table plus player fatigue/rating rows |
| `SimController.ts` | Play, Pause, and speed controls |
| `ModalManager.ts` | Penalty choice modal |

Keep DOM ids and class names stable unless the owning module and CSS are updated together.

## Colour Tokens

All shared colours are CSS custom properties in `style/main.css`.

| Token | Default value | Purpose |
|---|---:|---|
| `--bg` | `#111111` | App background |
| `--surface` | `#0d0d0d` | Major panels and overlays |
| `--surface2` | `#1a1a1a` | Raised or nested surfaces |
| `--border` | `#333333` | Subtle borders |
| `--border-mid` | `#444444` | Stronger borders |
| `--text` | `#FFFFFF` | Primary text |
| `--text-sec` | `#CCCCCC` | Secondary text |
| `--text-muted` | `#888888` | Muted labels and captions |
| `--blue` | `#00BAFF` | Primary accent and lineout event colour |
| `--blue-dark` | `#005A8C` | Darker blue accent |
| `--blue-light` | `#001A26` | Blue tinted surface |
| `--green` | `#2ecc71` | Good outcomes, scrum event colour, fatigue OK |
| `--red` | `#e74c3c` | Penalties, poor outcomes, low fatigue |
| `--amber` | `#FFB800` | Tries, warnings, fatigue warning |
| `--purple` | `#A855F7` | Half-time and full-time accents |
| `--gold` | `#FFD700` | Scores, ball outline, high ratings |

`body.light-mode` overrides the same tokens for the light theme. The theme toggle in `HomeScreen.ts` persists `light-mode` in local storage under `rugby-manager-theme`.

Use tokens for colours wherever possible. Hardcoded colours currently exist only where the value is domain-specific or intentionally fixed, such as the pitch zones, team possession tints, ball colour, and the green start button border.

## Typography

Fonts are loaded in `index.html`:

- Inter for general UI text.
- Space Mono with JetBrains Mono fallback for live numbers.

Use `var(--font-sans)` for general UI and `var(--font-mono)` for changing numeric values. Live numbers should also use:

```css
font-variant-numeric: tabular-nums;
```

Current numeric surfaces include:

- Score values.
- Clock.
- Version number.
- Player ids.
- Player attributes.
- Match stat values.
- Fatigue and rating values.
- Commentary minute stamps.

## Layout

The app is a full-viewport single-page experience. `html`, `body`, and `#app` are locked to the viewport and hide browser scrollbars. Internal panels scroll where needed.

Primary flow:

1. `#home-screen` is a fixed overlay at z-index 300.
2. `#pre-match` is a fixed overlay at z-index 200.
3. `#app` contains the match shell underneath.

Match shell order:

1. `#scoreboard`
2. `#panel-pitch`
3. `#panel-bottom`
4. `#sim-controls`
5. `#modal-overlay`

Safe-area insets are used for mobile notches and home indicators. Preserve those rules when changing full-screen layouts.

## Screen Notes

### Home Screen

The home screen is intentionally sparse: title, version, start button, and theme toggle. The start button is the primary action and should remain visually distinct.

### Pre-Match

The pre-match screen is dense by design. It lets the user scan each team before kick-off:

- Header with match title and team matchup.
- Tabs for home and away rosters.
- Attribute legend grouped into Physical, Technical, and Mental.
- Compact player rows with id, surname, position, and stat cells.
- Fixed footer action to kick off.

Preserve the compact row layout; this screen needs to fit 15 players on small screens with minimal scrolling.

### Scoreboard

The scoreboard must remain stable during live updates. Scores and clock use monospace/tabular numbers. Team names are uppercase and truncated to avoid layout shifts.

### Pitch Strip

The pitch is a horizontal strip, not a detailed field. It communicates:

- Try zones.
- 22m zones.
- Halfway.
- Ball position as `ballX` percentage.
- Current attacking team and direction.

The ball marker should always transition smoothly and stay visually above pitch zones.

### Commentary

Commentary entries are prepended, with a maximum of 30 entries. Possession tint shows which side had the ball; phase-specific left borders highlight notable events.

Keep commentary text compact. Long entries reduce the usefulness of the live feed.

### Stats

Match stats are rendered as a compact table, with home and away values around a centre label. Player stats show fatigue bars and rating badges. Player stats update once per game minute to reduce unnecessary DOM churn.

### Modal

The modal is currently used for penalty choices. It should interrupt the simulation clearly without hiding the match context permanently. Choice buttons should contain both an action label and a short consequence.

## Motion

Motion is CSS-only:

- Commentary entries use `entryIn` over 0.18s.
- Pre-match exits with `pmSlideDown` over 0.3s.
- Ball marker movement transitions over 0.35s.
- Fatigue bars transition width over 0.5s.
- Buttons use short background or border transitions.

Keep motion functional and brief. It should help users track live changes, not compete with the simulation.

## Accessibility

- `:focus-visible` uses a blue outline token.
- Tap highlight is suppressed globally for a mobile-app feel.
- Text selection is disabled for normal UI and re-enabled for inputs, textareas, and editable content.
- The theme toggle has an `aria-label` that reflects the next action.
- Avoid conveying meaning through colour alone when adding new controls.

## Responsive Behaviour

The default CSS is mobile-first. Larger viewports are handled in `style/main.css` with media queries. When adding new UI, check both phone-sized and desktop-sized layouts.

Make fixed-format elements stable with explicit dimensions or responsive constraints. In particular:

- Do not let score, clock, phase, or button text resize their containers during play.
- Do not let player names or team names push numeric columns out of alignment.
- Prefer truncation for labels and surnames in dense panels.

## Do

- Use CSS variables from `style/main.css`.
- Use `var(--font-mono)` and tabular numbers for live numeric values.
- Keep each UI module responsible for one surface.
- Preserve the event-driven engine/UI boundary described in `CLAUDE.md`.
- Check `engine.md` before changing text that describes match behaviour.
- Keep live-match screens dense, legible, and stable.

## Don't

- Do not introduce new component libraries for small UI changes without discussion.
- Do not hardcode deploy-sensitive paths or asset bases.
- Do not reverse semantic colours: green is positive/OK, red is penalty/poor/low, amber is try/warning, purple is terminal phase.
- Do not add ornamental UI that reduces scannability during a match.
