// Silent-fixture golden-score harness.
//
// Sims a fixed set of headless AI fixtures (the exact path GameCoordinator
// uses for non-player league/cup/European matches) from pinned seeds and
// asserts the full result set hashes to a checked-in golden value. Unlike
// checkDeterminism (which runs LIVE coordinators) and checkSeasonDeterminism
// (which only compares two runs of the SAME code), this pins the ABSOLUTE
// silent-mode outcomes — so any change that claims to speed up silent
// simulation "without altering results" is mechanically verified here.
//
// The snapshot covers each fixture's final score plus both teams' full
// per-match summary aggregates (tries, line breaks, carries, metres, set
// piece, cards, …) — the same MatchSnapshot.{home,away}Summary that drives
// season-scope stats. A regression that shifts a stat counter without moving
// the scoreline still trips the hash.
//
// Regenerating the golden: run this script, copy the printed `actual` hash
// into GOLDEN below, and commit. Do this ONLY when an outcome change is
// intentional — a surprise mismatch means a silent-path optimisation altered
// the simulation.
//
// Timing assertion (Upgrade.md § 12): also asserts that the mean wall-clock
// time per fixture stays below SILENT_FIXTURE_MEAN_MS + 250 ms so the spatial
// engine build never silently blows the performance budget. Baseline is frozen
// in spatialBaselines.ts.

import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { simulateFixture } from '../src/game/simulateFixture.js';
import type { RawTeamInput } from '../src/types/teamData.js';
import { SILENT_FIXTURE_MEAN_MS } from './spatialBaselines.js';

import bathRaw         from '../src/data/team-bath.json' with { type: 'json' };
import bristolRaw      from '../src/data/team-bristol.json' with { type: 'json' };
import exeterRaw       from '../src/data/team-exeter.json' with { type: 'json' };
import gloucesterRaw   from '../src/data/team-gloucester.json' with { type: 'json' };
import harlequinsRaw   from '../src/data/team-harlequins.json' with { type: 'json' };
import leicesterRaw    from '../src/data/team-leicester.json' with { type: 'json' };
import newcastleRaw    from '../src/data/team-newcastle.json' with { type: 'json' };
import northamptonRaw  from '../src/data/team-northampton.json' with { type: 'json' };
import saleRaw         from '../src/data/team-sale.json' with { type: 'json' };
import saracensRaw     from '../src/data/team-saracens.json' with { type: 'json' };

const TEAMS = [
  bathRaw, bristolRaw, exeterRaw, gloucesterRaw, harlequinsRaw,
  leicesterRaw, newcastleRaw, northamptonRaw, saleRaw, saracensRaw,
] as unknown as RawTeamInput[];

const ROOT_SEED = 0xDEADBEEF;

