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
const GOLDEN = 'ccb537f2e4b42186e918577747ff4e0d1d7f1e6db7fcdf5972ed469f8066ae10';

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

