// Tuning for the spatial ShapeSolver — defensive line slots, fold, backfield,
// the offside plane, and the minimal carry corridor (Upgrade.md §§ 5.2, 5.3, 6
// Layer 1). Every number the ShapeSolver / carry-corridor logic reads lives
// here — no magic literals in src/engine/spatial/ShapeSolver.ts (CLAUDE.md
// balance rule).
//
// Coordinate space is the existing 0–100 pitch (Upgrade.md § 2.6): x = long
// axis (try lines x=0/x=100), y = lateral (touchlines y=0/y=100). A coord-unit
// on the long axis ≈ 1 metre. `defensiveLine` is the rush/drift/shadow tactic;
// it maps to lateral slot spacing + how far in front of the mark the line sets.

import type { DefensiveLine, AttackingStyle } from '../../types/team';

// ── Defensive line slots (Upgrade.md § 5.2 "Line model") ──────────────────
// Defenders fill slots on a line anchored at the breakdown/mark. Slots are laid
// out laterally either side of the mark; `slotSpacing` is now the SCALE of the
// density gradient (DEFENCE_SPACING below) — the average inter-slot gap, tight at
// the ruck and wider toward the edge — not a uniform gap. Blitz packs tight + sets
// up flat (fast line speed eats space); drift spreads wide + sets deeper (lateral
// slide shepherds to touch); hybrid sits between. Spacing is in lateral coord-units;
// standOff is how far in FRONT of the mark (toward the attacking side, against
// attackDir) the line sets.
export const DEFENSIVE_LINE: Record<DefensiveLine, { slotSpacing: number; standOff: number; forwardPress: number; lateralTrack: number }> = {
  // `forwardPress` (0–1) is how hard the line advances UP onto the carrier as he
  // runs the corridor (Bug ③): blitz presses up fast, drift presses little and
  // shepherds laterally instead, hybrid sits between. `lateralTrack` (0–1) is how
  // much the line slides ACROSS to follow the carrier's channel each tick: drift
  // slides the most (the lateral shepherd), blitz the least (it just rushes up).
  // Both feed the per-tick re-anchor; the standOff still sets the opening depth.
  blitz:  { slotSpacing: 5.5, standOff: 2.0, forwardPress: 0.85, lateralTrack: 0.35 },
  drift:  { slotSpacing: 7.5, standOff: 4.5, forwardPress: 0.35, lateralTrack: 0.85 },
  hybrid: { slotSpacing: 6.5, standOff: 3.0, forwardPress: 0.6,  lateralTrack: 0.6  },
} as const;

// Per-tick defensive re-anchor (Bug ③). Each micro-tick the line's targets are
// recomputed against the LIVE carrier so the defence visibly advances/folds as he
// runs the corridor instead of holding the static opening slots. `pressGain` is
// the coord-units the line steps toward the gain line per unit of carrier advance,
// scaled by the tactic's forwardPress; `pressCap` bounds the total forward creep
// so the line cannot rush past the carrier (and the offside sweep stays coherent
// against the fixed breakdown mark). `trackGain` is how far each slot's lateral
// target chases the carrier's y per tick, scaled by the tactic's lateralTrack.
export const DEFENCE_REANCHOR = {
  pressGain: 0.55,
  pressCap: 9.0,
  trackGain: 0.12,
} as const;

// Cover defence (shape-realism). The deep backfield (fullback + a winger) normally
// holds for kick coverage, but once the carrier has BROKEN PAST the defensive line
// it must step UP and make the cover tackle instead of holding deep and conceding
// the gain. The NEAREST backfielder (by lateral channel) comes up to meet the
// carrier; the other holds (far-side / kick cover). Whether he shuts the break down
// is emergent — a fast carrier beats the cover (a real line break), a slow one is
// caught (contact). Outcome-affecting; the spatial verdict already routes a caught
// carrier through ContactSystem.
export const COVER_DEFENCE = {
  // The carrier must be PAST the (pressed) defensive line by this margin (coord-
  // units, along attackDir) for the cover to engage — a genuine break in progress.
  // Below it, the front line is still contesting and the backfield holds deep.
  triggerAdvance: 2.0,
  // The cover aims this far GOAL-SIDE of the carrier (along attackDir) so he meets
  // him square + goal-side rather than chasing from behind (the worse tackle angle).
  leadAhead: 3.0,
} as const;

// Number of front-line defender slots laid out around the mark. The remaining
// on-field defenders (minus the backfield) hold their nearest reform position;
// 12 covers the realistic defensive front (15 − ~1-2 backfield − ruck bodies).
export const LINE_SLOT_COUNT = 12;

