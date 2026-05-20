// User-facing UI preferences kept in localStorage with their own lifecycle —
// per-user, never cleared on team-switch (so they're not part of SaveManager).
// Today this is just the match tick delay; theme persistence is bootstrapped
// inline in index.html for first-paint timing and stays separate.

const TICK_DELAY_KEY        = 'rugby-manager-tick-delay-ms';
const DEFAULT_TICK_DELAY_MS = 2000;
// Bounds match the slider's min/max in AppShell.ts. A saved value outside
// the range falls back to the default — defense against a hand-edited
// localStorage entry rather than a real path.
const MIN_TICK_DELAY_MS = 100;
const MAX_TICK_DELAY_MS = 4000;

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
