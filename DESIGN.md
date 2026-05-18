# Design Guide

This guide documents the current Rugby Simulator UI — the "Match Day Editorial" design system. It is specific to this repo's DOM and CSS implementation.

For engine behaviour, formulas, and phase rules, use `engine.md`. For contributor workflow, versioning, and architecture constraints, use `CLAUDE.md`.

## Design Principles

- Broadcast-grade dark aesthetic: atmospheric, data-dense, live.
- Prioritise stable, compact information over decorative layout.
- Use typographic contrast (display / editorial / mono) to signal different kinds of information at a glance.
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
| `Scoreboard.ts` | Team crests, codes, scores, clock, phase badge |
| `PitchStrip.ts` | Pitch zones, ball marker, end labels, attack direction |
| `CommentaryFeed.ts` | Live commentary entries, event tags, possession tint |
| `StatsPanel.ts` | Dual-bar match stats and player fatigue/rating rows |
| `SimController.ts` | Play, Pause, and speed controls |
| `ModalManager.ts` | Penalty choice modal |

Keep DOM ids and class names stable unless the owning module and CSS are updated together.

## Typography

Fonts are loaded in `index.html` from Google Fonts:

| Variable | Family | Use |
|---|---|---|
| `var(--rm-font-display)` | Anton, Bebas Neue, Impact | Large impact moments: home screen title, scores, CTA labels |
| `var(--rm-font-editor)` | Instrument Serif, Georgia | Editorial italic moments: scoreboard clock, try commentary, home tagline |
| `var(--rm-font-body)` | Geist, Helvetica Neue, system-ui | General UI: labels, buttons, navigation |
| `var(--rm-font-mono)` | JetBrains Mono, ui-monospace | All live numbers, codes, tags, minute stamps |

`var(--font-sans)` and `var(--font-mono)` are mapped to the new families for legacy compatibility.

**Rule:** All live numeric values — scores, clock, stat values, player ratings, commentary minutes — must use:
```css
font-family: var(--rm-font-mono);
font-variant-numeric: tabular-nums;
```

**Rule:** Do not use display or editorial fonts for body copy. Display type is for moments of impact only.

## Colour System

All colours use the `oklch()` colour space, defined as `--rm-*` custom properties in `style/main.css`. Legacy tokens (`--bg`, `--surface`, `--text`, etc.) are mapped to `--rm-*` values for backward compatibility.

### Background / Surface Hierarchy

| Token | Value | Purpose |
|---|---|---|
| `--rm-bg-deep` | `oklch(0.12 0.010 150)` | Deepest background: scoreboard gradient base, controls bar gradient |
| `--rm-bg` | `oklch(0.16 0.012 150)` | App background floor |
| `--rm-surface` | `oklch(0.205 0.013 150)` | Major panels |
| `--rm-surface-2` | `oklch(0.245 0.014 150)` | Raised panels, panel headers, modal |
| `--rm-surface-3` | `oklch(0.295 0.015 150)` | Active/hover states |

All surfaces have a subtle green undertone (hue 150) to tie the palette to the pitch.

### Border Tokens

| Token | Value | Purpose |
|---|---|---|
| `--rm-border` | `oklch(0.32 0.012 150)` | Structural dividers |
| `--rm-border-soft` | `oklch(0.27 0.010 150)` | Softer borders: button outlines, modal |
| `--rm-divider` | `oklch(0.38 0.015 150)` | Stronger rule lines |
| `--rm-hairline` | `color-mix(in oklch, chalk 8%, transparent)` | Near-invisible separators in feeds and panels |

### Text Tokens

| Token | Value | Purpose |
|---|---|---|
| `--rm-chalk` | `oklch(0.97 0.008 90)` | Maximum contrast text: scores, headings, highlighted values |
| `--rm-text` | `oklch(0.95 0.008 90)` | Primary body text |
| `--rm-text-muted` | `oklch(0.68 0.012 150)` | Secondary labels, helper text |
| `--rm-text-dim` | `oklch(0.50 0.012 150)` | Tertiary labels, codes, tags |
| `--rm-text-faint` | `oklch(0.38 0.012 150)` | Barely-visible decorative text |

### Accent Tokens

