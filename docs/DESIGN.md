# DESIGN.md — Rugby Manager Design System

> **System name:** Match Day Editorial v2.1
> **Last revised:** May 2026 (v2.274a team-colour theming rollout)
> **Status:** Authoritative. This document supersedes any conflicting guidance in older mockup notes or screen comments.

---

## 0. How to use this document

This is the **single source of truth** for visual and interaction design in the Rugby Manager codebase. Every CSS file, TypeScript component, and design decision must align with what's documented here.

**When you make a change:**
1. Check this document for the relevant rule or pattern.
2. If your change introduces a new pattern, **update this document in the same PR**.
3. If you discover an existing violation, file it as a task in `docs/ui-audit-tasks/` rather than fixing it ad-hoc.

**When you're unsure:**
- Default to the most restrictive interpretation.
- Look at how Football Manager handles the same problem, not at generic web conventions.
- Ask: "Does this earn its place?" If not, cut it.

---

## 1. Aesthetic intent

### Vibe
**Match Day Editorial.** Broadcast-grade dark. Pitch-side intensity, not corporate dashboard. The visual language sits between *Sky Sports rugby graphics* and *a serious editorial publication* — confident, dense with information, never decorative.

### What it is
- Dark, near-black canvas with pitch-green accents
- Editorial italic serif moments (the clock, scoreline italics) as rare punctuation
- Tabular monospace for every number that matters
- High contrast on key data, low contrast on chrome
- Single intentional bright colour (pitch green) used sparingly

### What it is not
- Not a fitness app (no bright gradients, no soft pastels)
- Not a corporate tool (no neutral greys, no chrome density without purpose)
- Not skeuomorphic (no leather textures, no stadium photography behind UI)
- Not playful (no rounded "fun" typography, no oversized iconography)

### Decisions in one line
- **Dark canvas + pitch-green accent + amber for reward + red for danger.** That's the palette.
- **Anton for display, Geist for body, JetBrains Mono for data, Instrument Serif for editorial italics.** That's the type system.
- **Heroicons SVG only.** No emoji. No Unicode glyphs as icons.
- **Primary CTA colour via `--rm-cta` / `--rm-cta-hover` / `--rm-cta-active`.** Everything is a token.

---

## 2. Colour system

### 2.1 Token architecture

All colours are declared in `style/main.css` `:root` using **oklch** for perceptual uniformity. The game is dark-mode only.

**You may never:**
- Declare a colour outside `main.css :root`
- Use a hex code, `rgb()`, `rgba()`, or named colour (`white`, `red`) inline in screen CSS or TS
- Use `var(--token, #fallback)` syntax — fallbacks hide missing declarations

**You should:**
- Reach for `color-mix(in oklch, var(--token) X%, transparent)` for tints
- Add new tokens to `:root` when an existing one doesn't fit, rather than hardcoding

### 2.2 Canonical tokens

#### Surface elevation
| Token | Dark value | Use case |
|---|---|---|
| `--rm-bg-deep` | oklch(0.12 0.010 150) | Deepest level — page edges, footer shadows |
| `--rm-bg` | oklch(0.16 0.012 150) | Default page background |
| `--rm-surface` | oklch(0.205 0.013 150) | First-level card / panel surface |
| `--rm-surface-2` | oklch(0.245 0.014 150) | Elevated card, sub-panel, active control |
| `--rm-surface-3` | oklch(0.295 0.015 150) | Most-elevated surface, modal, sheet, toast |

**Elevation rule:** A card MUST sit on a surface darker than itself. If its parent is `--rm-surface`, the card uses `--rm-surface-2`. Inverted depth (card darker than parent) is forbidden — it makes the card look sunken rather than elevated.

#### Text
| Token | Dark value | Use case |
|---|---|---|
| `--rm-chalk` | oklch(0.97 0.008 90) | Primary display copy, scores, top-tier text |
| `--rm-text` | oklch(0.95 0.008 90) | Body text |
| `--rm-text-muted` | oklch(0.68 0.012 150) | Secondary text |
| `--rm-text-dim` | oklch(0.50 0.012 150) | Tertiary, metadata, mono labels |
| `--rm-text-faint` | oklch(0.38 0.012 150) | Disabled, separators, ghost states |

#### Accents
| Token | Dark value | Semantic role |
|---|---|---|
| `--rm-pitch` | oklch(0.76 0.21 144) | **Primary accent** — active states, "alive" UI, brand |
| `--rm-pitch-deep` | oklch(0.55 0.18 144) | Hover/active variants, gradient bottom |
| `--rm-pitch-soft` | oklch(0.30 0.08 144) | Pitch-line gradients, subtle field references |
| `--rm-pitch-glow` | color-mix variant | Box-shadow glows |
| `--rm-cta` | oklch(0.47 0.18 144) | **Primary CTA fill** — all green action buttons |
| `--rm-cta-hover` | oklch(0.54 0.19 144) | CTA hover state |
| `--rm-cta-active` | oklch(0.40 0.15 144) | CTA pressed/active state |
| `--rm-amber` | oklch(0.74 0.16 62) | **Performance reward** — MOTM, top performer, milestone |
| `--rm-amber-deep` | oklch(0.58 0.16 50) | Gradient bottom |
| `--rm-danger` | oklch(0.60 0.20 25) | **Negative health/discipline** — injury, expiring contract, red card |
| `--rm-danger-deep` | oklch(0.45 0.18 25) | Gradient bottom |

#### Quantitative stat scale
Use this scale only for **quantitative numerical data** (ratings, overall scores, statistical comparisons). Do not use for status or UI state.

| Token | Hue | Meaning |
|---|---|---|
| `--rm-stat-1` (red) | 25 | Low — rating < 60, declining attribute |
| `--rm-stat-2` (orange) | 55 | Below average — rating 60–69 |
| `--rm-stat-3` (gold) | 95 | Elite — rating ≥ 85 |
| `--rm-stat-4` (green) | 144 | Good — rating 70–84. **Never use for accent text against UI green** — too close to `--rm-pitch` (use `--rm-text-muted` instead) |
| `--rm-stat-5` (cyan) | 175 | Above average / analytical signal |

#### Borders & dividers
| Token | Use case |
|---|---|
| `--rm-border` | Primary card border |
| `--rm-border-soft` | Subtle card border, default for most surfaces |
| `--rm-divider` | Section dividers |
| `--rm-hairline` | Faintest separator (8% chalk-on-bg mix) |

### 2.3 Semantic colour map

Each accent colour has **exactly one semantic role**. Do not reuse for unrelated meanings.

| Token | Semantic | Used for |
|---|---|---|
| `--rm-pitch` | Primary / active / alive | CTAs, active tabs, selected rows, brand moments, hub hero, eyebrows; fallback when `--team-color` is unset |
| `--rm-amber` | Performance reward | MOTM badges, top scorer callouts, milestone notifications, salary-cap "tight" state |
| `--rm-danger` | Negative health/discipline | Injuries, expiring contracts, red-card markers, over-cap state, release confirmations |
| `--rm-stat-3` (gold) | Quantitative elite | Player overall ratings ≥ 85 |
| `--rm-stat-5` (cyan) | Analytical/predictive | Match spread predictions, statistical callouts, trending indicators |
| `--team-color` | Manager's team identity | Screen background gradients (Tier 1/2), active interactive tints, jersey badges — see §2.5 |

### 2.4 Sanctioned constants

Two values are intentionally pinned and may appear inline. All other hardcoded colours are forbidden outside `main.css :root`.

**`#007a2a`** — primary CTA green. Pinned for native-shell status-bar tinting and manifest theme-color, where a CSS variable cannot reach.

