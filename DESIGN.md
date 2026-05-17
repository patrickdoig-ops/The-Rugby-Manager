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

### Background / Surface Hierarchy

Surfaces get progressively lighter as they are more elevated. Always use the next level up for a raised or nested element.

| Token | Dark value | Purpose |
|---|---|---|
| `--bg` | `#090c14` | App background — the floor everything sits on |
| `--surface` | `#0f1420` | Major panels: scoreboard, sim controls, pre-match header/footer |
| `--surface2` | `#161d2e` | Raised panels: panel headers, clock pill, modal box |
| `--surface3` | `#1e2538` | Deepest raised elements: active ctrl-btn states |

### Border Tokens

| Token | Dark value | Purpose |
|---|---|---|
| `--border` | `#1c2538` | Subtle structural dividers |
| `--border-mid` | `#28345a` | Stronger borders: clock pill, panel headers, footer separators |

### Text Tokens

| Token | Dark value | Purpose |
|---|---|---|
| `--text` | `#e2e8f8` | Primary text |
| `--text-sec` | `#8a98bc` | Secondary text, team names |
| `--text-muted` | `#485070` | Muted labels and captions |

### Accent / Semantic Tokens

| Token | Dark value | Purpose |
|---|---|---|
| `--blue` | `#4d9fff` | Accents, lineout events, active tactic selection |
| `--blue-dark` | `#1a3a6e` | Hover border for tactic option buttons |
| `--blue-light` | `#0d1a35` | Active tactic card background tint |
| `--green` | `#00d97e` | Good outcomes, scrum events, fatigue-ok bars |
| `--red` | `#ff4d5e` | Penalties, poor outcomes, fatigue-low bars |
| `--amber` | `#ffb52e` | Tries, warnings, fatigue-warning bars |
| `--purple` | `#b06aff` | Half-time and full-time events |
| `--gold` | `#ffd040` | Scores, ball outline, high ratings |

### Pitch Tokens

Pitch zone colours are defined in `:root` and used exclusively by the pitch strip. Do not use these tokens outside `PitchStrip` context.

| Token | Dark value | Zone |
|---|---|---|
| `--pitch-try` | `#0a300e` | Try zones (5% each end) |
| `--pitch-22` | `#0e3d14` | 22m zones (17% each) |
| `--pitch-mid` | `#11481a` | Midfield zone (56%) |

### Light Mode

`body.light-mode` overrides all tokens with lighter equivalents. The theme toggle in `HomeScreen.ts` persists `light-mode` in local storage under `rugby-manager-theme`. Light mode token values:

| Token | Light value |
|---|---|
| `--bg` | `#f0f3fc` |
| `--surface` | `#ffffff` |
| `--surface2` | `#e8eef8` |
| `--surface3` | `#dde5f5` |
| `--border` | `#ccd5ee` |
| `--border-mid` | `#b0bcdc` |
| `--text` | `#0c1220` |
| `--text-sec` | `#3a4a72` |
| `--text-muted` | `#7080a8` |
| `--blue` | `#2563eb` |
| `--blue-dark` | `#1e40af` |
| `--blue-light` | `#dbeafe` |
| `--green` | `#059669` |
| `--red` | `#dc2626` |
| `--amber` | `#d97706` |
| `--purple` | `#7c3aed` |
| `--gold` | `#b45309` |
| `--pitch-try` | `#14532d` |
| `--pitch-22` | `#166534` |
| `--pitch-mid` | `#15803d` |

Use tokens for colours wherever possible. Hardcoded colours are acceptable only where the value is domain-specific or intentionally fixed: team identity colours in the scoreboard gradient, possession tints, ball colour (`#7a3a10` with `--gold` border), and the primary CTA green (`#007a2a`/`#009434`/`#006622`).

## Button Patterns

### Primary CTA — dark green, white text

The primary CTA pattern is used for the single most important action on each screen. It must always be visually dominant.

**Exact spec:**

