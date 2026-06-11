// Player match-day form model.
//
// Form = a deterministic bias (derived from the player's recent form, freshness,
// and recent return from absence) + a single random perturbation rolled at
// match start. The result is a signed integer added uniformly to every stat in
// `currentStats` at MatchCoordinator.initPlayer time.
//
// The deterministic bias + volatility are computed in src/game/playerForm.ts
// (career scope, where GameState is available) and threaded onto RawPlayer; the
// engine owns only the random draw and the final clamp.

export const FORM_MODEL = {
  // Final clamp on the composed form modifier (matches the additive-to-stat range).
  min: -10,
  max: 10,
  // σ of the random noise. Multiplied by the player's volatility before scaling
  // the standard-normal draw. (Was an effective 5 in the old pure-random model;
  // reduced to leave headroom for the deterministic bias.)
  baseSpread: 3,

  // The two steady-state factors below are symmetric (±4 each), so an in-form,
  // fresh player reaches +8 and a poor, tired player −8. The return penalty
  // below is transient and one-directional (rustiness has no positive twin).

  // --- Recent-rating bias --------------------------------------------------
  // Mean of the player's last-N match ratings vs a baseline, scaled and clamped.
  ratingBaseline: 6.5,   // ~average RatingEngine output (clamped [5,10], base 6)
  ratingSlope: 4,        // +1.0 avg rating from baseline → ±4 form
  ratingBiasClamp: 5,    // clamp the rating contribution to [-5, +5]
  minApps: 2,            // need ≥2 logged ratings before recent form biases anything

  // --- Condition (freshness) bias -----------------------------------------
  // Bidirectional around a neutral freshness point: fresher than neutral lifts
  // form, more tired than neutral drags it. `(condition − neutral) × slope`,
  // clamped to ±cap. Neutral sits near the typical match-day condition so the
  // league-wide mean form stays ~0 (no scoring inflation).
  conditionNeutral: 90,  // condition 90 → 0; +3 at 100 (peak fresh), −3 at 70
  conditionSlope: 0.3,
  conditionCap: 3,

  // --- Return-from-absence rustiness --------------------------------------
  // Applied on the round the player returns, fading linearly to 0 over fadeRounds.
  injuryReturnPenalty: -3,
  intlReturnPenalty: -2,
  returnFadeRounds: 3,

  // --- Volatility (σ multipliers, multiplied together) --------------------
  // Younger players swing more match-to-match; veterans and marquee men are
  // steadier.
  youngAge: 22,
  youngVolatility: 1.3,
  veteranAge: 31,
  veteranVolatility: 0.7,
  marqueeVolatility: 0.85,
} as const;