**`--rm-on-accent: oklch(0.99 0 0)`** — text/icon colour on any `--rm-cta` or team-colour accent surface. Near-white in oklch, expressed as a token so a single edit covers every CTA label if the accent palette ever shifts. Use `var(--rm-on-accent)` for `color` on all green CTA buttons and accent chips — never `#fff` or `#ffffff` inline.

```css
/* OK */
#hub-play-next {
  background: #007a2a;
}
.some-cta {
  background: var(--rm-cta);
  color: var(--rm-on-accent);
}

/* NOT OK */
.something-else {
  background: #d8503e; /* should be var(--rm-danger) */
}
.another-cta {
  color: #ffffff; /* should be var(--rm-on-accent) */
}
```

### 2.5 Team colours

Team brand colours are dynamic data (set from team JSON) and must be passed via the `--team-color` CSS custom property on the screen root:

```ts
const screenEl = document.getElementById('hub');
screenEl.style.setProperty('--team-color', team.color);
```

**Every in-season screen that shows the manager's own team data sets `--team-color` in JS.** League-neutral screens (LeagueTable, LeagueMenu, TeamStats, PlayerStats) do not — they display multi-club data and personalising them with the manager's colour would be misleading.

#### 2.5.1 sRGB colour-mixing rule

**Always use `in srgb` when mixing `--team-color` with a dark anchor.** Never use `in oklch` for team-colour gradients.

`oklch` interpolation rotates between competing hues, causing Gloucester red and Harlequins purple to drift through muddy orange/brown midpoints. `srgb` mixing with `black` scales all RGB components proportionally, preserving the team's hue and saturation at every stop.

```css
/* Correct */
color-mix(in srgb, var(--team-color, var(--rm-pitch)) 80%, black)

/* Wrong — hue drift on red/purple teams */
color-mix(in oklch, var(--team-color, var(--rm-pitch)) 80%, oklch(0.08 0 0))
```

Always include `var(--rm-pitch)` as the `--team-color` fallback. This keeps the pattern valid on any screen that hasn't received the JS `setProperty` call yet.

#### 2.5.2 Two-tier application system

Team colour is applied at two intensity levels depending on how prominent the team identity should be:

**Tier 1 — Full-screen radial gradient** (Hub, ModePicker, PreMatch)

The entire screen background carries the team colour as a dominant wash at the top, fading to `--rm-bg` by 88%. Used on screens where team identity is the primary visual statement.

```css
background-image: radial-gradient(
  ellipse 200% 130% at 50% 0%,
  color-mix(in srgb, var(--team-color, var(--rm-pitch)) 80%, black) 0%,
  color-mix(in srgb, var(--team-color, var(--rm-pitch)) 38%, black) 50%,
  var(--rm-bg) 88%
);
```

**Tier 2 — Tinted app-header** (FixtureList, Contracts, SquadManagement, SquadOverview, Training, Renewals, TransferMarket, RoundResults, SigningResults, RetentionDecision)

Only the `.app-header` block carries the team colour. The list/content area beneath uses the standard dark background. The screen-root ID scopes the override so it doesn't bleed into other screens.

```css
#screen-id .app-header {
  background: linear-gradient(180deg,
    color-mix(in srgb, var(--team-color, var(--rm-pitch)) 75%, black) 0%,
    color-mix(in srgb, var(--team-color, var(--rm-pitch)) 38%, black) 100%
  );
  border-bottom-color: color-mix(in srgb, var(--team-color, var(--rm-pitch)) 45%, transparent);
}
```

The 75→38% linear gradient gives the header a top-heavy glow that transitions downward without a visible hard edge where it meets the content.

#### 2.5.3 Interactive element tinting

Active/selected controls within a team-colour screen — filter chips, position tabs, active toggles — receive a low-percentage team-colour tint to stay visually consistent with the header without competing with it.

```css
.sq-chip.active {
  background: color-mix(in srgb, var(--team-color, var(--rm-pitch)) 22%, var(--rm-surface-2));
  border-color: color-mix(in srgb, var(--team-color, var(--rm-pitch)) 60%, transparent);
  box-shadow: 0 0 10px color-mix(in srgb, var(--team-color, var(--rm-pitch)) 18%, transparent);
}
```

Keep the tint percentage low (18–22% background, 40–60% border) so the team colour reads as contextual accent, not a competing primary accent.

#### 2.5.4 Team-coloured jersey badges

Starter jersey number badges (`.sq-jersey--starter`) use a linear gradient from full team colour to a darkened mix, with a matching glow shadow:

```css
.sq-jersey--starter {
  background: linear-gradient(155deg,
    var(--team-color, var(--rm-pitch)) 0%,
    color-mix(in srgb, var(--team-color, var(--rm-pitch)) 52%, black) 100%);
  box-shadow:
    0 0 12px color-mix(in srgb, var(--team-color, var(--rm-pitch)) 40%, transparent),
    0 2px 6px rgba(0, 0, 0, 0.4),
    inset 0 1px 0 rgba(255, 255, 255, 0.18);
}
```

Bench jersey badges use the neutral surface treatment — team colour on bench slots would flatten the starter/bench visual hierarchy.

---

## 3. Typography

### 3.1 The font triplet (plus serif punctuation)

| Variable | Family | Role |
|---|---|---|
| `--rm-font-display` | Anton | All-caps display headings, scores, CTA labels |
| `--rm-font-body` | Geist | Body copy, button text, descriptive content |
| `--rm-font-mono` | JetBrains Mono | All numbers, all section labels, all metadata, tabular data |
| `--rm-font-editor` | Instrument Serif (italic) | The clock, "vs" separators, taglines — *rare punctuation only* |

### 3.2 Font role rules

- **Anton is never below 18px.** It loses its display authority and looks spindly. If you need 16px-and-down headings, use Geist 600 weight.
- **All numbers use mono.** Scores, ratings, ages, wages, points totals, statistics. The tabular-numerals property (`font-variant-numeric: tabular-nums`) is implicit — set it on any element that displays varying numbers.
- **All section labels use mono.** Uppercase, 700 weight, letterspaced. See §3.3 for the canonical scale.
- **Instrument Serif italic is rare.** It earns its place at the match clock and in the editorial "vs" between teams. Don't sprinkle it elsewhere.
- **Body copy never uses Anton.** Anton is display-only.

### 3.3 Size scale

#### Display (Anton)
| Size | Use case |
|---|---|
| 72px | Match Result winner's score |
| 44–52px | Match Result loser's score, hero scores |
| 42px | Live scoreboard score |
| clamp(30px, 9vw, 44px) | Hub team name (`#hub-team-name`) — fluid, centred, pure `#ffffff` |
| 28px | Home screen CTA, modal title |
| 20–22px | In-flow CTA labels, screen titles in hub-hero |
| 20px | `.app-title` in shared header |
| 18px | Minimum for Anton — below this, use Geist bold |

#### Body (Geist)
| Size | Weight | Use case |
|---|---|---|
| 14–15px | 400 | Body text, descriptions |
| 13px | 400/600 | Card body, list rows |
| 12px | 400/600 | Compact metadata, table cells |
| 11px | 600 | Button labels, sub-labels |
| 10–11px | 700 | Tags, pill labels |

#### Mono (JetBrains Mono)
| Size | Letter-spacing | Use case |
|---|---|---|
| 14px | 0.02em | Wage figures, headline numbers |
| 12–13px | 0.04em | Stat values, ratings |
| 11px | 0.06em | Metadata, table cells |
| **10px** | **0.16em** | **Section labels** (the canonical standard) |
| 9px | 0.18em | Pill labels, sub-metadata |
| 8px | 0.18em | Smallest mono — column headers, footnotes |

