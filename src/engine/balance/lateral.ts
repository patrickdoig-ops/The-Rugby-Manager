// Tuning for lateral (Y-axis) ball movement. Y is 0-100 across the pitch width
// (50 = centre, 0/100 = touchlines); 1 metre ≈ 1.43 Y-units (70m width). All
// distances below are authored in Y-units (the metre basis is noted inline);
// kick angles are in degrees, fed to tan() in src/engine/Lateral.ts.

// Sweep reversal band: play heading toward a touchline reverses once it gets
// within 15m of it. 15m ≈ 21 Y-units, so the playable band is y ∈ [21, 79].
export const EDGE_Y_LOW = 21;
export const EDGE_Y_HIGH = 79;

// Per-pass lateral distance during an open-play sweep. Most passes are short
// (2-5m); a quarter are mid (5-12m); the long tail (12-20m) is the occasional
// miss-pass / long spin wide. Percent thresholds roll on rngPosition(1,100).
export const PASS_DISTANCE_M = {
  shortPct: 70,
  midPct:   95,
  short: [2, 5],
  mid:   [5, 12],
  long:  [12, 20],
} as const;

// Scrum-half pass off a set piece: longer flat spin pass to the fly-half, 10-20m.
export const SCRUM_HALF_PASS_M = [10, 20] as const;

// Wider-playing teams move the ball further across per phase.
export const SWEEP_STYLE_MULT = {
  keep_it_tight: 0.7,
  balanced:      1.0,
  wide_wide:     1.4,
} as const;

// A lineout forms ~6 Y-units (≈4m) in from the touchline it was kicked out on.
export const LINEOUT_TOUCHLINE_INSET = 6;

// Kick-off: lands about the 15m line (21 Y-units in from a touchline), biased
// to the kicker's left (right-foot kicker). Short kick-offs go nearly straight.
export const KICKOFF_TARGET_INSET = 21;
export const KICKOFF_LEFT_BIAS_PCT = 75;
export const KICKOFF_JITTER = 6;
export const KICKOFF_STRAIGHT_JITTER = 3;

// Cross-field kick lands near the far touchline (~6 Y-units in), in the corner.
export const CROSS_KICK_INSET = 6;
export const CROSS_KICK_JITTER = 4;

// In-field kick launch angles (degrees off straight-down-pitch). Box kicks are
// nearly straight for the chaser; grubbers and drop-outs angle diagonally.
export const BOX_KICK_ANGLE_DEG = 5;
export const GRUBBER_ANGLE_DEG = [8, 18] as const;
export const DROPOUT_ANGLE_DEG = [10, 20] as const;
// A #10's territorial clearing kick kept in field — angled diagonally downfield.
export const CLEARING_ANGLE_DEG = [10, 22] as const;

// Lateral jitter applied around the swept Y when a try is grounded — the runner
// angling in for the line. Wider styles scatter further toward the corner.
export const TRY_LANDING_JITTER = {
  keep_it_tight: 6,
  balanced:      10,
  wide_wide:     16,
} as const;