// Defensive-line DENSITY GRADIENT (shape-realism). A real drilled line is NOT
// evenly spaced: it is TIGHT next to the ruck (the guards + tight forwards packed
// to stop the close carry) and progressively WIDER toward the open edge (backs
// marking wide attackers). Each per-side slot N sits at the cumulative sum of gaps,
// where the gap grows from `innerRatio · slotSpacing` (the inner slots) to
// `outerRatio · slotSpacing` (beyond `spreadSlots` out). The ratios are chosen so
// the AVERAGE gap ≈ the old uniform `slotSpacing`, keeping the line's total extent
// ~unchanged (minimal calibration shift) while redistributing it into the gradient.
// `slotSpacing` (DEFENSIVE_LINE) is now the gradient SCALE, not a uniform gap.
export const DEFENCE_SPACING = {
  innerRatio: 0.72,
  outerRatio: 1.35,
  spreadSlots: 4,
} as const;

// When the ruck is wide, front-line slots that would clamp against the near
// touchline are redistributed to the OPEN side instead of packing the touchline,
// so the line spreads across the field rather than bunching (the "half the pitch
// open" look). Capped: only this many clamped slots redirect — keeping 1-2 pillars
// on the blindside and limiting how far the change shifts outcomes (home-win-share
// rises with the redirect count; 2 holds every § 13 band in range while still
// pushing the open-side coverage out ~8 m).
export const LINE_OPEN_REDIRECT_CAP = 2;

// ── Backfield (Upgrade.md § 5.2 "Backfield") ──────────────────────────────
// The number of deep defenders posted for kick coverage, exempt from the line,
// keyed by the backfieldDefence tactic. Posted via the pickFullback chain.
export const BACKFIELD_COUNT = { one_back: 1, two_back: 2, three_back: 2 } as const;
// How far behind the line (toward the defending try line, along attackDir) the
// backfield posts, in coord-units.
export const BACKFIELD_DEPTH = 22;
// Lateral spread of a 2-deep backfield, as |y| EITHER SIDE OF THE PITCH MIDLINE
// (y=50) — PITCH-CENTRED, not ruck-centred (shape-realism). The back three cover
// the WHOLE width of the field regardless of where the ruck is, so a wide ruck no
// longer leaves both deep defenders bunched on the same touchline with the far
// side open (the reference defensive shape splits 14/15 ~40 m apart across the
// pitch). A single backfielder (one_back) sits on the midline. The DEPTH stays
// mark-relative (BACKFIELD_DEPTH). Replaces the old ruck-centred BACKFIELD_SPREAD.
export const BACKFIELD_PITCH_SPLIT = 16;

// ── Offside plane (Upgrade.md § 5.2 "Offside discipline") ─────────────────
// The line holds behind the offside plane (the mark) until ball-out. Creep is
// the distance a defender drifts past the plane before the ball is out, in
// coord-units. Base creep is scaled DOWN by discipline/positioning (well-
// drilled defenders hold) and UP by the team `discipline` tactic (risky teams
// push the line). A defender whose creep exceeds `penaltyThreshold` is rolled
// (via spatial-RNG) into an offside PENALTY_AWARDED at `penaltyRollPct`.
export const OFFSIDE = {
  // Base creep (coord-units) for an average-discipline defender on a balanced
  // team. The per-defender creep = base × disciplineScale × teamTacticScale.
  baseCreep: 2.2,
  // Per-defender discipline scaling: creep multiplier at the WORST (attr=1) and
  // BEST (attr=100) combined discipline+positioning. Better drilled → less creep.
  disciplineScaleWorst: 1.8,
  disciplineScaleBest:  0.35,
  // Creep (coord-units) past the plane beyond which an offside penalty can be
  // rolled. A defender below this is onside enough that the referee plays on.
  penaltyThreshold: 3.2,
  // Probability (spatial-RNG 1–100) that a creep-beyond-threshold is pinged.
  // Sized with the discipline tactic scaling so the aggregate offside-penalty
  // rate folds into the existing ~11.4 penalties/match band rather than adding
  // a large new source. Only the single worst offender per carry is rolled.
  penaltyRollPct: 9,
} as const;

// Team `discipline` tactic creep multiplier — risky teams push the line harder
// (more creep, more offsides won as territory but more pings); cautious teams
// hold. Keyed by the Discipline enum.
export const OFFSIDE_TEAM_SCALE = { risky: 1.35, balanced: 1.0, cautious: 0.7 } as const;

