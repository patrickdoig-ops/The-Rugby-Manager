// Squad rearrangement helpers — pure, deterministic, no module state.
//
// The pre-match screen lets the manager swap players between the starting
// XV (id 1-15), the bench (id 16-23), and the wider senior squad (id 24+).
// `extractMatchdaySquad` snapshots the resulting 23-man matchday roster as
// stable name refs so it can be persisted in `GameState.player.matchdaySquad`;
// `applyMatchdaySquad` is the inverse — given a fresh-from-JSON RawTeamInput
// and a saved snapshot, it rearranges players/bench/squad so the saved
// 23 occupy slots 1-23 and the rest drop into `squad`. IDs and squadNumbers
// are reassigned by slot, same convention as the pre-match swap logic.

import type { RawTeamInput, RawPlayer } from '../types/teamData';
import type { PlayerRef } from '../types/gameState';
import type { Player } from '../types/player';
import { repairInjuredMatchdaySquad } from './autoSelect';

function nameKey(p: { firstName: string; lastName: string }): string {
  return `${p.firstName}|${p.lastName}`;
}

export function extractMatchdaySquad(team: RawTeamInput): PlayerRef[] {
  return [...team.players, ...(team.bench ?? [])].map(p => ({
    firstName: p.firstName,
    lastName:  p.lastName,
  }));
}

// Returns the team unchanged when `squad` is undefined, the wrong length,
// or references a player no longer rostered — caller doesn't need to
// special-case. When `repair` is provided and the saved squad contains
// an injured player, the injured slot(s) are surgically swapped for the
// best same-position replacement from the wider club roster via
// `repairInjuredMatchdaySquad`. Fit slots stay locked. When `repair` is
// omitted, no injury handling runs (injured players seat normally —
// matches the pre-v9 contract).
export function applyMatchdaySquad(
  team: RawTeamInput,
  squad: PlayerRef[] | undefined,
  repair?: { roster: Record<number, Player>; clubSquadIds: number[] },
): RawTeamInput {
  if (!squad || squad.length !== 23) return team;

  let workingSquad = squad;

  if (repair) {
    const repaired = repairForInjuries(squad, repair.roster, repair.clubSquadIds);
    if (repaired) workingSquad = repaired;
  }

  const all: RawPlayer[] = [
    ...(team.players as RawPlayer[]),
    ...((team.bench ?? []) as RawPlayer[]),
    ...((team.squad ?? []) as RawPlayer[]),
  ];
  const byName = new Map(all.map(p => [nameKey(p), p]));

  const starters: RawPlayer[] = [];
  const bench:    RawPlayer[] = [];
  const used = new Set<string>();

  for (let i = 0; i < 23; i++) {
    const ref = workingSquad[i];
    const key = nameKey(ref);
    const found = byName.get(key);
    if (!found) return team;
    const slot = i + 1;
    const seated: RawPlayer = { ...found, id: slot, squadNumber: slot };
    if (slot <= 15) starters.push(seated);
    else bench.push(seated);
    used.add(key);
  }

  const remaining = all.filter(p => !used.has(nameKey(p)));
  return { ...team, players: starters, bench, squad: remaining };
}

// Maps a PlayerRef[] to rosterIds via the club roster, runs the autoSelect
// repair pass, and maps back to PlayerRef[]. Returns null when the saved
// squad has no injured players (caller can skip the repair) or when name
// resolution fails (caller falls back to the unrepaired squad — the outer
// seat loop then handles "player not found" with a clean bail-out).
function repairForInjuries(
  squad: PlayerRef[],
  roster: Record<number, Player>,
  clubSquadIds: number[],
): PlayerRef[] | null {
  const idByName = new Map<string, number>();
  for (const rid of clubSquadIds) {
    const p = roster[rid];
    if (p) idByName.set(nameKey(p), rid);
  }

  const currentIds: number[] = [];
  let hasInjured = false;
  for (const ref of squad) {
    const rid = idByName.get(nameKey(ref));
    if (rid === undefined) return null;
    currentIds.push(rid);
    if (roster[rid]?.injury) hasInjured = true;
  }
  if (!hasInjured) return null;

  const repairedIds = repairInjuredMatchdaySquad(currentIds, roster, clubSquadIds);
  return repairedIds.map(rid => {
    const p = roster[rid];
    return { firstName: p.firstName, lastName: p.lastName };
  });
}

// Convenience: build an `isInjured` predicate over a GameState's career
// roster for a specific club, by full-name lookup. Used by PreMatchScreen
// and SquadManagementScreen so they don't have to duplicate the roster
// scan on every render.
export function makeInjuredPredicate(
  roster: Record<number, { firstName: string; lastName: string; injury?: unknown }>,
  clubSquad: number[],
): (ref: PlayerRef) => boolean {
  const injuredNames = new Set<string>();
  for (const rid of clubSquad) {
    const p = roster[rid];
    if (p && p.injury) injuredNames.add(`${p.firstName}|${p.lastName}`);
  }
  return (ref) => injuredNames.has(`${ref.firstName}|${ref.lastName}`);
}
