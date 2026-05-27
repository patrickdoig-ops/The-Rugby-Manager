# DESIGN.md — Rugby Manager Design System

> **System name:** Match Day Editorial v2.1
> **Last revised:** May 2026 (after UI Audit v2.0)
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
- **One CTA colour pinned in hex: `#007a2a`.** Everything else is a token.

---

## 2. Colour system

### 2.1 Token architecture

All colours are declared in `style/main.css` `:root` using **oklch** for perceptual uniformity. Every token has a `body.light-mode` counterpart in the same file.

**You may never:**
- Declare a colour outside `main.css :root` (with the single exception of `#007a2a` for the primary CTA)
- Use a hex code, `rgb()`, `rgba()`, or named colour (`white`, `red`) inline in screen CSS or TS
- Use `var(--token, #fallback)` syntax — fallbacks hide missing declarations

**You should:**
- Reach for `color-mix(in oklch, var(--token) X%, transparent)` for tints
- Add new tokens to `:root` (and `body.light-mode`) when an existing one doesn't fit, rather than hardcoding

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
| `--rm-pitch` | Primary / active / alive | CTAs, active tabs, selected rows, brand moments, hub hero, eyebrows |
| `--rm-amber` | Performance reward | MOTM badges, top scorer callouts, milestone notifications, salary-cap "tight" state |
| `--rm-danger` | Negative health/discipline | Injuries, expiring contracts, red-card markers, over-cap state, release confirmations |
| `--rm-stat-3` (gold) | Quantitative elite | Player overall ratings ≥ 85 |
| `--rm-stat-5` (cyan) | Analytical/predictive | Match spread predictions, statistical callouts, trending indicators |

### 2.4 The one allowed hex

The primary CTA green `#007a2a` is intentionally pinned and may appear inline. This is the only exception to "no hex outside `main.css :root`."

```css
/* OK */
#hub-play-next {
  background: #007a2a;
}

/* NOT OK */
.something-else {
  background: #d8503e; /* should be var(--rm-danger) */
}
```

### 2.5 Team colours

Team brand colours are dynamic data (set from team JSON) and must be passed via the `--team-color` CSS custom property on the screen root:

```ts
const screenEl = document.getElementById('hub');
screenEl.style.setProperty('--team-color', team.color);
```

Then in CSS, reference with a fallback to pitch:

```css
.hub-crest {
  background: linear-gradient(160deg,
    var(--team-color, var(--rm-pitch)),
    color-mix(in oklch, var(--team-color, var(--rm-pitch)) 30%, black));
}
```

The fallback to `--rm-pitch` is acceptable here because team colour is genuinely runtime-dynamic, unlike system tokens.

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

Team crests appear at **exactly four sizes**. There is no fifth size; if you need one between two steps, choose the larger.

| Token | Size | Radius | Font-size | Use case |
|---|---|---|---|---|
| `--crest-xs` | 22×22 | 5px | 11px | League table rows, round results, fixture list rows |
| `--crest-sm` | 34×34 | 8px | 15px | Next-match cards, live scoreboard, pre-match summary header |
| `--crest-md` | 44×44 | 10px | 22px | Match Result hero, Pre-Match split-screen, Team Selector cards |
| `--crest-lg` | 58×58 | 13px | 28px | Hub hero, end-of-season standings highlight |
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

> **Light-mode caveat:** The current shadow stack is dark-calibrated. When the light-mode pass lands (C4), shadow rgba values will be parameterised via new tokens. Until then, treat the shadow as dark-only.

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
| 22–24px | Hub tile icons |
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

Sound cues come from the existing three-cue palette (`whistle`, `crowdRoar`, `uiClick`) — no new audio assets. Audio plays under reduced motion (audio is independent of motion).

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
  color: #ffffff;
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

---

## 9. Light mode policy

Light mode is **a first-class feature, not an afterthought.** Any new CSS rule that uses a colour MUST work in both modes.

### 9.1 Rules

1. **Every colour token must have a `body.light-mode` override** in `main.css`. Adding a token in dark-only is forbidden.
2. **No hardcoded `rgba(0,0,0,*)` or `rgba(255,255,255,*)`** outside `main.css`. Use mode-aware tokens.
3. **Shadow opacities** are currently dark-calibrated and will be migrated to parameterised tokens. Until that lands (tracked as C4 in `docs/ui-audit-tasks/`), the light-mode toggle is gated behind an experimental flag.
4. **Team brand colours** are inherently mode-agnostic and pass through unchanged via `--team-color`.

### 9.2 Current state

The light-mode toggle is hidden in production until the full pass completes. See `docs/ui-audit-tasks/C4-light-mode.md` for the planned migration.

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
- ❌ Hex codes outside `main.css :root` (with the single `#007a2a` exception)
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
| Team-colour atmospheric wash | `#hub-hero` background-image, `#end-of-season::before` |

When the existing implementations contradict each other, **this document is correct** and the implementation is the bug.

---

## 15. Maintaining this document

- Update this document in the **same PR** as any change that introduces a new pattern.
- Quarterly UI audits (see `docs/UI-AUDIT-v2.md` for the May 2026 template) will surface drift. Fix drift by either updating this document (if the new pattern is correct) or filing tasks (if the implementation is wrong).
- Specific design decisions are linked from this document — never re-debate them inside a PR review. If a rule needs to change, change it here first.

---

*Match Day Editorial — broadcast-grade dark — Rugby Manager*