// ── Carry corridor (Upgrade.md § 5.3, minimal in WP2) ─────────────────────
// The attacking shape is deliberately primitive here (full attack shape is
// WP5): the carrier plus a small support pod get targets up the corridor; the
// rest hold station. Support runners sit at authored offsets relative to the
// carrier — lateral offset (coord-units, alternating sides) and depth behind
// (toward own try line, against attackDir).
export const CARRY_CORRIDOR = {
  supportCount: 3,           // carrier + up to 3 support runners
  supportLateralOffset: 4.0, // |y| offset of the nearest support pair
  supportLateralStep: 3.5,   // extra |y| per support beyond the first pair
  supportDepth: 3.0,         // coord-units of depth behind the carrier
  // How far up the corridor (coord-units, along attackDir) the carrier's target
  // is set each solve — the carrier runs at the line. Drives the micro-tick
  // advance distance; the actual metres awarded come from the resolver / break.
  carryReach: 14,
};

// ── Attack placeholder spread (Upgrade.md § 5.3; beat-opening shape) ──────
// Beyond the carrier + support pod, the REST of the attacking side opens the
// beat in a credible placeholder shape (full pods are WP5): forwards in a rough
// cluster near the mark, backs fanning out with width + depth behind the gain
// line. Used only to SEED the opening positions (the corridor solve still owns
// the carrier + support pod targets); it stops every attacker opening on the
// ball. Coordinates are oriented by attackDir so both possession sides and both
// halves mirror correctly. All offsets are coord-units relative to the mark.
// Forward pods (WP5): the off-ball forwards set up as PODS — small tight units
// posted across the field at the gain-line depth as receiving stations for the
// next phase — instead of one loose cluster. Pods fan toward the open side, each
// pod wider; within a pod the 2-3 forwards bunch tightly. (Style-driven 1-3-3-1
// vs 2-4-2 spacing is a follow-up; this is a fixed structure for now.)
export const FORWARD_POD = {
  podSize: 3,            // forwards per pod
  podDepth: 4.0,         // pod centre this far behind the gain line
  inPodSpread: 2.6,      // within-pod lateral step
  inPodStagger: 1.4,     // within-pod along-axis depth step
  // The first off-ball forward holds the BLINDSIDE edge (the leading "1" of a
  // 1-3-3-1) this far onto the SHORT side of the mark (coord-units), so the attack
  // keeps a short-side option instead of fanning entirely open-side (shape-realism).
  blindsideEdgeOffset: 13.0,
  // The second off-ball forward holds the OPENSIDE edge (the trailing "1") out on
  // the FAR open touchline — so the forwards span the WHOLE width (edge·pods·edge),
  // not just a stack toward the open side. clampY caps it at the touchline. The
  // ruck pod (carrier + cleaners, role 'corridor') is the implicit first pod; the
  // remaining off-ball forwards pod between the two edges.
  openEdgeOffset: 28.0,
  // Attacking STYLE drives how far the pods spread across the field: keep_it_tight
  // keeps them close to the ruck (forward-dominant, narrow), wide_wide flings them
  // toward the edges (spread the ball), balanced between. `firstPodOffset` is the
  // |y| of the inside pod from the mark; `podSpacing` the lateral gap between pods.
  spread: {
    keep_it_tight: { firstPodOffset: 4.5, podSpacing: 8.0 },
    balanced:      { firstPodOffset: 6.0, podSpacing: 12.0 },
    wide_wide:     { firstPodOffset: 9.0, podSpacing: 18.0 },
  } as Record<AttackingStyle, { firstPodOffset: number; podSpacing: number }>,
} as const;

export const ATTACK_SPREAD = {
  // Backline: a fanning line set deeper than the forwards, each back further
  // from the mark laterally (toward the open side) and progressively deeper, so
  // the backs carry real width + depth behind the gain line. `firstOffset` is
  // the |y| of the inside back; `lateralStep` the extra width per back out;
  // `depth` how far behind the mark the backline sets; `depthStep` extra depth
  // per back out (the classic angled backline).
  backFirstOffset: 9.0,
  backLateralStep: 9.0,
  backDepth: 7.0,
  backDepthStep: 3.0,
} as const;

// Parking spot for an empty agent slot (a side reduced below 15 by a card): a
// deep corner near its own line, well off the ball so it never joins the pile
// or the formation. Coord-units; x is mirrored by attackDir, y is the touchline
// side. Inactive agents get no steering target and hold here for the beat.
export const EMPTY_SLOT_PARK = { backDepth: 30, sideY: 6 } as const;

