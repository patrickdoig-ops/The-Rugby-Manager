// Tuning for the WP4 spatial ruck-commitment heuristic (Upgrade.md § 5.6).
// Every weight / threshold / radius the RuckCommitment system reads lives here —
// no magic literals in src/engine/spatial/RuckCommitment.ts (CLAUDE.md balance rule).
//
// On tackle completion the breakdown forms at the ruck mark. Every nearby agent
// scores commit-vs-reform: committed agents converge on the ruck (and feed the
// BreakdownResolver as the contesting body count + quality); the rest reform
// (defenders fold back into the line, attackers reset their shape). The
// resolver's CONTEST FORMULA is unchanged — only its INPUTS (which players, how
// many) come from this heuristic instead of a random pick.
//
// Coordinate space is the existing 0–100 pitch (x = long axis, y = lateral); a
// coord-unit on the long axis ≈ 1 metre. The `breakdown` stat is authored 1–100.

// ── Eligibility ────────────────────────────────────────────────────────────
// Only agents within ELIGIBILITY_RADIUS coord-units of the ruck mark can commit —
// a player 20 m away is not getting to this ruck before the ball is out. The
// carrier (already on the ground at the mark) and the deep backfield are never
// eligible (they cover kicks / reset, not contest the ruck).
export const RUCK_ELIGIBILITY = {
  // Radius (coord-units ≈ metres) around the mark within which an agent can
  // realistically arrive at the breakdown. ~16 m covers the forwards + the
  // nearest backs so the committed body count tracks the attacking plan's
  // supporter count (a tighter radius starved some rucks of cleaners, dropping
  // points/tries and lifting turnovers off baseline) without pulling the whole
  // width into every ruck.
  eligibilityRadius: 16,
} as const;

// ── Commit scoring ─────────────────────────────────────────────────────────
// Each eligible agent's commit score combines specialisation + isolation + noise
// (Upgrade.md § 5.6). The score RANKS the eligible agents; selectCommitted then
// takes the top `cap` of them (the team's target body count — the attacking cap is
// the existing breakdownSupporterCount, the defensive cap is keyed by
// defendingBreakdown), modulated by the isolation drop and the specialist override
// below. There is no absolute commit threshold — the cap sets how many commit.
export const RUCK_COMMIT = {

  // Carrier isolation → raises commit priority. Measured as the REAL distance from
  // the carrier to his nearest support in the World. An isolated carrier (support
  // far away) makes the defence keener to contest (jackal threat) and the attack
  // keener to secure. isolationFull is the distance (coord-units) at/above which
  // isolation is maximal; below it the factor scales linearly to 0 at distance 0.
  isolationFull: 10,
  // How many score points full isolation adds. Applied to BOTH sides (attack
  // secures harder, defence jackals harder) — the symmetric pressure of a lone
  // carrier. The defensive override (below) reads the same isolation signal.
  isolationWeight: 22,

  // Isolation threshold (on the 0–1 isolationFactor) at/above which the
  // attacking side commits ONE FEWER cleaner — the genesis of the jackal
  // turnover. Set high so only a genuinely exposed carrier (support well off the
  // shoulder, iso01 ≳ 0.85) thins the ruck; a normal carry with support arriving
  // (iso01 ≈ 0) keeps the full cap. Tuned against the turnover band (2.0 ± 0.5)
  // and points band (26.2 ± 3): at 0.85 only the most exposed carriers thin out,
  // keeping cleaners on borderline rucks so scoring and turnovers sit on baseline.
  isolationDropFactor: 0.85,

  // Specialisation → the breakdown stat weights the ruck over the line. A high-
  // breakdown forward commits readily; a winger almost never. specPivot is the
  // breakdown value that is neutral; specWeight scales the (stat − pivot) delta.
  specPivot: 50,
  specWeight: 0.45,

  // Spatial-RNG noise band (± this) added to each agent's commit score so the
  // committed set is not a hard step. Spatial RNG stream only — confined to the
  // substrate (the heuristic in RuckCommitment.ts is the sole consumer).
  noiseBand: 8,

  // ── Override (specialisation + threat beats the cap) ─────────────────────
  // Even past the team cap (base incentive ~0), a high-breakdown specialist next
  // to an isolated carrier still commits — the openside who can't ignore a jackal
  // chance, or the cleaner who must save an exposed ball. overrideThreshold is the
  // (specialisation-score + threat-score) bar; threatScore is the isolation term.
  overrideSpecWeight: 0.6,   // weight on (breakdown − specPivot) for the override
  overrideThreshold: 28,     // spec+threat sum that beats the cap

  // ── Committed-body bounds ────────────────────────────────────────────────
  // Floor + ceiling on each side's committed count, so the resolver always gets a
  // sane participant set even at the extremes (a side with no eligible forwards
  // still contests with at least the minimum; a huge pile is capped). The attack
  // floor guarantees the ball is presented; the defence floor guarantees a jackal.
  minAttackCommit: 1,
  maxAttackCommit: 5,
  minDefendCommit: 1,
  maxDefendCommit: 4,
} as const;

// ── Defensive cap by defendingBreakdown tactic ─────────────────────────────
// How many defenders a side commits to the ruck before its base incentive
// decays to 0, keyed by the defendingBreakdown tactic:
//   • jackal       — one specialist over the ball (poach), few committed.
//   • counter_ruck — pile bodies in to win the ball / blow them off it.
//   • shadow       — barely contest; defenders sprint back into the line.
// The override can still pull one extra (a specialist beside an isolated carrier).
export const RUCK_DEFEND_CAP = {
  jackal: 2,
  counter_ruck: 4,
  shadow: 1,
} as const;