#### Type tokens & Dynamic Type scaling

**Every `font-size` references a token, never a raw px value.** The scale above is realised
as `--rm-fs-*` custom properties in `style/main.css` `:root` (`--rm-fs-8` … `--rm-fs-72`, one
per size in the scale). Each is `calc(Npx * var(--rm-text-scale))`, so a single multiplier —
`--rm-text-scale` — rescales all type at once (iOS Dynamic Type-style accessibility support).

```css
--rm-text-scale: 1;                              /* default; Settings overrides at runtime */
--rm-fs-14: calc(14px * var(--rm-text-scale));   /* body base — html/body bind to this */
```

- **Use the tokens.** New CSS must use `font-size: var(--rm-fs-N)` (or `calc(Npx * var(--rm-text-scale))`
  for an off-ladder half-pixel value, and `clamp(calc(Apx * var(--rm-text-scale)), Bvw, calc(Cpx * var(--rm-text-scale)))`
  for fluid hero display). Never hardcode `font-size: Npx` — it would silently opt out of the
  accessibility scale.
- **The multiplier is user-driven.** Settings → Accessibility offers discrete manual steps
  (Default / Large / Larger / Largest → `1 / 1.15 / 1.3 / 1.45`) and, on the native iOS shell, a
  "Follow system text size" toggle. The controller is `src/ui/textScale.ts`: it owns the effective
  scale, persists the choice via `src/ui/uiPrefs.ts`, and writes `:root` through `applyTextScale()`.
  Because `:root` carries a static `--rm-text-scale: 1`, first paint is correct before JS runs.
- **Native Dynamic Type follow (iOS).** The `DynamicType` Capacitor plugin
  (`ios/App/App/DynamicTypePlugin.swift`, JS bridge `src/native/dynamicType.ts`) reports
  `UIContentSizeCategory` and emits live changes; `textScale.ts` maps each category onto the
  multiplier, clamped to `1.5` so the largest accessibility sizes can't break layouts. Auto mode is
  the native default; on web it resolves to `1` (no system source), so the web build is unchanged.

### 3.4 The section label standard

**Every section label across the product uses this exact treatment:**

```css
.section-label {
  font-family: var(--rm-font-mono);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--rm-text-dim);
}
```

If your section label deviates, it's wrong. The 8px labels found in the May 2026 audit have been migrated up to 10px — do not regress.

---

## 4. Crest scale

Team crests appear at **exactly five sizes**. If you need one between two steps, choose the larger.

| Token | Size | Radius | Font-size | Use case |
|---|---|---|---|---|
| `--crest-xs` | 22×22 | 5px | 11px | League table rows, round results, fixture list rows |
| `--crest-sm` | 34×34 | 8px | 15px | Next-match cards, live scoreboard, pre-match summary header |
| `--crest-md` | 44×44 | 10px | 22px | Match Result hero, Pre-Match split-screen, Team Selector cards |
| `--crest-lg` | 58×58 | 13px | 28px | End-of-season standings highlight |
| `--crest-xl` | 88×88 | 16px | 36px | Team Info hero, Mode Picker hero |

### Implementation

Tokens are declared in `main.css :root`. Apply via screen-specific CSS using the token names:

```css
.hub-crest {
  width: var(--crest-lg-size);
  height: var(--crest-lg-size);
  border-radius: var(--crest-lg-radius);
  /* ... other styling ... */
}
```

### Crest treatment

Every crest carries the same base treatment:
- Linear gradient 160° from the team colour to a darkened mix
- 1px border in a tinted-team-colour mix at 45% opacity
- Inset highlight + drop shadow + ambient glow (use `--rm-card-shadow` or a glow variant)
- A `::after` pseudo-element with a 180° dark gradient overlay for depth (50%-to-bottom)
- The team initial wrapped in a `<span>` with `position: relative; z-index: 1`

Reference implementations: `.team-crest` in `main.css`, `.hub-crest` in `hub.css`, `.mr-crest` in `matchresult.css`.

### Stat badges

OVR / rating / numeric tiles attached to player rows use a **separate two-step scale**. Same token shape (`--xxx-size` / `--xxx-radius`), declared in `main.css :root`:

| Token | Size | Radius | Use case |
|---|---|---|---|
| `--badge-sm` | 34×34 | 8px  | Squad management row OVR (`.sq-ovr`) |
| `--badge-md` | 42×42 | 10px | Contracts row OVR (`.ct-ovr`), Squad Overview row OVR (`.so-ovr`) |

```css
.so-ovr {
  width: var(--badge-md-size);
  height: var(--badge-md-size);
  border-radius: var(--badge-md-radius);
  /* ... colour bands, typography, etc. ... */
}
```

Stat badges are square; their inner number uses `--rm-font-mono`. Don't reach for a `--crest-*` token here — crests are gradient-filled and have a darker overlay, badges are tinted-flat and band by value (`.ovr-elite` / `.ovr-good` / etc.).

### 4.7 Form pip

Shared W/D/L pip used across LeagueTable, FixtureList rows, Hub next-match card, RoundResults. Single base class with size + state modifiers in `style/main.css`:

```css
.form-pip                     /* base */
.form-pip--sm                 /* 12px — LeagueTable, FixtureList */
.form-pip--md                 /* 22px — Hub next-match card */
.form-pip--w / .form-pip--l / .form-pip--d / .form-pip--empty
```

The render helper is `src/ui/components/formPip.ts::renderFormPipStrip(form, size)`. Always pass the array from `recentForm()` in `src/game/teamStats.ts` (oldest at index 0, most recent at index n-1, padded left with null). Use `--sm` on dense list rows, `--md` on hero / centre-stage cards. PreMatch keeps its own larger `.pm-form-pin` since the scout card's palette is bespoke.

### 4.8 Row tap-to-expand

In-list rows that have rich underlying data but render a single line at rest can opt into the shared expand pattern. The row carries `data-row-id="..."`, with a sibling `.row-expand-panel` div that toggles via `data-expanded="true"`. The reveal tweens via `grid-template-rows: 0fr → 1fr` (no `max-height` hack). The shared controller `src/ui/components/rowExpand.ts::createRowExpander({ rowSelector, onChange })` owns the per-screen `Set<rowId>` and the delegated click handler. Buttons, links, and `.player-link` inside the row automatically bypass the toggle.

Today's adopters: ContractsScreen (`.ct-expand`), TransferMarketScreen (`.tm-expand`), RoundResultsScreen (`.rr-expand`), SquadManagementScreen (`.sq-expand`), PreMatchScreen lineup rows (`.pm-lineup-expand` — both Mine and Opp steps). SquadManagement uses an opt-in `.sq-expand-btn` chevron because the row body itself is the swap-source target. PreMatch uses the shared `.row-expand-chevron` at the row end (it's a high-density read screen — the chevron makes the affordance visible without competing with the jersey/name centre-of-attention). Other screens treat the row body as the tap area.

---

## 5. Spacing, layout & elevation

### 5.1 Safe-area

The shared token `--safe-bottom: max(env(safe-area-inset-bottom), 28px)` is declared in `:root`. Every bottom-pinned footer, toast, sheet, and floating control **must** use this token:

```css
#some-footer {
  padding-bottom: var(--safe-bottom);
}
```

Do not write raw `max(env(safe-area-inset-bottom), Npx)` expressions in screen CSS. The token is the single source of truth.

### 5.2 Card elevation system

The canonical shadow stack is declared as `--rm-card-shadow` in `main.css`:

```css
--rm-card-shadow:
  inset 0 1px 0 rgba(255, 255, 255, 0.055),  /* top highlight */
  0 2px 8px rgba(0, 0, 0, 0.55),              /* close shadow */
  0 8px 28px rgba(0, 0, 0, 0.35);             /* ambient lift */
```

