// User-facing UI preferences kept in localStorage with their own lifecycle —
// per-user, never cleared on team-switch (so they're not part of SaveManager).
// Today this is the match tick delay, the key-moment auto-pause / auto-slow
// toggles, and the live-match commentary filter.

const TICK_DELAY_KEY        = 'rugby-manager-tick-delay-ms';
const DEFAULT_TICK_DELAY_MS = 2500;
// Bounds bracket the speed buttons' data-ms range in AppShell.ts (currently
// 400ms at 4× → 5000ms at ½×). A saved value outside the range falls back
// to the default — defense against a hand-edited localStorage entry.
const MIN_TICK_DELAY_MS = 100;
const MAX_TICK_DELAY_MS = 5000;

const AUTO_PAUSE_KEY = 'rugby-manager-auto-pause';
const AUTO_SLOW_KEY  = 'rugby-manager-auto-slow';

export function loadTickDelayMs(): number {
  try {
    const raw = localStorage.getItem(TICK_DELAY_KEY);
    if (raw === null) return DEFAULT_TICK_DELAY_MS;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < MIN_TICK_DELAY_MS || n > MAX_TICK_DELAY_MS) {
      return DEFAULT_TICK_DELAY_MS;
    }
    return n;
  } catch {
    return DEFAULT_TICK_DELAY_MS;
  }
}

export function saveTickDelayMs(ms: number): void {
  try {
    localStorage.setItem(TICK_DELAY_KEY, String(ms));
  } catch {
    // localStorage disabled / quota exceeded — silent for MVP.
  }
}

// Auto-pause defaults ON: a first-time user gets the most dramatic experience.
export function loadAutoPauseEnabled(): boolean {
  try {
    return localStorage.getItem(AUTO_PAUSE_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function saveAutoPauseEnabled(on: boolean): void {
  try {
    localStorage.setItem(AUTO_PAUSE_KEY, on ? 'on' : 'off');
  } catch {
    // localStorage disabled / quota exceeded — silent.
  }
}

// Auto-slow defaults OFF: with auto-pause on by default, slow is the
// alternative-mode escape hatch for users who'd rather not click.
export function loadAutoSlowEnabled(): boolean {
  try {
    return localStorage.getItem(AUTO_SLOW_KEY) === 'on';
  } catch {
    return false;
  }
}

export function saveAutoSlowEnabled(on: boolean): void {
  try {
    localStorage.setItem(AUTO_SLOW_KEY, on ? 'on' : 'off');
  } catch {
    // localStorage disabled / quota exceeded — silent.
  }
}

// Accessibility text scale — single multiplier applied to the --rm-text-scale
// CSS custom property, which every font-size token (--rm-fs-*) is derived from.
// Discrete iOS Dynamic Type-style steps: Default / Large / Larger / Largest.
const TEXT_SCALE_KEY = 'rugby-manager-text-scale';
export const TEXT_SCALE_VALUES = [1, 1.15, 1.3, 1.45] as const;
export const TEXT_SCALE_LABELS = ['Default', 'Large', 'Larger', 'Largest'] as const;
const DEFAULT_TEXT_SCALE = 1;

export function loadTextScale(): number {
  try {
    const raw = localStorage.getItem(TEXT_SCALE_KEY);
    if (raw === null) return DEFAULT_TEXT_SCALE;
    const n = Number(raw);
    if ((TEXT_SCALE_VALUES as readonly number[]).includes(n)) return n;
    return DEFAULT_TEXT_SCALE;
  } catch {
    return DEFAULT_TEXT_SCALE;
  }
}

export function saveTextScale(scale: number): void {
  try {
    localStorage.setItem(TEXT_SCALE_KEY, String(scale));
  } catch {
    // localStorage disabled / quota exceeded — silent.
  }
}

// Writes the multiplier onto :root so every --rm-fs-* token rescales at once.
// Called once at boot (main.ts) and live on each Settings change.
export function applyTextScale(scale: number = loadTextScale()): void {
  document.documentElement.style.setProperty('--rm-text-scale', String(scale));
}

// Commentary feed filter — single-select, sticky across matches. Maps to
// the `.commentary-entry .event-*` phase classes the feed already emits.
const CF_FILTER_KEY = 'rugby-manager-cf-filter';
export const CF_FILTER_VALUES = ['all', 'tries', 'penalties', 'kicks'] as const;
export type CfFilter = typeof CF_FILTER_VALUES[number];

export function loadCommentaryFilter(): CfFilter {
  try {
    const raw = localStorage.getItem(CF_FILTER_KEY);
    if (raw && (CF_FILTER_VALUES as readonly string[]).includes(raw)) {
      return raw as CfFilter;
    }
    return 'all';
  } catch {
    return 'all';
  }
}

export function saveCommentaryFilter(f: CfFilter): void {
  try {
    localStorage.setItem(CF_FILTER_KEY, f);
  } catch {
    // localStorage disabled / quota exceeded — silent.
  }
}
