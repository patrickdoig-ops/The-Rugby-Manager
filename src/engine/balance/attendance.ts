// Attendance model. A per-club base fill rate is scaled by small additive
// deltas for fixture significance, home form, round position, and derby
// status. All factors are additive on the fill rate then clamped to
// [MIN_FILL_RATE, 1.0] before multiplying by capacity.

export const CLUB_FILL_RATE: Record<string, number> = {
  bath:         0.92,
  bristol:      0.55, // Ashton Gate (27 k) rarely fills for league rugby
  exeter:       0.90,
  gloucester:   0.78,
  harlequins:   0.82,
  leicester:    0.82, // Welford Road is large; ~82% typical
  newcastle:    0.68,
  northampton:  0.85,
  sale:         0.72,
  saracens:     0.88, // StoneX is small and usually full
};

export const ATTENDANCE = {
  // Fixture-type bonuses (additive on fill rate)
  derbyBonus:           0.07,
  top4Bonus:            0.06, // both teams currently in top 4
  closeStandingsBonus:  0.04, // within 3 positions, not both top 4
  // Home team form
  goodFormBonus:        0.04, // 4+ wins in last 5
  poorFormPenalty:     -0.05, // 4+ losses in last 5
  // Round-of-season flavour
  earlyRoundBonus:      0.02, // rounds 1-3 (opening day buzz)
  lateRoundBonus:       0.05, // rounds 15-18 (title-race stakes)
  // Hard floor — even the worst fixture fills at least this share
  minFillRate:          0.55,
} as const;
