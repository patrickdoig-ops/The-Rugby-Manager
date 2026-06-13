// Playbook schema (Upgrade.md § 7.1; WP6). A play is a temporary named
// role-assignment — 2–4 roles, ~3 s lifetime — carrying run lines (waypoints
// relative to the play origin and attackDir) and a timing schedule of
// pass/dummy/receive actions. It overrides Layer 1 (ROLE) for its named roles
// only; Layers 2–3 (DECIDE / REACT) stay live throughout, and every play carries
// abort conditions. The play sets up the picture; contact, evasion geometry, and
// the defensive fold decide whether it works ("authored intent, simulated
// outcome", Upgrade.md § 6).
//
// CONTENT vs TUNING (CLAUDE.md balance rule): the play DEFINITIONS here are
// content; the SELECTION weights (which play the carrier utility layer picks) are
// tuning in balance/spatialDecision.ts. Waypoints are authored in the Phase
// Animator's play editor and exported here — never hand-edited coordinate math.
//
// COORDINATE MODEL — every waypoint is MARK-RELATIVE and ATTACK-ORIENTED so one
// definition mirrors anywhere on the pitch in either direction (the mirror falls
// out of playPointToPitch in src/engine/spatial/playGeometry.ts — never
// hand-mirrored data):
//   fwd — along the attack direction; POSITIVE = toward the gain line / forward,
//         NEGATIVE = behind it (where a deep runner starts). 0 = on the mark.
//   lat — toward the OPEN side (positive); the engine mirrors it to whichever
//         side is actually open at runtime (openSign), so a play authored to one
//         side plays correctly off either touchline.

// Where the play is anchored — the reference point its waypoints are relative to.
export type PlayOrigin = 'ruck' | 'scrum' | 'lineout';

// The lateral channel of the pitch the play is built for (selection gate).
export type PlayChannel = 'tight' | 'mid' | 'wide';

// The phase the play can fire from. Strike plays fire at FirstPhase (off
// scrum / lineout); continuity moves fire off clean quick ruck ball in PhasePlay.
export type PlayPhase = 'FirstPhase' | 'PhasePlay';

// Per-tick abort conditions — evaluated live; any true ends the play and the
// bound roles revert to their ShapeSolver targets (Upgrade.md § 7.1).
export type PlayAbort = 'turnover' | 'intercept_risk' | 'receiver_covered';

// One point on a role's run line. `t` is the micro-tick offset (0 = play start)
// at which the role should BE at this point — the steering layer leads him there.
export interface PlayWaypoint {
  t: number;
  fwd: number;
  lat: number;
}

// A timed action a role performs. `t` is the micro-tick offset; `to` names the
// role the pass / dummy is aimed at (omitted for a solo carry).
export interface PlayAction {
  t: number;
  do: 'pass' | 'dummy' | 'receive' | 'carry';
  to?: string;
}

// One named role within a play. `slot` is the matchday slot (1–15) that animates
// it — bound directly (the play editor lets the author pick which players take
// part, exactly like the shape-editor roster subset). `line` is the run-line
// waypoints (≥1; the first is the role's start offset); `actions` the timed
// pass / dummy / receive / carry schedule.
export interface PlayRole {
  slot: number;
  line: PlayWaypoint[];
  actions?: PlayAction[];
}

// When a play is eligible to fire.
export interface PlayTrigger {
  phases: PlayPhase[];
  channels?: PlayChannel[];
  // Require at least this much open-side space (metres from the mark to the open
  // touchline) before the play is offered — a wide strike needs room to run.
  minSpaceWide?: number;
}

// A complete play definition.
export interface Play {
  id: string;
  name: string;
  origin: PlayOrigin;
  // Play lifetime in micro-ticks (10 Hz → 30 ≈ 3 s). After this the roles revert
  // to ShapeSolver targets even if no abort fired.
  lifetimeTicks: number;
  trigger: PlayTrigger;
  // Roles keyed by name (e.g. 'firstReceiver', 'decoy', 'strike'). 2–4 entries.
  roles: Record<string, PlayRole>;
  abort: PlayAbort[];
}