Use this for **any elevated card**. Reach for it via `box-shadow: var(--rm-card-shadow)`.

For glowing accents (e.g. an MOTM hero), layer additional shadows:

```css
.motm-card {
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.06),
    0 2px 8px rgba(0, 0, 0, 0.5),
    0 8px 24px color-mix(in oklch, var(--rm-amber) 12%, transparent);
}
```

### 5.3 Tap targets

- **Minimum 40px tall** for any interactive control (button, toggle, pill).
- **44px preferred** per Apple HIG, especially for post-match flows where users tap quickly.
- The `.lt-toggle__btn` and `.app-back` patterns are reference implementations.

### 5.4 Border radii

Default scale:
- **4px** — Small tags, badges (`.ct-tag`, mini chips)
- **8px** — Standard buttons, segmented controls, small cards
- **10–12px** — Player rows, modal choice buttons
- **14px** — Primary CTAs, cards, panels
- **16–20px** — Modals, sheets

The crest scale (§4) has its own radii — don't conflate them with general card radii.

---

## 6. Iconography

### 6.1 Heroicons only

**Every icon in the product is a Heroicons SVG.** No emoji. No Unicode glyphs (★, ▲, ▼, ✓, etc.) used as iconography.

The single exception: numerical superscripts and the en-dash/em-dash in copy are not iconography and are fine.

### 6.2 Sizing

| Size | Use case |
|---|---|
| 11–13px | Inline icons within text or labels (MOTM star, sort chevrons) |
| 14–16px | Button-internal icons, secondary action icons |
| 18px | Standard back-button and topbar icon size |
| 20px | Hub tile icons |
| 32px | Empty-state hero icons |

### 6.3 Stroke vs solid

- **Outline (stroke-width 1.5)** — Default. Use for nav icons, action icons, content icons.
- **Solid (fill currentColor)** — Reserved for **state markers**: filled star = MOTM/marquee, filled play = active CTA. The solid weight signals "this is on / selected / earned."

### 6.4 Implementation

Paste the path inline. Do not load Heroicons from a CDN. Don't build an SVG sprite system — the existing inline pattern is simpler and matches the convention used throughout the codebase.

```ts
const ICON_STAR_SOLID = `<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="..."/></svg>`;
```

For reusable icons in a screen, declare them as module-level constants (see `ContractsScreen.ts` `STAR_FILLED` / `STAR_OUTLINE` for the canonical pattern).

---

## 7. Animation & motion

### 7.1 Duration floor

**No animation under 150ms.** Anything shorter is imperceptible on 60fps displays and reads as a snap, not motion.

### 7.2 Default easing

`cubic-bezier(0.22, 1, 0.36, 1)` — a soft spring that settles naturally. Use for entries, exits, and modal transitions. The `sheetUp` keyframe in `main.css` is the canonical reference.

For state changes (hover, focus, active), use a simple `ease` or `ease-out` at 120–150ms.

### 7.3 Two ambient rhythms

The product uses two distinct ambient animation rhythms with explicit semantic difference:

| Rhythm | Duration | Easing | Meaning |
|---|---|---|---|
| **Breathing** | 2.4s | `ease-in-out` | "Alive, ready, awaiting input" — used on CTAs (`.cta-pulse`) |
| **Computing** | 1.2s | `ease` | "Actively working" — used on in-progress states (`.rr-pending`) |

Do not mix these. A "computing" element using the 2.4s breathing rhythm reads as idle.

### 7.4 Transitions on interactive elements

Every `:hover`, `:focus`, `:active` state **must** be accompanied by a `transition` declaration. A bare hover that snaps is worse than no hover at all.

```css
/* Correct */
.app-back {
  color: var(--rm-text-muted);
  transition: color 0.15s;
}
.app-back:hover {
  color: var(--rm-text);
}

/* Wrong — snap on hover */
.app-back {
  color: var(--rm-text-muted);
}
.app-back:hover {
  color: var(--rm-text);
}
```

### 7.5 Hover gating on touch devices

All `:hover` rules that could leave a "stuck" state on mobile tap **must** be wrapped in `@media (hover: hover)`:

```css
@media (hover: hover) {
  .lt-row:hover {
    background: color-mix(in oklch, var(--rm-surface) 80%, var(--rm-surface-2));
  }
}
```

Do not write top-level `:hover` rules for any element a user might tap on mobile.

### 7.6 Motion tokens

Four custom properties on `:root` formalise the screen-transition + row-stagger choreography. Use these tokens rather than reintroducing bare durations or easing curves in screen-specific CSS.

```css
:root {
  --rm-ease-out:        cubic-bezier(0.22, 1, 0.36, 1);  /* screen + row entry */
  --rm-ease-in-out:     cubic-bezier(0.4, 0, 0.2, 1);    /* reserved for cross-fades */
  --rm-duration-screen: 220ms;                            /* screen-enter window */
  --rm-duration-row:    240ms;                            /* per-row stagger window */
  --rm-stagger-step:    25ms;                             /* delay between adjacent rows */
}
```

### 7.7 Screen transitions (directional)

Forward navigation slides in from the right (FM / mobile-native convention); back slides in from the left. Old screen hides instantly under the new one — no exit animation. The previous flat fade-up (`screenEnter`) is preserved as the first-mount fallback only.

```
forward  →  translateX(24px)  → translateX(0)  + fade  220ms ease-out
back     →  translateX(-24px) → translateX(0)  + fade  220ms ease-out
```

Direction is set by the caller at `screenRouter.show(id, { direction })` (default `'forward'`). In `main.ts`, sub-screen back-arrows pass `'back'`; hub-tile and post-match Continue chain pass the default. The post-match chain (`RoundResults → LeagueTable → Training → Hub`) is semantically forward, even though it lands back on Hub — progressing through the season is forward motion.

`ScreenRouter` writes `data-direction="forward"` or `data-direction="back"` on the entering screen and adds `.screen-entering`. Both are cleaned up by a single `setTimeout(700)` — the timer must outlive the longest row-stagger window, because row animations are gated on the parent class.

### 7.8 List stagger

Row entry on screen change uses a `--row-delay` custom property set inline per row. The delay step is `--rm-stagger-step` (25ms); the per-row anim is `--rm-duration-row` (240ms). The index is capped at 16, giving a 400ms ceiling on stagger total + 240ms anim ≈ 640ms — comfortably within the 700ms class lifetime.

Pattern (mechanical, identical across screens):

```ts
rows.map((r, i) => `
  <div class="fl-row" style="--row-delay: ${Math.min(i, 16) * 25}ms">…</div>
`).join('')
```

The CSS rule is gated by the parent `.screen-entering` class, so rows only animate on first paint after a screen change — filter / sort / data-event re-renders inside an already-mounted screen do **not** restagger. Opt-in classes today: `.fl-row`, `.ct-player`, `.lt-row`, `.tm-row`, `.rr-row`, `.ps-row`, `.ts-row`, `.rn-row`, `.sr-row`, `.sq-player`. Add new row classes to the combined selector in `style/main.css` to opt them in.

### 7.9 Reduced motion

Under `prefers-reduced-motion: reduce`, both screen transforms and row stagger collapse to a single 80ms opacity fade (`@keyframes rmFadeOnly`). Movement-sensitive users still get a subtle transition cue; nothing slides, nothing staggers. The reduced-motion override at the bottom of the motion section in `style/main.css` is the single source of truth — add new opt-in row classes to its selector list in lockstep with §7.8.

