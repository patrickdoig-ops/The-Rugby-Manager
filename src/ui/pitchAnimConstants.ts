// Presentation constants for the 2D pitch animation. These are VISUAL pacing /
// spacing values, NOT gameplay tuning — they do not belong in src/engine/balance/
// (changing them never affects a match outcome or determinism). Centralised here so
// the ball animators (PitchView) and the dot choreographer (pitchChoreography) read
// the SAME numbers — a divergent copy desyncs the ball from the dots (the reason
// MAUL_HOOKER_DX was already shared).

// Long-axis offset (pitch units) the ball-carrier dot sits BEHIND the ball, so its
// circle and number read alongside the ball rather than under it.
export const CARRIER_BEHIND_BALL = 2.5;

// Long-axis offset the dominant tackler sits AHEAD of the carrier (into the
// collision) when pinned to a dominant carry/tackle.
export const TACKLER_AHEAD = 1.3;

// Open-field kick lob (animateKickArc) + the formation-chase dot run: duration
// clamp, bounded below by readability and above so a dense passage never drags.
export const KICK_ARC_MS_MIN = 300;
export const KICK_ARC_MS_MAX = 650;

// Per-leg floor for a multi-leg ball walk — never animate a leg faster than this,
// even at the fastest tick speed.
export const LEG_FLOOR_MS = 90;

// Formation glide (Layer-3 dot-transitioning) — MUST match the CSS transition
// duration (`.dot-transitioning .pitch-dot { transition: top/left 0.6s … }` in
// style/main.css). The scheduleGlide cleanup timer and any animator that wants to
// arrive WITH the gliding pack both read this.
export const GLIDE_MS = 600;

// Snap transition (kick-off / half-time / full-time) — a faster cut, matching
// `.dot-snap-transition` in style/main.css.
export const SNAP_MS = 400;

// Maul ball slide to the hooker at the tail of the drive. Floor for readability;
// ceiling aligned to GLIDE_MS so the ball reaches the hooker AS the bound pack
// finishes gliding into the post-drive cluster (it previously capped at 400ms and
// so arrived before the pack). Still clamped to stepMs so it never lags commentary.
export const MAUL_SLIDE_FLOOR_MS = 200;

// Scrum scrum-half sweep (from loosehead start to behind the #8): duration clamp.
export const SH_SWEEP_MS_MIN = 300;
export const SH_SWEEP_MS_MAX = 500;

// Lateral offset (pitch units) infield from the ball where the scrum #9 starts its
// sweep, so the arc has enough travel to read on mobile.
export const SCRUM_SH_INFIELD_START = 9;

// Between-ruck formation drift: the fraction of the way each off-ball dot moves
// toward its ball-anchored target shape (BREAKDOWN_CLEAN) on each PhasePlay beat.
// A lerp weight — low enough that the shape eases (never snaps), high enough that the
// defensive line visibly keeps re-forming goal-side of an advancing ball over a few
// phases. Presentation only.
export const DRIFT_WEIGHT = 0.4;
