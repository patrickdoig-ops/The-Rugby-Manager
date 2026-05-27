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
  // is ~580. A side down one forward loses ~73 of pack score and is
  // materially weaker.
  strengthWeight:    0.55,
  setPieceWeight:    0.45,
  // rng(1, 50) per side ⇒ noise distribution triangular on [-49, +49].
  rngSpan:           50,
  // Two-stage resolution. Stage 1: pure strength margin (attackScore -
  // defendScore + RNG) decides whether the attackers win the push
  // (margin > 0 → maul_won) or the defenders stop it (margin ≤ 0 →
  // maul_held). Stage 2: on a maul_won, roll a cynical-collapse check —
  // the defenders may bring the maul down illegally rather than concede
  // ground. Collapse probability rises with pressure (margin — the
  // more they're being driven back, the more tempted) AND inverse
  // discipline (a low-discipline pack is more likely to crack). The two
  // weights below combine additively, capped at maxCollapsePct.
  //
  // Calibration target (equal packs): ~50% maul_won, ~50% maul_held,
  // ~5-10% of maul_won attempts convert to collapse_penalty. Mismatched
  // packs see more dominant outcomes — a strong attacking pack vs a
  // weak defender still mostly gains ground; the weak defender
  // occasionally cracks under sustained pressure.
  collapseFromMarginWeight:     0.30,   // pp per +1 of margin (above 0)
  collapseFromDisciplineWeight: 0.50,   // pp per (50 - defendDiscipline)
  maxCollapsePct:               60,
  // Gain distribution on maul_won. Base drive is 5-10m; ~10% of wins
  // chain into a long drive (15-25m). Real-world Premiership driving
  // mauls average ~7m; the long drives that show up on highlight reels
  // are the rare cases the soft floor models.
  baseGainMin:        5,
  baseGainMax:       10,
  longDrivePct:      10,
  longGainMin:       15,
  longGainMax:       25,
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
//   inside opp 10m     → 80%  (close range — the highest-value tactic)
// The opp22 band starts AT 22m. Inside-10m takes precedence over opp22
// for distances ≤ 10m, so the lookup is "tightest zone first".
export const MAUL_GATE = {
  opp10mPct:    80,
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
