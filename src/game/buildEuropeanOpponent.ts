// Builds a RawTeamInput for a non-English European team with a fresh-match
// condition (95-100) applied to every player. Condition rolls use rngTransfer
// (career stream) so the draws don't perturb in-match outcome rolls.

import { europeanTeams } from '../data/european-teams';
import { rngTransfer } from '../utils/rng';
import type { RawTeamInput } from '../types/teamData';

export function buildEuropeanOpponent(teamId: string): RawTeamInput | null {
  const data = europeanTeams.find(t => t.id === teamId);
  if (!data) return null;
  type PlayerLike = { condition?: number };
  const withCondition = <T extends PlayerLike>(players: T[]): T[] =>
    players.map(p => ({ ...p, condition: rngTransfer(95, 100) }));
  return {
    ...data,
    players: withCondition(data.players),
    bench: data.bench ? withCondition(data.bench) : undefined,
  };
}
