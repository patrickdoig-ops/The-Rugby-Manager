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
// references a player no longer rostered, or references an injured player
// (per the optional `isInjured` predicate) — caller doesn't need to
// special-case. When `isInjured` is omitted, only the rostered-or-not
// fallback applies (matches the v8 contract). PreMatchScreen passes a
// roster-backed predicate so an injured saved-squad selection auto-falls
// back to the underlying team (whose `players + bench` are already
// injury-free if it came from buildTeamFromRoster).
export function applyMatchdaySquad(
  team: RawTeamInput,
  squad: PlayerRef[] | undefined,
  isInjured?: (ref: PlayerRef) => boolean,
): RawTeamInput {
  if (!squad || squad.length !== 23) return team;
  if (isInjured && squad.some(ref => isInjured(ref))) return team;

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
    const ref = squad[i];
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
