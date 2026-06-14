// Spatial decision / pass-mechanics tuning (Upgrade.md § 5.4, § 6 backline trio;
// WP5). All weights/distances/timings the spatial pass chain reads live here — no
// magic literals in src/engine/spatial/. Coordinates are the 0–100 pitch (x = long
// axis, y = lateral); a coord-unit on the long axis ≈ 1 metre.

import type { AttackingStyle, DefensiveLine } from '../../types/team';
import type { Zone } from './kickDecision';
import type { PlayChannel } from '../../data/playbook/types';

// Carrier utility AI (Upgrade.md § 5.4): the wide-vs-hard READ. On top of the
// team's attackingStyle base propensity (effStyleScalar(HARD_CARRY_THRESHOLDS)),
// the playmaker reads the defensive picture and field position and shades the
// decision toward the space — but only as much as his COMPOSURE lets him (a rattled
// 10 defaults to the base tactic + rng; a composed 10 fully applies the read). The
// underlying rng() draw is preserved, so the seam stays deterministic; only the
// THRESHOLD moves. A POSITIVE value pushes toward going wide.
export const CARRIER_UTILITY = {
  // Attack the space the opponent's defensive line tactic leaves: a BLITZ rushes up
  // narrow (outside space → go wide); a DRIFT shepherds across (less outside →
  // go inside / hard carry); hybrid neutral.
  vsDefLine: { blitz: 12, hybrid: 0, drift: -8 } as Record<DefensiveLine, number>,
  // Field position: more profit going wide deep in the opponent's territory
  // (stretch a tiring defence); keep it tighter pinned in your own 22 (lower risk).
  fieldPos: { opp22: 6, oppHalf: 3, ownHalf: 0, own22: -6 } as Record<Zone, number>,
  // The read is scaled by the playmaker's composure (0–100) → 0..1; clamp the final
  // threshold to a sane band so the read shades, never forces, the choice.
  thresholdFloor: 5,
  thresholdCeil: 95,
} as const;

// The PASS CHAIN that prefixes a spatial carry: the ball is swept from the
// scrum-half at the ruck, through the intervening backline, to the carrier at his
// receiving point, BEFORE he runs. Purely the ball's spatial path + the receiving
// geometry — the pass OUTCOME (knock-on / interception) stays on the legacy rng()
// rolls in OpenPlayEvent (the spatial chain is the visual + the where, not a re-roll).
export const PASS_CHAIN = {
  // Micro-ticks the ball spends in flight per pass (10 Hz, so 3 ≈ 0.3 s). Kept
  // short so the chain reads as crisp passing, not a slow lob.
  flightTicks: 3,

  // A BACK carrier receives the ball OUT WIDE in the backline (not at the ruck):
  // `receiveWidth` is how far toward the open side of the mark his receiving point
  // sits, `receiveDepth` how far behind the gain line (so he runs ONTO the line).
  // A FORWARD carrier ignores these — he engages from the ruck (the mark) as before.
  receiveWidth: 16.0,
  receiveDepth: 4.0,

  // Intervening receivers (e.g. the fly-half) are posted evenly along the line
  // between the ruck and the carrier's receiving point during the pass phase, at
  // this depth behind the gain line — a flat-ish backline the ball travels across.
  linkDepth: 3.0,

  // The scrum-half plays at the RUCK base, this far behind the mark — so the pass
  // chain starts at the ball and he never drifts out into the backline fan.
  scrumHalfDepth: 1.5,

  // Run-onto-the-ball: an intervening receiver starts this much DEEPER than his
  // catch point and runs forward onto the pass over the flight — so a receiver is
  // moving onto the ball, not standing still while it flies through him.
  runOnDepth: 4.0,
} as const;