```css
background: #007a2a;
border: 1px solid rgba(255,255,255,0.12);
color: #ffffff;
font-family: var(--font-sans);
font-weight: 700;
text-transform: uppercase;
letter-spacing: 0.05em;
border-radius: 12px;
box-shadow: 0 4px 24px rgba(0,122,42,0.45), inset 0 1px 0 rgba(255,255,255,0.10);
transition: background 0.15s, box-shadow 0.15s;
```

Hover (desktop only):
```css
background: #009434;
box-shadow: 0 6px 32px rgba(0,148,52,0.60);
```

Active:
```css
background: #006622;
box-shadow: none;
```

**Used on:**
- `#start-game-btn` — home screen Start Game (`style/homescreen.css`)
- `#pm-start` — pre-match Kick Off (`style/prematch.css`)
- `.ctrl-btn.primary` — sim controls Play button (`style/main.css`, slightly tighter shadow)
- `.tactics-resume-btn` — tactics panel Resume (`style/tactics.css`)

### Secondary / Neutral — surface fill, mid border

Used for non-primary actions that should not compete visually with the primary CTA.

```css
background: var(--surface2);
border: 1px solid var(--border-mid);
color: var(--text-sec);
border-radius: 8px;
```

Hover (desktop):
```css
background: var(--surface3);
```

**Used on:** `.ctrl-btn` (Pause, speed adjust), `#theme-toggle`, `.modal-choice-btn` (penalty options).

## Typography

Fonts are loaded in `index.html`:

- Inter (`var(--font-sans)`) for general UI text.
- Space Mono with JetBrains Mono fallback (`var(--font-mono)`) for live numbers.

Use `var(--font-sans)` for general UI and `var(--font-mono)` for changing numeric values. Live numbers must also use:

```css
font-variant-numeric: tabular-nums;
```

Current numeric surfaces include scores, clock, version number, player ids, player attributes, match stat values, fatigue and rating values, and commentary minute stamps.

## Layout

The app is a full-viewport single-page experience. `html`, `body`, and `#app` are locked to the viewport and hide browser scrollbars. Internal panels scroll where needed.

Primary overlay stack (z-index order):

1. `#home-screen` — fixed overlay, z-index 300
2. `#pre-match` — fixed overlay, z-index 200
3. `#modal-overlay` — fixed overlay, z-index 100
4. `#app` — match shell underneath

Match shell order (mobile: flex column; desktop: grid with named areas):

1. `#scoreboard`
2. `#panel-pitch`
3. `#panel-bottom` (two columns: commentary 3fr, stats 2fr)
4. `#sim-controls`

Safe-area insets (`env(safe-area-inset-*)`) are applied to all full-screen layers. Preserve those rules when changing full-screen layouts.

## Screen Notes

### Home Screen

The home screen is intentionally sparse: title, version, start button, and theme toggle. The start button is the primary action and should remain visually distinct.

**Visual details:**
- `#home-screen` has two radial-gradient glows on `background-image`: a green ellipse at 42% vertical (pitch atmosphere) and a blue ellipse at the bottom (atmospheric).
- `#home-title` uses `background-clip: text` with a `linear-gradient(155deg, #ffffff 25%, var(--gold) 100%)` for a white-to-gold gradient on the text.
- `#home-version` is a monospace pill with `var(--surface2)` background and `var(--border-mid)` border.
- `#start-game-btn` uses the primary CTA pattern (full spec above).
- `#theme-toggle` (top-left) uses the secondary/neutral button pattern.

### Pre-Match

The pre-match screen is dense by design. It lets the user scan each team before kick-off:

- Header with match title and team matchup.
- Tabs for home and away rosters (active tab uses `var(--tc, var(--blue))` for team-colour accent).
- Attribute legend grouped into Physical, Technical, and Mental.
- Compact player rows with id, surname, position, and stat cells.
- Fixed footer with primary CTA (Kick Off).

Stat cell tier colours (applied to `.attr-val`):

| Class | Colour token | Range |
|---|---|---|
| `.tier-elite` | `var(--gold)` | 90+ |
| `.tier-great` | `var(--green)` | 80–89 |
| `.tier-good` | `var(--blue)` | 70–79 |
| `.tier-avg` | `var(--text-sec)` | 60–69 |
| `.tier-poor` | `var(--text-muted)` | <60 |

