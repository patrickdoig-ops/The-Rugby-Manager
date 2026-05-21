// Resolves a tunable home-advantage modifier into the attacker / defender
// pair expected by the open-play and breakdown resolvers. Returned values
// are added directly to the existing attackMod / defendMod (or the
// equivalent bonus parameters) — when the home team has possession the
// bump lands on the attacker; when the home team is defending it lands
// on the defender. Either way the home side gets the edge.

import type { MatchState } from '../types/match';

export function homeEdge(state: MatchState, mod: number): { attack: number; defend: number } {
  const homeAttacking = state.possession === 'home';
  return {
    attack: homeAttacking ? mod : 0,
    defend: homeAttacking ? 0   : mod,
  };
}
