# CLAUDE.md — proposed invariant additions

> Merge these sections into the root `CLAUDE.md` once the UI Audit v2.0 PRs land.
> These are the architectural rules that the audit revealed were missing or under-specified.

---

## §X — Visual system invariants

These rules MUST hold across all screen CSS files. The UI Audit v2.0 identified each of these as having been violated at least once.

### Crest size scale (canonical)

Team crests appear at exactly four sizes. Each step has a fixed width, height, and border-radius. **Do not invent intermediate sizes.** Add a new step to the scale if needed; do not freelance.

| Token | Size | Radius | Use case |
|---|---|---|---|
| `--crest-xs` | 22×22 | 5px | League table rows, round results compact, fixture list rows |
| `--crest-sm` | 34×34 | 8px | Next-match cards, scoreboard, pre-match summary |
| `--crest-md` | 44×44 | 10px | Match result hero, pre-match split-screen |
| `--crest-lg` | 58×58 | 13px | Hub hero, end-of-season standings highlight |

Implementation: shared classes `.team-crest--xs`, `.team-crest--sm`, etc. defined in `main.css`. All crests across the product use these classes; no inline `width/height/border-radius` overrides.

### Colour rules

1. **Only `#007a2a` may appear as a hardcoded hex outside `main.css :root`.** It is the primary CTA green and is intentionally pinned. Every other colour MUST be a CSS custom property declared in `:root`.
2. **Every token MUST have a light-mode counterpart** in `body.light-mode`. If you add a token, add both modes in the same commit.
3. **Token fallbacks (`var(--foo, #fallback)`) are forbidden** outside debug builds. If the token might be undefined, fix the declaration, not the call site.

### Semantic colour map

These colours map to specific meanings. **Do not reuse a semantic colour for an unrelated state.**

| Token | Semantic |
|---|---|
| `--rm-pitch` | Primary accent, active/selected, "alive" UI |
| `--rm-amber` | Performance reward (MOTM, top performer, milestone) |
| `--rm-danger` | Negative health/discipline (injury, expiring contract, red card) |
| `--rm-stat-1` (red) | Quantitative low (rating < 60, declining attribute) |
| `--rm-stat-3` (gold) | Quantitative elite (rating ≥ 85) |
| `--rm-stat-4` (green) | Quantitative good — **but never for accent text against UI green** (use `--rm-text-muted`) |
| `--rm-stat-5` (cyan) | Analytical / predictive signal |

### Typography invariants

- **Section labels:** `font-family: var(--font-mono); font-size: 10px; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase; color: var(--rm-text-dim)`. No smaller.
- **`.app-title`** in the shared header is 20px Anton, not 16px.
- **In-flow primary CTAs:** 20px Anton. The Home screen hero buttons (28px) are the only exception, and they are explicitly a distinct context.
- **Anton minimum:** never use Anton below 18px. It loses its display authority and looks spindly.

### Layout invariants

- **Footer safe-area:** all bottom-pinned footers MUST use `padding-bottom: var(--safe-bottom)` where `--safe-bottom: max(env(safe-area-inset-bottom), 28px)` is declared in `:root`.
- **Tap targets:** interactive controls in the post-match flow MUST be ≥ 40px tall. Toggles, segmented controls, and pill buttons in headers must respect this.
- **Card elevation:** elevated surfaces use `var(--rm-surface-2)` or `--rm-surface-3` on a `--rm-surface` parent. **A card MUST NOT use `--rm-bg` as its background when its parent is `--rm-surface`** — that inverts the depth model.

### Animation invariants

- **No animation under 150ms.** Anything shorter is imperceptible and reads as a snap.
- **Default ease:** `cubic-bezier(0.22, 1, 0.36, 1)` for entry/exit. The `sheetUp` keyframe is the reference.
- **Ambient pulse:** 2.4s for breathing CTAs, 1.2s for "actively computing" states (round results, lineout setup). Don't mix the two.
- **Every interactive element MUST have a `transition` declaration** — never define a `:hover` state without one.

### Empty states

A list with zero items MUST render a structured empty state, not bare text:
- Centred in the panel with `padding: 48px 24px` vertical rhythm
- Icon (Heroicons outline, 32×32, `color: var(--rm-text-faint)`)
- Primary label (14px Geist, `--rm-text-muted`)
- Secondary descriptor (12px Geist, `--rm-text-dim`) explaining why empty / what to do

No bare `<div>NO ITEMS</div>`.

### Notification badges

Hub tiles and nav items that have actionable counts (injuries, expiring contracts, transfer offers) MUST display a notification badge:
- 16×16 circle, `background: var(--rm-danger)`, white text, 9px JBM, 700 weight
- Positioned `top: -4px; right: -4px` of the parent
- Shared class `.notification-badge`

### Light mode policy

Light mode is a first-class feature, not an afterthought. **Any new CSS rule that uses a colour MUST work in both modes.** If a hardcoded value is unavoidable (e.g. team brand colour), it must be set as a CSS custom property on the screen root, not inline in the rule.

If light mode is broken on a screen, the toggle MUST be gated behind a feature flag before merge.

---

## §Y — Feedback & affirmation

Every user-initiated state mutation MUST produce visible feedback:

| Action | Feedback |
|---|---|
| Save squad | Toast: "Squad saved" + button state pulse |
| Sign player | Toast: "{name} signed" + crest fly-in to roster (future) |
| Renew contract | Toast: "{name} renewed" + row state transition |
| Release player | Confirmation modal first, then toast |
| Advance week | Inline transition with audio cue (future) |

Use the shared `showToast(message, variant)` helper. Do not build per-screen toasts.
