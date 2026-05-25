// Injury system tuning. Calibrated against professional rugby epidemiology:
// match injury incidence ~80-90 per 1,000 player-hours → ~2 injuries per
// match across both teams (80 min × 30 players ≈ 40 player-hours). Type
// mix dominated by ligament sprains (~22%), muscle strains (~20%), and
// concussions (~15%). Recovery range: 1-week knocks → 26-36 week ACLs.
//
// Two tuning surfaces:
//   • INJURY        — the per-tackle injury TRIGGER roll (in-match).
//   • INJURY_KIND_WEIGHTS — which kind of injury, given a trigger fired.
//   • INJURY_SEVERITY     — per-kind severity weights + week bands; rolled
//                            at match teardown via rngTransfer.
//
// Consumed by:
//   src/engine/events/OpenPlayEvent.ts   (trigger + kind, rng())
//   src/game/GameCoordinator.ts          (severity + weeks, rngTransfer())

import type { Position, InjuryKind, InjurySeverity } from '../../types/player';

export const INJURY = {
  // Trigger probability per resolved tackle outcome. Calibrated so a
  // typical match lands ~1.5 injuries across both teams, ~14 per club
  // per 18-round season. The OpenPlay resolver fires the roll ~22 times
  // per match (PHASE_PLAY phases that produce a true tackle outcome,
  // i.e. not a line break); the dominant-tackle / position / fatigue
  // multipliers stack on top. Was 8.0 (~2.0 per match, ~18.5 per club
  // per season) — dropped to 6.0 in v2.153a after audit showed the
  // cumulative time-loss load (~120 player-weeks/club/season) ran
  // ~1.5× real Premiership rates and the per-match cadence felt
  // constant. Re-run `npx tsx scripts/injuryAudit.ts` after any change.
  basePctPerTackle:    6.0,         // % — consumed via rng(1, 10000) <= basePct * 100

  // Big-hit injuries are disproportionately frequent on dominant tackles
  // — the carrier gets driven backwards or the tackler leads with a high
  // hit. Multiplier applies on top of the base.
  dominantTackleMult:  2.5,

  // Fatigued players are more injury-prone (form drops, technique slips).
  // At 100% fatigue (i.e. fresh) → no boost; at 0% → +fatigueWeight × 100%
  // boost. PlayerFatigue runs 100 → 0 over a match, so the multiplier
  // increases as the match wears on.
  fatigueWeight:       0.6,

  // Recurrence: a player who picked up an injury within the last X
  // weeks (RECURRENCE_WINDOW_WEEKS) rolls a higher chance of going
  // down again, and (in INJURY_SEVERITY) loses more time when they do.
  recurrenceMult:      1.4,
  recurrenceWindowWeeks: 8,

  // On a dominant_tackle, the injury hits the tackler instead of the
  // carrier with this probability (modelled as the tackler leading with
  // the shoulder / head and bearing the consequence).
  tacklerVictimPct:    30,

  // Position vulnerability multipliers. Forwards take more contact;
  // backs less. Centres are the league baseline.
  positionVuln: {
    Prop: 1.20, Hooker: 1.15, Lock: 1.10, Flanker: 1.10, 'Number 8': 1.10,
    'Back Row': 1.10, 'Scrum-Half': 0.90, 'Fly-Half': 0.85, Centre: 1.00,
    Wing: 0.85, Fullback: 0.90, 'Utility Back': 0.95,
  } satisfies Record<Position, number>,
} as const;

// Weights sum to 100. Picked by a single rng(1, 100) at the moment of
// trigger. Calibrated against RWC 2019 surveillance + PRISP 22-23:
// ligament sprains and muscle strains dominate; concussion still 15%;
// fractures and knee cartilage represent the smaller share of severe
// injuries.
export const INJURY_KIND_WEIGHTS: Record<InjuryKind, number> = {
  muscle_strain:   22,
  ligament_sprain: 20,
  concussion:      15,
  knock:           12,
  knee_cartilage:  10,
  shoulder:         9,
  fracture:         7,
  laceration:       5,
};

// Per-kind severity profile + week bands. At teardown, for each in-match
// injury we roll severity (via rngTransfer 1-100 against `weights`), pick
// a week count uniformly inside `bands[severity]`, then apply the
// recurrence time-loss multiplier if the player was already in their
// recurrence window. Numbers calibrated against:
//   • hamstring strains: 6-12 wks typical
//   • shoulder dislocation: ~10-12 wks
//   • ACL / serious knee ligament: 26-36 wks
//   • concussion / HIA fail: 1-2 wks
//   • thigh haematoma / minor knock: ~1 wk
//   • fractured jaw / lower leg: 12-20 wks
export interface SeverityProfile {
  weights: Record<InjurySeverity, number>;     // sum to 100
  bands:   Record<InjurySeverity, [number, number]>; // weeksRemaining range, inclusive
}

export const INJURY_SEVERITY: Record<InjuryKind, SeverityProfile> = {
  knock: {
    weights: { mild: 80, moderate: 18, severe: 2 },
    bands:   { mild: [1, 1], moderate: [2, 3],  severe: [4, 5] },
  },
  laceration: {
    weights: { mild: 75, moderate: 22, severe: 3 },
    bands:   { mild: [1, 1], moderate: [2, 3],  severe: [4, 6] },
  },
  concussion: {
    weights: { mild: 45, moderate: 40, severe: 15 },
    bands:   { mild: [2, 2], moderate: [3, 4],  severe: [5, 8] },
  },
  muscle_strain: {
    weights: { mild: 50, moderate: 40, severe: 10 },
    bands:   { mild: [2, 4], moderate: [5, 8],  severe: [9, 12] },
  },
  ligament_sprain: {
    weights: { mild: 45, moderate: 40, severe: 15 },
    bands:   { mild: [3, 5], moderate: [6, 10], severe: [11, 16] },
  },
  shoulder: {
    weights: { mild: 30, moderate: 50, severe: 20 },
    bands:   { mild: [3, 5], moderate: [8, 12], severe: [13, 18] },
  },
  fracture: {
    weights: { mild: 25, moderate: 45, severe: 30 },
    bands:   { mild: [4, 6], moderate: [8, 14], severe: [15, 22] },
  },
  knee_cartilage: {
    weights: { mild: 25, moderate: 40, severe: 35 },
    bands:   { mild: [4, 8], moderate: [10, 18], severe: [26, 36] },
  },
};

// On recurrence, the rolled `weeksRemaining` is multiplied by this and
// floored. Mirrors the literature: re-injuries cost ~50% more time.
export const INJURY_RECURRENCE_TIME_LOSS_MULT = 1.5;
