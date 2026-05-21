# Design Guide

This guide documents the current Rugby Simulator UI — the "Match Day Editorial" design system. It is specific to this repo's DOM and CSS implementation.

For engine behaviour, formulas, and phase rules, use `docs/match-engine.md`. For contributor workflow, versioning, and architecture constraints, use `CLAUDE.md`.

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

### Stat Heatmap — palette

Five named hues used for player attribute values, player ratings, fatigue bars, and phase badges. Applied as `color` on numeric values. The tokens are a neutral palette — *which* hue means "elite" vs "poor" is set by the rating-tier mappings further down (see `.rating-*` and `.tier-*` tables), not by token ordinal.

| Token | Value | Hue | Typical use |
|---|---|---|---|
| `--rm-stat-1` | `oklch(0.55 0.18 25)` | Coral red | Errors, penalties, the very bottom of the rating scale |
| `--rm-stat-2` | `oklch(0.68 0.16 55)` | Amber | Below-average ratings, fatigue warn tier |
| `--rm-stat-3` | `oklch(0.78 0.14 95)` | Gold | **Top rating tier** — draws the eye to star-level numbers |
| `--rm-stat-4` | `oklch(0.76 0.20 144)` | Pitch green | Strong-but-not-elite ratings, fatigue ok tier |
| `--rm-stat-5` | `oklch(0.82 0.18 175)` | Cyan | Above-average ratings (one tier below green) |

Rating order from worst to best: amber → cyan → green → gold. Gold sits at the top so elite numbers pop; red is reserved for clearly poor / penalty signal.

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

## Elevation & Polish Patterns

Three reusable patterns lift surfaces and signal interactivity. Defined once in `style/main.css`, consumed by every screen.

### Card elevation — `--rm-card-shadow`

`:root` exposes a single multi-layer shadow that gives every panel / tile / card a uniform sense of depth:

```css
--rm-card-shadow:
  inset 0 1px 0 rgba(255, 255, 255, 0.055),  /* inner top highlight */
  0 2px 8px  rgba(0, 0, 0, 0.55),             /* close shadow */
  0 8px 28px rgba(0, 0, 0, 0.35);             /* ambient lift */
```

Applied to `.mr-card`, `.hub-tile`, `#hub-next-match`, `.lt-row`, `.rr-row`, `.ts-card`. Stub tiles (`.hub-tile--stub`) override to a flatter `0 1px 4px rgba(0,0,0,0.3)` to read as inactive.

### CTA pulse — `.cta-pulse`

A single shared `ctaPulse` keyframe breathes the primary CTA glow between two intensities every 2.4s. Add the `cta-pulse` class to any green primary button:

```css
@keyframes ctaPulse {
  0%, 100% { box-shadow: inset 0 1px 0 rgba(255,255,255,0.25),
                          0 8px 24px color-mix(in oklch, var(--rm-pitch) 30%, transparent); }
  50%      { box-shadow: inset 0 1px 0 rgba(255,255,255,0.25),
                          0 8px 36px color-mix(in oklch, var(--rm-pitch) 55%, transparent); }
}
.cta-pulse { animation: ctaPulse 2.4s ease-in-out infinite; }
```

Live on `#start-game-btn`, `#hub-play-next`, `#mr-continue`, `#rr-continue`, `#lt-continue`, `#pm-start`. Pressed / disabled states are unaffected — they continue to read their own pressed box-shadows.

### Crest glow

Large monogram crests (Hub, Match Result, Team Selector, Round Results, Hub next-match) carry an outer team-colour glow set inline at build time so the colour follows the team's identity:

```js
`box-shadow:
  0 0 18px color-mix(in oklch, ${team.color} 40%, transparent),
  inset 0 1px 0 rgba(255,255,255,0.18),
  0 6px 20px rgba(0,0,0,0.5);`
```

League-table crests (`.lt-crest`, 22×22) skip the glow — too noisy at row scale.

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
| Back navigation (any screen) | `arrow-left` | Outline (stroke-width 2) |
| Theme toggle — dark mode | `moon` | Outline |
| Theme toggle — light mode | `sun` | Outline |

### Back navigation

