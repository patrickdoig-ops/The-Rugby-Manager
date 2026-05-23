// Tuning constants for KickDecisionDirector (src/engine/KickDecisionDirector.ts).
// The base kick probability table (KICK_PROBABILITIES) lives in kicking.ts
// alongside other kicking math; this file owns the modifiers and routing
// weights that turn a "kick or carry?" decision into a typed kick output
// (family + kicker + sub-choice).

// Slow-ball kick bias. Added to the base KICK_PROBABILITIES[plan][zone]
// when the upcoming decision is reading a slow_ball outcome. Replaces the
// pre-v2.83a Breakdown slow_ball → BoxKick gate (deterministic boolean)
// with a probabilistic modifier — slow ball makes any kick family more
// likely, not just box kick. Tuned conservatively in Stage B: ping-pong
// kick sequences (box kick → KickReturn → kick → KickReturn → …) are
// amplified by box kicks rarely finding touch, so the bonus stays modest
// until Stage E gives box kicks a long-and-off touch-finder path.
export const SLOW_BALL_KICK_BONUS = 10;

// Family selection weights — sum to 100 within each zone × plan cell. The
// kick has already been DECIDED at this point (kickProb roll passed); these
// weights distribute the kick across the four families.
//
// Indexed by [zone][plan][family]. Zones:
//   own22  = inOwn22(state)
//   ownHalf = inOwnHalf && !inOwn22
//   oppHalf = !inOwnHalf && !inOpposition22
//   opp22  = inOpposition22(state)
//
// fifty_22 currently routes through TacticalKick with no special resolver
// (Stage C will add the dedicated path + backfield-defender gate).
// attacking currently routes through TacticalKick with no sub-type
// branching (Stage D will add cross_field / grubber).
export type Plan = 'possession' | 'balanced' | 'kicking';
export type Zone = 'own22' | 'ownHalf' | 'oppHalf' | 'opp22';
export type Family = 'clearance' | 'territory' | 'fifty_22' | 'attacking';

export const FAMILY_WEIGHTS: Record<Zone, Record<Plan, Record<Family, number>>> = {
  own22: {
    possession: { clearance: 100, territory: 0,  fifty_22: 0,  attacking: 0 },
    balanced:   { clearance:  95, territory: 5,  fifty_22: 0,  attacking: 0 },
    kicking:    { clearance:  90, territory: 10, fifty_22: 0,  attacking: 0 },
  },
  ownHalf: {
    possession: { clearance:  30, territory: 60, fifty_22: 10, attacking: 0 },
    balanced:   { clearance:  20, territory: 60, fifty_22: 20, attacking: 0 },
    kicking:    { clearance:  10, territory: 65, fifty_22: 25, attacking: 0 },
  },
  oppHalf: {
    possession: { clearance:   0, territory: 30, fifty_22: 0,  attacking: 70 },
    balanced:   { clearance:   0, territory: 40, fifty_22: 0,  attacking: 60 },
    kicking:    { clearance:   0, territory: 50, fifty_22: 0,  attacking: 50 },
  },
  opp22: {
    possession: { clearance:   0, territory:  0, fifty_22: 0,  attacking: 100 },
    balanced:   { clearance:   0, territory:  0, fifty_22: 0,  attacking: 100 },
    kicking:    { clearance:   0, territory:  0, fifty_22: 0,  attacking: 100 },
  },
};

// Kicker selection within a family. #9 = scrum half (box kick); #10 = fly
// half (tactical kick path). Percent likelihood of #9 taking the kick.
// Modern real-world #9s take ~70% of clearance and ~65% of territorial
// kicks. The Stage E touch-finder path (BoxKickResolver's goes_to_touch
// outcome) means long-and-off clearances now end at Lineout instead of
// spawning KickReturns, so the #9 routing can match real-world dominance
// without ping-pong inflating total kick volume.
export const SCRUM_HALF_KICKER_PCT: Record<Family, number> = {
  clearance: 50,
  territory: 40,
  fifty_22:  40,  // either kicker can pull it off
  attacking:  0,  // always #10 — cross-field / grubber / chip is fly-half territory
};

// Clearance style — long-and-on (contestable, stays in field) vs
// long-and-off (touch finder, opposition lineout). Inside own 22 the
// touch-find is essentially free (kick from in your 22 always finds touch
// where it goes out, lineout-throw for the opposition). Outside the 22
// it's a risk — direct kick to touch goes back to where the ball was
// kicked from, so most teams keep the ball in play.
// Percent likelihood of long-and-off (touch finder).
export const LONG_AND_OFF_PCT: Record<Zone, number> = {
  own22:   85,  // dominant choice — protect possession via lineout
  ownHalf: 25,  // risk of giving up the lineout — most teams keep it in
  oppHalf:  0,  // clearance shouldn't fire in oppHalf
  opp22:    0,  // clearance shouldn't fire in opp22
};

// Attacking sub-type — cross-field vs grubber. Cross-field is the dominant
// modern attacking kick from #10 (Marcus Smith style); grubber covers
// short-kick-through plays.
// Percent likelihood of cross_field.
export const CROSS_FIELD_VS_GRUBBER_PCT = 65;
