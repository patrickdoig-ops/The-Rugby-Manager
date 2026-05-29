// App-wide achievement unlock persistence. Mirrors the uiPrefs.ts pattern:
// its own localStorage key, defensive try/catch, silent failure. Lives
// outside SaveManager deliberately — achievements are per-player (per
// device), not per-career, so they survive starting a new game / switching
// teams (clearSave only removes the 'rugby-manager-save' key). This matches
// Game Centre's per-account, not per-save, semantics.

const ACHIEVEMENTS_KEY = 'rugby-manager-achievements';

export interface UnlockedRecord {
  unlockedAt: number; // epoch ms
}

type UnlockedMap = Record<string, UnlockedRecord>;

export function loadUnlocked(): UnlockedMap {
  try {
    const raw = localStorage.getItem(ACHIEVEMENTS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (parsed === null || typeof parsed !== 'object') return {};
    return parsed as UnlockedMap;
  } catch {
    return {};
  }
}

export function isUnlocked(id: string): boolean {
  return id in loadUnlocked();
}

// Idempotent: re-marking an already-unlocked id is a no-op (keeps the
// original unlockedAt). Returns true only on a genuine first unlock, so
// the caller knows whether to fire the toast + Game Centre report.
export function markUnlocked(id: string): boolean {
  try {
    const map = loadUnlocked();
    if (id in map) return false;
    map[id] = { unlockedAt: Date.now() };
    localStorage.setItem(ACHIEVEMENTS_KEY, JSON.stringify(map));
    return true;
  } catch {
    return false;
  }
}
