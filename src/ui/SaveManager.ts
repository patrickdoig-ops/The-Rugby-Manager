// Persists the player's in-progress career to localStorage so the Home
// Screen's "Continue Game" button can resume mid-season after a browser
// close. Schema is versioned — bump SAVE_VERSION whenever the shape changes.
//
// v5 (current) extends v4 with a persistent career snapshot —
// state.career.roster (every player, with current baseStats), per-club
// squad pointers, archived standings + awards from prior seasons, and the
// seasonsCompleted / nextRosterId allocator. Lets the career span multiple
// seasons with stat development and retirements that survive a tab close.
//
// v4 extended v3 with persisted pre-match choices — `tactics` and
// `matchdaySquad` — that carry forward as defaults for the next match.
// v4 saves are still loadable; the career snapshot is synthesised fresh
// from the JSON team data on load (lossless — pre-v5 there was zero
// per-player evolution to preserve).
//
// v3 extended v2 with `seasonLabel` and `fixtures` snapshots so the schedule
// the user saw at save time is reconstructed verbatim on load.
//
// v2 stored the minimal slice for replay (playerTeamId, seed, currentWeek,
// results).
//
// v1 saves are discarded — they predate AI-vs-AI results.

import type { SavedCareer, SavedSeason, SavedSeasonResult } from '../game/GameCoordinator';
import type { ArchivedSeason, ClubState, Fixture, PlayerRef } from '../types/gameState';
import type { Player } from '../types/player';
import type { TeamTactics } from '../types/team';

const SAVE_KEY = 'rugby-manager-save';
const SAVE_VERSION = 5;
const ACCEPTED_VERSIONS = new Set([5, 4, 3, 2]);

export type SavedGame = SavedSeason & { version: number };

export function loadSave(): SavedSeason | null {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as SavedGame;
    if (!ACCEPTED_VERSIONS.has(parsed.version)) return null;
    if (typeof parsed.playerTeamId !== 'string') return null;
    if (typeof parsed.seed !== 'number') return null;
    if (typeof parsed.currentWeek !== 'number') return null;
    if (!Array.isArray(parsed.results)) return null;
    // v3+ includes the schedule snapshot; v2 omits it and GameCoordinator
    // falls back to the canonical PREMIERSHIP_2025_26 during fromSave.
    const fixtures: Fixture[] | undefined =
      parsed.version >= 3 && Array.isArray(parsed.fixtures)
        ? parsed.fixtures.map(f => ({
            round: f.round,
            homeId: f.homeId,
            awayId: f.awayId,
            ...(f.date !== undefined ? { date: f.date } : {}),
          }))
        : undefined;
    // v4+ persists pre-match preferences (tactics + matchday squad).
    const tactics: TeamTactics | undefined =
      parsed.version >= 4 && parsed.tactics ? { ...parsed.tactics } : undefined;
    const matchdaySquad: PlayerRef[] | undefined =
      parsed.version >= 4 && Array.isArray(parsed.matchdaySquad) && parsed.matchdaySquad.length === 23
        ? parsed.matchdaySquad.map(r => ({ firstName: r.firstName, lastName: r.lastName }))
        : undefined;
    // v5+ persists the full career snapshot. v4 and older fall through —
    // GameCoordinator.fromSave seeds a fresh roster from JSONs.
    const career: SavedCareer | undefined =
      parsed.version >= 5 && parsed.career ? parseCareer(parsed.career) : undefined;
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
      ...(tactics !== undefined ? { tactics } : {}),
      ...(matchdaySquad !== undefined ? { matchdaySquad } : {}),
      ...(career !== undefined ? { career } : {}),
    };
  } catch {
    return null;
  }
}

// Best-effort structural parse of the v5 career envelope. Returns
// undefined if any required field is missing — callers (fromSave) then
// fall through to fresh-seed behaviour rather than corrupting state.
function parseCareer(raw: unknown): SavedCareer | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const c = raw as Record<string, unknown>;
  if (typeof c.seasonsCompleted !== 'number') return undefined;
  if (typeof c.nextRosterId !== 'number') return undefined;
  if (!Array.isArray(c.clubs)) return undefined;
  if (typeof c.roster !== 'object' || c.roster === null) return undefined;
  if (!Array.isArray(c.archive)) return undefined;
  return {
    seasonsCompleted: c.seasonsCompleted,
    nextRosterId: c.nextRosterId,
    clubs: (c.clubs as ClubState[]).map(cl => ({ id: cl.id, squad: [...cl.squad] })),
    roster: c.roster as Record<number, Player>,
    archive: (c.archive as ArchivedSeason[]).map(a => ({
      seasonLabel: a.seasonLabel,
      standings: a.standings.map(s => ({ ...s })),
      topScorerRosterId: a.topScorerRosterId,
      mvpRosterId: a.mvpRosterId,
    })),
  };
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
