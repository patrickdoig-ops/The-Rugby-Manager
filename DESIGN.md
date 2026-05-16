# Design Guide

A reference for visual design, layout patterns, and component conventions used across the app. Intended for anyone extending or restyling the UI.

---

## Typography

Two font families are used throughout.

**Sans-serif — Inter**
Used for all body text, labels, and UI copy.

| Weight | Usage |
|--------|-------|
| 300 | Light labels, secondary captions |
| 400 | Body text, descriptions |
| 500 | Emphasis, subheadings |
| 600 | Section labels, interactive text |
| 700 | Primary headings, bold UI elements |
| 800 | Hero text, screen titles |

**Monospace — Space Mono / JetBrains Mono**
Used for all numeric values and anything that must align in columns. Always pair with `tabular-nums` to prevent digit-width jitter.

```css
font-family: "Space Mono", "JetBrains Mono", monospace;
```

**Terminal mode:** The `.terminal-mode` class applies `font-mono !important` to every element on screen, giving a full monospace aesthetic selectable in settings.

**Screen titles** use all-caps with `tracking-[0.2em]` letter-spacing.

---

## Colour System

All colours are CSS custom properties defined on `:root` and overridden by `.dark-mode`. Tailwind tokens map to these properties via `@theme` in `index.css`.

### Light mode

| Token | Variable | Hex | Usage |
|-------|----------|-----|-------|
| `bg` | `--bg` | `#FFFFFF` | Page background |
| `surface` | `--surface` | `#F7F7F7` | Card / panel fill |
| `surface2` | `--surface2` | `#FAFAFA` | Nested surface, input fill |
| `border-dim` | `--border` | `#EEEEEE` | Subtle dividers |
| `border-mid` | `--border-mid` | `#CCCCCC` | Standard borders |
| `text` | `--text` | `#1D1D1B` | Primary text |
| `text-sec` | `--text-sec` | `#2D3039` | Secondary text |
| `text-muted` | `--text-muted` | `#757575` | Placeholder, captions |
| `trading-blue` | `--blue` | `#0F70C7` | Primary action colour |
| `trading-blue-dark` | `--blue-dark` | `#0019A8` | Hover state for blue |
| `trading-blue-light` | `--blue-light` | `#EFF6FD` | Blue tinted surfaces |
| `trading-green-text` | `--green-text` | `#00782A` | Profit, positive P&L |
| `trading-green-bg` | `--green-bg` | `#E7F6DC` | Profit background tint |
| `trading-red-text` | `--red-text` | `#C8102E` | Loss, negative P&L |
| `trading-red-bg` | `--red-bg` | `#FFEFEF` | Loss background tint |
| `trading-amber-text` | `--amber-text` | `#7A6500` | Warnings, special values |
| `trading-amber-bg` | `--amber-bg` | `#FAF5E1` | Warning background tint |
| `trading-purple-text` | `--purple-text` | `#6B21A8` | Achievements, rare items |
| `trading-purple-bg` | `--purple-bg` | `#F5EFFF` | Achievement background tint |
| `trading-gold` | `--gold` | `#D4AF37` | Career final, legendary rarity |
| `surface-alt` | `--surface-alt` | `#EEEEEE` | Muted button fill |
| `surface-hover` | `--surface-hover` | `#E8E8E8` | Muted button hover |

### Dark mode (`.dark-mode`)

| Token | Hex | Notes |
|-------|-----|-------|
| `--bg` | `#000000` | Pure black |
| `--surface` | `#000000` | Matches bg |
| `--surface2` | `#0A0A0A` | Barely lifted |
| `--border` | `#333333` | |
| `--border-mid` | `#555555` | |
| `--text` | `#FFFFFF` | |
| `--text-sec` | `#CCCCCC` | |
| `--text-muted` | `#888888` | |
| `--blue` | `#00BAFF` | Brighter for dark contrast |
| `--blue-dark` | `#005A8C` | |
| `--blue-light` | `#001A26` | |
| `--green-text` | `#00FF00` | Neon — do not use as button bg |
| `--red-text` | `#FF1A00` | Neon — do not use as button bg |
| `--amber-text` | `#FFB800` | |
| `--purple-text` | `#A855F7` | |
| `--gold` | `#FFD700` | |

