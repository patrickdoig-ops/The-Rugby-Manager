// Determinism golden-master harness.
//
// Runs a fixed (seed, home, away) match through MatchCoordinator twice and
// asserts the two state.events[] arrays produce identical SHA-256 hashes.
// Exit 0 = deterministic. Exit 1 = RNG-order regression — investigate before
// committing.
//
// Drives an unmodified MatchCoordinator: subscribes to engine:paused and
// auto-resolves the kickoff-strategy and penalty-choice modals with fixed
// defaults, then waits for engine:finished. No engine changes required.

import { createHash } from 'node:crypto';
import { MatchCoordinator } from '../src/engine/MatchCoordinator.js';
import type { RawTeamInput } from '../src/types/teamData.js';
import { eventBus } from '../src/utils/eventBus.js';
import bathRaw from '../src/data/team-bath.json' with { type: 'json' };
import saracensRaw from '../src/data/team-saracens.json' with { type: 'json' };

const SEED = 0xDEADBEEF;
const HOME = bathRaw as unknown as RawTeamInput;
const AWAY = saracensRaw as unknown as RawTeamInput;

function runOnce(seed: number): Promise<string> {
  return new Promise(resolve => {
    const engine = new MatchCoordinator(HOME, AWAY, { tickDelayMs: 0, seed });

    const offPaused = eventBus.on('engine:paused', ({ payload }) => {
      if (payload.type === 'kickoff_choice') payload.onChoice('high_ball');
      else if (payload.type === 'penalty_choice') payload.onChoice('kick_for_goal');
    });

    const offFinished = eventBus.on('engine:finished', () => {
      offPaused();
      offFinished();
      const events = engine.getState().events;
      const hash = createHash('sha256').update(JSON.stringify(events)).digest('hex');
      engine.destroy();
      resolve(hash);
    });

    engine.initialize();
    engine.start();
  });
}

const h1 = await runOnce(SEED);
const h2 = await runOnce(SEED);
if (h1 !== h2) {
  console.error(`DETERMINISM BROKEN\n  run1: ${h1}\n  run2: ${h2}`);
  process.exit(1);
}
console.log(`OK: deterministic. seed=0x${SEED.toString(16)} hash=${h1.slice(0, 16)}…`);
