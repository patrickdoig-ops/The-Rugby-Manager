// Seeding for advanced (numeric) tactics. When the manager switches a team
// from preset tactics into advanced mode, the sliders start from the exact
// numbers the current preset already implies — so entering advanced mode is a
// lossless handoff (the engine produces identical kicks until a slider moves).
//
// Phase 1 covers the kicking game: per-zone frequency + per-zone kick-type
// mix, sourced from the same KICK_PROBABILITIES / FAMILY_WEIGHTS tables the
// preset path reads. The engine's four zones are more granular than the
// frequency table (own22 + opp22 are explicit; ownHalf/oppHalf collapse to
// the table's "ownHalf"/"opposition" rows), so the seed expands them out.

import { KICK_PROBABILITIES, FAMILY_WEIGHTS, type Zone } from './balance';
import type { TeamTactics, AdvancedTactics, AdvancedKicking } from '../types/team';

const ZONES: Zone[] = ['own22', 'ownHalf', 'oppHalf', 'opp22'];

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
  return { kicking };
}