| Token | Value | Purpose |
|---|---|---|
| `--rm-pitch` | `oklch(0.76 0.21 144)` | Vivid broadcast green — primary brand accent: CTAs, active states, live indicators |
| `--rm-pitch-deep` | `oklch(0.55 0.18 144)` | Deeper green for gradients and hover |
| `--rm-pitch-soft` | `oklch(0.30 0.08 144)` | Very subtle green tint for backgrounds |
| `--rm-pitch-glow` | `color-mix(rm-pitch 38%, transparent)` | Box-shadow / glow at reduced opacity |
| `--rm-amber` | `oklch(0.74 0.16 62)` | Tries, penalties, warnings |
| `--rm-amber-deep` | `oklch(0.58 0.16 50)` | Deeper amber for ball gradients |

### Stat Heatmap — 5-tier scale

Used for player attribute values, player ratings, and animated bars. Applied as `color` on numeric values.

| Token | Value | Range | Meaning |
|---|---|---|---|
| `--rm-stat-1` | `oklch(0.55 0.18 25)` | Poor | Coral red |
| `--rm-stat-2` | `oklch(0.68 0.16 55)` | Below average | Amber |
| `--rm-stat-3` | `oklch(0.78 0.14 95)` | Average | Chartreuse |
| `--rm-stat-4` | `oklch(0.76 0.20 144)` | Good | Pitch green |
| `--rm-stat-5` | `oklch(0.82 0.18 175)` | Elite | Cyan |

### Pitch Strip Tokens

Used exclusively by the pitch strip. Do not use outside `PitchStrip` context.

| Token | Value | Zone |
|---|---|---|
| `--pitch-try` | `oklch(0.15 0.04 144)` | Try zones (5% each end) |
| `--pitch-22` | `oklch(0.20 0.06 144)` | 22m zones (17% each) |
| `--pitch-mid` | `oklch(0.24 0.08 144)` | Midfield zone (56%) |

### Semantic Colour Aliases (legacy tokens)

| Legacy token | Maps to | Role |
|---|---|---|
| `--green` | `--rm-pitch` | Positive outcomes, scrum events |
| `--red` | `--rm-stat-1` | Penalties, errors, fatigue-low |
| `--amber` | `--rm-amber` | Tries, warnings, fatigue-warning |
| `--gold` | `--rm-amber` | Retained for backward compatibility |
| `--blue` | `oklch(0.70 0.18 248)` | Lineout events, active tactic states |
| `--purple` | `oklch(0.64 0.22 302)` | Half/full-time events |

### Light Mode

`body.light-mode` overrides all `--rm-*` tokens with a clean white variant. The palette inverts: near-white backgrounds, near-black text, slightly darker pitch greens and ambers for contrast. The theme toggle in `HomeScreen.ts` persists `light-mode` in local storage under `rugby-manager-theme`.

Key light mode overrides:
- `--rm-bg` → `oklch(0.98 0.004 150)` (near white with faint green undertone)
- `--rm-surface` → `oklch(1.0 0 0)` (pure white)
- `--rm-chalk` → `oklch(0.12 0.012 150)` (near black)
- `--rm-pitch` → `oklch(0.46 0.18 144)` (darker green for contrast)
- Stat heatmap tokens shift to lower lightness values for legibility on white

### Hardcoded Colour Exceptions

These values are intentionally fixed and must not be replaced with tokens:

| Value | Use |
|---|---|
| `#007a2a` | Primary CTA background |
| `#009434` | Primary CTA hover |
| `#006622` | Primary CTA active/pressed |
| `#7a3a10` | Ball fill colour |
| Team identity colours | Set inline from team JSON data |

## Colour Usage Rules

- Use `color-mix(in oklch, <token> <pct>, transparent)` for semi-transparent tints. Do not use `rgba()` with hardcoded hex values for tinted surfaces.
- Do not reverse semantic direction: pitch green = positive/active, red = error/poor, amber = event/warning, purple = terminal phase.
- Do not add new surface colours without adding them to `:root` in `style/main.css`.

## Button Patterns

### Button System Rules

Two patterns govern all buttons in the app based on how many actions appear together:

**Single action (full-width CTA):** When a view or modal has one primary action, the button spans the full available width. The label is always in block capitals (`text-transform: uppercase`, `letter-spacing: 0.06–0.08em`). Examples: "RESUME MATCH", "KICK OFF", "START GAME". Use the primary CTA green spec for positive actions.

**Multi-button row (icon-led pair):** When two actions appear side by side (confirm/cancel), each button leads with a Heroicons SVG icon (`width="16" height="16"`, `pointer-events: none`) followed by a short uppercase label. Both use `flex: 1`. Confirm uses primary CTA green; Cancel uses secondary/neutral.