// Play-overlay mechanism (Upgrade.md § 7.1; WP6). A selected play binds its named
// roles to agents and installs their authored run-line waypoints as the Layer-1
// steering source for the play's lifetime; Layers 2–3 (contact / utility veto) stay
// live, and every play carries abort conditions evaluated per micro-tick. These
// constants tune the ABORT geometry only — the run lines themselves are CONTENT in
// src/data/playbook/ (CLAUDE.md content-vs-tuning rule). All abort checks read agent
// positions (no rng): a play that the defence has read should die, deterministically,
// so the familiarity penalty (defender read speed) can shift the rate predictably.
// Coordinates are the 0–100 pitch; a coord-unit on the long axis ≈ 1 metre.
export const PLAY_OVERLAY = {
  // receiver_covered: the next receiver in the pass schedule has a defender within
  // this radius when the pass is due → the picture is shut, abort to ShapeSolver.
  receiverCoverRadius: 3.2,
  // intercept_risk: a defender sits within this distance of the live pass lane
  // (the segment from the current ball-holder to the next receiver) → the skip
  // pass is into a covered channel, abort before throwing it.
  interceptLaneRadius: 2.4,
  // turnover: the strike runner is carrying the ball into a defender within this
  // radius before he has completed his line (contact would resolve it anyway, but
  // the play as a SET MOVE is dead) → revert so he runs it as a normal carry.
  turnoverRadius: 2.6,
  // The strike runner counts as ISOLATED (no bound support nearer than this) — only
  // then does the turnover abort fire, so a well-supported carry is not aborted by
  // a single tackler the contact system would resolve in the attack's favour.
  isolationRadius: 9.0,
  // Familiarity READ (WP6): each of the three abort radii above is scaled by
  // (1 + familiarityReadGain × recency) where recency is the 0..1 "the defence has
  // seen this play lately" scalar (state.playRecency). A read play's abort windows
  // widen — defenders react faster, so a repeated move dies more often. At recency
  // 1 the radii grow 40%; at 0 (a fresh play) they are unscaled.
  familiarityReadGain: 0.4,
} as const;

// Play SELECTION (WP6, Upgrade.md § 7.1) — which playbook play (if any) overlays a
// carry. Tuning only; the play DEFINITIONS are content in src/data/playbook/. The
// fire gate + weighted pick draw on the OUTCOME rng() stream (selection shapes the
// outcome), so they are seeded-deterministic. Calibrated NEUTRAL to the owner's
// post-rebalance § 13 targets (tries ~5.5): plays change HOW a break comes, not the
// rate. A team's effective attackingStyle biases WHICH play surfaces (the "default
// playbook from suggestedTactics") via styleAffinity; recency lowers a stale play's
// weight so the attack varies its moves.
export const PLAY_SELECTION = {
  // Percent of eligible carries on which a play is offered at all. Low — a set move
  // is the exception, not every phase. The rest run the plain ShapeSolver carry.
  // Calibrated so plays keep tries on the owner's post-rebalance ~5.5 target.
  firePct: 9,
  // Open-side space (metres from the mark to the open touchline) at/above which a
  // wide call reaches the WIDE channel; below it a wide call stays MID.
  wideChannelSpace: 24,
  // styleAffinity[attackingStyle][channel] — the team's shape preference scales a
  // play's weight by the channels it is built for (a play's weight takes the MAX
  // over its trigger channels). wide_wide flings it to the edge; keep_it_tight
  // hammers the close channels; balanced is flat.
  styleAffinity: {
    wide_wide:     { tight: 0.5, mid: 1.0, wide: 1.6 },
    balanced:      { tight: 1.0, mid: 1.0, wide: 1.0 },
    keep_it_tight: { tight: 1.5, mid: 1.0, wide: 0.5 },
  } as Record<AttackingStyle, Record<PlayChannel, number>>,
  // How far a fully-read play's selection weight drops: weight ×= (1 − drop × recency).
  // At recency 1 a stale play keeps 35% of its weight (the attack mostly moves on).
  familiarityWeightDrop: 0.65,
  // PLAY_SELECTED recency dynamics (applied in applyMatchEvent): on each selection
  // the side's existing recencies decay by recencyDecay, then the chosen play gains
  // recencyBump (clamped to 1). decay < 1 means a play not run for a few phases
  // fades back toward fresh; the bump means ~2-3 repeats to approach "fully read".
  recencyDecay: 0.7,
  recencyBump: 0.5,
} as const;