Every screen that pushes a forward navigation (Home → TeamSelector → FixtureList → PreMatch → live match) carries a back button in the top-left, rendered as the Heroicons `arrow-left` outline. The label names the **destination**, not the current screen (e.g. "Lobby" on Team Selector returns to Home; "Teams" on Fixture List returns to Team Selector). Stroke width is 2 — slightly heavier than the default 1.5 to match the chunky nav-bar feel.

Canonical markup:

```html
<button id="…-back" aria-label="Back">
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
       stroke="currentColor" stroke-width="2"
       stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M19 12H5M12 19l-7-7 7-7"/>
  </svg>
  <span>[destination label]</span>
</button>
```

Reference implementations: `#fl-back` (FixtureListScreen), `#pm-back` (PreMatchScreen), `#ts-back` (TeamSelectorScreen). All three share the same SVG path and the same button shape — copy from any of them when adding a back button to a new screen.

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

### Live match shell

`AppShell.ts` injects this static HTML skeleton:

```
#scoreboard                      — score grid (3 columns) + pitch strip (spans all 3)
  #score-home / #match-clock / #score-away
  #pitch-wrapper (grid-column: 1/-1)
    .end-label#home-end-label
    #pitch-field                 — striped pitch; lines at 8%/24%/50%/76%/92%
      #ball-marker               — SVG rugby ball (amber, drop-shadow); left set by PitchStrip
      #attack-label              — overlaid at bottom of pitch; shows shortName e.g. "LNS attacking →"
    .end-label#away-end-label
#view-toggle-bar                 — 4 icon-only Heroicon buttons; active one gets class "active"
  #btn-view-dashboard            — Squares2X2 icon
  #btn-view-commentary           — ChatBubbleLeftEllipsis icon
  #btn-view-stats                — ChartBar icon
  #btn-view-players              — UserGroup icon
#panel-bottom.view-{mode}        — class drives layout; switched by SimController
  #panel-commentary              — commentary feed (always present in DOM)
  #panel-stats                   — match stats only (#stats-content inside)
  #panel-players                 — player stats only (#player-stats-content inside)
#sim-controls / #ctrl-bar
```

`#panel-bottom` layout modes (class on the element):
- `view-dashboard` — CSS grid 3fr/2fr; commentary left, stats+players stacked right (1fr/1fr rows)
- `view-commentary` — flex column; stats and players `display:none`
- `view-stats` — flex column; commentary and players `display:none`
- `view-players` — flex column; commentary and stats `display:none`

`StatsPanel.ts` writes to `#stats-content` and `#player-stats-content` regardless of active view — live data always flows, only visibility changes. **Do not merge `#panel-stats` and `#panel-players` back into one element** — the separate IDs enable independent view modes.

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
| `.tier-elite` | `--rm-stat-3` (gold) | 88+ |
| `.tier-great` | `--rm-stat-4` (green) | 78–87 |
| `.tier-good` | `--rm-stat-5` (cyan) | 65–77 |
| `.tier-avg` | `--rm-stat-2` (amber) | 50–64 |
| `.tier-poor` | `--rm-stat-1` (red) | <50 |

These thresholds match `statColor()` in `src/ui/PreMatchScreen.ts`, which is the source of truth for per-stat colouring on the pre-match grid.

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
| `.rating-high` | `--rm-stat-3` (gold) | ≥ 7.5 |
| `.rating-mid` | `--rm-stat-4` (green) | 5.5–7.5 |
| `.rating-low` | `--rm-stat-5` (cyan) | 3.5–5.5 |
| `.rating-poor` | `--rm-stat-2` (amber) | <3.5 |

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

Typography inside modals uses `--rm-font-body` (Geist) throughout — no italic. `.modal-subtitle` and `.choice-desc` are both regular weight Geist at `--rm-text-muted` colour. Instrument Serif italic is reserved for the scoreboard clock, try commentary entries, and editorial moments — not interactive UI copy.

### Team Info

Reached from the team selector via a top-right info ⓘ button on each team card. The card itself is a `<div>` containing a nested `.ts-card-select` button (covers crest + name + code) and an absolutely positioned `.ts-card-info` button (32×32, top-right, transparent background, `--rm-text-dim` icon — surface-3 on hover/active).

Screen structure (`#team-info` → `#ti-inner`, max-width 540px, scrollable column, 28px gap):