`#pm-footer` uses `border-top: 1px solid var(--border-mid)`.

Preserve the compact row layout; this screen needs to fit 15 players on small screens with minimal scrolling.

### Scoreboard

The scoreboard must remain stable during live updates.

**Visual details:**
- `#scoreboard` has a `background-image` with a `linear-gradient(90deg, ...)` that fades from Lions red (`rgba(200,16,46,0.10)`) at 0% to transparent at 36%, and from transparent at 64% to Eagles blue (`rgba(0,48,135,0.10)`) at 100%. These are hardcoded team identity colours.
- `.score` values are monospace/tabular, `var(--gold)` colour, with `text-shadow: 0 0 24px rgba(255,208,64,0.45)` gold glow.
- `#clock-display` is a boxed pill: `var(--surface2)` background, `var(--border-mid)` border, 8px border-radius.
- Team names are uppercase, truncated with `text-overflow: ellipsis`, coloured `var(--text-sec)`.

**Phase badge** (`.phase-badge`): a pill below the clock, colour-coded by game state. Classes are set by `phaseClass()` in `Scoreboard.ts`:

| Class | Colour | Used for |
|---|---|---|
| `.phase-play` | `var(--text-muted)` (default) | OpenPlay, Breakdown, KickOff |
| `.phase-try` | `var(--amber)` | TryScored, ConversionKick |
| `.phase-penalty` | `var(--red)` | Penalty |
| `.phase-scrum` | `var(--green)` | Scrum, Lineout |
| `.phase-kick` | `var(--blue)` | BoxKick, TacticalKick |
| `.phase-terminal` | `var(--purple)` | HalfTime, FullTime |

Each coloured badge has a matching semi-transparent background and border at the same hue.

### Pitch Strip

The pitch is a horizontal strip. Zone widths: try 5% | 22m 17% | midfield 56% | 22m 17% | try 5%. Zone colours use `--pitch-try`, `--pitch-22`, and `--pitch-mid` CSS variables. The midfield zone adds a repeating mow-stripe effect via `repeating-linear-gradient`.

The ball marker (`#ball-marker`) is oval (`22px × 14px`), dark brown fill (`#7a3a10`), `var(--gold)` border, with a multi-stop `box-shadow` for a bright inner glow and soft outer halo. It transitions `left` over 0.35s.

### Commentary

Commentary entries are prepended (max 30). Each entry has two layered class responsibilities:

1. **Possession classes** set both `background` tint and `border-left-color` (team identity colours):
   - `.possession-home`: `rgba(200,16,46,0.11)` background, `rgba(200,16,46,0.55)` left border
   - `.possession-away`: `rgba(0,48,135,0.13)` background, `rgba(0,48,135,0.55)` left border

2. **Event classes** override just the `border-left-color` (and for try/halftime/fulltime also the background):
   - `.event-try`: `var(--amber)` border, amber-tinted background, `var(--text)` colour
   - `.event-penalty`: `var(--red)` border
   - `.event-scrum`: `var(--green)` border
   - `.event-lineout`: `var(--blue)` border
   - `.event-halftime`: `var(--purple)` border, purple-tinted background, `var(--text)` colour, `font-weight: 600`
   - `.event-fulltime`: `var(--purple)` border, stronger purple tint, `var(--text)` colour, `font-weight: 700`

Minute stamps use `var(--font-mono)` / tabular-nums.

Keep commentary text compact. Long entries reduce the usefulness of the live feed.

### Stats

Match stats: compact table with home and away values around a centre label. Stat values use `var(--font-mono)` / tabular-nums.

Player stats (updated once per game minute):

**Fatigue bars** use CSS gradients (not flat colours):

| Class | Gradient | Condition |
|---|---|---|
| `.fatigue-ok` | `#00d97e → #00a360` | ≥ normal |
| `.fatigue-warn` | `#ffb52e → #e07800` | warning |
| `.fatigue-low` | `#ff4d5e → #cc1a2a` | low |

**Rating badges** (`.rating-badge`): pill with `border-radius: 20px`, monospace font, filled tier background:

