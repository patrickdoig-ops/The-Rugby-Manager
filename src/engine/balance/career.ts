// Multi-season career tuning constants. Drives `developStats` (per-stat
// age curve applied at each rollover) and `shouldRetire` (probabilistic
// retirement curve indexed by age + position class). All numbers are
// v1 baselines — tune via career-determinism telemetry once we have it.

import type { PlayerStats } from '../../types/player';

// Per-stat age trajectory. Stat increases each year up to `peakAge`,
// declines thereafter. `growthPerYear` and `declinePerYear` are pre-noise
// expected deltas; `STAT_NOISE` adds per-player jitter.
//
// Calibration (v2.284a):
//   Growth rates halved from v1 baselines so rollover and training are
//   roughly equal contributors. Physical decline steepened (pace 1.2→1.5),
//   mental decline flattened (composure 0.2→0.1) to widen the career arc.
//   STAT_NOISE.stddev halved (0.5→0.25) in the same pass: growth rates are
//   too small for 0.5-stddev noise not to swamp them on mental/skill stats.
export const AGE_CURVES: Record<keyof PlayerStats,
  { peakAge: number; growthPerYear: number; declinePerYear: number }> = {
  pace:        { peakAge: 25, growthPerYear: 0.80, declinePerYear: 1.50 },
  agility:     { peakAge: 26, growthPerYear: 0.70, declinePerYear: 1.20 },
  stamina:     { peakAge: 27, growthPerYear: 0.60, declinePerYear: 0.80 },
  strength:    { peakAge: 28, growthPerYear: 0.50, declinePerYear: 0.70 },
  tackling:    { peakAge: 29, growthPerYear: 0.40, declinePerYear: 0.50 },
  breakdown:   { peakAge: 29, growthPerYear: 0.40, declinePerYear: 0.50 },
  handling:    { peakAge: 30, growthPerYear: 0.35, declinePerYear: 0.35 },
  setPiece:    { peakAge: 30, growthPerYear: 0.35, declinePerYear: 0.35 },
  kicking:     { peakAge: 31, growthPerYear: 0.30, declinePerYear: 0.30 },
  discipline:  { peakAge: 32, growthPerYear: 0.25, declinePerYear: 0.20 },
  positioning: { peakAge: 32, growthPerYear: 0.25, declinePerYear: 0.20 },
  composure:   { peakAge: 33, growthPerYear: 0.20, declinePerYear: 0.10 },
};

// Age-banded headroom (OVR points above current) seeded once per player at
// game-start and persona-generation. rngTransfer(min, max) picks within the
// band. Young players have significant room to grow; veterans are already near
// their ceiling.
export const POTENTIAL_HEADROOM: {
  maxAge: number; min: number; max: number;
}[] = [
  { maxAge: 21, min: 8,  max: 20 },
  { maxAge: 24, min: 3,  max: 12 },
  { maxAge: 28, min: 1,  max:  6 },
  { maxAge: 99, min: 0,  max:  3 },
];

// Growth multiplier applied when a player approaches their OVR ceiling
// (potential). Interpolated linearly between anchors. Applied to rollover
// growth and training development chance — never to decline.
// Sorted ascending by headroom; headroom = potential - currentOvr.
export const PROXIMITY_CURVE: { headroom: number; mul: number }[] = [
  { headroom:  0, mul: 0.10 },
  { headroom:  3, mul: 0.25 },
  { headroom:  6, mul: 0.50 },
  { headroom: 10, mul: 0.80 },
  { headroom: 15, mul: 1.00 },
];

// Match-appearances multiplier applied to rollover growth only (not decline,
// not training). Sorted descending by minApps so the first matching entry wins.
export const APPEARANCES_CURVE: { minApps: number; mul: number }[] = [
  { minApps: 16, mul: 1.20 },
  { minApps: 11, mul: 1.00 },
  { minApps:  5, mul: 0.70 },
  { minApps:  0, mul: 0.40 },
];

// Pure helpers — shared by careerRollover and trainingWeek.

export function proximityMultiplier(potential: number | undefined, ovr: number): number {
  if (potential === undefined) return 1.0;
  const headroom = Math.max(0, potential - ovr);
  const c = PROXIMITY_CURVE;
  if (headroom >= c[c.length - 1].headroom) return c[c.length - 1].mul;
  if (headroom <= c[0].headroom) return c[0].mul;
  for (let i = 0; i < c.length - 1; i++) {
    const lo = c[i], hi = c[i + 1];
    if (headroom >= lo.headroom && headroom <= hi.headroom) {
      const t = (headroom - lo.headroom) / (hi.headroom - lo.headroom);
      return lo.mul + t * (hi.mul - lo.mul);
    }
  }
  return 1.0;
}

