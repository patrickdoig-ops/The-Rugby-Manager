// Headless AI fixture runner. Drives a silent MatchCoordinator at zero tick
// delay, waits for engine:finished, returns the final score.
//
// The silent flag on MatchCoordinator suppresses every commentary event and
// stateChange notification, and PenaltyHandler short-circuits modal prompts
// to its determinism-harness defaults (`high_ball` / `kick_for_goal`), so the
// live UI stays inert while a background fixture runs.
//
// Determinism: seed is derived per-fixture via deriveFixtureSeed so the same
// (rootSeed, round, homeId, awayId) always produces the same score.

import { MatchCoordinator } from '../engine/MatchCoordinator';
import type { RawTeamInput } from '../types/teamData';
import { eventBus } from '../utils/eventBus';
import { deriveFixtureSeed } from './derive';

export interface SimulatedFixtureResult {
  homeScore: number;
  awayScore: number;
}

export function simulateFixture(
  home: RawTeamInput,
  away: RawTeamInput,
  rootSeed: number,
  round: number,
): Promise<SimulatedFixtureResult> {
  const seed = deriveFixtureSeed(rootSeed, round, home.id, away.id);
  return new Promise(resolve => {
    const engine = new MatchCoordinator(home, away, {
      tickDelayMs: 0,
      seed,
      silent: true,
    });
    const off = eventBus.on('engine:finished', ({ state }) => {
      off();
      const { home: homeScore, away: awayScore } = state.score;
      engine.destroy();
      resolve({ homeScore, awayScore });
    });
    engine.initialize();
    engine.start();
  });
}
