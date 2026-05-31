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
import { HEADLESS_COMMENTARY_BUFFER_CAP } from '../engine/balance';
import type { RawTeamInput } from '../types/teamData';
import { eventBus } from '../utils/eventBus';
import { deriveFixtureSeed } from './derive';
import { snapshotMatch, type MatchSnapshot } from './seasonStatsCollector';

export interface SimulatedFixtureResult {
  homeScore: number;
  awayScore: number;
  // Per-match snapshot taken before MatchCoordinator.destroy(). Carries the
  // per-player breakdown plus team-summary aggregates for both sides.
  // GameCoordinator feeds it to collectSeasonEvents to drive the season-
  // scope mutation events. Player snapshots are empty when both teams'
  // players have rosterId === 0 (non-career test contexts); the team
  // summaries fire regardless.
  snapshot: MatchSnapshot;
}

export function simulateFixture(
  home: RawTeamInput,
  away: RawTeamInput,
  rootSeed: number,
  round: number,
  opts: { neutralVenue?: boolean; homeFillRate?: number } = {},
): Promise<SimulatedFixtureResult> {
  const seed = deriveFixtureSeed(rootSeed, round, home.id, away.id);
  return new Promise((resolve, reject) => {
    const engine = new MatchCoordinator(home, away, {
      tickDelayMs: 0,
      seed,
      silent: true,
      // Nothing reads this fixture's commentary log (snapshotMatch pulls from
      // state.stats), so keep the events buffer tiny to avoid the 300-ref
      // per-event splice churn.
      commentaryBufferCap: HEADLESS_COMMENTARY_BUFFER_CAP,
      ...(opts.neutralVenue ? { neutralVenue: true } : {}),
      ...(opts.homeFillRate !== undefined ? { homeFillRate: opts.homeFillRate } : {}),
    });
    let settled = false;
    const offFinished = eventBus.on('engine:finished', ({ state }) => {
      if (state.engine.seed !== seed || settled) return;
      settled = true;
      offFinished();
      offError();
      const { home: homeScore, away: awayScore } = state.score;
      const snapshot = snapshotMatch(state, home.id, away.id);
      engine.destroy();
      resolve({ homeScore, awayScore, snapshot });
    });
    // A silent-fixture crash rethrows into a detached setTimeout, so the
    // caller's await could never settle. Reject on engine:error instead, so
    // the season flow surfaces a crash overlay rather than a frozen spinner.
    const offError = eventBus.on('engine:error', ({ seed: errSeed, message }) => {
      if (errSeed !== seed || settled) return;
      settled = true;
      offFinished();
      offError();
      engine.destroy();
      reject(new Error(`Silent fixture ${home.id} v ${away.id} crashed: ${message}`));
    });
    engine.initialize();
    engine.start();
  });
}
