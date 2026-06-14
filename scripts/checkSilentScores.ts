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
const GOLDEN = '6db8c4dc4beca2cbacc61b4d68204bbce843f2495d1aff8764a4fd3704b40acc';

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

