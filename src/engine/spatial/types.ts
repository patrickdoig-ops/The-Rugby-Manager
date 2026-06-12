// Spatial substrate type contracts (Upgrade.md §§ 3, 8.1).
//
// All positions/velocities are in the existing 0–100 pitch space (invariant
// § 2.6): x = long axis (try lines x=0/x=100), y = lateral (touchlines
// y=0/y=100). The World is engine-internal — never part of MatchState, never
// saved, never range-checked by assertInvariants. Plain objects only: NO ECS,
// NO classes-with-behaviour for agents (CLAUDE.md § 3; Upgrade.md § 1).

import type { PossessionSide } from '../../types/engine';

// A 2D vector in pitch coordinates. Reused in place inside the micro-tick loop;
// scratch instances live on the World, never allocated per tick.
export interface Vec2 {
  x: number;
  y: number;
}

// Per-agent role assigned by the (stubbed in WP1) ShapeSolver. The string set
// grows in WP 2+ (line defender, pod runner, backfield…); 'idle' is the WP1
// stub default before any decision layer exists.
//  • 'empty'    — a slot with no on-field player (a side reduced below 15 by a
//                 card). The ShapeSolver skips it entirely; it is parked off the
//                 ball so it never joins the formation or the gap/offside contest.
//  • 'corridor' — the ball carrier or a support-pod runner whose OPENING start
//                 position solveCarryCorridor seeds directly (at/near the mark)
//                 and whose intent.target is a RUN destination up the corridor,
//                 not a formation slot. seedFormation must NOT snap these onto
//                 their target (that would teleport the carrier downfield) — it
//                 leaves their seeded start position intact.
export type AgentRole = 'idle' | 'empty' | 'corridor';

// Per-agent transient intent — what the decision layer wants this agent to do
// this beat. A bag of fields the steering layer reads; the WP1 stub fills only
// `target`. Mutated in place; never reallocated.
export interface AgentIntent {
  // Steering target in pitch coordinates. Null ⇔ no target (agent holds).
  target: Vec2 | null;
}

// One simulated player. Identity is positional: home slots 1–15 then away
// 1–15 in World.agents (the frozen iteration order, Upgrade.md § 11).
export interface Agent {
  slot: number;                 // matchday slot 1–15
  side: PossessionSide;         // 'home' | 'away'
  pos: Vec2;                    // current position (in place)
  vel: Vec2;                    // current velocity (in place)
  role: AgentRole;
  intent: AgentIntent;
  // Snapshot of the source player's live fatiguePct at World (re)build time —
  // read by the speed derivation. Snapshot, not live, so the spatial sim can
  // never write back to MatchState (only its outcomes cross applyMatchEvent).
  fatigueSnapshot: number;
  // Snapshot of the derived steering attributes, captured at build time so the
  // micro-tick loop never reaches back into the Player record.
  pace: number;
  agility: number;
  // Snapshot of the ShapeSolver attributes (Upgrade.md § 5.2): fold work rate
  // (stamina + positioning), cover (tackling), and offside discipline. Captured
  // at build time alongside pace/agility so the solver never reaches back into
  // the Player record either.
  stamina: number;
  positioning: number;
  tackling: number;
  discipline: number;
  // Per-beat top-speed multiplier (1 = full). The ShapeSolver sets this below 1
  // for a slowly-folding defender (derived work rate × fatigue) so MovementSystem
  // scales his arrive() speed — slow folds leave overlaps (Upgrade.md § 5.2). It
  // is independent of the pace-derived top speed so it bites even where the
  // 1–20 steering clamp saturates the raw pace. Default 1; reset every build.
  speedScale: number;
  // WP3 additions: collision dominance + recovery-lockout state.
  // `strength` is captured from player.baseStats.strength at World build time.
  // `handling` is captured from player.baseStats.handling (offload catch gate).
  // `recoveryLockout` is set true when a defender is beaten in Phase 1 evasion
  // (he is physically behind play and steers back instead of re-engaging).
  strength: number;
  handling: number;
  recoveryLockout: boolean;
}

// The ball within the spatial world. `height` is a render-only scalar for kick
// arcs (Upgrade.md § 5.7) — never part of MatchState. `carrierSlot`/`carrierSide`
// identify the carrier when the ball is held.
export interface SpatialBall {
  pos: Vec2;
  vel: Vec2;
  height: number;
  carrierSlot?: number;
  carrierSide?: PossessionSide;
}

// One captured agent position within a Frame. Fixed order matches World.agents.
export interface AgentFrame {
  x: number;
  y: number;
}

// A mid-beat event marker for the UI to time effects against (Upgrade.md § 8.3).
export interface FrameMarker {
  t: number;
  kind: 'tackle' | 'offload' | 'break' | 'take';
  slot: number;
}

// One captured micro-tick render snapshot (Upgrade.md § 8.1). Live matches
// only — silent fixtures skip capture entirely. A frozen scalar snapshot with
// the same lifetime rules as GameEvent.movements (CLAUDE.md § 4): never live
// state, never range-checked, never saved.
export interface Frame {
  t: number;                                   // micro-tick index within the beat
  ball: { x: number; y: number; h: number; carrierSlot?: number };
  dots: AgentFrame[];                          // fixed order: home 1–15 then away 1–15
  markers?: FrameMarker[];
  // Per-tick decision annotations, recorded ONLY behind world.recordAnnotations
  // (dev builds) — never in production or silent paths. Keyed by agent index
  // (0–29, matching `dots`). Consumed by the frame debugger.
  annotations?: Record<number, FrameAnnotation>;
}

// Why an agent did what it did this tick — surfaced in the frame debugger
// (Upgrade.md § 9). `layer` is the control layer that won (1 ROLE / 2 DECIDE /
// 3 REACT, Upgrade.md § 6); `topScores` are the leading utility options.
export interface FrameAnnotation {
  layer: 1 | 2 | 3;
  topScores: { option: string; score: number }[];
}