- **Back button** `#ti-back` — fixed top-left, mirrors `#ts-back`/`#fl-back`/`#pm-back` pattern. Label "Back" since the origin varies (selector now; other team info screens later — closure-based back stack in `main.ts`, no global history).
- **Hero** `#ti-hero` — large 96px team crest (same gradient + inset shadow pattern as the selector, scaled), Anton team name `clamp(28px, 8vw, 40px)`, mono subline joining `nickname · Est. {founded}` (any absent field silently drops out, no dangling separators). Short-name and stadium intentionally not repeated here — both are surfaced elsewhere on the screen.
- **Tiles** `.ti-tiles` — explicit 2-column grid. Three tile variants:
  - `.ti-tile-full` spans both columns (Overall rating, Season form). Overall rating uses the full Anton 36px treatment in `--rm-pitch`; no foot text. Season form shows W-D-L in Anton 36px then `<played> played · <pts> pts · <±>PD` foot (only rendered when `seasonForm.played > 0`).
  - `.ti-tile-sm` takes one column with a smaller body-bold 20px value (Stadium capacity, Head coach). Min-height 100px and centred so the half-width tiles align visually. Stadium capacity shows the locale-formatted number with the venue name as foot; Head coach strips parenthetical role notes. Either is omitted if the underlying field is blank.
- **About** — narrative blurb from `team-data.md` in `--rm-font-body` 14px, `line-height: 1.55`.
- **Playing style** — `.ti-tactics-grid` 2-column, each `.ti-tactic-chip` showing the dimension label (mono, dim) above the human-readable tactic name (body, 13px, chalk, semi-bold). Stat-bias pills below in `--rm-pitch` pill style (lowercase mono on `pitch 14%` tint).
- **Star players** — `.ti-star` cards: name + Anton 22px suggested-rating top-right, position · nationality subline, body blurb, indexHigh pills.
- **Honours** — `.ti-honours` paragraph in `--rm-surface` panel with a `--rm-pitch` 3px left-border accent. 13px body, 1.6 line-height. Section omitted if `team-data.md` has no honours line.
- **Squad** — collapsible `<details>` sections (Starting XV / Bench / Wider squad). Each row: mono squad number · name · mono position · Anton overall (in `--rm-pitch`). Summary chevron handled by `<details>` default with custom marker hidden.

Overall rating on the rating tile is the team's top-23 player-overall average, computed at read time by `src/team/teamProfile.ts:computeOverallRating`. Form tile is hidden when `seasonForm.played === 0`.

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

### End-of-Season + Off-Season (paired)

Both screens share `style/seasonrollover.css` — they're the post-final-round flow's two halves. Full-screen `position: fixed`, `z-index: 225`, `--rm-bg` background, safe-area padding identical to the rest of the in-season screens.

**EndOfSeasonScreen** (`#end-of-season`) — final standings + awards (top scorer, MVP) with the player's club row highlighted via the same `--me`-tinted treatment as the league table. Forward CTA "Continue → Off-Season".

**RolloverScreen** (`#rollover`) — off-season diff: retirements and per-player stat deltas for the player's squad. Deltas render as inline pills tagged `roll-delta-pos` / `roll-delta-neg`, scoped to the standard heatmap accents (green = positive growth, coral = decline). Forward CTA "Begin {next-season-label}".

No back navigation on either screen — they sit on a forward-only spine that lands the user on the new season's Hub.

### Contracts

`style/contracts.css`, `#contracts`. Read-only tabular list of the player's senior squad, columns: name / position / age / OVR / wage / expiry / marquee star. Header buttons are sortable. Wage values render with `fmtWage()` (£M for ≥1M, £k for ≥1k). Cap usage shows as a dimmed pill at the top right (`ct-cappill`) — non-marquee wage sum vs `SENIOR_CAP`, no enforcement until Phase 3 of the transfer system.

Expiry chips: `ct-expiring` flag (rendered next to the date) when expiry is within ten months of the current calendar date. Marquee row gets a subtle `--marquee` tint (slight gold wash on the row, gold star icon in the flag column).

Hub-stack screen: back arrow returns to Hub. Reached via the Hub's Contracts tile.

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