// Pinned golden hash of the full result set. Regenerate intentionally only.
// Re-baselined 2026-06 (WP2 + kicking merge): PhasePlay carries now resolve through the
// spatial substrate (SpatialSimulator) — spatial gap detection replaces the legacy
// line-break/metres portion of OpenPlayResolver, and a new offside-creep penalty source
// feeds the penalty pipeline. Also incorporates kicking tuning from main (balance/kicking.ts
// + KickingResolver + TacticalKickEvent), authored FIRST_PHASE try grounding y precedence,
// 5m try-leniency band removal, and scrum-half kick routing fix. All by design.
// Re-baselined again: velocity-clamp fix in MovementSystem (post-separation vel clamped to
// deriveTopSpeed × speedScale) tightens carry-corridor trajectories → slight outcome shift.
// Silent outcomes shift by design while every § 13 telemetry band stays in range.
// Re-baselined again (WP2 initial-placement correction): beat-opening now SEEDS agents into
// the ShapeSolver formation (defensive line + backfield, carrier + support corridor, attacker
// placeholder spread) via seedFormation instead of piling all 30 on the ball — the carry
// resolves against a formed line from frame 0, shifting break/tackle outcomes. By design;
// every § 13 telemetry band stays in range. Reverting PhasePlay from SPATIAL_PHASES restores
// the spatial-only prior golden.
// Re-baselined again (WP2 carry-watchability fixes): the ball now couples to the carrier each
// micro-tick (Bug ②), the defensive line re-anchors onto the live carrier (Bug ③), and the
// backfield sign is corrected so deep defenders post on the defenders' side (Bug ①). The
// line's per-tick fold/press shifts the measured gap so break/tackle outcomes move. By
// design; every § 13 telemetry band stays in range.
// Re-baselined (WP3 contact-timing fix): seeding guard nudges defenders outside
// CONTACT_RADIUS + SEEDING_CLEAR_MARGIN before tick 0; launch grace suppresses
// contact until carrier has run LAUNCH_GRACE_TICKS ticks AND LAUNCH_GRACE_DIST
// units from the carry start. Carries now have a realistic engagement distance
// before the tackle fires — outcomes shift by design; § 13 bands all in range.
// Re-baselined (backfield slot fix): solveDefence now picks backfield defenders
// by matchday slot (back three: fullback 15, wings 14/11) instead of depth sort
// (which picked props 1/2). Props rejoin the front line; the back three cover
// kicks from deep. Front-line composition changes shift gap-detection outcomes.
// By design; every § 13 telemetry band stays in range.
//
// WP4 update: the breakdown now contests with the spatially-COMMITTED bodies
// (RuckCommitment over the persistent World) instead of an rng-picked forward
// set — same resolver formula, different (better-placed) participants.
//
// WP4 seeding fix: the cold-World formation seed moved from runCarrySim into the
// World lifecycle (seedWorld, called once at handlePhasePlay cold entry) and
// Breakdown no longer cold-builds — so kick / pick-and-go / carry beats all open
// in a real formation instead of 30 dots blooming off the ball.
//
// WP5 continuous onside shape: the carrier now ENGAGES FROM THE RUCK (snaps to the
// mark each beat and runs forward from there), the support pod TRAILS him, and the
// off-ball attack RE-ANCHORS behind the live gain line every tick — so the attack
// stays onside instead of stranding the backline ahead of the ball.
//
// WP5 defensive spread: front-line slots that would clamp against a near touchline
// at a wide ruck now redistribute to the OPEN side (capped at LINE_OPEN_REDIRECT_CAP)
// instead of packing the touchline — the line spreads across the field.
//
// WP5 forward pods: the off-ball forwards now set up as PODS posted across the
// field at the gain-line depth (receiving stations for the next phase) instead of
// one loose cluster behind the ruck.
//
// WP5 style-driven pods: the pod spread is now keyed off the team's effective
// attackingStyle — keep_it_tight keeps the pods near the ruck (~11 m wide),
// wide_wide flings them to the edges (~21 m), balanced between (the previous values).
//
// WP5 pass mechanics: a BACK carrier now receives the ball OUT WIDE in the backline
// (the ball sweeps from the ruck through the backline to him before he runs).
//
// WP5 carrier utility AI: the playmaker shades the wide-vs-hard read by the
// opponent's defensive line tactic + field position, scaled by his composure.
//
// WP5 authored shape consumption: a team's effective attackingStyle can select a
// hand-authored attacking formation (AUTHORED_ATTACK_SHAPES).
//
// WP5 dynamic pass (run-onto-ball): the pass phase now runs in BOTH live + silent
// (deterministic position math) — the scrum-half plays at the ruck, intervening
// receivers RUN ONTO the ball, and there is NO snapshot/restore, so the receivers
// flow into the carry (no pass→carry teleport). Positions feed commitRuck, so
// outcomes shift (by design); every § 13 band holds (pts 24.73, tries 3.79, TO 2.08,
// pen 12.68, tackMade 64.4, home-win 53.56 on the 5-seed sweep).
//
// WP6 FirstPhase spatialisation: FirstPhase joined SPATIAL_PHASES — a strike off a
// scrum/lineout now resolves its carry through the spatial substrate (same hybrid
// template as PhasePlay: the legacy rng() seam is preserved; the spatial line-break /
// contact verdict overrides the outcome) and the World persists FirstPhase → Breakdown.
// Re-calibrated with first-phase-LOCAL levers (a set-defence contact-evasion bonus so
// the square set line is harder to beat 1-on-1; a line-break-metres bonus so a strike
// into open field carries to the line instead of stopping short into a downfield
// breakdown) plus two breakdown knobs (ruckRetentionBonus 9→11, notRollingAway 4→2.6)
// to absorb the extra set-defence breakdowns. By design; every § 13 band holds on the
// 5-seed sweep (pts 26.16, tries 4.04, pen 12.38, tackAtt 62.01, tackMade 59.78,
// TO 2.06, home-win 53.11).
//
// Re-baselined on merge with main (player-stat updates in team-data.md / the team
// JSONs, the knockout-extra-time/kicking work, the Exeter tactic/stat tweaks, and the
// hooker try-credit halving): the silent outcomes shift with the new authored stats +
// rating change — NOT a spatial-engine change. With the new stats the first-phase
// set-defence contact bonus was nudged 14→18 so tackles-made clears the fast-mode
// (3-seed) floor with margin. Every § 13 band holds on the 5-seed sweep (pts 25.45,
// tries 3.93, pen 12.41, tackAtt 62.88, tackMade 60.84, TO 2.10, home-win 54.67).
//
// Shape-realism (defensive): the defensive line gained a DENSITY GRADIENT (tight at
// the ruck, wider toward the edge — DEFENCE_SPACING) and the backfield became
// PITCH-CENTRED (splits the field around y=50 instead of bunching on the ruck's
// touchline — BACKFIELD_PITCH_SPLIT). The better-organised line lifts tackles back
// toward baseline; outcomes shift accordingly (no breakdown re-tuning needed). Every
// § 13 band holds on the 5-seed sweep (pts 24.51, tries 3.81, pen 12.03, tackAtt 65.40,
// tackMade 63.46, TO 2.08, home-win 55.78).
//
// Shape-realism (attacking): the first off-ball forward now holds the BLINDSIDE edge
// (the leading "1" of a 1-3-3-1) instead of every forward fanning open-side, and the
// procedural backline is steeper + wider (backDepthStep 1.5→3, backLateralStep 7→9).
// Outcomes shift accordingly (no breakdown re-tuning); home-win comes back toward the
// middle. Every § 13 band holds on the 5-seed sweep (pts 24.88, tries 3.85, pen 12.27,
// tackAtt 65.68, tackMade 63.78, TO 2.01, home-win 53.78).
//
// Shape-realism (attacking, full-width): the SECOND off-ball forward now holds the
// OPENSIDE edge (the trailing "1") so the forwards span the whole width edge·pods·edge
// (FORWARD_POD.openEdgeOffset). The wider attack pulled the chronically-tight turnovers
// band to its floor, so turnoverMargin was widened −14 → −14.5 (the wide outlet left
// home-win headroom to absorb the small turnover lift). Every § 13 band holds on the
// 5-seed sweep with comfortable margins (pts 25.51, tries 3.93, pen 11.98, tackAtt 64.51,
// tackMade 62.62, TO 2.19, home-win 50.22).
//
// Shape-realism (cover defence): once the carrier breaks PAST the line, the nearest
// deep backfielder now steps UP to make the cover tackle (COVER_DEFENCE) instead of
// holding deep and conceding the gain; the other holds for kick/far-side cover.
// Whether the break is shut down is emergent (a fast carrier still beats the cover).
// Low scoring impact, modest defensive lift; every § 13 band holds on the 5-seed sweep
// (pts 25.49, tries 3.94, pen 11.95, tackAtt 64.34, tackMade 62.46, TO 2.18,
// home-win 53.11).
//
// Maul nerf (hooker over-scoring). Maul tries are credited to the hooker, and a
// near-deterministic pack-strength model let forward-heavy clubs win ~86% of mauls,
// so their hookers ran away with the try charts. Fix: (1) compressed the pack-score
// weights (0.55/0.45 → 0.20/0.16) so a dominant pack wins ~60% not ~86% — even strong
// mauls are now stoppable; (2) added MAUL_VALUES.defenderAdvantage (18) setting the
// equal-pack floor (~19% maul_won); (3) trimmed the won-gain bands (5-10/15-25 →
// 4-8/12-18, longDrivePct 10 → 6) so won mauls make less ground and cross the line less.
// Golden re-derived after merging the cover-defence change with the maul nerf.
//
// Tackle-stat accounting fix: a non-try line break now records the COVER
// tackler's own attempt (not just their make), so a covered break is 2
// attempts / 1 make. Previously the cover's make was counted without an
// attempt, hiding every covered break and inflating team tackle completion
// toward ~97%; the corrected figure is ~82%. Stat-only change — scorelines are
// unaffected, but the per-match summary tackle counts shift, so the hash moves.
const GOLDEN = 'ba6d7fe8670e3219a7b712b2dc0bc6d36ecd3afb4f5e0736258ebb0c1dfa4172';

