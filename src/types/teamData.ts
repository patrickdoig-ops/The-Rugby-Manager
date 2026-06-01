// Team-data shape — the JSON contract that data files (src/data/team-*.json)
// expose and that every consumer (match engine, game engine, UI screens,
// determinism scripts) accepts.
//
// Distinct from `Team` in src/types/team.ts: `Team` is the *runtime* in-engine
// shape with full Player objects (currentStats, fatiguePct, rating, x, y);
// `RawTeamInput` is the *data* shape before MatchCoordinator.initPlayer
// hydrates it. Living here rather than in the match engine keeps the data
// shape neutral — the engine consumes it, it doesn't own it.

import type { Player, PlayerContract } from './player';
import type { TeamTactics } from './team';

// `rosterId` is allocated at roster seed time, not in JSON — but
// rosterTeamBuilder (`src/game/rosterTeamBuilder.ts`) re-attaches it on the
// matchday RawTeamInput so MatchCoordinator.initPlayer can thread it
// through to the live matchday Player. Optional in the data shape: JSON
// imports leave it undefined, the engine path populates it.
//
// `contract` + `reputation` are likewise engine-populated by the
// roster-seed pipeline. JSONs may optionally carry them as
// hand-authored overrides for marquee stars (see docs/team-data.md);
// every other player has them synthesised by contractSeeder.
export type RawPlayer = Omit<Player,
  'currentStats' | 'fatiguePct' | 'rating' | 'x' | 'y' | 'squadNumber'
  | 'rosterId' | 'seasonStats' | 'matchStats' | 'formModifier'
  | 'contract' | 'reputation' | 'condition'
> & {
  squadNumber?: number;
  rosterId?: number;
  // Partial overrides — JSON typically provides only the marquee flag;
  // contractSeeder fills the missing wage / length / expiry / clubId.
  // The full PlayerContract shape flows through when rosterTeamBuilder
  // re-derives a matchday RawTeamInput from the persisted roster.
  contract?: Partial<PlayerContract>;
  reputation?: number;
  // Inter-match freshness, threaded through by rosterTeamBuilder so
  // MatchCoordinator.initPlayer can use it as the starting fatiguePct.
  // Absent on the raw JSON path (legacy fixtures, tests) where the
  // engine defaults to 100.
  condition?: number;
  // Precomputed form inputs, threaded through by rosterTeamBuilder from
  // playerForm.computeFormInputs. `formBias` is the deterministic form offset
  // (recent ratings + condition + return rustiness); `formVolatility` scales
  // the random spread (age + marquee). MatchCoordinator.initPlayer combines
  // them with a single random draw. Absent on the raw JSON path, where the
  // engine falls back to bias 0 / volatility 1 (old pure-random behaviour).
  formBias?: number;
  formVolatility?: number;
};

export type RawTeamInput = {
  id: string;
  name: string;
  shortName: string;
  color: string;
  secondaryColor: string;
  stadium: string;
  stadiumCapacity?: number;
  players: RawPlayer[];
  bench?: RawPlayer[];
  squad?: RawPlayer[];
  boardAmbition?: 'title' | 'playoffs' | 'topHalf';
  // Authored per-club identity tactics (`src/data/team-*.json`). Consumed by
  // MatchCoordinator as the AI side's baseline; the human side overrides via
  // playerTactics from PreMatchScreen. Optional only because legacy / test
  // fixtures may not supply it — in which case buildTeam falls through to
  // DEFAULT_TACTICS.
  suggestedTactics?: TeamTactics;
};
