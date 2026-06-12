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
  dist,
} from './spatialScenarioKit.js';

setMatchSeed(0x5A7A1);

interface Scenario {
  name: string;
  run: () => string | null; // null = pass, string = failure reason
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
