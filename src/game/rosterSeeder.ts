// First-ever new-game roster seed. Walks every RawTeamInput, allocates a
// globally-unique rosterId per player, builds the canonical `roster` index
// and per-club squad pointers. Takes already-star-boosted team inputs —
// star boost (`src/team/applyStarBoost.ts`) is applied once at JSON
// import time in main.ts and the seeder consumes the already-boosted
// data. Persistent Player objects carry baseStats only — currentStats /
// fatiguePct / rating / matchStats / x / y are freshly initialised per
// match by MatchCoordinator.initPlayer.
//
// Pure: no RNG, no side effects. Re-seeding the same set of teams
// produces an identical roster.
//
// Called from GameCoordinator.newSeason (always) and GameCoordinator.fromSave
// (only when the save predates v5 — v5+ saves carry the roster directly).

import type { Player } from '../types/player';
import { zeroMatchStats, zeroSeasonStats } from '../types/player';
import type { ClubState } from '../types/gameState';
import type { RawPlayer, RawTeamInput } from '../types/teamData';

export interface SeededRoster {
  roster: Record<number, Player>;
  clubs: ClubState[];
  nextRosterId: number;
}

export function seedRoster(allTeams: RawTeamInput[]): SeededRoster {
  const roster: Record<number, Player> = {};
  const clubs: ClubState[] = [];
  let nextId = 1;

  for (const team of allTeams) {
    const squadIds: number[] = [];
    const addAll = (arr: RawPlayer[] | undefined) => {
      if (!arr) return;
      for (const rp of arr) {
        const id = nextId++;
        roster[id] = hydratePersistentPlayer(rp, id);
        squadIds.push(id);
      }
    };
    // Order matters: starters first (slots 1-15), then bench (16-23), then
    // wider squad. rosterTeamBuilder relies on this convention when
    // resolving squad ids back to a matchday team without an explicit
    // matchdaySquad selection.
    addAll(team.players);
    addAll(team.bench);
    addAll(team.squad);
    clubs.push({ id: team.id, squad: squadIds });
  }

  return { roster, clubs, nextRosterId: nextId };
}

function hydratePersistentPlayer(raw: RawPlayer, rosterId: number): Player {
  return {
    id: raw.id,
    rosterId,
    squadNumber: raw.squadNumber ?? raw.id,
    firstName: raw.firstName,
    lastName: raw.lastName,
    dob: raw.dob,
    nationality: raw.nationality,
    position: raw.position,
    baseStats: { ...raw.baseStats },
    // reputation + contract default to placeholders here. Commit 2 of
    // Phase 2 wires contractSeeder to populate them with real values
    // (wage by rating tier, expiry staggered across years, marquee
    // overrides from JSON).
    reputation: raw.reputation ?? 0,
    contract: raw.contract ?? { clubId: '', expiresOn: '', annualWage: 0, isMarquee: false },
    // Volatile per-match fields default to idle values in the roster.
    // MatchCoordinator.initPlayer overwrites them when the player is
    // hydrated into a matchday Team.
    currentStats: { ...raw.baseStats },
    matchStats: zeroMatchStats(),
    seasonStats: zeroSeasonStats(),
    formModifier: 0,
    fatiguePct: 100,
    rating: 6.0,
    x: 50,
    y: 50,
  };
}