| Class | Colour | Background |
|---|---|---|
| `.rating-high` | `var(--gold)` | `rgba(255,208,64,0.15)` |
| `.rating-mid` | `var(--green)` | `rgba(0,217,126,0.14)` |
| `.rating-low` | `var(--amber)` | `rgba(255,181,46,0.14)` |
| `.rating-poor` | `var(--red)` | `rgba(255,77,94,0.14)` |

### Modal

The modal (penalty choices) slides up from the bottom on mobile (`sheetUp` animation), and scales in as a centred dialog on desktop (`modalIn` animation). Backdrop uses `rgba(0,0,0,0.72)` with `backdrop-filter: blur(6px)`.

Choice buttons (`.modal-choice-btn`) use the secondary/neutral pattern (`var(--surface)` bg, `var(--border-mid)` border). On active/hover they gain `var(--blue)` border-color.

### Tactics Menu

Tactic option cards (`.tactics-opt-btn`) use the secondary/neutral pattern. Active selection:
- Background: `var(--blue-light)`
- Border: `var(--blue)`, with a `0 0 14px rgba(77,159,255,0.18)` glow
- A 4px blue left accent bar via `::before` pseudo-element
- Label colour changes to `var(--blue)`

The Resume button (`.tactics-resume-btn`) uses the primary CTA pattern.

## Motion

Motion is CSS-only:

- Commentary entries use `entryIn` over 0.18s (slide from -4px + fade).
- Pre-match exits with `pmSlideDown` over 0.3s.
- Modal sheet slides up with `sheetUp` over 0.22s (`cubic-bezier(0.22, 1, 0.36, 1)`).
- Modal desktop dialog scales in with `modalIn` over 0.22s (same easing).
- Ball marker movement transitions `left` over 0.35s ease.
- Fatigue bars transition `width` over 0.5s ease.
- Phase badge transitions `background`, `border-color`, `color` over 0.25s.
- Buttons use `background` and `box-shadow` transitions over 0.12–0.15s.

Keep motion functional and brief. It should help users track live changes, not compete with the simulation.

## Accessibility

- `:focus-visible` uses a 2px solid `var(--blue)` outline.
- Tap highlight is suppressed globally (`-webkit-tap-highlight-color: transparent`) for a mobile-app feel.
- Text selection is disabled globally and re-enabled for `input`, `textarea`, and `[contenteditable]`.
- The theme toggle has an `aria-label` that reflects the next action.
- Avoid conveying meaning through colour alone when adding new controls.

## Responsive Behaviour

The default CSS is mobile-first. Desktop layout (≥ 700px) is handled in each CSS file's `@media (min-width: 700px)` block. On desktop, `#app` switches from flex column to a CSS grid with named areas.

Key stability rules:

- Do not let score, clock, phase, or button text resize their containers during play.
- Do not let player names or team names push numeric columns out of alignment.
- Prefer truncation (`overflow: hidden; text-overflow: ellipsis; white-space: nowrap`) for labels and surnames in dense panels.
- Hover rules are only inside desktop media queries — mobile has no hover states.

## Do

- Use CSS variables from `style/main.css`.
- Use `var(--font-mono)` and `font-variant-numeric: tabular-nums` for live numeric values.
- Keep each UI module responsible for one surface.
- Preserve the event-driven engine/UI boundary described in `CLAUDE.md`.
- Check `engine.md` before changing text that describes match behaviour.
- Keep live-match screens dense, legible, and stable.
- Use `var(--surface2)` background and `var(--border-mid)` border for secondary/neutral buttons.

## Don't

- Do not introduce new component libraries for small UI changes without discussion.
- Do not hardcode deploy-sensitive paths or asset bases.
- Do not reverse semantic colours: green is positive/OK, red is penalty/poor/low, amber is try/warning, purple is terminal phase.
- Do not add ornamental UI that reduces scannability during a match.
- Do not use the blue (`var(--blue)`) filled pattern or neon-green (`var(--green)`) filled pattern for primary CTAs — use the dark green (`#007a2a`) pattern exclusively for primary actions.
- Do not add new surface-level colours without adding them as tokens to `:root` in `style/main.css`.
- Do not use `transform: translateY(...)` on button `:active` states — none of the standard buttons do this.
