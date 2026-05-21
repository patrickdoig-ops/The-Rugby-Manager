// Build a matchday RawTeamInput from the persistent career roster.
//
// Team identity (name, color, stadium, suggestedTactics) comes from the
// `teamJson` argument — these are immutable per-club facts that live in
// the JSON. Player data (id 1-N by slot, baseStats, position) is resolved
// from `state.career.roster` via the per-club `ClubState.squad` rosterId
// pointer list. Each RawPlayer carries its `rosterId` so
// MatchCoordinator.initPlayer can attach it to the matchday Player; the
// matchday `id` (1-23) stays a slot number.
//
// Convention: ClubState.squad is ordered starters-first (slots 1-15),
// bench (16-23), wider squad (24+). PreMatchScreen's saved matchday
// selection (applyMatchdaySquad) reorders this for the player's team;
// the AI side always uses the canonical order.
//
// Pure: no RNG, no mutation. Idempotent.

import type { GameState } from '../types/gameState';
import type { Player } from '../types/player';
import type { RawPlayer, RawTeamInput } from '../types/teamData';

export function buildTeamFromRoster(state: GameState, teamJson: RawTeamInput): RawTeamInput {
  const club = state.career.clubs.find(c => c.id === teamJson.id);
  if (!club) return teamJson;

  const rosterPlayers = club.squad.map((rid, idx) => {
    const p = state.career.roster[rid];
    if (!p) return null;
    return rawFromRosterPlayer(p, idx + 1);
  }).filter((p): p is RawPlayer => p !== null);

  return {
    ...teamJson,
    players: rosterPlayers.slice(0, 15),
    bench:   rosterPlayers.slice(15, 23),
    squad:   rosterPlayers.slice(23),
  };
}

function rawFromRosterPlayer(p: Player, slot: number): RawPlayer {
  return {
    id: slot,
    rosterId: p.rosterId,
    squadNumber: slot,
    firstName: p.firstName,
    lastName: p.lastName,
    dob: p.dob,
    nationality: p.nationality,
    position: p.position,
    baseStats: { ...p.baseStats },
  };
}