Standard icon assignments for paired buttons:
- Cancel / Dismiss: `x-mark` outline (`M6 18 18 6M6 6l12 12`)
- Confirm / Apply: `check` outline (`m4.5 12.75 6 6 9-13.5`)

CSS class pattern for multi-button rows:
```css
.sub-action-btn      /* shared base: flex, gap, padding, font, uppercase */
.sub-action-cancel   /* surface-2 fill, soft border, muted text */
.sub-action-confirm  /* #007a2a fill, white text, pitch glow shadow */
```

### Primary CTA — pitch green, dark text

The primary CTA is used for the single most important action on each screen. It uses the hardcoded green spec (not a token) and must remain visually dominant.

**Spec:**
```css
background: #007a2a;
border: none;
color: #ffffff;         /* or --rm-bg-deep for dark-on-green */
border-radius: 16px;
box-shadow: 0 12px 36px color-mix(in oklch, var(--rm-pitch) 28%, transparent),
            inset 0 1px 0 rgba(255,255,255,0.3);
```

For the home screen CTA, the label uses Anton display font at 28px. For smaller CTAs (Kick Off, Resume), use the body font, bold, uppercase.

Hover (desktop):
```css
background: #009434;
```

Active:
```css
background: #006622;
```

**Used on:** `#start-game-btn`, `#pm-start`, `.ctrl-btn.primary`, `.tactics-resume-btn`

### Secondary / Neutral — surface fill, soft border

```css
background: var(--rm-surface-2);
border: 1px solid var(--rm-border-soft);
color: var(--rm-text-muted);
border-radius: 10px;
```

Hover (desktop): `background: var(--rm-surface-3)`

**Used on:** `.ctrl-btn` (Pause, Tactics), `#theme-toggle`, `.modal-choice-btn`

### Monogram Crest Tile

Team identity tiles used in the scoreboard. Background is set inline from team JSON colour data.

```css
.team-crest {
  width: 38–44px; height: 38–44px;
  border-radius: 8px;
  font-family: var(--rm-font-display);
  /* gradient + border-color set inline via JS in Scoreboard.ts */
}
```

The gradient pattern:
```js
`linear-gradient(160deg, ${color} 0%, color-mix(in oklch, ${color} 65%, black) 100%)`
```

A `::after` pseudo-element adds a `linear-gradient(180deg, transparent 50%, rgba(0,0,0,0.18) 100%)` shadow overlay. The letter inside is wrapped in `<span>` so it sits above the overlay at `z-index: 1`.

## Icons