> **Critical:** The dark-mode green (`#00FF00`) and red (`#FF1A00`) are neon values with near-zero contrast against white text. Never use `bg-trading-green-text` or `bg-trading-red-text` as button backgrounds. Use the fixed hex values `#007a2a` (buy) and `#b8001b` (sell) instead — these work in both modes.

## Spacing & Layout

The app is a full-viewport single-page experience with no browser chrome. Layout is built on Tailwind utility classes with the following conventions:

- **Padding scale:** `p-3` / `p-4` inside panels; `p-6` for page-level containers; responsive variants use `md:` prefix
- **Gap scale:** `gap-2` for tight rows, `gap-3`–`gap-4` for component groups, `gap-5`–`gap-6` for sections
- **Border radius:** `rounded-[3px]` for playing cards (near-square), `rounded-lg` for buttons and chips, `rounded-xl` for floating panels and modals
- **Safe areas:** `.safe-top` and `.safe-bottom` utility classes handle iOS notch/home-indicator insets (`env(safe-area-inset-top/bottom)`, minimum 1rem)

### Scrolling

Scrollable regions hide their scrollbar via `.no-scrollbar` (cross-browser, using both `-webkit-scrollbar: none` and `scrollbar-width: none`).

---

## Shadows & Elevation

| Usage | Class |
|-------|-------|
| Light card lift | `shadow-sm` |
| Panel / modal | `shadow-md` or `shadow-lg` |
| Bottom sheet upward shadow | `shadow-[0_-2px_8px_rgba(0,0,0,0.06)]` |
| Blue button glow | `shadow-trading-blue/20` |

Avoid heavy shadows in dark mode — the near-black backgrounds make elevation feel more via border contrast than shadow depth.

---

## Motion

Animation uses the `motion/react` library (Framer Motion v12).

### Enter / exit pattern

Screens and panels enter with opacity + small transform, exit with a matching reverse:

```tsx
initial={{ opacity: 0, y: 8 }}
animate={{ opacity: 1, y: 0 }}
exit={{ opacity: 0, y: -8 }}
transition={{ duration: 0.18, ease: 'easeOut' }}
```

`AnimatePresence` in `App.tsx` wraps all screen transitions.

### Spring physics

Interactive elements (modals, cards, achievement badges) use spring transitions:

```tsx
transition={{ type: 'spring', stiffness: 300, damping: 22 }}
```

### Confetti

Achievement celebrations use CSS `@keyframes confettiFall`: 110vh fall over ~1.5s with a 720° rotation, fading out at 85%.

### Timing reference

| Duration | Usage |
|----------|-------|
| 80–120ms | Micro-interactions (button press, toggle) |
| 180–220ms | Panel open/close, element enter |
| 300–350ms | Screen transitions, card reveals |
| 500ms | Longer emphasis (settlement, career modal) |

---

## Buttons

### Primary (blue)

```
bg-trading-blue text-white rounded-lg
hover:bg-trading-blue-dark
transition-colors duration-200
```

Used for the main action on a screen (Start Game, etc.).

### Muted / secondary

```
bg-surface-alt text-text-main rounded-lg
hover:bg-surface-hover
border border-border-dim
```

Used for secondary actions and cancel buttons.

### Buy (green — fixed hex)

```
bg-[#007a2a] text-white rounded-lg
hover:bg-[#005c1e]
```

### Sell (red — fixed hex)

```
bg-[#b8001b] text-white rounded-lg
hover:bg-[#8f0015]
```

### Danger / destructive

```
bg-[#b8001b] text-white rounded-lg
hover:bg-[#8f0015]
```

