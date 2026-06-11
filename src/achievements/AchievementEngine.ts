// Achievement orchestrator. Subscribes once to the season-scope game:* events,
// evaluates the catalog against live GameState, and unlocks idempotently —
// each genuine first unlock pops a toast and reports to Game Centre.
//
// Initialised once per page lifetime (alongside the other in-season screens in
// main.ts), with a `() => GameState` getter so it always reads the live engine
// even after a New Game swaps the GameCoordinator reference. The bus
// subscriptions are permanent, matching the existing in-season screen contract.

import { eventBus } from '../utils/eventBus';
import { showToast } from '../ui/Toast';
import { ACHIEVEMENTS, type AchievementCtx } from './achievementDefs';
import { loadUnlocked, markUnlocked } from './achievementStore';
import { getGameCenter } from './GameCenterBridge';
import type { GameState, FixtureResult } from '../types/gameState';

export function initAchievementEngine(getState: () => GameState): void {
  const gameCenter = getGameCenter();

  // Evaluate every not-yet-unlocked def against the supplied context. The
  // unlocked set guards re-firing, so this is safe to call on every event.
  function evaluate(state: GameState, result?: FixtureResult): void {
    const unlocked = loadUnlocked();
    const ctx: AchievementCtx = { state, playerTeamId: state.player.teamId, result };
    for (const def of ACHIEVEMENTS) {
      if (def.id in unlocked) continue;
      let hit = false;
      try {
        hit = def.check(ctx);
      } catch (err) {
        console.error(`achievement "${def.id}" check threw`, err);
        continue;
      }
      if (!hit) continue;
      if (markUnlocked(def.id)) {
        showToast(`🏆 ${def.title}`, 'success');
        void gameCenter.reportAchievement(def.gcId, 100);
      }
    }
  }

  // game:fixtureRecorded carries the just-recorded result; pass it through so
  // match-category predicates can read the scoreline. Every other game:* event
  // is a pure state-derived re-scan.
  eventBus.on('game:fixtureRecorded', ({ state, result }) => evaluate(state, result));
  eventBus.on('game:weekAdvanced',    ({ state }) => evaluate(state));
  eventBus.on('game:bracketSeeded',   ({ state }) => evaluate(state));
  eventBus.on('game:playoffsUpdated', ({ state }) => evaluate(state));
  eventBus.on('game:seasonComplete',  ({ state }) => evaluate(state));
  eventBus.on('game:trainingApplied', ({ state }) => evaluate(state));
  // On game load / new game, re-scan so a resumed save backfills any state-
  // derived achievement the player already earned (e.g. titles in the archive).
  eventBus.on('game:initialized',     ({ state }) => evaluate(state));
}
