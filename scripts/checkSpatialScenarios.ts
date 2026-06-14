// Spatial scenario regression suite (Upgrade.md § 11) — the FM-style "does the
// engine understand rugby" harness. Loads authored World setups, runs N
// micro-ticks of the dark-mode substrate, and asserts qualitative predicates.
//
// WP 1 ships two smoke scenarios against the stub (no decision/contact layers
// yet): an agent arrives at its target within tolerance, and soft separation
// keeps two co-located agents from stacking. WPs 2–8 grow this into the full
// suite (2-on-1 converts, isolated carrier jackalled, rush kills the miss-2…).
//
// Wired into `npm run verify`. Exit 0 = all pass; exit 1 names the first failure.

import { setMatchSeed } from '../src/utils/rng.js';
import {
  buildScenarioWorld,
  runScenario,
  runCarryScenario,
  runCarryBallPath,
  runContactScenario,
  buildContactWorld,
  contactRate,
  runContactWithMovement,
  minDefenderDistAtSeed,
  runCarryWithLaunchGrace,
  continuitySequence,
  runOverlayScenario,
  CONTACT_RADIUS,
  SEEDING_CLEAR_MARGIN,
  LAUNCH_GRACE_TICKS,
  LAUNCH_GRACE_DIST,
  dist,
} from './spatialScenarioKit.js';
import { playById } from '../src/data/playbook/index.js';
import { playPointToPitch, openSignFor } from '../src/engine/spatial/playGeometry.js';
import type { AgentSetup, ContactAgentSetup } from './spatialScenarioKit.js';
import { commitRuck } from '../src/engine/spatial/RuckCommitment.js';
import { run as runSpatial } from '../src/engine/spatial/SpatialSimulator.js';
import { deriveTopSpeed, SPATIAL_DT } from '../src/engine/balance/spatialSteering.js';
import { CARRY_CORRIDOR_TICKS } from '../src/engine/balance/spatialShape.js';
import { solveDefence, solveCarryCorridor, solveAttackSpread } from '../src/engine/spatial/ShapeSolver.js';
import { isForwardSlot } from '../src/engine/Slot.js';
import type { ShapeParams } from '../src/engine/spatial/ShapeSolver.js';

setMatchSeed(0x5A7A1);

interface Scenario {
  name: string;
  run: () => string | null; // null = pass, string = failure reason
}

// ── WP2 carry-scenario helpers ────────────────────────────────────────────
// Run `trials` independent carries over a freshly-built world and return the
// line-break / offside-penalty rate. Each trial reseeds nothing — the spatial
// stream advances across trials, so a band over many trials is seed-robust.
const SEEDS = [0x5A7A1, 0xBEEF1, 0xC0FE2, 0xFACE3];

function breakRate(build: () => ReturnType<typeof buildScenarioWorld>, params: Parameters<typeof runCarryScenario>[1], trials: number): number {
  let hits = 0;
  let n = 0;
  for (const seed of SEEDS) {
    setMatchSeed(seed);
    for (let i = 0; i < trials; i++) {
      if (runCarryScenario(build(), params).lineBreak) hits++;
      n++;
    }
  }
  return hits / n;
}

function offsideRate(build: () => ReturnType<typeof buildScenarioWorld>, params: Parameters<typeof runCarryScenario>[1], trials: number): number {
  let hits = 0;
  let n = 0;
  for (const seed of SEEDS) {
    setMatchSeed(seed);
    for (let i = 0; i < trials; i++) {
      if (runCarryScenario(build(), params).offsidePenalty) hits++;
      n++;
    }
  }
  return hits / n;
}

// A full 15-defender line bunched around a ruck `y`, folding across to cover the
// carrier. `slow` gasses the fold (low stamina/positioning → slow speedScale).
function bunchedLine(ruckTopY: number, slow: boolean): AgentSetup[] {
  const work = slow ? { stamina: 18, positioning: 18 } : { stamina: 98, positioning: 98 };
  const out: AgentSetup[] = [];
  for (let i = 0; i < 15; i++) {
    out.push({ x: 54, y: ruckTopY + i * 1.3, pace: 75, agility: 62, tackling: 55, discipline: 60, ...work, target: null });
  }
  return out;
}

// Three wide attackers stacked off the carrier's channel.
function wideAttackers(carrierY: number): AgentSetup[] {
  const out: AgentSetup[] = [];
  for (let i = 0; i < 15; i++) out.push({ x: 48, y: carrierY + i * 2, pace: 82, agility: 82, target: null });
  return out;
}

