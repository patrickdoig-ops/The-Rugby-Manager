// Tuning for a ball-in-hand carry: collision/evasion outcomes, line-break and
// dominant-carry margins, hard-carry probability by attacking style, and the
// knock-on threshold gate (which only matters during a carry).

export const HARD_CARRY_THRESHOLDS = {
  keep_it_tight: 95,
  balanced:      70,
  wide_wide:     50,
} as const;

// Quadratic handling gate. Per-check KO probability = gap² / 100, where
// gap = max(0, zeroRiskHandling − handling). Above zeroRiskHandling the
// rate is identically zero — elite playmakers don't drop clean ball. Below,
// the gap squared means moderate handlers (75–80) stay safe and only
// genuinely poor handlers cluster the misses. Capped at maxKnockOnPct so
// a heavily fatigued forward doesn't spill every other carry. clockInRed
// adds a flat percentage-point bump — late-game tired hands.
export const HANDLING_GATE = {
  zeroRiskHandling: 85,
  maxKnockOnPct:    40,
  clockInRedBonus:  3,
} as const;

export function knockOnPct(handling: number, clockInTheRed: boolean): number {
  const g = HANDLING_GATE;
  const gap = Math.max(0, g.zeroRiskHandling - handling);
  const base = (gap * gap) / 20;
  return Math.min(g.maxKnockOnPct, clockInTheRed ? base + g.clockInRedBonus : base);
}

// Tactics-weighted lateral spread when a carry crosses the try line.
// Half-spread is symmetric around the midline (y=50); larger values mean
// tries scatter further toward the corner flags. Wider-playing teams put
// runners into wider channels, so their tries are more often out wide.
export const TRY_LANDING_HALF_SPREAD = {
  keep_it_tight: 12,
  balanced:      25,
  wide_wide:     45,
} as const;

// Lateral bands (|y - 50|) used for the post-try commentary line. Drives
// only the narration; conversion difficulty reads ball.y directly through
// CONVERSION_VALUES.distanceFromPostsWeight in ConversionKickEvent.
export const TRY_LOCATION_BANDS = {
  central: 7,
  close:   17,
  wide:    32,
  // else → corner
} as const;

// Base trigger rate for the obstruction penalty. Rolled inside
// PhasePlay + FirstPhase whenever the attacking side opts to "go out the
// back" — the forward screen on a wide pass is the typical real-world
// obstruction source. Pct per out-the-back attempt; out-the-back is reached
// in ~14 attempts per match league-wide, so a base of 4 gives ~0.6
// obstructions per match. Shifted at the call site by
// TACTIC_MODIFIERS.obstructionStyleMod[attackingStyle].
export const OBSTRUCTION_BASE_PCT = 4;

// Base interception rate per pass attempt. Rolled at every PASS_COMPLETED
// site in OpenPlay + FirstPhase before the pass actually completes. Modified
// by TACTIC_MODIFIERS.interceptionMod[defenseTactic] and a per-passer
// (handling − statCentre) × handlingWeight penalty (better hands → fewer
// picks). Calibrated for ~50 pass attempts per side per match → ~0.25 base
// interceptions per side per match, scaling up to ~0.75 vs a blitzing
// defence.
export const INTERCEPTION_BASE_PCT = 0.5;

// Per-point handling sensitivity in the interception formula. The passer's
// handling above the league-average centre subtracts directly from the
// per-pass interception roll: intPct = base - (handling − statCentre) ×
// handlingWeight. A 90-handling fly-half → −0.8% vs a 50-handling one.
export const INTERCEPTION_HANDLING_WEIGHT = 0.02;

// League-average baseline for the handling stat. Used to centre the
// (handling − statCentre) term in the interception formula so a perfectly
// average passer gets no adjustment.
export const INTERCEPTION_STAT_CENTRE = 50;

// Front-foot boost on state.breakdownMod.attack that the interceptor
// carries into their first run after an INTERCEPTION. Mirrors the
// CARRY_HANDOFF_BONUSES.lineBreak idea: the cover is forward, the
// interceptor has space — give them the line-break-frequency lift on the
// next evasion check.
export const INTERCEPTION_FOLLOW_UP_BONUS = 12;

export const OPEN_PLAY_VALUES = {
  agilityWeight:     0.5,
  positioningWeight: 0.3,
  paceWeight:        0.5,
  // Defender's tackling factored into the line-break check (v2.93a). Before
  // this, only positioning + pace gated line breaks — `tackling` was decorative
  // for tackle% because every line break auto-counted as a missed tackle in
  // applyMatchEvent. Positioning reduced 0.5 → 0.3 to make room for tackling
  // 0.2, keeping the defender side at total weight 1.0 so the league-wide
  // line break rate is preserved. Net effect: high-tackling teams (SAR/LEI)
  // tighten up; low-tackling teams (NEW) sag — realism gain is that the
  // tackling stat now actually shows up in tackle %.
  defenderTacklingLineBreakWeight: 0.2,
  lineBreakMargin: 15,
  // Line breaks now project the ball further downfield (real-world line
  // breaks pierce the defensive line by 15-40m on average). The 20-45 range
  // means a midfield line break frequently lands inside the opposition 22,
  // and the follow-up carry — boosted by CARRY_HANDOFF_BONUSES.lineBreak
  // (applied in BreakdownEvent, see balance/breakdown.ts) — closes the
  // score with one more phase.
  lineBreakMetres: [20, 45],
  // Pace-scaled line-break gain (v2.196a). Wing-level pace (90) keeps the
  // 20-45m calibration above; slower carriers scale the random range
  // downward multiplicatively (compresses both ends — slow carriers can't
  // hit the upper bound). Models "defenders chase back to catch the slower
  // carrier before they get long ground". minGainMetres floors the result
  // so a line_break outcome still advances the ball at least 5m — by
  // definition a line break has cleared the line.
  //
  // Predicted gain ranges before tactic mods stack:
  //   Wing pace 95:    factor 1.00  →  20-45m (unchanged)
  //   Centre pace 80:  factor 0.85  →  17-38m
  //   Back-row pace 70: factor 0.70 →  14-31m
  //   Lock pace 60:    factor 0.55  →  11-25m
  //   Prop pace 50:    factor 0.40  →  8-18m
  //   Prop pace 40:    factor 0.25  →  5-11m
  LINE_BREAK_PACE: {
    paceAtFullGain:   90,
    paceAtFloorGain:  40,
    paceFactorMin:    0.25,
    paceFactorMax:    1.0,
    minGainMetres:    5,
  },
  dominantCarryMargin:  5,
  dominantCarryMetres:  [3, 8],
  dominantTackleMargin: -5,
  dominantTackleMetres: [-2, 1],
  playOnMetres: [1, 4],
  attackerStrengthWeight: 0.5,
  attackerPaceWeight:     0.5,
  defenderTacklingWeight: 0.5,
  defenderStrengthWeight: 0.5,
} as const;