Same as sell — used for delete/reset actions in settings.

### Small control buttons (± nudge buttons)

```
w-8 h-8 rounded-lg
bg-surface border border-border-mid
hover:bg-surface-v2
text-sm font-mono
```

---

### Sizes

| Size prop | Classes | Typical context |
|-----------|---------|-----------------|
| `sm` | `w-8 h-11 md:w-10 md:h-14` | Info bar, tutorial deck grid |
| `md` | `w-10 h-14` | Settlement recap rows |
| `lg` | `w-14 h-20 md:w-20 md:h-28` | Tutorial large display |

### Face-up colour coding

| Value | Text colour | Border colour |
|-------|-------------|---------------|
| `-10` | `trading-red-text` | `trading-red-text/40` |
| `20` | `trading-amber-text` | `trading-amber-text/50` |
| Community card | `trading-blue` | `trading-blue/60` on `trading-blue/5` bg |
| `1–15` (normal) | `text-main` | `border-mid` |


---

### Modals / dialogs

```
fixed inset-0 z-50
bg-black/60 backdrop-blur-sm
flex items-center justify-center
```

Inner card:
```
bg-bg border border-border-dim rounded-xl
p-6 shadow-lg
max-w-sm w-full mx-4
```

---

## Semantic Colour Usage

These mappings are consistent throughout the app and must not be reversed:

| Meaning | Colour |
|---------|--------|
| Profit / buy / positive | Green (`trading-green-text`) |
| Loss / sell / negative | Red (`trading-red-text`) |
| Primary action / selected | Blue (`trading-blue`) |
| Warning / special card (20) | Amber (`trading-amber-text`) |
| Achievement / rare | Purple (`trading-purple-text`) |
| Career final / legendary | Gold (`trading-gold`) |
| Break-even / neutral | Muted (`text-muted`) |

---

## Screen Structure

All screens are full-height flex columns (`flex flex-col min-h-screen` or `h-screen`). The in-game screen is the only one with a fixed layout: `Header (56–64px) → InfoBar → EventLog (flex-1, scrollable) → LiveMarket (conditional) → ActionPanel`.

Screens not in `validScreens` in `useSession.ts` (currently: `analytics`) fall back to `home` on page reload.

---

## Accessibility

- **Focus rings:** `focus-visible:ring-2 focus-visible:ring-trading-blue` on interactive elements
- **Tap highlight:** Suppressed globally (`-webkit-tap-highlight-color: transparent`)
- **Text selection:** Disabled on non-input elements (`user-select: none`) to prevent accidental selection during touch interactions; re-enabled on `input` and `textarea`
- **Colour contrast:** All text/background combinations are chosen for WCAG AA at minimum. The neon dark-mode values (`#00FF00`, `#FF1A00`) are text-only tokens — never used as backgrounds with white foreground text.

---

## Rarity Colours (Achievements)

| Rarity | Badge colour |
|--------|-------------|
| Common | `text-text-muted` / `border-border-mid` |
| Uncommon | `text-trading-green-text` / `border-trading-green-text` |
| Rare | `text-trading-blue` / `border-trading-blue` |
| Epic | `text-trading-purple-text` / `border-trading-purple-text` |
| Legendary | `text-trading-gold` / `border-trading-gold` |

---

## Do / Don't

**Do:**
- Use `font-mono tabular-nums` for every numeric value that updates live
- Read colour tokens from CSS variables via Tailwind tokens — never hardcode hex except for Buy/Sell buttons
- Use spring transitions for interactive surfaces; easeOut for passive enters

**Don't:**
- Use `bg-trading-green-text` or `bg-trading-red-text` as button backgrounds (neon in dark mode)
- Use `flex-wrap` for the InfoBar grid — column alignment breaks
- Reset the action panel spread value between live rounds — the player's chosen spread must persist
- Hardcode colours in component logic that belong in the theme (except the two Buy/Sell exceptions above)
