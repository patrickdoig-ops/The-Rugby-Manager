// Tuning for the maul phase: a lineout-driven set-piece contest where
// 8 attacking forwards push 8 defending forwards. Successful drives
// advance the ball up to ~25m; a held maul becomes a turnover scrum;
// a collapsed maul becomes a defending-side penalty (often a yellow
// inside the defender's 22 — see MAUL_COLLAPSE_YELLOW). Pack score is a
// SUM of (strength × strengthWeight + setPiece × setPieceWeight) so a
// pack missing a forward (sin-binned, sent off, in-match injured)
// genuinely weakens, mirroring SCRUM_VALUES.
//
// Weights skew slightly more toward strength than the scrum (a maul is
// more of a sustained drive than a coordinated bind), and discipline is
// used as a collapse-bias modifier (the same pivot trick as the scrum:
// (packDiscipline - 50) × disciplineWeight), so a low-discipline pack
// is more likely to push the contest into the collapse-penalty bucket.

export const MAUL_VALUES = {
  // packScore is a SUM of forwards' (strength * strengthWeight + setPiece * setPieceWeight)
  // — see MaulResolver. With 8 forwards averaging ~75/70 the per-side score
  // is ~232. A side down one forward loses ~27 of pack score and is
  // materially weaker (a man-down pack's maul_won rate collapses toward 0).
  //
  // The weights are deliberately *low* relative to the rng(1, 50) noise and
  // the defenderAdvantage edge: this compresses how far pure pack strength
  // tilts the contest. Without it, a strong pack's score delta (a SUM over
  // 8 forwards) dwarfs the noise and wins ~86% of mauls — which made the
  // hookers of forward-heavy clubs run away with the try-scoring charts.
  // Compressed, a dominant pack wins ~60% (still clearly favoured, but
  // genuinely stoppable), an even contest ~19%, a weaker pack ~1%.
  strengthWeight:    0.20,
  setPieceWeight:    0.16,
  // rng(1, 50) per side ⇒ noise distribution triangular on [-49, +49].
  rngSpan:           50,
  // Two-stage resolution. Stage 1: strength margin (attackScore -
  // defendScore - defenderAdvantage + RNG) decides whether the attackers
  // win the push (margin > 0 → maul_won) or the defenders stop it
  // (margin ≤ 0 → maul_held). Stage 2: on a maul_won, roll a cynical-collapse check —
  // the defenders may bring the maul down illegally rather than concede
  // ground. Collapse probability rises with pressure (margin — the
  // more they're being driven back, the more tempted) AND inverse
  // discipline (a low-discipline pack is more likely to crack). The two
  // weights below combine additively, capped at maxCollapsePct.
  //
  // Calibration target (equal packs): ~19% maul_won, ~81% maul_held,
  // a few % of maul_won attempts convert to collapse_penalty. Mismatched
  // packs still skew — a strong attacking pack wins ~60% (and the high
  // margin pushes more of those into collapse_penalty); a weaker pack
  // wins almost none.
  collapseFromMarginWeight:     0.30,   // pp per +1 of margin (above 0)
  collapseFromDisciplineWeight: 0.50,   // pp per (disciplinePivot - defendDiscipline)
  // Stat pivot for the discipline term — 50 = neutral. Same value as
  // BREAKDOWN_VALUES.disciplinePivot and HIGH_TACKLE.statPivot by design.
  disciplinePivot:              50,
  maxCollapsePct:               60,
  // Flat defensive edge subtracted from the attack margin in stage 1 —
  // models a well-drilled modern maul defence (sack the catcher, swim
  // round, refuse to engage). Sets the equal-pack floor: with the
  // compressed pack weights above, an even contest wins ~19%. Works with
  // (not instead of) the weight compression — the edge sets the baseline,
  // the low weights stop a strong pack blowing past it.
  defenderAdvantage:  18,
  // Gain distribution on maul_won. Base drive is 4-8m; ~6% of wins
  // chain into a long drive (12-18m). Real-world league driving
  // mauls average ~7m; trimmed from the old 5-10m / 15-25m so a won maul
  // makes less ground and is less likely to carry the ball over the line.
  baseGainMin:        4,
  baseGainMax:        8,
  longDrivePct:       6,
  longGainMin:       12,
  longGainMax:        18,
} as const;

// Maul gate — probability of driving a maul (vs. transitioning straight
// to FirstPhase) after a clean lineout catch. Zone-driven, with an
// attackingStyle bias (forward-heavy teams maul more, wide-game teams
// less). The gate is symmetric for human and AI — no modal prompt.
//
// Zones are in metres-from-opposition-try-line:
//   own half           → 0%   (you don't maul backwards over your own line)
//   opposition half    → 5%   (40-50m out — uncommon but happens)
//   opposition 22      → 35%  (10-22m out — the classic territory)
//   inside opp 10m     → 60%  (close range — the highest-value tactic)
// The opp22 band starts AT 22m. Inside-10m takes precedence over opp22
// for distances ≤ 10m, so the lookup is "tightest zone first".
export const MAUL_GATE = {
  opp10mPct:    60,
  opp22Pct:     35,
  oppHalfPct:    5,
  ownHalfPct:    0,
  // attackingStyle modifier added to the base zone %. Capped to [0, 100]
  // at the call site so 'keep_it_tight' near the line can't exceed 100%.
  keepItTightBias: 20,
  wideWideBias:   -20,
  balancedBias:    0,
} as const;

// Direct yellow probability when a `maul_collapse` penalty is awarded,
// keyed by the defending side's distance from THEIR OWN try line (i.e.
// how close the maul is to scoring). Inside the 5m the collapse is a
// near-certain card; in opp half it's a rare but possible cite. Routed
// through CardHandler.evaluateNewPenalty (not the phase handler) so the
// CARD_ISSUED mutation seam stays inside CardHandler.
export const MAUL_COLLAPSE_YELLOW = {
  inside5mPct:  70,
  inside22Pct:  30,
  inOppHalfPct:  5,
  // own-half maul collapse is essentially impossible (no attacking maul
  // gets that deep without scoring first) but the value is here for
  // completeness.
  ownHalfPct:    0,
} as const;