// A fixed fixture list: one-way round-robin (45 unique pairings) plus a
// handful of flag-bearing fixtures (derby, neutral venue, low/high fill) so
// the home-advantage and occasion code paths are covered too.
interface Spec { home: RawTeamInput; away: RawTeamInput; round: number; opts: { neutralVenue?: boolean; homeFillRate?: number; isDerby?: boolean } }

const SPECS: Spec[] = [];
let round = 1;
for (let i = 0; i < TEAMS.length; i++) {
  for (let j = i + 1; j < TEAMS.length; j++) {
    SPECS.push({ home: TEAMS[i], away: TEAMS[j], round: round++, opts: {} });
  }
}
// Flag-bearing coverage (distinct seeds via distinct rounds).
SPECS.push({ home: TEAMS[0], away: TEAMS[1], round: 100, opts: { isDerby: true } });
SPECS.push({ home: TEAMS[2], away: TEAMS[3], round: 101, opts: { neutralVenue: true } });
SPECS.push({ home: TEAMS[4], away: TEAMS[5], round: 102, opts: { homeFillRate: 0.55 } });
SPECS.push({ home: TEAMS[6], away: TEAMS[7], round: 103, opts: { homeFillRate: 1.0 } });

const rows: string[] = [];
const fixtureTimes: number[] = [];
for (const s of SPECS) {
  const t0 = performance.now();
  const r = await simulateFixture(s.home, s.away, ROOT_SEED, s.round, s.opts);
  fixtureTimes.push(performance.now() - t0);
  rows.push(JSON.stringify({
    h: s.home.id, a: s.away.id, hs: r.homeScore, as: r.awayScore,
    hsum: r.snapshot.homeSummary, asum: r.snapshot.awaySummary,
  }));
}

