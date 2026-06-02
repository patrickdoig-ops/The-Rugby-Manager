// First-ever new-game roster seed. Walks every RawTeamInput, allocates a
// globally-unique rosterId per player, builds the canonical `roster` index
// and per-club squad pointers. The team JSONs carry final, play-ready
// baseStats (authored in docs/team-data.md) — no spawn-time stat transform
// is applied. Persistent Player objects carry baseStats + contract + reputation;
// volatile per-match fields default to idle values and are overwritten
// per match by MatchCoordinator.initPlayer.
//
// Contract terms come from contractSeeder (rngTransfer-driven) unless
// the JSON carries hand-authored overrides (typically marquees). The
// `seasonStartYear` argument is the year the next season opens in — used
// to compute contract expiry dates relative to "now".
//
// Consumes rngTransfer (via contractSeeder); call setCareerSeed before
// invoking. Same root seed produces an identical roster + identical
// contract terms.

import type { Player } from '../types/player';
import { zeroMatchStats, zeroSeasonStats } from '../types/player';
import type { ClubState } from '../types/gameState';
import type { RawPlayer, RawTeamInput } from '../types/teamData';
import { seedContractFields } from './contractSeeder';
import {
  CLUB_SALARY_BUDGETS_2025_26, SENIOR_CAP, EFFECTIVE_CAP_CREDITS,
  WAGE_FLOOR, WAGE_ROUNDING_UNIT,
} from '../engine/balance';
import { POTENTIAL_HEADROOM } from '../engine/balance/career';
import { playerOverall } from '../engine/RatingEngine';
import { getAge, seasonOpenIso } from './age';
import { rngTransfer } from '../utils/rng';

export interface SeededRoster {
  roster: Record<number, Player>;
  clubs: ClubState[];
  nextRosterId: number;
}

export function seedRoster(allTeams: RawTeamInput[], seasonStartYear: number): SeededRoster {
  const roster: Record<number, Player> = {};
  const clubs: ClubState[] = [];
  let nextId = 1;

  for (const team of allTeams) {
    const squadIds: number[] = [];
    const addAll = (arr: RawPlayer[] | undefined) => {
      if (!arr) return;
      for (const rp of arr) {
        const id = nextId++;
        roster[id] = hydratePersistentPlayer(rp, id, team.id, seasonStartYear);
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
    // Seed the per-club salary budget from the table-driven map.
    // Unknown clubIds default to the effective cap (no constraint) so
    // future league expansions don't crash here without an entry.
    const salaryBudget = CLUB_SALARY_BUDGETS_2025_26[team.id] ?? (SENIOR_CAP + EFFECTIVE_CAP_CREDITS);
    // Scale the authored 2025/26 squad's wages so a full roster consumes
    // exactly its owner budget — otherwise high-budget clubs start with
    // free headroom and the user could sign free agents without selling.
    normalizeClubWagesToBudget(roster, squadIds, salaryBudget);
    clubs.push({ id: team.id, squad: squadIds, salaryBudget });
  }

  return { roster, clubs, nextRosterId: nextId };
}

// Uniformly scales a club's non-marquee wages so their sum equals the
// club's salaryBudget (marquee wages sit outside the budget, same as
// clubBudgetUsage / the cap). Preserves the rating-driven relative wage
// structure; absorbs the rounding residual into the top earner so a full
// seeded roster lands exactly on budget (zero headroom). Pure,
// RNG-free — runs after contract seeding, so it never perturbs the
// rngTransfer stream.
function normalizeClubWagesToBudget(
  roster: Record<number, Player>,
  squadIds: number[],
  salaryBudget: number,
): void {
  const ids = squadIds.filter(id => !roster[id].contract.isMarquee);
  if (ids.length === 0) return;
  const current = ids.reduce((sum, id) => sum + roster[id].contract.annualWage, 0);
  if (current <= 0) return;

  const scale = salaryBudget / current;
  for (const id of ids) {
    const scaled = roster[id].contract.annualWage * scale;
    roster[id].contract.annualWage = Math.max(
      WAGE_FLOOR,
      Math.round(scaled / WAGE_ROUNDING_UNIT) * WAGE_ROUNDING_UNIT,
    );
  }

  // Rounding leaves a small residual (a multiple of WAGE_ROUNDING_UNIT);
  // fold it into the highest-paid non-marquee player so the total hits
  // the budget exactly.
  const sum = ids.reduce((s, id) => s + roster[id].contract.annualWage, 0);
  const residual = salaryBudget - sum;
  if (residual !== 0) {
    const topId = ids.reduce((best, id) =>
      roster[id].contract.annualWage > roster[best].contract.annualWage ? id : best, ids[0]);
    roster[topId].contract.annualWage = Math.max(
      WAGE_FLOOR,
      roster[topId].contract.annualWage + residual,
    );
  }
}

function hydratePersistentPlayer(
  raw: RawPlayer,
  rosterId: number,
  clubId: string,
  seasonStartYear: number,
): Player {
  const { contract, reputation } = seedContractFields(raw, clubId, seasonStartYear);
  const ovr = playerOverall(raw.baseStats, raw.position);
  const age = raw.dob ? (getAge(raw.dob, seasonOpenIso(seasonStartYear)) ?? 25) : 25;
  const band = POTENTIAL_HEADROOM.find(b => age <= b.maxAge) ?? POTENTIAL_HEADROOM[POTENTIAL_HEADROOM.length - 1];
  const potential = Math.min(99, ovr + rngTransfer(band.min, band.max));
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
    reputation,
    contract,
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
    condition: 100,
    morale: 65,
    potential,
  };
}