Reward-moment screens (§7.10) own their own reduced-motion blocks in `style/budgetreveal.css` and `style/seasonrollover.css` since their hero / pop / trophy keyframes live in those files. Confetti and counter-up tweens self-check the media query in code (see `src/ui/components/counterUp.ts` and the gates in `EndOfSeasonScreen.ts` / `TakeoverRevealScreen.ts`).

### 7.10 Reward-moment choreography (Budget, Takeover, EOS, Rollover)

Four screens are once-a-year peaks and use a shared celebration recipe rather than the generic page-enter pattern:

| Surface | Counter-up | Stagger | Scale-pop hero | Sound | Confetti |
|---|---|---|---|---|---|
| BudgetReveal | budget headline | reason chips | `tkHeroEnter` on `.br-card` (already shipped) | — | — |
| TakeoverReveal | `.tk-boost-num` (player's own card) | `.tk-other-row` (league-wide) | `tkCrestPop` on `.tk-crest--lg`; newspaper-framing on `.tk-hero` | `uiClick` ~250ms | `launchConfetti(playerColor, 'normal')` when player owns the takeover |
| EOS | every standings row's points + every "your season" stat | `.eos-row`, `.eos-leader` (gold/silver/bronze leader cards in sequence) | `eosChampionEnter` + `eosCrestPop` + `eosNameRise` + `eosWashSwell` (kept from prior work); new `rmTrophyPop` on the inline trophy SVG | `whistle` on enter; `crowdRoar` ~800ms when player is champion | `launchConfetti(playerColor, 'storm')` ~700ms when player is champion (replaces the 14-dot CSS effect, which is now reserved for AI-champion seasons) |
| Rollover | academy OVRs (hero + inline) | existing `.roll-row` stagger | new `.roll-breakout` hero card (only when an academy grad ≥ 80 OVR) | — | — |

Numbers tween from 0 via `animateCounter()` in `src/ui/components/counterUp.ts` — single easing (`1 - (1 - t)^3`), default 1200ms, snaps to final under reduced motion. Use it via inline `data-counter-*` attributes on numeric cells so the render path stays string-based.

Sound is a manifest-driven Web Audio engine. `src/ui/audio/audioManifest.ts` is the catalogue — every cue's id, file (`public/audio/…`), mix channel (`whistle` / `crowd-bed` / `crowd-reaction` / `impact` / `ui` / `stinger` / `music`), loop flag, trigger, and an ElevenLabs generation prompt. `src/ui/SoundManager.ts` is the engine: per-channel GainNodes under a master gain, lazy fetch+decode (a missing file caches null and no-ops, so it runs before assets are sourced), cross-faded loop beds (crowd ambience + screen music), persisted enable/volume, AudioContext unlocked on first gesture. When a cue's file is missing the engine falls back to **procedural synthesis** (`src/ui/audio/synth.ts`) — Web Audio generators for the tonal/percussive cues (all `ui.*`, all `whistle.*`, plus rough placeholders for a few simple stingers/impacts) so clicks and whistles work with zero assets; a real recording dropped at the cue's path always wins. Crowd / music cues have no generator and stay silent until sampled. `src/ui/audio/AudioDirector.ts` is the single router — it subscribes to `engine:event` (match cues keyed off `phase` + narration step keys, plus crowd-bed intensity), `engine:initialized` / `engine:finished` (crowd bed lifecycle), `game:bracketSeeded` / `game:seasonComplete` (season stingers), and `screenRouter.onScreenShow` (per-screen music). UI never calls the engine directly except the global click cue in `main.ts`; the legacy `playCue('whistle'|'crowdRoar'|'uiClick')` API still works, mapped onto manifest ids. Audio plays under reduced motion (audio is independent of motion).

Haptics mirror the audio split on the same event-bus seam. `src/ui/HapticsManager.ts` is the engine — a 7-entry `HapticPattern` map (`try` / `card` / `goal_made` / `goal_miss` / `tmo` / `whistle_half` / `whistle_full`), each routed to a native iOS Taptic call (`@capacitor/haptics` `impact` / `notification`, fire-and-forget) or a `navigator.vibrate` web fallback, gated by `Capacitor.isNativePlatform()` and a persisted enable flag (`isHapticsEnabled` / `setHapticsEnabled`, defaults on, Settings → Audio toggle). `src/ui/haptics/HapticsDirector.ts` is the single router — subscribes to `engine:event` only and fires at most one pattern per event for the big moments (tries, cards + TMO verdicts, TMO intervention, goal-kick made/missed, half/full-time whistles), keyed off the same `phase` + narration step keys the AudioDirector reads. Silent AI fixtures don't emit `engine:event`, so haptics never fire off the live path.

Confetti calls (`Confetti.ts`) are reserved for two moments only: player-as-champion at EOS (storm) and player-owned takeover (normal). Both are gated by a `prefers-reduced-motion` check in the calling code.

Iconography: gold trophy SVG inline next to the EOS champion's name; gold/silver/bronze medal SVGs left of the top-3 standings ranks; newspaper-framing eyebrow ("BREAKING" red for Red Bull / "BOARDROOM" green for investor) + faux byline on the takeover hero card; "BREAKOUT TALENT" eyebrow on the Rollover hero card.

---

## 8. Component patterns

### 8.1 Primary CTA

The full-width green action button. Pinned colour: `#007a2a`.

```css
.primary-cta {
  width: 100%;
  padding: 14px 22px;
  background: #007a2a;
  border: none;
  border-radius: 14px;
  color: var(--rm-on-accent);
  font-family: var(--rm-font-display);
  font-size: 20px;             /* hero context: 28px */
  letter-spacing: 0.04em;
  text-transform: uppercase;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.25),
    0 8px 24px color-mix(in oklch, var(--rm-pitch) 28%, transparent);
  transition: background 0.15s, box-shadow 0.15s;
}

.primary-cta:hover  { background: #009434; }
.primary-cta:active { background: #006622; }
```

Apply the `cta-pulse` class for the ambient breathing animation.

**Font size:** 20px Anton for in-flow CTAs (Hub, Pre-Match, Match Result, Squad, League, Round Results, Transfer Market, EOS, Rollover). 28px Anton is reserved for the Home screen hero CTAs — that is the only exception.

### 8.2 Shared screen header

Every list-screen header (Fixtures, League Table, Contracts, Squad, Transfer Market, Renewals, Round Results, EOS, Rollover, Settings) uses the shared `.app-header` pattern:

```html
<div class="app-header">
  <div class="app-topbar">
    <button class="app-back" aria-label="Back to hub">
      <svg>...</svg><span>Hub</span>
    </button>
    <span class="app-title">Screen Title</span>
    <div class="app-topbar-spacer"></div>
  </div>
  <div class="app-eyebrow">Season label · WK 14 / 22</div>
</div>
```

- `.app-title` is **20px Anton uppercase** with `letter-spacing: 0.05em`. Never 16px.
- `.app-eyebrow` is **10px mono uppercase, pitch-green**, used for temporal context (season + week) or fixture metadata.
- The right slot may be a `<div class="app-topbar-spacer">` (placeholder), a sort button, or a cap pill — never the title.

**Intentional exceptions to this pattern:** Hub, PreMatch, MatchResult, TeamSelector, TeamInfo, Home. These screens have bespoke headers because they're not "browse list" contexts.

### 8.3 Notification badge

Hub tiles and navigation items with actionable counts display a notification badge:

```html
<button class="hub-tile" style="position: relative">
  <span class="notification-badge">3</span>
  <!-- tile icon and label -->
</button>
```

```css
/* Already declared in main.css */
.notification-badge {
  position: absolute;
  top: -4px;
  right: -4px;
  /* 18×18, pitch-rounded, danger-coloured, mono 10px, 2px bg-coloured border */
}
```

Use the badge for **injuries**, **expiring contracts**, **pending transfer offers**, and other states that need attention. Don't use it for purely informational counts.

### 8.4 Empty state

A list with zero items renders a structured empty state, never bare text:

```html
<div class="empty-state">
  <svg class="empty-state__icon" width="32" height="32" ...><!-- Heroicons outline --></svg>
  <div class="empty-state__title">No free agents available</div>
  <div class="empty-state__desc">Check back after the next round of fixtures — new players become available as contracts expire across the league.</div>
</div>
```

Class definitions live in `main.css`. The descriptor explains **why empty** or **what to do next** — not just "no items."

### 8.5 Toast feedback

Use the shared `showToast` helper (`src/ui/Toast.ts`) for every user-initiated state mutation. **Do not build per-screen toasts.**

```ts
import { showToast } from './Toast';

// After a successful save
showToast('Squad saved');

// After a signing
showToast(`${player.firstName} ${player.lastName} signed`);

// Variant for negative actions
showToast(`${player.firstName} ${player.lastName} released`, 'danger');
```

Variants:
- `'success'` (default) — pitch-green border, used for confirmations
- `'info'` — cyan border, used for non-affirmative state changes (pre-agree, applied filter)
- `'danger'` — red border, used for destructive confirmations (release, cancel)

Toasts auto-dismiss at 1.8s, can be tapped to dismiss early, and respect `--safe-bottom`.

### 8.6 Salary cap pill

The cap pill is a shared pattern across Contracts, Transfer Market, and Renewals. Three states:

| State | Threshold | Visual |
|---|---|---|
| `ok` | ≤ 95% of effective cap | Pitch border + pitch tint |
| `tight` | > 95% but ≤ 100% | Amber border + amber tint |
| `over` | > 100% | Danger border + danger tint, value text in danger |

Format: `<CAP> £5.8M / £6.4M` — label uppercase mono dim, value mono chalk.

### 8.7 Crest scale (see §4)

Apply `.team-crest--xs/sm/md/lg` or screen-specific variants that consume the canonical scale tokens.

### 8.8 In-match shell

The live-match panel inherits the same design-system tokens as the in-season screens. Five conventions are load-bearing:

1. **Animated stat bars.** `.stat-bar-h` / `.stat-bar-a` use `transition: width var(--rm-duration-row) var(--rm-ease-out)` so possession / territory swings glide between values. Inline `style.width="${pct}%"` mutation still happens every tick — the transition lives entirely in CSS.
2. **Winner-flip flash.** When the leading side on a stat row flips, the row briefly highlights via a pitch-green underline pulse (`.stat-row--changed::after`). The flash auto-clears after 600ms. Driven by the StatsPanel module comparing previous vs new `WinnerSide` per `data-stat-id`. Reduced-motion: animation disabled, no pulse.
3. **Expandable player rows.** Every player card on the live-match Dashboard / Players view is tap-to-expand using the shared `createRowExpander` controller. Collapsed shows jersey + name + fatigue bar + live rating badge + chevron. Expanded reveals 8 mini-stats (Carries · Metres · Passes · Tackles · Missed · Rucks · Turnovers · Kicks) plus a live OVR + form-mod context strip. Keyed by `rosterId` so the expand state survives substitutions and the per-tick patch path. Padding lives on `.sp-expand-body` (the wrapper inside `.row-expand-inner`) so the grid-row tween truly collapses to zero height — never put padding on `.row-expand-inner` itself.
4. **Commentary filter chips + team-tinted entries.** A four-chip filter bar (`.cf-filter-bar`) sits above the commentary feed: All / Tries / Pens / Kicks. Selection is sticky across matches via `loadCommentaryFilter()` in `uiPrefs.ts`. Each entry sets `--possession-color` inline to the attacking team's text colour, surfaced as a 3px `border-left` on `.commentary-entry`. The amber `.event-try` left-border still wins on hero try entries by virtue of cascade order.
5. **View bar above the scoreboard + 2D Pitch view.** The live panel has **five** views — Dashboard, **Pitch**, Commentary, Stats, Players — selected from an icon-only `#view-toggle-bar` that sits **above** the scoreboard (so it stays put while the scoreboard sheds the 1D strip in Pitch view). The **Pitch** view (`src/ui/PitchView.ts`) is a portrait top-down pitch: `display.ballX` drives the vertical (long) axis, `display.ballY` the horizontal. The 100m field of play maps onto the 8%–92% in-goal band (`toTop()`) so the ball marker sits exactly on the painted lines. Markings follow World Rugby Law 1 — try / 22m / halfway / dead-ball solid, 10m and 5m dashed (cross-field), plus lengthwise 5m and 15m dashed lines off each touchline (running only through the field of play), in-goal areas, and rugby goalposts (H, tall uprights) straddling each try line. Also: a large team-name label (Anton display font, team-coloured) filling each in-goal naming the end a side defends; a `#latest-commentary` strap above the field; a territory tug-of-war bar; a phase/attacking-team label; per-side card pips; and zone flashes on try/penalty/card/turnover beats. **Kick-at-goal flight animation:** when a `success`, `kick_for_goal`, or `miss` phase_outcome step fires on the `engine:event` bus during a ConversionKick or Penalty phase, a `#pitch-kick-flight` overlay element (same BALL_SVG, `z-index: 5`) is CSS-transitioned from the kick position to the posts area (success → centre 50%, miss → wide on the kick side) while scaling down to 25% and fading out over 600ms, giving a "ball flying into the distance" effect. The field rotates 180° at half-time. The 1D `#pitch-wrapper` strip is retained in the scoreboard for the other four views and hidden via `body.pitch-view-active` only in Pitch view. **Player dots (Level 3):** FM-style numbered team-coloured circles render the players *involved in each beat* — harvested from the `GameEvent` actors + each narration step's `primary`/`secondary` (so a wide play shows the fly-half → centre → wing chain) — plus the full 16-forward packs at scrums (two 3-4-1 shapes at the mark) and lineouts (two lines off the near touchline). Positions are an inferred, stylized impression (the engine has no per-player coordinates): carrier on the ball, support fanned behind, defenders just ahead; the carrier dot holds at the receive point through the passes then runs the final carry leg onto the ball; dots fade in/out per beat. Team is resolved by object-reference equality against the live rosters, so colours stay correct even on interception/turnover beats. Split for clean boundaries: `src/ui/pitchChoreography.ts` (pure rugby→geometry, no DOM) + `src/ui/PitchPlayers.ts` (a dumb dot pool + a `BallWalkFollower` seam), driven by one delegating call from `PitchView`. Pure UI over the beat-synced `display` snapshot + `GameEvent` actors — no engine impact.

The shared `createRowExpander` + `.row-expand-panel` pattern from §4.8 is the only correct way to add new expandable rows to the live panel — do not invent a screen-specific `max-height` toggle.

---

## 9. Light mode (deferred)

Light mode is **out of scope for now.** The game is dark-only until a dedicated implementation pass is ready. Do not add `body.light-mode` overrides, `prefers-color-scheme` media queries, or theme-toggle UI.

### 9.1 What this means today

- `style/main.css` tokens are dark-only. There is no `body.light-mode` ruleset.
- `index.html` carries a gated pre-paint script (commented out). When light mode ships, uncomment the `localStorage` check there and build out the `body.light-mode` token overrides.
- The LocalStorage key is `rugby-manager-theme`; the class is `light-mode`. These names are reserved — do not repurpose them.

### 9.2 When light mode lands

1. Declare `body.light-mode { ... }` token overrides for every surface / text / border token in `main.css`.
2. Un-comment the pre-paint script in `index.html` so the class is applied before first paint.
3. Add a theme toggle to Settings and wire it to `uiPrefs.ts` (`saveTheme` / `loadTheme`).
4. Delete this "deferred" section and replace it with the live policy (token rules, shadow migration notes, team-colour pass-through).

---

## 10. Content & copy

### 10.1 Filler is forbidden

**Do not pad designs with placeholder text or filler content.** Every element earns its place. If a section feels empty, solve it with layout and composition — not by inventing content.

### 10.2 Number formatting

- **Wages:** `£420k` (under £1m), `£1.20M` (≥ £1m). Always uppercase M / lowercase k.
- **Scores:** Plain integers, mono tabular. Use an en-dash separator (`28–21`), not a hyphen.
- **Percentages:** Round to whole numbers (`58%`), unless precision matters (rare).
- **Player ratings:** One decimal (`7.4`, `8.1`), mono tabular.
- **Ages:** Plain integer (`28`), no "y" or "yrs" suffix.

### 10.3 Copy tone

- **Direct, not chatty.** "Squad saved" not "Great job! Your squad has been saved."
- **Active voice.** "Sign player" not "Player can be signed."
- **Title case for headings, sentence case for descriptions.**
- **No exclamation marks** anywhere in product copy.

### 10.4 Empty state copy pattern

Title: short noun phrase. Descriptor: one sentence explaining why empty and/or what to do next.

> **Title:** "No free agents available"
> **Descriptor:** "Check back after the next round of fixtures — new players become available as contracts expire across the league."

Not:

> ~~"No items found"~~
> ~~"NO FREE AGENTS AVAILABLE"~~ (bare label, all caps)

---

## 11. Feedback & affirmation

Every user-initiated state mutation produces visible feedback.

| Action | Feedback |
|---|---|
| Save squad | Toast: "Squad saved" |
| Sign free agent | Toast: "{name} signed" |
| Pre-agree poach | Toast: "{name} pre-agreed" (info variant) |
| Renew contract | Toast: "{name} renewed" |
| Release player | Toast: "{name} released" (danger variant) |
| Designate marquee | Star fills, cap pill updates in place — no toast (the inline state change is the affirmation) |
| Sort table | Header arrow updates in place — no toast |
| Filter list | List rerenders in place — no toast |

The principle: **toast when something globally meaningful changed**, inline update when the user's own action was tracked locally.

---

## 12. Accessibility

### 12.1 Focus states

Every interactive element shows a visible focus ring on `:focus-visible`:

```css
:focus-visible {
  outline: 2px solid var(--rm-pitch);
  outline-offset: 2px;
}
```

Do not strip `outline` without providing an alternative.

### 12.2 ARIA labels

- Icon-only buttons require `aria-label`.
- Decorative SVGs use `aria-hidden="true"`.
- Tab-like controls use `role="tab"` + `aria-selected`.
- Live regions for score updates use `aria-live="polite"`.

### 12.3 Contrast

- Body text on `--rm-bg`: ≥ 7:1 (`--rm-text` and `--rm-chalk` both clear this).
- Secondary text on `--rm-bg`: ≥ 4.5:1 (`--rm-text-muted`).
- Tertiary text (`--rm-text-dim`) sits at ~3:1 — use only for non-essential metadata.

### 12.4 Touch targets

See §5.3. Minimum 40px, prefer 44px.

---

## 13. Anti-patterns — do not do these

A non-exhaustive list of things that have been flagged in past audits and **must not return**:

- ❌ Emoji or Unicode glyphs as icons (★, ▲, ▼, ✓, ⚠)
- ❌ Hex codes outside `main.css :root` (with the two sanctioned constants — see §2.4)
- ❌ `var(--token, #fallback)` syntax — fix the token declaration instead
- ❌ Token names that don't exist in `:root` (e.g. referencing `--rm-danger` before it was declared)
- ❌ Cards using a background darker than their parent (inverted depth)
- ❌ Anton below 18px
- ❌ Section labels at 8px (the standard is 10px)
- ❌ `.app-title` at 16px (the standard is 20px)
- ❌ Bare text empty states — always use the structured `.empty-state` pattern
- ❌ Per-screen toast implementations — always use `showToast()`
- ❌ Hardcoded `padding-bottom: max(env(safe-area-inset-bottom), Npx)` — use `var(--safe-bottom)`
- ❌ Animation durations under 150ms
- ❌ `:hover` rules outside `@media (hover: hover)` for tappable elements
- ❌ `:hover` states without `transition` declarations
- ❌ Inline `width/height/border-radius` on crest elements — use the canonical scale
- ❌ Using `--rm-stat-4` (green) for accent text alongside `--rm-pitch` — they're the same hue
- ❌ Amber (`--rm-amber`) for injuries (red `--rm-danger` is correct)
- ❌ Red (`--rm-danger`) for performance rewards (amber `--rm-amber` is correct)
- ❌ `in oklch` for `--team-color` gradients — use `in srgb` with `black` to preserve hue on red/purple teams
- ❌ Setting `--team-color` on league-neutral screens (LeagueTable, TeamStats, PlayerStats) — multi-club views should not be personalised with the manager's team colour
- ❌ Bright gradients, soft pastels, photo backgrounds, leather textures
- ❌ Filler content / dummy sections / placeholder copy
- ❌ Exclamation marks in product copy

---

## 14. When in doubt

Reach for the existing reference implementations:

| Need | Look at |
|---|---|
| Card with elevation | `#hub-next-match` in `hub.css` |
| Primary CTA | `#hub-play-next`, `#mr-continue`, `#sq-save` |
| Shared screen header | `LeagueTableScreen.ts`, `FixtureListScreen.ts` |
| Section labels | `.mr-card-title`, `.sq-section-label`, `.eos-h3` (all at 10px mono) |
| Empty state | `.empty-state` in `main.css`, used in Squad + Transfer Market |
| Toast | `src/ui/Toast.ts` + `.rm-toast` in `main.css` |
| Notification badge | `.notification-badge` + Hub tile usage |
| Crest at any size | Read the four `--crest-*` token values, pick the right one |
| Tier 1 full-screen team-colour gradient | `#hub` or `#pre-match` `background-image` in `hub.css` / `prematch.css` |
| Tier 2 tinted app-header team-colour | `#contracts .app-header` in `contracts.css` |
| Team-coloured active chip / filter | `.sq-chip.active` in `squad.css` |
| Team-coloured jersey badge | `.sq-jersey--starter` in `squad.css` |

When the existing implementations contradict each other, **this document is correct** and the implementation is the bug.

---

## 15. Navigation & Screen Architecture

### 15.1 Routing rule

All transitions go through **`screenRouter.show(id, { direction? })`** (`src/ui/ScreenRouter.ts`). Screen modules never call `document.getElementById('...').style.display` directly; they accept `onForward`/`onBack` callbacks from `main.ts`. Adding a screen: (1) add the id to the `SCREENS` map in `ScreenRouter.ts`, (2) add `<div id="...">` to `index.html`, (3) wire a flat handler in `main.ts`.

**Overlay exception:** The half-time team talk (`#half-time-panel`) is a fixed-position full-screen overlay that sits inside `#app` but outside ScreenRouter — it appears over the match screen and is toggled via `classList.remove/add('hidden')` directly. The pre-match team talk is a normal routed screen (`team-talk`).

### 15.2 In-season screen lifecycle

**Initialised exactly once per page lifetime.** `initInSeasonScreens()` in `main.ts` is gated by an `inSeasonInited` closure flag — the second call is a no-op. This is load-bearing: each screen registers `eventBus.on('game:*')` subscriptions at init time without an unsub; the gate prevents duplicated handlers on back/forward navigation or game switch.

Each screen receives a **`getGameEngine: () => GameCoordinator` getter** (not the engine reference). Screens call `getGameEngine().getState()` on every render. When `main.ts` reassigns `gameEngine` for a new game, every screen reads the new engine automatically — capturing the reference at init time would freeze screens to the first game. Subsequent visits use bare `screenRouter.show(id)`.

**Hub is the top of the in-season stack** — no back arrow. The Settings cog is the exit route to Home. Back arrows on all other in-season sub-screens return to Hub (except Settings, which also has a Home-entry path via `goSettingsFromHome`).

### 15.3 Dual-mode screens

Some screens serve both the post-match Continue chain and direct Hub entry. Pattern: expose a module-level setter (e.g. `showRoundResults(round, onContinue)`) that the orchestrator calls *before* `screenRouter.show(id)`. The setter updates closure state so a forward "Continue → next" CTA renders in place of the back arrow. Mode clears on the forward click. Hub-entry omits the setter and gets the normal back-arrow render.

Dual-mode screens: `RoundResultsScreen`, `LeagueTableScreen`, `TrainingScreen`, `EndOfSeasonScreen`, `RenewalsScreen`, `TransferMarketScreen`, `RolloverScreen`. New dual-mode screens follow this pattern — do not reach for a global store or re-init the screen.

### 15.4 Hub tile list

The Hub (`src/ui/HubScreen.ts`) has **six tiles** plus a Settings cog and "Go to next match" CTA:

| Tile | Routes to | Notes |
|---|---|---|
| Squad | `squad-management` | Matchday-23 curation; round-trips with PreMatch via `state.player.matchdaySquad` |
| Fixtures | `fixture-list` | Upcoming and completed rounds |
| League | `league-menu` | Sub-menu: Table / Team Stats / Player Stats / Cup (browse) / Awards |
| Training | `training` (mid-week mode) | Persists plan without running the training block |
| Contracts & Transfers | `contracts-transfers-menu` | Sub-menu (club colours): Contracts leaf + Transfers leaf + Scouting leaf; badge = expiring-contract count + poach-threat count combined |
| Club | `club-menu` | Sub-menu (club colours): board-confidence card + Staff nav row |

**Invariant: the Hub tile count is fixed at six.** New screens must fit inside existing sub-menus. `ClubMenuScreen` and `ContractsTransfersMenuScreen` are the natural homes for club-management features.

PreMatch's 'mine' step (the user's starting XV) carries a tappable captain badge (`.pm-captain-badge`, a circular "C") on each starter row — modelled on the OOP badge. Tap to nominate, tap the current captain to clear; persists to `state.player.captainRosterId` via `setPlayerCaptain`. Unset rows default the badge to the highest-composure starter (`resolveCaptainRosterId`). Narrative-only: the captain is named in the referee's team-22 warning during the match.