export function appearancesMultiplier(apps: number): number {
  for (const { minApps, mul } of APPEARANCES_CURVE) {
    if (apps >= minApps) return mul;
  }
  return APPEARANCES_CURVE[APPEARANCES_CURVE.length - 1].mul;
}

// Standard deviation + clamp for the Gaussian noise added to each
// per-stat delta. Drives some players developing better/worse than the
// pure curve would predict.
export const STAT_NOISE = { stddev: 0.25, clamp: 1.5 };

// Season-rollover reputation smoothing. Each rollover, a player's reputation
// moves this fraction of the way toward their current overall rating, so
// reputation tracks ability over a few seasons rather than snapping. 0 = never
// updates, 1 = snaps to OVR immediately.
export const REPUTATION_OVR_NUDGE = 0.5;

// Probability of retiring at the END of the season the player is
// currently playing (i.e. evaluated against the age the player will be
// when the new season begins). Cumulative probabilities — the last
// matching age applies. Below the lowest age in the table, retirement
// probability is 0.
//
// Position-class split: forwards last about a year longer than backs at
// peak, but tail-off accelerates similarly. Loose v1 baseline; refine
// once a multi-season telemetry pass exists.
export const RETIREMENT_CURVE = {
  forwards: [
    { age: 32, prob: 0.05 }, { age: 33, prob: 0.10 }, { age: 34, prob: 0.20 },
    { age: 35, prob: 0.35 }, { age: 36, prob: 0.55 }, { age: 37, prob: 0.80 },
    { age: 38, prob: 1.00 },
  ],
  backs: [
    { age: 31, prob: 0.05 }, { age: 32, prob: 0.12 }, { age: 33, prob: 0.25 },
    { age: 34, prob: 0.40 }, { age: 35, prob: 0.60 }, { age: 36, prob: 0.85 },
    { age: 37, prob: 1.00 },
  ],
};

// End-of-season awards / leaderboards.
//   - mvpMinAppearances guards against a 10-minute sub posting a 9.0
//     rating from a single play.
//   - leaderboardSize is the top-N captured into ArchivedSeason.leaders
//     for each category (tries, carries, tackles, avg rating).
export const SEASON_AWARDS = {
  mvpMinAppearances: 5,
  leaderboardSize: 3,
};

// Phase 7 supply pipeline. Each rollover, every club promotes a handful
// of academy graduates (per-club, biased toward the club's nationality
// pool) and a batch of foreign imports lands in the free-agent pool.
// Per-rollover roster growth is ~32 players league-wide (10 clubs × 3
// academy + ~7 imports), so a 448-player base settles at ~480 by the
// end of season 2 — plenty of supply for AI signings and human
// poaching without runaway inflation.
export const ACADEMY_SUPPLY = {
  gradsPerClub: { min: 2, max: 4 },
  ageBand:      { min: 18, max: 20 },
  ratingBand:   { min: 55, max: 75 },
};

export const IMPORT_SUPPLY = {
  perRollover: { min: 5, max: 10 },
  ageBand:     { min: 23, max: 30 },
  ratingBand:  { min: 65, max: 88 },
};

// Starter free-agent pool seeded once at game start (newSeason) so the
// Hub → Transfers tile has something to scout from day one rather than
// silently bouncing back. Same generator as foreign imports — journeyman
// rating band, slightly wider age, larger volume. Skipped at fromSave
// (the saved state already carries whatever FA pool the career has
// accumulated since opening day).
export const STARTER_FA_POOL = {
  count:       { min: 12, max: 18 },
  ageBand:     { min: 23, max: 32 },
  ratingBand:  { min: 65, max: 85 },
};

// ── Roster hygiene (long-career growth control) ──────────────────────────
// Retained-archive depth. The live archive and the saved archive are both
// trimmed to this many most-recent seasons; older seasons' leaders / per-player
// history are dropped. Retired roster records not referenced by the retained
// archive (or any live structure) are pruned at rollover, so the roster — and
// therefore the save file — stays bounded across a long career instead of
// accumulating every player who ever retired. weightedLeaguePosition only ever
// reads the two most-recent archive entries, so 15 is comfortably deep.
export const ARCHIVE_CAP = 15;

// Minimum club squad size guaranteed at each rollover: a matchday 23 plus cover
// for injuries and international call-ups. After the season's releases, this
// rollover's retirements and pre-agreed moves, and the academy/import intake,
// any club projected below this is topped up with extra academy graduates — so
// no AI-run club can fall below a fieldable squad over a long career.
export const MIN_SQUAD_SIZE = 30;