All icons use inline SVGs from [Heroicons](https://heroicons.com/). Do not use emoji, Unicode symbols, or any icon font.

- **Solid style** (`fill="currentColor"`) for action icons: play, pause.
- **Outline style** (`stroke="currentColor"`, `stroke-width="1.5"`) for settings and label icons: tactics, navigation.

SVGs inside buttons must carry `pointer-events: none` so clicks pass through. The global rule `.ctrl-btn svg { pointer-events: none; flex-shrink: 0; }` in `style/main.css` covers sim controls; add a matching rule for any new button context wrapping an SVG.

Current icon assignments:

| Location | Icon | Style |
|---|---|---|
| Sim controls — Play | `play` | Solid |
| Sim controls — Pause | `pause` | Solid |
| Sim controls — Tactics | `adjustments-horizontal` | Outline |
| Home screen — Start Game (arrow) | `arrow-right` | Outline (stroke-width 2.5) |
| Pre-match — back nav | `arrow-left` | Outline |
| Theme toggle — dark mode | `moon` | Outline |
| Theme toggle — light mode | `sun` | Outline |

## Layout

The app is a full-viewport single-page experience. `html`, `body`, and `#app` are locked to the viewport and hide browser scrollbars. Internal panels scroll where needed.

Primary overlay stack (z-index order):

1. `#home-screen` — fixed overlay, z-index 300
2. `#pre-match` — fixed overlay, z-index 200
3. `#modal-overlay` — fixed overlay, z-index 100
4. `#app` — match shell underneath

Match shell order (mobile: flex column; desktop: CSS grid with named areas):

1. `#scoreboard`
2. `#panel-pitch`
3. `#panel-bottom` (two columns: commentary 3fr, stats 2fr)
4. `#sim-controls`

Safe-area insets (`env(safe-area-inset-*)`) are applied to all full-screen layers. Preserve those rules when changing full-screen layouts.

## Screen Notes

### Home Screen

The home screen uses an atmospheric pitch design to establish mood before the simulation starts.

**Visual structure (top to bottom):**
- Background: `--rm-bg-deep` base with two radial gradient glows (pitch green ellipse centred high, dark vignette at the bottom) plus a `repeating-linear-gradient` for faint pitch stripe texture.
- Decorative SVG: `<svg class="home-pitch-lines">` — pitch line markings (halfway line, 22m lines, centre circle) at `opacity: 0.15`, `position: absolute; inset: 0`.
- `#home-chrome`: live status dot + version text on the left; `#theme-toggle` on the right.
- `#home-hero`: eyebrow label (`--rm-font-mono`, pitch green), `#home-title` (Anton, `clamp(72px, 22vw, 96px)`, `line-height: 0.86`, `--rm-chalk`), version badge pill, `#home-tagline` (Instrument Serif italic, 20px, `--rm-text-muted`).
- `#home-cta`: full-width primary CTA (`#start-game-btn`) with Anton "Start Game" label and arrow icon.

**Live dot:** `8px × 8px` circle, `background: var(--rm-pitch)`, `box-shadow: 0 0 12px var(--rm-pitch)`.

### Pre-Match

Dense by design. Lets the user scan each team before kick-off.

- Header: mono eyebrow (`--rm-text-dim`), Anton team badges coloured with team identity colour, Instrument Serif italic "vs", tab bar.
- Tabs active state: `color: var(--rm-chalk)`, `border-bottom-color: var(--tc, var(--rm-pitch))`.
- Attribute legend: `--rm-font-mono`, `--rm-text-dim`.
- Player rows: surname + position, compact attribute cells with heatmap colours.
- Footer: `background: var(--rm-surface)`, `border-top: 1px solid var(--rm-hairline)`, primary CTA.

Attribute cell tier colours use the stat heatmap tokens:

| Class | Token | Range |
|---|---|---|
| `.tier-elite` | `--rm-stat-5` | 90+ |
| `.tier-great` | `--rm-stat-4` | 80–89 |
| `.tier-good` | `--rm-stat-3` | 70–79 |
| `.tier-avg` | `--rm-stat-2` | 60–69 |
| `.tier-poor` | `--rm-text-dim` | <60 |

### Scoreboard

Must remain stable during live updates. Key visual elements:

**Team sides:** each side is `display: flex; align-items: center; gap: 8px`. Home side: `[crest][score-block]`. Away side: `[score-block][crest]` (reversed).

**Crest tile:** 38–44px square, `border-radius: 8px`, gradient background + semi-transparent border set inline via `Scoreboard.ts` on the first `engine:stateChange` (one-shot initialisation, since team data is fixed for the match).

**Team code:** `--rm-font-mono`, 9px, `letter-spacing: 0.16em`, coloured with team identity colour.

**Score:** Anton display font, 42px mobile / 52px desktop, `--rm-chalk`, `line-height: 0.9`. Rendered zero-padded: `String(score).padStart(2, '0')`.

**Clock:** `#clock-display` uses Instrument Serif italic, 24px mobile / 30px desktop, `--rm-pitch`. The Instrument Serif italic treatment communicates "live, in-the-moment" versus the static display font scores.

**Scoreboard background:** `linear-gradient(180deg, rm-bg-deep 0%, rm-bg 100%)` — a subtle gradient toward the base surface. No hardcoded team-colour gradient (unlike the old design).

**Phase badge** (`.phase-badge`): `--rm-font-mono`, 8px, uppercase, positioned below the clock. Colour-coded by phase:

| Class | Colour | Use |
|---|---|---|
| `.phase-try` | `--rm-amber` | TryScored, ConversionKick |
| `.phase-penalty` | `--rm-stat-1` | Penalty |
| `.phase-scrum` | `--rm-pitch` | Scrum |
| `.phase-kick` | `--blue` | Lineout, BoxKick, TacticalKick, KickOff |
| `.phase-terminal` | `--purple` | HalfTime, FullTime |

Each badge uses `color-mix(in oklch, <token> 14%, transparent)` background and `color-mix(in oklch, <token> 45%, transparent)` border.

### Pitch Strip

Horizontal strip below the scoreboard. Zone widths: try 5% | 22m 17% | midfield 56% | 22m 17% | try 5%. Zone colours use `--pitch-try`, `--pitch-22`, `--pitch-mid`. The midfield zone adds a `repeating-linear-gradient` mow-stripe overlay.

**Ball marker:** `20px × 13px` oval, `#7a3a10` fill, `--rm-amber` 2px border, two-stop `box-shadow` (amber glow at 85% + faint outer halo at 22%). Transitions `left` over 0.35s ease.

### Commentary

Entries are prepended (max 30). Each entry is a **3-column CSS grid**:

```
grid-template-columns: 30px 34px 1fr
```

Columns: minute | event tag | text

**Minute:** `--rm-font-mono`, 10px, `--rm-text-dim`. The most-recent entry (`:first-child`) gets `--rm-pitch` + `font-weight: 700`.

**Event tag:** `--rm-font-mono`, 8px, uppercase, `letter-spacing: 0.12em`. Colour varies by entry class.

**Text:** 12px, `--rm-text`.

Entry classes set both the tag colour and (for TRY) the text style:

| Class | Tag | Tag colour | Text style |
|---|---|---|---|
| `.event-try` | `TRY` | `--rm-pitch` | Instrument Serif italic, 13.5px, `--rm-chalk` |
| `.event-penalty` | `PEN` | `--rm-amber` | Normal |
| `.event-conversion` | `CON` | `--rm-pitch` | Normal |
| `.event-scrum` | `SCR` | `--rm-pitch` at 70% opacity | Normal |
| `.event-lineout` | `LNO` | `--blue` | Normal |
| `.event-kickoff` | `KO` | `--rm-text-dim` | Normal |
| `.event-halftime` | `HT` | `--purple` | Bold chalk |
| `.event-fulltime` | `FT` | `--purple` | Bold chalk |
| (other) | `·` | `--rm-text-dim` | Normal |

Player names are colourised inline with team identity colours via `colorizePlayer()` in `CommentaryFeed.ts`. Player format is `"Name (#N)"`.

### Match Stats

The stats panel uses **dual proportional bars** rather than a table. Each stat row has:

1. **Header row:** `36px | 1fr | 36px` grid — home value (right-aligned), label (centred, mono uppercase), away value (left-aligned). The winning side's value gets `.stat-winner` (chalk colour); the losing side is `--rm-text-muted`.

2. **Bar row:** `display: flex; height: 3px`. Two `div`s side-by-side with widths proportional to each team's raw count. Bar colours are set inline from team JSON data. Winning side at `opacity: 1`; losing side at `opacity: 0.4`.

For inverted stats (e.g. Errors, where lower is better), winning logic reverses.

Stat labels: `--rm-font-mono`, 8px, uppercase, `letter-spacing: 0.12em`, `--rm-text-dim`. Always `white-space: nowrap`.

### Player Stats

Updated once per game minute using DOM patching (not full re-render) for performance. Layout: **4-column grid** `22px | 1fr | 36px | 28px` — jersey number | surname | fatigue bar | rating.

**Jersey number:** `--rm-font-mono`, 9px, coloured with team identity colour.

**Fatigue bars** use gradients from the stat heatmap tokens:

| Class | Gradient | Condition |
|---|---|---|
| `.fatigue-ok` | `stat-4 70% → stat-4` | ≥ 60% stamina |
| `.fatigue-warn` | `stat-2 70% → stat-2` | 30–60% stamina |
| `.fatigue-low` | `stat-1 70% → stat-1` | <30% stamina |

**Rating badges:** `--rm-font-mono`, 10px, right-aligned. Colour only (no background fill), using heatmap tokens:

| Class | Token | Rating |
|---|---|---|
| `.rating-high` | `--rm-stat-5` | ≥ 7.5 |
| `.rating-mid` | `--rm-stat-4` | 5.5–7.5 |
| `.rating-low` | `--rm-stat-3` | 3.5–5.5 |
| `.rating-poor` | `--rm-stat-2` | <3.5 |

### Sim Controls

The controls bar uses a **frosted glass card** pattern. The outer `#sim-controls` has a gradient fade from transparent to `--rm-bg-deep`. The inner `#ctrl-bar` is the glass card:

```css
background: color-mix(in oklch, var(--rm-surface) 92%, transparent);
backdrop-filter: blur(20px) saturate(160%);
-webkit-backdrop-filter: blur(20px) saturate(160%);
border: 1px solid var(--rm-hairline);
border-radius: 14px;
```

The Play button (`.ctrl-btn.primary`) glows: `box-shadow: 0 0 16px color-mix(in oklch, var(--rm-pitch) 45%, transparent)`.

### Modal

The penalty modal slides up from the bottom on mobile (`sheetUp` animation) and scales in as a centred dialog on desktop (`modalIn` animation). Backdrop: `rgba(0,0,0,0.72)` with `backdrop-filter: blur(6px)`.

Choice buttons use the secondary/neutral pattern. On active/hover they gain `var(--rm-pitch)` border-color.

### Tactics Menu

Active tactic card:
```css
background: color-mix(in oklch, var(--rm-pitch) 18%, var(--rm-surface));
border-color: var(--rm-pitch);
box-shadow: 0 0 14px color-mix(in oklch, var(--rm-pitch) 18%, transparent);
```

Active label colour: `var(--rm-pitch)`. A 4px left accent bar via `::before`.

The Resume button uses the primary CTA pattern.

The title uses `--rm-pitch` colour (not `--rm-amber` / old gold).

## Motion

Motion is CSS-only:

- Commentary entries: `entryIn` 0.18s (slide from -4px + fade).
- Pre-match exit: `pmSlideDown` 0.3s.
- Modal sheet: `sheetUp` 0.22s `cubic-bezier(0.22, 1, 0.36, 1)`.
- Modal desktop dialog: `modalIn` 0.22s (same easing, scale from 0.92).
- Ball marker: `left` transitions over 0.35s ease.
- Fatigue bars: `width` transitions over 0.5s ease.
- Phase badge: `background`, `border-color`, `color` over 0.25s.
- Buttons: `background`, `box-shadow` over 0.12–0.15s.
- Live dot: `rmPulse` keyframe — `opacity: 1 → 0.35 → 1` over 1.8s.

Keep motion functional and brief. It should help users track live changes, not compete with the simulation.

## Accessibility

- `:focus-visible` uses a 2px solid `var(--rm-pitch)` outline.
- Tap highlight suppressed globally (`-webkit-tap-highlight-color: transparent`).
- Text selection disabled globally; re-enabled on `input`, `textarea`, `[contenteditable]`.
- The theme toggle has an `aria-label` that reflects the next action.
- Decorative SVGs carry `aria-hidden="true"`.
- Do not convey meaning through colour alone.

## Responsive Behaviour

Mobile-first CSS. Desktop layout (≥ 700px) in each file's `@media (min-width: 700px)` block. On desktop, `#app` switches from flex column to CSS grid with named areas.

Stability rules:
- Scores, clock, phase badge, and button labels must never cause their container to resize during play.
- Player names and team names must truncate (`overflow: hidden; text-overflow: ellipsis; white-space: nowrap`), not reflow.
- Hover rules only inside desktop media queries — no hover states on mobile.

## Do

- Use `--rm-*` tokens from `style/main.css` for all colours.
- Use `var(--rm-font-mono)` and `font-variant-numeric: tabular-nums` for all live numeric values.
- Use `color-mix(in oklch, <token> <pct>, transparent)` for semi-transparent tints.
- Use Anton for display/impact moments, Instrument Serif italic for editorial/live moments, JetBrains Mono for all numbers.
- Use Heroicons inline SVGs for all iconography; solid for actions, outline for settings.
- Keep each UI module responsible for one surface.
- Preserve the event-driven engine/UI boundary described in `CLAUDE.md`.
- Zero-pad score values: `String(score).padStart(2, '0')`.

## Don't

- Do not use emoji or Unicode symbols in the UI — use Heroicons inline SVGs.
- Do not use `rgba()` with hardcoded hex for tinted surfaces — use `color-mix(in oklch, ...)`.
- Do not hardcode any colour except the three CTA green values (`#007a2a`, `#009434`, `#006622`), the ball fill (`#7a3a10`), and team identity colours injected from JSON.
- Do not use display font (Anton) for body copy or labels — only for scores, headings, and CTA text.
- Do not reverse semantic colours: pitch green = positive/active, red = error/poor, amber = event/warning, purple = terminal phase.
- Do not add ornamental UI that reduces scannability during a match.
- Do not add new surface colours without adding them as tokens to `:root`.
- Do not use `transform: translateY(...)` on button `:active` states.
- Do not introduce the `--blue` filled pattern for primary CTAs — use the dark green hardcoded spec exclusively.