const scenarios: Scenario[] = [
  {
    name: 'agent arrives at target within tolerance',
    run: () => {
      // One home agent, fast, with a clear target 40 units away. After enough
      // ticks it should settle within ARRIVE_STOP_RADIUS of the target.
      const target = { x: 70, y: 50 };
      const world = buildScenarioWorld({
        home: [{ x: 30, y: 50, pace: 16, agility: 16, target }],
        away: [],
      });
      runScenario(world, 120); // 12 s at 10 Hz — ample to cover 40 units
      const d = dist(world.agents[0].pos, target);
      const TOL = 0.6;
      return d <= TOL ? null : `agent ended ${d.toFixed(3)} from target (tol ${TOL})`;
    },
  },
  {
    name: 'separation prevents stacking',
    run: () => {
      // Two home agents placed almost on top of each other with no target.
      // Soft separation must push them apart so they never stack.
      const world = buildScenarioWorld({
        home: [
          { x: 50, y: 50, target: null },
          { x: 50.2, y: 50, target: null },
        ],
        away: [],
      });
      runScenario(world, 60);
      const d = dist(world.agents[0].pos, world.agents[1].pos);
      const MIN = 1.0;
      return d >= MIN ? null : `agents only ${d.toFixed(3)} apart after separation (min ${MIN})`;
    },
  },

  // ── WP2: defensive line + carry corridor ─────────────────────────────────
  {
    name: 'fold overlap — slow far-side fold concedes a break, fast fold prevents it',
    run: () => {
      // A 15-man line bunched at a far-side ruck (y≈5–25) must fold across to a
      // carrier attacking the open side (y≈55). A SLOW fold (gassed, poorly
      // positioned) cannot reach the open channel in time → the wide attack
      // breaks with high probability. A FRESH, fast fold reduces breaks materially.
      //
      // Note: the backfield fix (slot-based selection) puts slots 14/15 in the
      // backfield rather than the front row. With a 50-unit lateral fold for the
      // remaining 13-player front line, even a fresh line cannot fully cover a
      // carrier 30+ units wide — but it still concedes measurably fewer breaks
      // than a gassed line. Thresholds reflect the correct back-three selection.
      const slowRate = breakRate(() => buildScenarioWorld({ home: wideAttackers(55), away: bunchedLine(5, true), ball: { x: 50, y: 55 } }), { mark: { x: 50, y: 55 }, carrierSlot: 1 }, 120);
      const fastRate = breakRate(() => buildScenarioWorld({ home: wideAttackers(55), away: bunchedLine(5, false), ball: { x: 50, y: 55 } }), { mark: { x: 50, y: 55 }, carrierSlot: 1 }, 120);
      if (slowRate < 0.9) return `slow fold broke only ${(slowRate * 100).toFixed(0)}% (want ≥90%)`;
      if (fastRate > 0.9) return `fast fold conceded ${(fastRate * 100).toFixed(0)}% breaks (want <90% — must be materially less than slow)`;
      if (slowRate - fastRate < 0.1) return `fold-speed gap only ${((slowRate - fastRate) * 100).toFixed(0)}pp (want ≥10pp)`;
      return null;
    },
  },
  {
    name: '2-on-1 — the extra man converts at a credible rate',
    run: () => {
      // Lone defender drawn wide (committed to the inside support) cannot recover
      // to cover the carrier's channel — the overlap tells more often than not.
      const build = () => buildScenarioWorld({
        home: [
          { x: 47, y: 55, pace: 88, agility: 88, target: null },  // carrier
          { x: 47, y: 48, pace: 85, agility: 85, target: null },  // inside support
        ],
        away: [{ x: 55, y: 80, pace: 50, agility: 48, tackling: 50, stamina: 35, positioning: 35, discipline: 60, target: null }],
        ball: { x: 50, y: 55 },
      });
      const rate = breakRate(build, { mark: { x: 50, y: 55 } }, 150);
      // A 2-on-1 should convert often but not always (the lone defender wins some).
      if (rate < 0.55 || rate > 0.95) return `2-on-1 break rate ${(rate * 100).toFixed(0)}% outside band [55%, 95%]`;
      return null;
    },
  },
  {
    name: 'rush defence vs deep attack — carries mostly die at/behind the gain line',
    run: () => {
      // A full, fit blitz line set flat against a deep lone carrier closes the
      // space — breaks are rare (the line is intact, no fold to exploit).
      const build = () => {
        const away: AgentSetup[] = [];
        for (let i = 0; i < 15; i++) away.push({ x: 54, y: 8 + i * 6, pace: 78, agility: 68, tackling: 72, positioning: 72, stamina: 85, discipline: 60, target: null });
        return buildScenarioWorld({ home: [{ x: 40, y: 50, pace: 72, agility: 66, target: null }], away, ball: { x: 48, y: 50 } });
      };
      const rate = breakRate(build, { mark: { x: 48, y: 50 }, defensiveLine: 'blitz' }, 150);
      if (rate > 0.2) return `rush defence conceded ${(rate * 100).toFixed(0)}% breaks (want ≤20%)`;
      return null;
    },
  },
  {
    name: 'offside discipline — low-discipline lines ping materially more than high',
    run: () => {
      // Identical staging, only the defenders' discipline/positioning + the team
      // `discipline` tactic differ. A risky, poorly-drilled line creeps past the
      // plane and is pinged far more often than a cautious, well-drilled one.
      const lineOf = (disc: number): AgentSetup[] => {
        const out: AgentSetup[] = [];
        for (let i = 0; i < 15; i++) out.push({ x: 50, y: 8 + i * 6, pace: 70, agility: 60, tackling: 60, positioning: disc, discipline: disc, stamina: 70, target: null });
        return out;
      };
      const carrier: AgentSetup[] = [{ x: 46, y: 50, pace: 75, agility: 70, target: null }];
      const lowRate = offsideRate(() => buildScenarioWorld({ home: carrier, away: lineOf(20), ball: { x: 48, y: 50 } }), { mark: { x: 48, y: 50 }, defendDiscipline: 'risky' }, 200);
      const highRate = offsideRate(() => buildScenarioWorld({ home: carrier, away: lineOf(90), ball: { x: 48, y: 50 } }), { mark: { x: 48, y: 50 }, defendDiscipline: 'cautious' }, 200);
      if (lowRate < 0.04) return `low-discipline offside rate only ${(lowRate * 100).toFixed(1)}% (want ≥4%)`;
      if (lowRate < highRate * 3) return `low-disc ${(lowRate * 100).toFixed(1)}% not materially > high-disc ${(highRate * 100).toFixed(1)}% (want ≥3×)`;
      return null;
    },
  },

  // ── Ball-couples-to-carrier regression guard (Bug ②) ─────────────────────
  {
    name: 'the ball travels with the carrier across a carry',
    run: () => {
      // A lone carrier runs up the corridor against a spread line. The ball must
      // be COUPLED to him each tick — its path length over the beat must track
      // the carrier's advance, not sit frozen at the mark (the old bug: ball
      // path 0.0, carrierSlot undefined). Guards Bug ② from silently regressing.
      setMatchSeed(0x5A7A1);
      const away: AgentSetup[] = [];
      for (let i = 0; i < 15; i++) away.push({ x: 54, y: 8 + i * 6, pace: 70, agility: 60, tackling: 60, positioning: 60, stamina: 70, discipline: 60, target: null });
      const world = buildScenarioWorld({
        home: [{ x: 46, y: 50, pace: 80, agility: 78, target: null }],
        away,
        ball: { x: 48, y: 50 },
      });
      const { ballPathLen, carrierMoved, carrierSlot } = runCarryBallPath(world, { mark: { x: 48, y: 50 }, carrierSlot: 1 });
      if (carrierSlot !== 1) return `ball carrierSlot ${carrierSlot} (want 1 — the carrier)`;
      if (ballPathLen <= 0) return `ball path length ${ballPathLen.toFixed(3)} — ball is frozen (Bug ②)`;
      // The coupled ball must track the carrier's run, not drift independently.
      if (Math.abs(ballPathLen - carrierMoved) > carrierMoved * 0.25 + 1) {
        return `ball path ${ballPathLen.toFixed(2)} not tracking carrier move ${carrierMoved.toFixed(2)}`;
      }
      if (carrierMoved < 3) return `carrier barely moved (${carrierMoved.toFixed(2)}) — carry not exercised`;
      return null;
    },
  },

  // ── Velocity-cap regression guard ────────────────────────────────────────
  // Ensures no agent ever moves faster than its rated top speed × speedScale
  // per tick. This catches the separation-runaway bug (no final vel clamp)
  // before it reaches the watchability gate.
  {
    name: 'per-tick displacement never exceeds top-speed budget',
    run: () => {
      // A dense cluster: 15 home agents all stacked near one point (triggers
      // worst-case separation accumulation) and 15 away agents evenly spread.
      // Targets are the symmetric opposite so every agent is in full motion.
      const home: AgentSetup[] = [];
      for (let i = 0; i < 15; i++) {
        home.push({ x: 50 + i * 0.05, y: 50 + i * 0.05, pace: 18, agility: 18, target: { x: 80, y: 20 } });
      }
      const away: AgentSetup[] = [];
      for (let i = 0; i < 15; i++) {
        away.push({ x: 20 + i * 4, y: 20 + i * 4, pace: 18, agility: 18, target: { x: 40, y: 70 } });
      }
      setMatchSeed(0xABCD1234);
      const world = buildScenarioWorld({ home, away });

      // Run tick by tick — record prev positions, step, measure displacement.
      const TICKS = 60; // 6 s — enough for separation to saturate if unclamped
      const EPSILON = 0.02; // float arithmetic tolerance

      for (let t = 0; t < TICKS; t++) {
        // Snapshot all positions before the tick.
        const prev = world.agents.map(a => ({ x: a.pos.x, y: a.pos.y }));
        runSpatial(world, 1, true);
        for (let i = 0; i < world.agents.length; i++) {
          const a = world.agents[i];
          const dx = a.pos.x - prev[i].x;
          const dy = a.pos.y - prev[i].y;
          const disp = Math.sqrt(dx * dx + dy * dy);
          // topSpeed × speedScale × SPATIAL_DT is the max legal displacement
          const cap = deriveTopSpeed(a.pace, a.fatigueSnapshot) * a.speedScale * SPATIAL_DT;
          if (disp > cap + EPSILON) {
            return `agent slot ${a.slot} moved ${disp.toFixed(4)} units/tick at tick ${t} (cap ${cap.toFixed(4)}, excess ${(disp - cap).toFixed(4)})`;
          }
        }
      }
      return null;
    },
  },


  // ── WP3: two-phase tackle + beat-ends-at-contact ─────────────────────────
  // These scenarios use buildContactWorld / runContactScenario — a direct
  // single-check API (no movement loop) that lets us precisely author the
  // carrier + defender velocities so geometry modifiers fire as expected.

  {
    name: 'WP3: prop at speed vs light defender square-on → dominant carry majority',
    run: () => {
      // Heavy prop (strength=82) at full pace (vel.x=8) colliding square-on with a light
      // back (strength=42, tackling=38). Square-on geometry: squareOnMult=1.0.
      // The prop's high strength + speed should win Phase 2 more than 50% of the time.
      // Use low agility on carrier + high tackling on defender to push into Phase 2 often.
      const trials = 300;
      const domCarryRate = contactRate(
        () => buildContactWorld(
          { x: 50, y: 50, pace: 65, agility: 28, strength: 82, handling: 55, stamina: 70, positioning: 60, tackling: 55, discipline: 60, fatigue: 5,  vx: 8.0, vy: 0 },
          [{ x: 52, y: 50, pace: 55, agility: 50, strength: 42, tackling: 38, stamina: 70, positioning: 55, discipline: 60, fatigue: 5, vx: -6.0, vy: 0 }],
        ),
        r => r.outcome === 'dominant_carry',
        trials,
        SEEDS,
      );
      if (domCarryRate < 0.5) return `prop dominant carry rate ${(domCarryRate * 100).toFixed(0)}% < 50% (want majority)`;
      return null;
    },
  },

  {
    name: 'WP3: jackal chasing from behind vs stepping fly-half → evasion advantage',
    run: () => {
      // Chasing: carrier vel.x=+6, defender vel.x=+4 (same direction) → dot > chaseThreshold
      //          → chaseMult=0.65 → defender score penalised → more evasion.
      // Head-on: carrier vel.x=+6, defender vel.x=-6 (opposite) → dot < headOnThreshold
      //          → headOnMult=1.1 → defender score boosted → less evasion.
      const trials = 400;
      const chasingEvasionRate = contactRate(
        () => buildContactWorld(
          { x: 50, y: 50, pace: 68, agility: 62, strength: 60, handling: 65, stamina: 70, positioning: 60, tackling: 50, discipline: 62, fatigue: 5, vx: 6.0, vy: 0 },
          [{ x: 52, y: 50, pace: 70, agility: 65, strength: 65, tackling: 72, stamina: 72, positioning: 70, discipline: 65, fatigue: 5, vx: 4.0, vy: 0 }],
        ),
        r => r.outcome === 'broken_tackle',
        trials,
        SEEDS,
      );
      const headOnEvasionRate = contactRate(
        () => buildContactWorld(
          { x: 50, y: 50, pace: 68, agility: 62, strength: 60, handling: 65, stamina: 70, positioning: 60, tackling: 50, discipline: 62, fatigue: 5, vx: 6.0, vy: 0 },
          [{ x: 52, y: 50, pace: 70, agility: 65, strength: 65, tackling: 72, stamina: 72, positioning: 70, discipline: 65, fatigue: 5, vx: -6.0, vy: 0 }],
        ),
        r => r.outcome === 'broken_tackle',
        trials,
        SEEDS,
      );
      if (chasingEvasionRate <= headOnEvasionRate) {
        return `chasing evasion ${(chasingEvasionRate * 100).toFixed(0)}% not higher than square-on ${(headOnEvasionRate * 100).toFixed(0)}% — geometry modifier not functioning`;
      }
      return null;
    },
  },

  {
    name: 'WP3: fatigued defender vs fresh carrier → dominance shifts toward carrier',
    run: () => {
      // Phase 2 collision: fatigued defender (fatigue=85%) has his power reduced by
      // fatigueScale=0.3. Carrier: strong (strength=80), low agility (30) so Phase 2 fires often.
      const trials = 400;
      function domCarryRateForDefFatigue(defFatigue: number): number {
        return contactRate(
          // Carrier: strength=75, vel=7.0 → momentum ≈ 73. Defender fresh: tackling=75,
          // strength=72 → power ≈ 73 → margin ≈ 0 (play_on). Fatigued 85%: power ≈ 55
          // → margin ≈ 18 > 10 → dominant_carry. Carrier agility=25 → Phase 2 fires often.
          () => buildContactWorld(
            { x: 50, y: 50, pace: 62, agility: 25, strength: 75, handling: 55, stamina: 80, positioning: 55, tackling: 50, discipline: 60, fatigue: 5,  vx: 7.0, vy: 0 },
            [{ x: 52, y: 50, pace: 62, agility: 55, strength: 72, tackling: 75, stamina: 65, positioning: 62, discipline: 62, fatigue: defFatigue, vx: -7.0, vy: 0 }],
          ),
          r => r.outcome === 'dominant_carry',
          trials,
          SEEDS,
        );
      }
      const freshRate    = domCarryRateForDefFatigue(5);
      const fatiguedRate = domCarryRateForDefFatigue(85);
      if (fatiguedRate <= freshRate) {
        return `fatigued defender dominant_carry rate ${(fatiguedRate * 100).toFixed(0)}% not higher than fresh ${(freshRate * 100).toFixed(0)}% — fatigue not applying to Phase 2`;
      }
      return null;
    },
  },

  {
    name: 'WP3: offload window — support close → attempts; isolated → near zero',
    run: () => {
      // Force play_on/dominant_tackle by using a dominant defender.
      // Close support (5 units): offload attempts >10%. Isolated (>20 units): near-zero.
      const trials = 400;
      function offloadAttemptRate(supportDist: number): number {
        return contactRate(
          () => buildContactWorld(
            { x: 50, y: 50, pace: 55, agility: 30, strength: 52, handling: 72, stamina: 70, positioning: 60, tackling: 50, discipline: 60, fatigue: 5, vx: 6.0, vy: 0 },
            [{ x: 52, y: 50, pace: 62, agility: 55, strength: 80, tackling: 82, stamina: 72, positioning: 72, discipline: 65, fatigue: 5, vx: -6.0, vy: 0 }],
            [{ x: 50, y: 50 + supportDist, pace: 72, agility: 68, strength: 60, handling: 75, stamina: 72, positioning: 65, tackling: 55, discipline: 65, fatigue: 5 }],
          ),
          r => r.offloadAttempted,
          trials,
          SEEDS,
        );
      }
      const closeRate    = offloadAttemptRate(5);
      const isolatedRate = offloadAttemptRate(20);
      if (closeRate < 0.10) return `close-support offload attempt rate ${(closeRate * 100).toFixed(1)}% < 10%`;
      if (isolatedRate > 0.05) return `isolated offload attempt rate ${(isolatedRate * 100).toFixed(1)}% > 5%`;
      if (closeRate <= isolatedRate) return `close rate ${(closeRate * 100).toFixed(1)}% not higher than isolated ${(isolatedRate * 100).toFixed(1)}%`;
      return null;
    },
  },

  {
    name: 'WP3: beat ends at contact — frame count varies with collision timing',
    run: () => {
      // Uses runContactWithMovement for the full movement-loop check.
      // Defender within convergence distance → most beats end before full tick budget.
      const trials = 200;
      const fullTicks = CARRY_CORRIDOR_TICKS;
      let shortBeats = 0;
      let total = 0;
      for (const seed of SEEDS) {
        setMatchSeed(seed);
        for (let i = 0; i < trials; i++) {
          const world = buildScenarioWorld({
            home: [{ x: 46, y: 50, pace: 72, agility: 65, strength: 65, handling: 60, stamina: 75, positioning: 65, tackling: 60, discipline: 65, target: { x: 70, y: 50 } }],
            away: [{ x: 48.5, y: 50, pace: 65, agility: 60, strength: 65, tackling: 65, stamina: 70, positioning: 65, discipline: 65, target: { x: 38, y: 50 } }],
            ball: { x: 46, y: 50 },
          });
          const result = runContactWithMovement(world, fullTicks);
          total++;
          if (result.ticksRun < fullTicks) shortBeats++;
        }
      }
      const shortRate = shortBeats / total;
      if (shortRate < 0.5) return `only ${(shortRate * 100).toFixed(0)}% of beats ended early (want ≥50%)`;
      return null;
    },
  },

  // ── WP3 contact-timing fix regression guards ──────────────────────────────
  // (a) Seeding guard: no defender within CONTACT_RADIUS + SEEDING_CLEAR_MARGIN
  //     of the carrier at t=0 after seedFormation runs (instant-tackle prevention).
  // (b) Launch grace: contact never fires before LAUNCH_GRACE_TICKS ticks AND
  //     LAUNCH_GRACE_DIST units of carrier travel (no 1-tick instant tackles).
  {
    name: 'WP3 contact-timing: seeding guard — no defender within contact range at t=0',
    run: () => {
      // Run the full seeding pipeline (solveDefence + solveCarryCorridor +
      // solveAttackSpread + seedFormation) with a BLITZ line (shallowest standOff
      // 2.0u — worst case for instant-spawn contact) at a range of marks and
      // lateral positions. Assert the minimum defender-to-carrier distance after
      // seeding is always ≥ CONTACT_RADIUS + SEEDING_CLEAR_MARGIN for every trial.
      const clearDist = CONTACT_RADIUS + SEEDING_CLEAR_MARGIN;
      const marks = [
        { x: 50, y: 50 }, { x: 30, y: 30 }, { x: 70, y: 70 },
        { x: 40, y: 20 }, { x: 60, y: 80 },
      ];
      for (const seed of SEEDS) {
        setMatchSeed(seed);
        for (const mark of marks) {
          const world = buildScenarioWorld({
            home: [{ x: mark.x, y: mark.y, pace: 75, agility: 70, target: null }],
            away: (() => {
              const line: AgentSetup[] = [];
              for (let i = 0; i < 15; i++) {
                line.push({ x: mark.x + 2, y: mark.y - 35 + i * 5, pace: 72, agility: 60, tackling: 65, positioning: 65, stamina: 80, discipline: 60, target: null });
              }
              return line;
            })(),
            ball: { x: mark.x, y: mark.y },
          });
          const minDist = minDefenderDistAtSeed(world, {
            mark,
            defensiveLine: 'blitz',
            carrierSlot: 1,
          });
          if (minDist < clearDist) {
            return `blitz line seeded defender ${minDist.toFixed(3)}u from carrier at mark (${mark.x},${mark.y}) — within clear zone ${clearDist.toFixed(1)}u (seed=0x${seed.toString(16)})`;
          }
        }
      }
      return null;
    },
  },

  // ── Backfield selection: back three by slot, not depth ───────────────────
  // Guards the fix for the bug where solveDefence picked the two deepest
  // agents (slots 1 & 2, the props) instead of the back three (slots 15/14/11).
  // Builds a 15-agent away side with all slots in their natural positions; the
  // backfield result must always be drawn from {11, 14, 15}, never from the
  // front row. Tests p.backfield=1 (fullback only) and p.backfield=2 (fullback
  // + one wing) across the same seed set, at several marks.
  {
    name: 'backfield selection: back three by slot, not deepest-by-position',
    run: () => {
      const BACK_THREE = new Set([11, 14, 15]);
      // Build a 15-agent side: all agents at the same x (so depth sort would
      // return whoever happens to be last, NOT the back three by slot).
      // Away agents: index i → slot i+1. Place them all at x=60 (flat line)
      // so slot is the only differentiator.
      const awaySetup: AgentSetup[] = [];
      for (let i = 0; i < 15; i++) {
        awaySetup.push({ x: 60, y: 10 + i * 5, pace: 70, agility: 60, tackling: 60, stamina: 70, positioning: 60, discipline: 60, target: null });
      }
      const marks = [{ x: 50, y: 50 }, { x: 35, y: 30 }, { x: 65, y: 70 }];
      for (const seed of SEEDS) {
        setMatchSeed(seed);
        for (const mark of marks) {
          for (const backfieldCount of [1, 2] as const) {
            const world = buildScenarioWorld({
              home: [{ x: mark.x, y: mark.y, pace: 75, agility: 70, target: null }],
              away: awaySetup,
              ball: { x: mark.x, y: mark.y },
            });
            const p: ShapeParams = {
              attackSide: 'home',
              defendSide: 'away',
              attackDir: 1,
              mark,
              defensiveLine: 'hybrid',
              backfield: backfieldCount,
              defendDiscipline: 'balanced', attackingStyle: 'balanced',
              carrierSlot: 1,
            };
            const roles = solveDefence(world, p);
            const backfieldRoles = roles.filter(r => r.isBackfield);
            if (backfieldRoles.length !== backfieldCount) {
              return `backfield=${backfieldCount}: got ${backfieldRoles.length} backfield roles (mark=${mark.x},${mark.y}, seed=0x${seed.toString(16)})`;
            }
            for (const r of backfieldRoles) {
              if (!BACK_THREE.has(r.agent.slot)) {
                return `backfield=${backfieldCount}: slot ${r.agent.slot} in backfield (want 11/14/15, mark=${mark.x},${mark.y}, seed=0x${seed.toString(16)})`;
              }
            }
            // backfield=1 must be slot 15 (fullback)
            if (backfieldCount === 1 && backfieldRoles[0].agent.slot !== 15) {
              return `backfield=1: slot ${backfieldRoles[0].agent.slot} chosen (want 15 fullback, mark=${mark.x},${mark.y}, seed=0x${seed.toString(16)})`;
            }
          }
        }
      }
      return null;
    },
  },

  {
    name: 'WP3 contact-timing: launch grace — no instant tackle in first grace period',
    run: () => {
      // Run carries with a tight formation (blitz, defender close-seeded) over
      // multiple seeds and marks. Assert that when contact fires, the carrier has
      // always run at least LAUNCH_GRACE_TICKS ticks AND LAUNCH_GRACE_DIST units
      // before the tackle. A 1-tick contact (the diagnosed bug) must never appear.
      const marks = [
        { x: 50, y: 50 }, { x: 35, y: 50 }, { x: 65, y: 50 },
      ];
      for (const seed of SEEDS) {
        setMatchSeed(seed);
        for (const mark of marks) {
          const world = buildScenarioWorld({
            home: [{ x: mark.x, y: mark.y, pace: 78, agility: 72, strength: 65, handling: 60, stamina: 78, positioning: 65, tackling: 60, discipline: 65, target: null }],
            away: (() => {
              const line: AgentSetup[] = [];
              for (let i = 0; i < 15; i++) {
                line.push({ x: mark.x + 3, y: mark.y - 35 + i * 5, pace: 75, agility: 62, tackling: 68, positioning: 68, stamina: 82, discipline: 65, strength: 68, target: null });
              }
              return line;
            })(),
            ball: { x: mark.x, y: mark.y },
          });
          const { contactTick, contactDist } = runCarryWithLaunchGrace(world, {
            mark,
            defensiveLine: 'blitz',
            carrierSlot: 1,
          });
          if (contactTick !== null && contactTick < LAUNCH_GRACE_TICKS) {
            return `contact fired at tick ${contactTick} < grace ${LAUNCH_GRACE_TICKS} (mark=(${mark.x},${mark.y}), seed=0x${seed.toString(16)})`;
          }
          if (contactDist !== null && contactDist < LAUNCH_GRACE_DIST) {
            return `contact fired after only ${contactDist.toFixed(3)}u < grace dist ${LAUNCH_GRACE_DIST} (mark=(${mark.x},${mark.y}), seed=0x${seed.toString(16)})`;
          }
        }
      }
      return null;
    },
  },

  // ── WP4: breakdown commitment + World continuity ─────────────────────────
  {
    name: 'WP4: isolation jackal — isolated carrier draws fewer cleaners + a jackal vs a supported carrier',
    run: () => {
      // Both worlds: carrier at the mark with a high-breakdown defender adjacent
      // (the jackal threat). SUPPORTED — support on the carrier's shoulder (~1.5u);
      // ISOLATED — nearest support 12u back. commitRuck measures REAL isolation,
      // so the isolated carrier should read high isolation, still field a jackal,
      // and commit no MORE attacking cleaners than the supported case (the genesis
      // of the breakdown turnover the unchanged resolver then converts).
      const mark = { x: 50, y: 50 };
      const jackalDef = (): AgentSetup[] => {
        const away: AgentSetup[] = [{ x: 51.5, y: 50, breakdown: 90, target: null }]; // slot1 jackal
        for (let i = 1; i < 6; i++) away.push({ x: 53, y: 46 + i, breakdown: 55, target: null });
        return away;
      };
      setMatchSeed(0x5A7A1);
      const supported = commitRuck(
        buildScenarioWorld({
          home: [
            { x: 50, y: 50, breakdown: 60, target: null },        // carrier
            { x: 48.5, y: 50, breakdown: 70, target: null },      // support on the shoulder
            { x: 48, y: 52, breakdown: 65, target: null },
            { x: 48, y: 48, breakdown: 65, target: null },
          ],
          away: jackalDef(),
          ball: mark,
        }),
        { attackSide: 'home', defendSide: 'away', attackDir: 1, mark, carrierSlot: 1, attackCap: 3, defendPlan: 'jackal' },
      );
      setMatchSeed(0x5A7A1);
      const isolated = commitRuck(
        buildScenarioWorld({
          home: [
            { x: 50, y: 50, breakdown: 60, target: null },        // carrier
            { x: 38, y: 50, breakdown: 70, target: null },        // support 12u back
            { x: 37, y: 52, breakdown: 65, target: null },
            { x: 37, y: 48, breakdown: 65, target: null },
          ],
          away: jackalDef(),
          ball: mark,
        }),
        { attackSide: 'home', defendSide: 'away', attackDir: 1, mark, carrierSlot: 1, attackCap: 3, defendPlan: 'jackal' },
      );
      if (!(isolated.carrierIsolation > supported.carrierIsolation + 5)) {
        return `isolated carrier not measured as more isolated (iso=${isolated.carrierIsolation.toFixed(1)} vs supported ${supported.carrierIsolation.toFixed(1)})`;
      }
      if (isolated.jackal === null) return 'isolated carrier fielded no jackal';
      if (isolated.committedAttackers.length > supported.committedAttackers.length) {
        return `isolated carrier committed MORE cleaners (${isolated.committedAttackers.length}) than supported (${supported.committedAttackers.length})`;
      }
      return null;
    },
  },
  {
    name: 'WP4: cap override — a breakdown specialist commits beyond a minimal_ruck cap',
    run: () => {
      // minimal_ruck attacking cap (1 body). With a moderately exposed carrier
      // (iso ≈ 5u → below the isolation-drop threshold), a high-breakdown
      // specialist among the support clears the override bar and commits a SECOND
      // body; swap that specialist for a low-breakdown forward and the override
      // does not fire (only the cap's single body commits).
      const mark = { x: 50, y: 50 };
      const away = (): AgentSetup[] => [{ x: 51.5, y: 50, breakdown: 60, target: null }];
      const homeWith = (specBreakdown: number): AgentSetup[] => [
        { x: 50, y: 50, breakdown: 55, target: null },               // carrier
        { x: 45, y: 50, breakdown: specBreakdown, target: null },    // support 5u back (iso≈0.5)
        { x: 45, y: 53, breakdown: 45, target: null },
        { x: 45, y: 47, breakdown: 45, target: null },
      ];
      const input = { attackSide: 'home' as const, defendSide: 'away' as const, attackDir: 1 as const, mark, carrierSlot: 1, attackCap: 1, defendPlan: 'jackal' as const };
      setMatchSeed(0xBEEF1);
      const withSpecialist = commitRuck(buildScenarioWorld({ home: homeWith(92), away: away(), ball: mark }), input);
      setMatchSeed(0xBEEF1);
      const withoutSpecialist = commitRuck(buildScenarioWorld({ home: homeWith(30), away: away(), ball: mark }), input);
      if (!(withSpecialist.committedAttackers.length > withoutSpecialist.committedAttackers.length)) {
        return `override did not fire: specialist committed ${withSpecialist.committedAttackers.length}, journeyman ${withoutSpecialist.committedAttackers.length} (expected specialist > journeyman)`;
      }
      return null;
    },
  },
  {
    name: 'WP4: continuity — a 10-phase same-way sequence has no position teleports across beat seams',
    run: () => {
      // The persistent World: beat 0 seeds the formation; beats 1–9 continue from
      // the resting positions (no reseed). Assert every beat-boundary position jump
      // is ≈ 0 — the programmatic no-teleport gate (Upgrade.md § 3). ε is generous
      // vs float noise but far below any real reseed (which would snap dots metres).
      const EPS = 0.01;
      for (const seed of SEEDS) {
        setMatchSeed(seed);
        const beats = continuitySequence(
          () => buildScenarioWorld({
            home: [{ x: 40, y: 50, pace: 80, agility: 72, target: null }],
            away: bunchedLine(40, false),
            ball: { x: 40, y: 50 },
          }),
          10,
        );
        for (let b = 1; b < beats.length; b++) {
          if (beats[b].boundaryJump > EPS) {
            return `teleport at beat ${b} seam: max jump ${beats[b].boundaryJump.toFixed(3)}u > ε ${EPS} (seed=0x${seed.toString(16)})`;
          }
        }
      }
      return null;
    },
  },
  {
    name: 'WP4: fold fatigue compounds — a gassed defence frays measurably over a 6-phase sequence',
    run: () => {
      // Same scripted 6-beat sequence, fresh vs fatigued defensive line. The
      // persistent World means the fatigued line never resets between phases, so
      // its raggedness (defender-x spread) at the final beat exceeds the fresh
      // line's — the overlap-genesis mechanic, now compounding across phases.
      let freshLast = 0, slowLast = 0;
      for (const seed of SEEDS) {
        setMatchSeed(seed);
        const fresh = continuitySequence(
          () => buildScenarioWorld({
            home: [{ x: 40, y: 50, pace: 80, agility: 72, target: null }],
            away: bunchedLine(40, false),
            ball: { x: 40, y: 50 },
          }),
          6,
        );
        setMatchSeed(seed);
        const slow = continuitySequence(
          () => buildScenarioWorld({
            home: [{ x: 40, y: 50, pace: 80, agility: 72, target: null }],
            away: bunchedLine(40, true),
            ball: { x: 40, y: 50 },
          }),
          6,
        );
        freshLast += fresh[fresh.length - 1].lineSpread;
        slowLast += slow[slow.length - 1].lineSpread;
      }
      if (!(slowLast > freshLast)) {
        return `fatigued line did not fray more than fresh over the sequence (slow spread ${(slowLast / SEEDS.length).toFixed(2)} ≤ fresh ${(freshLast / SEEDS.length).toFixed(2)})`;
      }
      return null;
    },
  },
  {
    name: 'WP5: onside discipline — the attack holds its shape BEHIND the carrier across a sequence',
    run: () => {
      // A full 15-man attack runs a 6-phase same-way sequence. Each beat the carrier
      // engages from the ruck and runs forward; the support pod trails him and the
      // off-ball shape re-anchors behind the gain line. Assert the attack stays
      // ONSIDE. The correct engine keeps EVERY teammate behind the carrier here
      // (measured attackAhead = 0 across all seeds/beats), so the cap is tight at 1
      // — leaving one runner of slack for a momentarily-level support man while
      // still tripping on any real "shape drifts ahead of the ball" regression.
      const MAX_AHEAD = 1;
      // Loose opening attack: forwards near the ruck, backs deeper. seedFormation
      // re-places them into the solved shape on beat 0; later beats continue.
      const fullAttack = (): AgentSetup[] => {
        const out: AgentSetup[] = [];
        for (let i = 0; i < 15; i++) {
          const isFwd = i < 8;
          out.push({
            x: 40 - (isFwd ? 3 : 8) - i * 0.4,
            y: 50 + (i - 7) * 2,
            pace: 75, agility: 70, stamina: 80, positioning: 70,
            breakdown: isFwd ? 70 : 40, target: null,
          });
        }
        return out;
      };
      for (const seed of SEEDS) {
        setMatchSeed(seed);
        const beats = continuitySequence(
          () => buildScenarioWorld({ home: fullAttack(), away: bunchedLine(40, false), ball: { x: 40, y: 50 } }),
          6,
          { carrierSlot: 8 },  // a forward hits up from the base of the ruck
        );
        for (let b = 0; b < beats.length; b++) {
          if (beats[b].attackAhead > MAX_AHEAD) {
            return `attack offside at beat ${b}: ${beats[b].attackAhead} teammates ahead of the carrier (max ${MAX_AHEAD}) seed=0x${seed.toString(16)}`;
          }
        }
      }
      return null;
    },
  },
  {
    name: 'WP5: defensive line spreads to the open side at a wide ruck (clamped slots redistribute, not pack the touchline)',
    run: () => {
      // Ruck near the left touchline (y=10). Slots that would clamp against the
      // near touchline redistribute to the OPEN field (capped), so the line reaches
      // materially further open than blindside — vs the old symmetric line that
      // packed defenders against y=3 and left the open side bare.
      setMatchSeed(0x5A7A1);
      const markY = 10;
      const world = buildScenarioWorld({
        home: [{ x: 50, y: markY, target: null }],
        away: Array.from({ length: 15 }, (_, i) => ({ x: 53, y: 5 + i * 4, tackling: 60, positioning: 70, stamina: 80, target: null })),
        ball: { x: 50, y: markY },
      });
      const roles = solveDefence(world, {
        attackSide: 'home', defendSide: 'away', attackDir: 1, mark: { x: 50, y: markY },
        defensiveLine: 'hybrid', backfield: 2, defendDiscipline: 'balanced', attackingStyle: 'balanced', carrierSlot: 1,
      });
      const lineYs = roles.filter(r => !r.isBackfield && r.agent.intent.target).map(r => r.agent.intent.target!.y);
      const openReach = Math.max(...lineYs) - markY;
      const blindReach = markY - Math.min(...lineYs);
      if (!(openReach > blindReach + 10)) {
        return `line not biased to the open side at a wide ruck: openReach ${openReach.toFixed(0)} vs blindReach ${blindReach.toFixed(0)}`;
      }
      return null;
    },
  },
  {
    name: 'shape-realism: defensive line has a DENSITY GRADIENT — tight at the ruck, wider toward the edge',
    run: () => {
      // Central ruck so the line spreads both ways with no touchline clamping. The
      // slot gaps must GROW from the ruck outward (guards/tight forwards packed,
      // backs spread) — not be uniform.
      setMatchSeed(0x5A7A1);
      const world = buildScenarioWorld({
        home: [{ x: 50, y: 50, target: null }],
        away: Array.from({ length: 15 }, (_, i) => ({ x: 53, y: 8 + i * 6, tackling: 60, positioning: 70, stamina: 80, target: null })),
        ball: { x: 50, y: 50 },
      });
      const roles = solveDefence(world, {
        attackSide: 'home', defendSide: 'away', attackDir: 1, mark: { x: 50, y: 50 },
        defensiveLine: 'hybrid', backfield: 2, defendDiscipline: 'balanced', attackingStyle: 'balanced', carrierSlot: 1,
      });
      // Slot ys on one side of the ruck, sorted outward; the gaps must increase.
      const slotYs = roles.filter(r => !r.isBackfield).map(r => r.slotY).sort((a, b) => a - b);
      const aboveMid = slotYs.filter(y => y >= 50);
      if (aboveMid.length < 3) return `not enough open-side slots to measure a gradient (${aboveMid.length})`;
      const innerGap = aboveMid[1] - aboveMid[0];
      const outerGap = aboveMid[aboveMid.length - 1] - aboveMid[aboveMid.length - 2];
      if (!(outerGap > innerGap + 1.5)) {
        return `no density gradient: inner slot gap ${innerGap.toFixed(1)} ≈ outer slot gap ${outerGap.toFixed(1)} (expected outer materially wider)`;
      }
      return null;
    },
  },
  {
    name: 'shape-realism: backfield is PITCH-CENTRED — the back two split the field even at a near-touchline ruck',
    run: () => {
      // Ruck on the left touchline (y=10). The two deep defenders must straddle the
      // y=50 midline (cover both halves) rather than bunching near the ruck's
      // touchline — the old ruck-centred backfield left the far side open.
      setMatchSeed(0x5A7A1);
      const markY = 10;
      const world = buildScenarioWorld({
        home: [{ x: 50, y: markY, target: null }],
        away: Array.from({ length: 15 }, (_, i) => ({ x: 53, y: 5 + i * 4, tackling: 60, positioning: 70, stamina: 80, target: null })),
        ball: { x: 50, y: markY },
      });
      const roles = solveDefence(world, {
        attackSide: 'home', defendSide: 'away', attackDir: 1, mark: { x: 50, y: markY },
        defensiveLine: 'hybrid', backfield: 2, defendDiscipline: 'balanced', attackingStyle: 'balanced', carrierSlot: 1,
      });
      const bfYs = roles.filter(r => r.isBackfield).map(r => r.agent.intent.target!.y).sort((a, b) => a - b);
      if (bfYs.length !== 2) return `expected 2 backfielders, got ${bfYs.length}`;
      if (!(bfYs[0] < 50 && bfYs[1] > 50)) {
        return `backfield not pitch-split: both on one side (${bfYs[0].toFixed(0)}, ${bfYs[1].toFixed(0)})`;
      }
      // And not bunched on the ruck's near touchline — the lower one is well off y=10.
      if (!(bfYs[0] > 25)) {
        return `backfield still ruck-bunched near the touchline: nearest at y=${bfYs[0].toFixed(0)}`;
      }
      return null;
    },
  },
  {
    name: 'WP5: attacking style spreads the forward pods — wide_wide flings them wider than keep_it_tight',
    run: () => {
      // Same 15-man attack solved under two styles; the off-ball forward pods must
      // spread materially wider on wide_wide than keep_it_tight (the tactic reads
      // in the shape). Measures the lateral span of the off-ball forwards' targets.
      const fwdSpan = (style: 'keep_it_tight' | 'wide_wide'): number => {
        const w = buildScenarioWorld({ home: Array.from({ length: 15 }, () => ({ x: 40, y: 50, target: null })), away: [], ball: { x: 40, y: 50 } });
        const p = { attackSide: 'home' as const, defendSide: 'away' as const, attackDir: 1 as const, mark: { x: 40, y: 50 }, defensiveLine: 'hybrid' as const, backfield: 2 as const, defendDiscipline: 'balanced' as const, carrierSlot: 8, attackingStyle: style };
        solveCarryCorridor(w, p); solveAttackSpread(w, p);
        const ys = w.agents.slice(0, 8).filter(a => a.role !== 'corridor' && a.intent.target).map(a => a.intent.target!.y);
        return ys.length ? Math.max(...ys) - Math.min(...ys) : 0;
      };
      const tight = fwdSpan('keep_it_tight');
      const wide = fwdSpan('wide_wide');
      if (!(wide > tight + 4)) return `style did not spread pods: wide_wide span ${wide.toFixed(0)} vs keep_it_tight ${tight.toFixed(0)} (want ≥4u wider)`;
      return null;
    },
  },
  {
    name: 'WP5: pass mechanics — a back receives OUT WIDE, a forward engages from the ruck',
    run: () => {
      // solveCarryCorridor positions the carrier at his receiving point: a back well
      // off the mark laterally (he gets the ball out wide), a forward on the mark.
      const carrierY = (slot: number): { x: number; y: number } => {
        const w = buildScenarioWorld({ home: Array.from({ length: 15 }, () => ({ x: 40, y: 50, target: null })), away: [], ball: { x: 40, y: 50 } });
        const p = { attackSide: 'home' as const, defendSide: 'away' as const, attackDir: 1 as const, mark: { x: 40, y: 50 }, defensiveLine: 'hybrid' as const, backfield: 2 as const, defendDiscipline: 'balanced' as const, carrierSlot: slot, attackingStyle: 'balanced' as const };
        const c = solveCarryCorridor(w, p);
        return { x: c.pos.x, y: c.pos.y };
      };
      const back = carrierY(13);   // a centre
      const fwd = carrierY(8);     // a back-row forward
      if (isForwardSlot(13) || !isForwardSlot(8)) return 'slot assumptions wrong (13 should be a back, 8 a forward)';
      if (Math.abs(back.y - 50) < 10) return `back carrier not out wide: received at y=${back.y.toFixed(0)} (mark y=50)`;
      if (Math.abs(fwd.y - 50) > 2 || Math.abs(fwd.x - 40) > 2) return `forward carrier not at the ruck: received at (${fwd.x.toFixed(0)},${fwd.y.toFixed(0)}) (mark 40,50)`;
      return null;
    },
  },

  // ── WP6 play-overlay scenarios ──────────────────────────────────────────
  // Build a world that seeds the SWITCH play's two roles at their first waypoint
  // (mirrored by playPointToPitch) with the defence parked far away, so the bound
  // agents run their authored lines in isolation — the mirror is then a pure
  // property of the run-line transform + steering, with no separation/abort noise.
  {
    name: 'WP6: play overlay mirrors left↔right (open side flips, trajectories mirror about the mark)',
    run: () => {
      const play = playById('switch')!;
      const build = (markY: number, dir: 1 | -1) => {
        const openSign = openSignFor(markY);
        const home: AgentSetup[] = Array.from({ length: 15 }, () => ({ x: 2, y: 3, target: null }));
        for (const role of Object.values(play.roles)) {
          const wp = role.line[0];
          const pt = playPointToPitch({ x: 50, y: markY }, dir, openSign, wp.fwd, wp.lat);
          home[role.slot - 1] = { x: pt.x, y: pt.y, pace: 80, agility: 80 };
        }
        const away: AgentSetup[] = Array.from({ length: 15 }, () => ({ x: 2, y: 3, target: null }));
        return buildScenarioWorld({ home, away, ball: { x: 50, y: markY } });
      };
      const A = runOverlayScenario(build(25, 1), play, { mark: { x: 50, y: 25 }, attackDir: 1, carrierSlot: 12 }, play.lifetimeTicks, false);
      const B = runOverlayScenario(build(75, 1), play, { mark: { x: 50, y: 75 }, attackDir: 1, carrierSlot: 12 }, play.lifetimeTicks, false);
      for (const name of Object.keys(A.traj)) {
        const ta = A.traj[name], tb = B.traj[name];
        for (let i = 0; i < ta.length; i++) {
          // lat about the mark: (yA−25) must equal −(yB−75); long axis identical.
          if (Math.abs((ta[i].y - 25) + (tb[i].y - 75)) > 0.05) return `lateral mirror broke for ${name} at tick ${i}: ${ta[i].y.toFixed(2)} vs ${tb[i].y.toFixed(2)}`;
          if (Math.abs(ta[i].x - tb[i].x) > 0.05) return `long-axis mirror broke for ${name} at tick ${i}: ${ta[i].x.toFixed(2)} vs ${tb[i].x.toFixed(2)}`;
        }
      }
      return null;
    },
  },
  {
    name: 'WP6: play overlay mirrors first↔second half (attackDir flips, trajectories mirror about the mark)',
    run: () => {
      const play = playById('switch')!;
      const build = (dir: 1 | -1) => {
        const openSign = openSignFor(25);
        const home: AgentSetup[] = Array.from({ length: 15 }, () => ({ x: 2, y: 3, target: null }));
        for (const role of Object.values(play.roles)) {
          const wp = role.line[0];
          const pt = playPointToPitch({ x: 50, y: 25 }, dir, openSign, wp.fwd, wp.lat);
          home[role.slot - 1] = { x: pt.x, y: pt.y, pace: 80, agility: 80 };
        }
        const away: AgentSetup[] = Array.from({ length: 15 }, () => ({ x: 2, y: 3, target: null }));
        return buildScenarioWorld({ home, away, ball: { x: 50, y: 25 } });
      };
      const A = runOverlayScenario(build(1), play, { mark: { x: 50, y: 25 }, attackDir: 1, carrierSlot: 12 }, play.lifetimeTicks, false);
      const C = runOverlayScenario(build(-1), play, { mark: { x: 50, y: 25 }, attackDir: -1, carrierSlot: 12 }, play.lifetimeTicks, false);
      for (const name of Object.keys(A.traj)) {
        const ta = A.traj[name], tc = C.traj[name];
        for (let i = 0; i < ta.length; i++) {
          // long axis about the mark: (xA−50) must equal −(xC−50); lat identical.
          if (Math.abs((ta[i].x - 50) + (tc[i].x - 50)) > 0.05) return `long-axis mirror broke for ${name} at tick ${i}: ${ta[i].x.toFixed(2)} vs ${tc[i].x.toFixed(2)}`;
          if (Math.abs(ta[i].y - tc[i].y) > 0.05) return `lateral mirror broke for ${name} at tick ${i}: ${ta[i].y.toFixed(2)} vs ${tc[i].y.toFixed(2)}`;
        }
      }
      return null;
    },
  },
  {
    name: 'WP6: play overlay aborts when the strike receiver is covered, reverting with no position discontinuity',
    run: () => {
      const play = playById('switch')!;
      const openSign = openSignFor(25);
      const home: AgentSetup[] = Array.from({ length: 15 }, () => ({ x: 2, y: 3, target: null }));
      let strikeStart = { x: 50, y: 25 };
      for (const role of Object.values(play.roles)) {
        const wp = role.line[0];
        const pt = playPointToPitch({ x: 50, y: 25 }, 1, openSign, wp.fwd, wp.lat);
        home[role.slot - 1] = { x: pt.x, y: pt.y, pace: 80, agility: 80 };
        if (role.slot === 12) strikeStart = pt;   // the strike runner (carrier) start
      }
      // A defender sitting ON the strike runner's receiving point → receiver_covered.
      const away: AgentSetup[] = Array.from({ length: 15 }, () => ({ x: 2, y: 3, target: null }));
      away[5] = { x: strikeStart.x, y: strikeStart.y, pace: 70, tackling: 70 };
      const world = buildScenarioWorld({ home, away, ball: { x: 50, y: 25 } });
      const r = runOverlayScenario(world, play, { mark: { x: 50, y: 25 }, attackDir: 1, carrierSlot: 12 }, play.lifetimeTicks, false);
      if (!r.aborted) return 'play did not abort despite a defender on the strike receiver';
      if (r.abortTick < 0 || r.abortTick > 5) return `abort fired too late: tick ${r.abortTick}`;
      // No teleport: every bound agent moved continuously (steering-bounded), even
      // across the abort tick where the carrier's target snaps to a forward run.
      if (r.maxStep > 3.0) return `position discontinuity at abort: maxStep ${r.maxStep.toFixed(2)} units/tick`;
      return null;
    },
  },
];

let failed = 0;
for (const s of scenarios) {
  const err = s.run();
  if (err) {
    console.error(`✗ ${s.name}: ${err}`);
    failed++;
  } else {
    console.log(`OK: ${s.name}`);
  }
}

if (failed > 0) {
  console.error(`SPATIAL SCENARIO FAILURE — ${failed} of ${scenarios.length} scenarios failed`);
  process.exit(1);
}
console.log(`OK: all ${scenarios.length} spatial scenarios pass`);
