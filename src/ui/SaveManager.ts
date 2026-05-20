// Persists the player's in-progress season to localStorage so the Home Screen's
// "Continue Game" button can resume mid-season after a browser close. Schema is
// versioned — bump SAVE_VERSION whenever the shape changes and add a migration
// (or invalidate stale saves) here.

const SAVE_KEY = 'rugby-manager-save';
const SAVE_VERSION = 1;

export type SavedResult = {
  round: number;
  homeId: string;
  awayId: string;
  playerSide: 'home' | 'away';
  homeScore: number;
  awayScore: number;
};

export type SavedGame = {
  version: number;
  playerTeamId: string;
  currentRound: number;
  results: SavedResult[];
};

export function loadSave(): SavedGame | null {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as SavedGame;
    if (parsed.version !== SAVE_VERSION) return null;
    if (typeof parsed.playerTeamId !== 'string') return null;
    if (typeof parsed.currentRound !== 'number') return null;
    if (!Array.isArray(parsed.results)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveGame(save: Omit<SavedGame, 'version'>): void {
  const payload: SavedGame = { version: SAVE_VERSION, ...save };
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
  } catch {
    // Storage full / disabled / private mode — silent for MVP.
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    // ignore
  }
}