const actual = createHash('sha256').update(rows.join('\n')).digest('hex');

if (actual === GOLDEN) {
  console.log(`OK: silent scores match golden (${SPECS.length} fixtures) hash=${actual.slice(0, 16)}…`);
} else {
  console.error('SILENT SCORE DRIFT — silent-mode simulation outcomes changed.');
  console.error(`  golden: ${GOLDEN}`);
  console.error(`  actual: ${actual}`);
  console.error('  If this change to outcomes is intentional, paste `actual` into GOLDEN and recommit.');
  process.exit(1);
}

// Timing assertion (Upgrade.md § 12): mean per-fixture wall-clock must stay
// below the frozen baseline + 250 ms headroom.
const meanFixtureMs = fixtureTimes.reduce((a, b) => a + b, 0) / fixtureTimes.length;
const TIMING_BUDGET_MS = SILENT_FIXTURE_MEAN_MS + 250;
if (meanFixtureMs > TIMING_BUDGET_MS) {
  console.error(`SILENT FIXTURE TIMING EXCEEDED — mean ${meanFixtureMs.toFixed(1)} ms > budget ${TIMING_BUDGET_MS} ms (baseline ${SILENT_FIXTURE_MEAN_MS} ms + 250 ms headroom).`);
  process.exit(1);
}
console.log(`OK: silent fixture timing — mean ${meanFixtureMs.toFixed(1)} ms per fixture (budget ${TIMING_BUDGET_MS} ms)`);

