// Team-data shape — the JSON contract that data files (src/data/team-*.json)
// expose and that every consumer (match engine, game engine, UI screens,
// determinism scripts) accepts.
//
// Distinct from `Team` in src/types/team.ts: `Team` is the *runtime* in-engine
// shape with full Player objects (currentStats, fatiguePct, rating, x, y);
// `RawTeamInput` is the *data* shape before MatchCoordinator.initPlayer
// hydrates it. Living here rather than in the match engine keeps the data
// shape neutral — the engine consumes it, it doesn't own it.

import type { Player } from './player';

export type RawPlayer = Omit<Player, 'currentStats' | 'fatiguePct' | 'rating' | 'x' | 'y' | 'squadNumber'> & { squadNumber?: number };

export type RawTeamInput = {
  id: string;
  name: string;
  shortName: string;
  color: string;
  secondaryColor: string;
  stadium: string;
  players: RawPlayer[];
  bench?: RawPlayer[];
  squad?: RawPlayer[];
};
