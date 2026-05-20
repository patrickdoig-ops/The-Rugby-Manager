// Persists the player's in-progress season to localStorage so the Home
// Screen's "Continue Game" button can resume mid-season after a browser
// close. Schema is versioned — bump SAVE_VERSION whenever the shape changes.
//
// v3 (current) extends v2 with `seasonLabel` and `fixtures` snapshots so the
// schedule the user saw at save time is reconstructed verbatim on load. An
// edit to the canonical PREMIERSHIP_2025_26 mid-season no longer corrupts a
// player's in-progress save.
//
// v2 stored the minimal slice for replay (playerTeamId, seed, currentWeek,
// results); it predates the per-save schedule snapshot. Migrated transparently
// on load — v2 saves were created against PREMIERSHIP_2025_26 (the only
// schedule that has ever shipped), so loading them with the current schedule
// is correct as long as fixtures-2025-26.ts hasn't drifted since the save.
//
// v1 saves are discarded — they predate AI-vs-AI results, so the table
// could not be reconstructed without re-simulating absent rounds.

import type { SavedSeason, SavedSeasonResult } from '../game/GameCoordinator';
import type { Fixture } from '../types/gameState';

const SAVE_KEY = 'rugby-manager-save';
const SAVE_VERSION = 3;

export type SavedGame = SavedSeason & { version: number };

export function loadSave(): SavedSeason | null {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as SavedGame;
    if (parsed.version !== SAVE_VERSION && parsed.version !== 2) return null;
    if (typeof parsed.playerTeamId !== 'string') return null;
    if (typeof parsed.seed !== 'number') return null;
    if (typeof parsed.currentWeek !== 'number') return null;
    if (!Array.isArray(parsed.results)) return null;
    // v3 includes the schedule snapshot; v2 omits it and GameCoordinator
    // falls back to the canonical PREMIERSHIP_2025_26 during fromSave.
    const fixtures: Fixture[] | undefined =
      parsed.version === SAVE_VERSION && Array.isArray(parsed.fixtures)
        ? parsed.fixtures.map(f => ({
            round: f.round,
            homeId: f.homeId,
            awayId: f.awayId,
            ...(f.date !== undefined ? { date: f.date } : {}),
          }))
        : undefined;
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
      ...(parsed.seasonLabel !== undefined ? { seasonLabel: parsed.seasonLabel } : {}),
      ...(fixtures !== undefined ? { fixtures } : {}),
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
