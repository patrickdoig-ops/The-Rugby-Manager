// Frame-stream dump for the Phase Animator's frame debugger (Upgrade.md § 9).
//
// Runs the dark-mode SpatialSimulator over an authored scenario WITH frame
// capture and decision annotations enabled (the dev-only world.recordAnnotations
// flag — never set in production or silent paths), and writes the captured frame
// stream to harness/frames.json for the debugger to load.
//
// Invoked by `npm run probe -- --frames`. Standalone from the browser probe
// because the spatial substrate runs dark (not yet wired into the live match),
// so there is nothing for the headless PitchView to capture — the frames come
// straight from the simulator.

import { mkdirSync, writeFileSync } from 'node:fs';
import { setMatchSeed } from '../src/utils/rng.js';
import { run } from '../src/engine/spatial/SpatialSimulator.js';
import { buildScenarioWorld } from './spatialScenarioKit.js';

setMatchSeed(0xDEADBEEF);

// A demonstrative scenario: two home backs running crossing lines onto targets,
// two away defenders folding across, the rest holding — enough motion to show
// steering, the accel cap, and soft separation in the debugger.
const world = buildScenarioWorld({
  home: [
    { x: 35, y: 30, pace: 15, agility: 14, target: { x: 70, y: 55 } },
    { x: 35, y: 70, pace: 13, agility: 16, target: { x: 72, y: 45 } },
    { x: 40, y: 50, pace: 10, agility: 12, target: { x: 60, y: 50 } },
  ],
  away: [
    { x: 65, y: 45, pace: 14, agility: 13, target: { x: 45, y: 40 } },
    { x: 65, y: 55, pace: 12, agility: 12, target: { x: 45, y: 60 } },
  ],
  ball: { x: 40, y: 50 },
});

// Dev-flag capture: record per-tick decision annotations for the debugger.
world.recordAnnotations = true;

const TICKS = 80;
const { frames } = run(world, TICKS, /* silent */ false);

mkdirSync('harness', { recursive: true });
const out = {
  generatedBy: 'dumpSpatialFrames',
  seed: '0xDEADBEEF',
  ticks: frames.length,
  frameStreams: [{ label: 'spatial-scenario', frames }],
};
writeFileSync('harness/frames.json', JSON.stringify(out));
console.log(`wrote harness/frames.json — ${frames.length} frames, annotations=${frames.filter(f => f.annotations).length}`);