**Contracts sub-menu** (`contracts-transfers-menu`, `src/ui/ContractsTransfersMenuScreen.ts`): Tier 2 club-colour app-header; four tiles with the same `.hub-tile` class but WITHOUT the `--rm-cta` override used by the League sub-menu, so tiles inherit `--team-color-tile` from `injectTeamColors`. Individual tile badges: Contracts = expiring-contract count, Transfers = poach-threat count, Scouting = total scouted player count. The fourth tile is **Loans** → `loans` (loan management screen — development loans out to a fixed partnership club, emergency cover loans in from a generated pool).

**Club sub-menu** (`club-menu`, `src/ui/ClubMenuScreen.ts`): Tier 2 club-colour app-header. Hosts the **board-confidence card** (`.cm-board`): a summary hero (band label + 0–100 meter + number, accent-coloured by band — Secure / Stable / Under pressure / At risk), a live **"what's driving it"** factor list (`boardConfidenceFactors` — season objective vs current position, recent results, winning/losing runs, any formal warning, each tone-tagged), and a plain-English explainer of how the meter moves. See `docs/game-engine.md` § "Board confidence layer". Below the board card is a **Staff nav row** (`.cm-nav-row`) linking to `StaffScreen`; new club-management screens should be added here as additional `.cm-nav-row` entries.

