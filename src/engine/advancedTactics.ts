// Seeding for advanced (numeric) tactics. When the manager switches a team
// from preset tactics into advanced mode, every control starts from the exact
// values the current preset already implies — so entering advanced mode is a
// lossless handoff (the engine produces identical play until a control moves).
//
// Kicking: per-zone frequency + per-zone kick-type mix, from the same
// KICK_PROBABILITIES / FAMILY_WEIGHTS tables the preset path reads (the four
// zones are more granular than the frequency table, so own22 + opp22 are
// explicit and ownHalf/oppHalf take the table's "ownHalf"/"opposition" rows).
// Every other dimension seeds all four zones (or, for intensity/discipline, the
// single value) to the preset bucket — discrete dims to the enum, slider dims
// to the matching slider position (0/50/100) from the shared bucket orders.

import { KICK_PROBABILITIES, FAMILY_WEIGHTS, type Zone } from './balance';
import { STYLE_ORDER, OFFLOAD_ORDER, INTENSITY_ORDER, DISCIPLINE_ORDER } from './tacticsResolve';
import type { TeamTactics, AdvancedTactics, AdvancedKicking, ZoneOf } from '../types/team';

const ZONES: Zone[] = ['own22', 'ownHalf', 'oppHalf', 'opp22'];

function allZones<T>(value: T): ZoneOf<T> {
  return { own22: value, ownHalf: value, oppHalf: value, opp22: value };
}

// Preset enum → slider position (0 / 50 / 100) from the same order the engine
// interpolates through, so a freshly-seeded slider reproduces the preset exactly.
function sliderPos<T extends string>(order: readonly T[], value: T): number {
  return order.indexOf(value) * 50;
}

export function seedAdvancedTactics(tactics: TeamTactics): AdvancedTactics {
  const plan = tactics.attackingGamePlan;
  const probs = KICK_PROBABILITIES[plan];
  const frequencyByZone: Record<Zone, number> = {
    own22:   probs.own22,
    ownHalf: probs.ownHalf,
    oppHalf: probs.opposition,
    opp22:   probs.opposition,
  };
  const kicking = {} as AdvancedKicking;
  for (const zone of ZONES) {
    kicking[zone] = {
      frequency: frequencyByZone[zone],
      types: { ...FAMILY_WEIGHTS[zone][plan] },
    };
  }

  return {
    kicking,
    attackingStyle:     allZones(sliderPos(STYLE_ORDER, tactics.attackingStyle)),
    offloadStrategy:    allZones(sliderPos(OFFLOAD_ORDER, tactics.offloadStrategy)),
    attackingBreakdown: allZones(tactics.attackingBreakdown),
    defendingBreakdown: allZones(tactics.defendingBreakdown),
    backfieldDefence:   allZones(tactics.backfieldDefence),
    defensiveLine:      allZones(tactics.defensiveLine),
    intensity:          sliderPos(INTENSITY_ORDER, tactics.intensity),
    discipline:         sliderPos(DISCIPLINE_ORDER, tactics.discipline),
  };
}
