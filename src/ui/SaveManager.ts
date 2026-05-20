// Persists the player's in-progress season to localStorage so the Home
// Screen's "Continue Game" button can resume mid-season after a browser
// close. Schema is versioned — bump SAVE_VERSION whenever the shape changes.
//
// v2 stores the minimal slice needed for GameCoordinator.fromSave to
// deterministically reconstruct the whole GameState: playerTeamId, seed,
// currentWeek, and every recorded result (player's + AI-vs-AI). Fixtures,
// standings, and calendar.date are all derived during replay.
//
// v1 saves are discarded — they predate AI-vs-AI results, so the table
// could not be reconstructed without re-simulating absent rounds.

import type { SavedSeason, SavedSeasonResult } from '../game/GameCoordinator';

const SAVE_KEY = 'rugby-manager-save';
const SAVE_VERSION = 2;

export type SavedGame = SavedSeason & { version: number };

export function loadSave(): SavedSeason | null {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as SavedGame;
    if (parsed.version !== SAVE_VERSION) return null;
    if (typeof parsed.playerTeamId !== 'string') return null;
    if (typeof parsed.seed !== 'number') return null;
    if (typeof parsed.currentWeek !== 'number') return null;
    if (!Array.isArray(parsed.results)) return null;
    return {
      playerTeamId: parsed.playerTeamId,
      seed: parsed.seed >>> 0,
      currentWeek: parsed.currentWeek,
      results: parsed.results.map(r => ({
        round: r.round,
        homeId: r.homeId,
        awayId: r.awayId,
        playerSide: r.playerSide ?? null,
        homeScore: r.homeScore,
        awayScore: r.awayScore,
      } satisfies SavedSeasonResult)),
    };
  } catch {
    return null;
  }
}

export function saveGame(save: SavedSeason): void {
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
