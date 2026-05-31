// Resolves a tunable home-advantage modifier into the attacker / defender
// pair expected by the open-play and breakdown resolvers. Returned values
// are added directly to the existing attackMod / defendMod (or the
// equivalent bonus parameters) — when the home team has possession the
// bump lands on the attacker; when the home team is defending it lands
// on the defender. Either way the home side gets the edge.
//
// The raw modifier is scaled by the venue's fill rate so a sell-out ground
// amplifies the edge and a sparse crowd diminishes it. See
// HOME_ADVANTAGE.crowd* constants for the calibration notes.

import type { MatchState } from '../types/match';
import { HOME_ADVANTAGE } from './balance';

function crowdScale(fillRate: number): number {
  const { crowdFillMin, crowdScaleMin, crowdScaleMax } = HOME_ADVANTAGE;
  const t = (fillRate - crowdFillMin) / (1.0 - crowdFillMin);
  return crowdScaleMin + t * (crowdScaleMax - crowdScaleMin);
}

export function homeEdge(state: MatchState, mod: number): { attack: number; defend: number } {
  // Neutral venue (season final at Twickenham) — neither side gets the
  // home edge. Short-circuits before reading possession.
  if (state.engine.neutralVenue) return { attack: 0, defend: 0 };
  const scaledMod = mod * crowdScale(state.engine.homeFillRate);
  const homeAttacking = state.possession === 'home';
  return {
    attack: homeAttacking ? scaledMod : 0,
    defend: homeAttacking ? 0         : scaledMod,
  };
}