### 15.5 Navigation flow

```
Home
 └─ Team Selector
     └─ Mode Picker
         ├─ Quick Start → Hub (authored rosters / contracts / marquee)
         └─ Squad Builder → BudgetReveal → SquadOverview → pre-season signing window
               → ContractsScreen (marquee-edit) → Hub
Hub
 ├─ Squad / Fixtures / League / Training → leaf screen, back → Hub
 ├─ [League] → LeagueMenuScreen → leaf, back → LeagueMenuScreen → back → Hub
 ├─ [Contracts & Transfers] → ContractsTransfersMenuScreen → Contracts / Transfers / Scouting / Loans, back → ContractsTransfersMenuScreen → back → Hub
 │   └─ [Scouting] → ScoutingScreen (swipe card → removeScouting; tap card → PlayerProfile), back → ContractsTransfersMenuScreen
 ├─ [Club] → ClubMenuScreen (board-confidence card + Staff nav row), back → Hub
 │   └─ [Staff] → StaffScreen (hire/release assistant manager, fitness lead, scouts), back → ClubMenuScreen
 └─ Go to next match → PreMatch
     └─ Kick Off → TeamTalk → Match → MatchResult → post-match chain
```

**Post-match chain — regular rounds:**
[Press Conference? (newsworthy only)] → Round Results → League Table → Training (runs block) → Hub