// Small DETERMINISTIC per-agent stagger applied when seedFormation SNAPS an
// agent onto its formation slot at beat-open (coord-units, by slot index). A
// perfectly even ruler-straight line is unnatural to watch and leaves the
// carrier dead-on a defender every carry (zero gap). The stagger breaks the
// wall into a slightly ragged line/spread. It is DETERMINISTIC (a fixed slot-
// keyed pattern, no random draw) on purpose: seedFormation must not consume the
// spatial-RNG stream, or it would shift every downstream detectGap/detectOffside
// draw of the beat and make outcomes hypersensitive to the stagger magnitude.
// Excludes the carrier + support pod (role 'corridor') — their start is exact.
export const FORMATION_STAGGER = 2.8;

// Micro-ticks run per PhasePlay carry beat (10 Hz). ~2.2 s of run-up-and-fold —
// enough for the line to fold and the carrier to reach the gain line so the
// gap measurement is meaningful, short enough that the silent micro-tick cost
// stays inside the WP0 timing budget. Frame capture is skipped when silent.
export const CARRY_CORRIDOR_TICKS = 22;

// WP3: maximum extra ticks run after a broken tackle before the beat ends.
// After a beaten defender the carrier continues looking for a second contact;
// this cap prevents the beat from running indefinitely when the carrier is clear.
export const MAX_TICKS_AFTER_BREAK = 8;

// ── Gap detection → line break (Upgrade.md § 5.2, the emergent payoff) ────
// A line break happens when the corridor opens up: the nearest line defender's
// lateral gap to the carrier's running line exceeds what the defender can close
// given the carrier's evasion potential. This is the SPATIAL replacement for
// OpenPlayResolver's `evasionScore − defenseScore >= lineBreakMargin` branch.
// The verdict is computed from real measured agent spacing after the micro-
// ticks, scaled by a carrier evasion factor; a small spatial-RNG band adds noise.
export const GAP_BREAK = {
  // Lateral gap (coord-units) to the nearest line defender at/above which the
  // corridor is "open" before the evasion adjustment. The effective threshold
  // is shifted by the carrier's evasion potential and the defender's cover.
  baseGapThreshold: 18.0,
  // Weight on a defender's along-axis deficit when he is BEHIND the carrier
  // (beaten). A beaten defender's lateral cover counts for less: his deficit ×
  // this weight is added to his |Δy| so a folding line that hasn't caught up
  // reads as a real gap. 0 would make the gap purely lateral (a beaten defender
  // still "covers" if level laterally); 1 would weight x and y equally.
  behindWeight: 0.6,
  // Carrier evasion potential: derived from agility+pace (1–100 → 0–1). A high-
  // evasion carrier needs LESS of a gap to break (subtracts from threshold); a
  // low-evasion carrier needs MORE. Coefficient is the coord-unit swing across
  // the full evasion range.
  evasionGapSwing: 4.0,
  // Defender cover: derived from positioning+tackling+pace (1–100 → 0–1). Good
  // cover RAISES the gap needed to break (adds to threshold).
  coverGapSwing: 3.5,
  // Net carry-modifier influence on the break threshold. The handler passes the
  // (attackMod − defendMod) sum the legacy resolver folds into its margin test —
  // home advantage, team talk, tactical evasion/collision shifts. A positive net
  // shift LOWERS the gap needed to break, so these match-shaping modifiers still
  // bias line breaks exactly as they did on the legacy path (restores the
  // home-win / tactics balance the pure-geometry verdict would otherwise drop).
  // Coefficient converts a mod point (same scale as the resolver's ±15 margin)
  // into coord-units of threshold.
  modGapWeight: 0.35,
  modGapClamp: 6,            // cap the net-mod threshold swing (coord-units)
  // Spatial-RNG noise band (coord-units, ±half) added to the measured gap so the
  // verdict is not a hard step — mirrors the rng(1,20) jitter in the resolver.
  noiseBand: 5,
  // Spatial line-break metres: pace-scaled like the legacy line break but drawn
  // on the spatial-RNG stream. Floor + range at the slowest/fastest carrier.
  metresFloor: 5,
  metresMin: [6, 12] as const,   // slow carrier (pace ~40) drawn range
  metresMax: [9, 24] as const,  // fast carrier (pace ~90) drawn range
  paceAtFloor: 40,
  paceAtFull:  90,
  // Flat metres added to a FirstPhase spatial line break (coord-units ≈ m). A
  // strike off a set piece breaks into the OPEN, structured field — a clean line
  // break there carries further (often to the line) than a break in the congested
  // phase-play middle. Applied only on a FirstPhase line break (WP6): it lifts
  // first-phase tries back toward the legacy rate AND cuts the downfield breakdowns
  // (and so the holding-on penalties) a break stopped short of the line would
  // otherwise create — the single lever easing both the points-floor and the
  // penalty-ceiling pressure the FirstPhase spatialisation introduced.
  firstPhaseBreakMetresBonus: 8,
} as const;
