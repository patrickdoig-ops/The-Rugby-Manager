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
  dist,
} from './spatialScenarioKit.js';
import type { AgentSetup } from './spatialScenarioKit.js';

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
      // breaks with high probability. A FRESH, fast fold mostly covers it.
      const slowRate = breakRate(() => buildScenarioWorld({ home: wideAttackers(55), away: bunchedLine(5, true), ball: { x: 50, y: 55 } }), { mark: { x: 50, y: 55 }, carrierSlot: 1 }, 120);
      const fastRate = breakRate(() => buildScenarioWorld({ home: wideAttackers(55), away: bunchedLine(5, false), ball: { x: 50, y: 55 } }), { mark: { x: 50, y: 55 }, carrierSlot: 1 }, 120);
      if (slowRate < 0.7) return `slow fold broke only ${(slowRate * 100).toFixed(0)}% (want ≥70%)`;
      if (fastRate > 0.3) return `fast fold conceded ${(fastRate * 100).toFixed(0)}% breaks (want ≤30%)`;
      if (slowRate - fastRate < 0.4) return `fold-speed gap only ${((slowRate - fastRate) * 100).toFixed(0)}pp (want ≥40pp)`;
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