**Post-match chain — international break (R6 / R11):**
League Table → IntlCallUps → CupFixtures → Training (`runInternationalBreakBlock`) → CupResults → PostTrainingResults → [InternationalBreak if duty players returned] → Hub

**Post-match chain — after R18 (final regular round):**
League Table → Training → Hub (bracket now active)

**R19 — Semi-Final week (from Hub CTA "Play Semi-Final" / "Continue"):**
[PreMatch → TeamTalk → Match → MatchResult (if player qualified)] → PlayoffBracket (SF results) → Training → Hub

**R20 — Final week (from Hub CTA "Play Final" / "Continue"):**
[PreMatch → TeamTalk → Match → MatchResult (if player in Final)] → PlayoffBracket (Final results) → Hub

**Hub CTA "Continue" (champion crowned):**
→ EndOfSeason → BudgetReveal → [TakeoverReveal if fired] → [Renewals if expiring] → [TransferMarket if FA/poach pool] → Rollover → Hub

**Job security (Tier 0 · 0.1).** Board confidence (`state.player.board`) drains on poor results and an end-of-season objective miss. At the warning threshold the inbox shows a final-warning item; at the sack threshold the manager is dismissed — mid-season (after a result, with a prior warning; persisted `board.sacked` latch) or end-of-season (the pure `judgeSeasonObjective()` verdict on EndOfSeason). `main.ts` reads `GameCoordinator.isManagerSacked()` on every continue / resume path so a reload can't escape the dismissal; either route clears the active save slot and shows the game-over `SackScreen` (New Game → Team Selector, or Main Menu → Home).

**Pre-season resume.** Each Squad Builder step writes `state.career.preSeasonStep` (`PRE_SEASON_STEP_SET`) before saving. `continueGame` reads the flag and routes back to the in-flight screen after a mid-pre-season tab close.

---

## 16. Maintaining this document

- Update this document in the **same PR** as any change that introduces a new pattern.
- Quarterly UI audits (see `docs/UI-AUDIT-v2.md` for the May 2026 template) will surface drift. Fix drift by either updating this document (if the new pattern is correct) or filing tasks (if the implementation is wrong).
- Specific design decisions are linked from this document — never re-debate them inside a PR review. If a rule needs to change, change it here first.

---

*Match Day Editorial — broadcast-grade dark — Rugby Manager*
