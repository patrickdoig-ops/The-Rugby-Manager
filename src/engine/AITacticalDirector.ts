// In-match AI tactical adaptation. A pure, RNG-free producer for the existing
// TACTICS_UPDATED mutation seam. Called once per tick from MatchCoordinator,
// before resolvePhase() — so the new tactics take effect on the very tick
// that meets the trigger condition.
//
// Selection logic is deliberately small: three named bundles per side
// (BASELINE = the team's authored suggestedTactics, CHASING = trailing late,
// PROTECTING = leading late). The director never touches the human side's
// tactics (those are owned by the player via the in-match modal).
//
// Determinism: no RNG, no time-of-day reads, no side effects beyond the
// applyMatchEvent boundary. The same MatchState produces the same emitted
// TACTICS_UPDATED queue every tick.

import type { MatchState } from '../types/match';
import type { TeamTactics, TeamSide } from '../types/team';
import { applyMatchEvent } from './applyMatchEvent';
import { AI_DIRECTOR_VALUES, AI_INTENT_CHASING, AI_INTENT_PROTECTING, CLOCK_VALUES } from './balance';

function tacticsEqual(a: TeamTactics, b: TeamTactics): boolean {
  return a.attackingGamePlan === b.attackingGamePlan
    && a.attackingStyle === b.attackingStyle
    && a.attackingBreakdown === b.attackingBreakdown
    && a.defendingBreakdown === b.defendingBreakdown
    && a.backfieldDefence === b.backfieldDefence;
}

export class AITacticalDirector {
  private state: MatchState;
  // Each side's baseline tactics — the suggestedTactics resolved at match
  // init. BASELINE intent reverts to this rather than DEFAULT_TACTICS so a
  // CHASING-then-baseline cycle preserves club identity (e.g. Sale's wide
  // style, Saracens' jackal defence).
  private baseline: { home: TeamTactics; away: TeamTactics };
  // 'home' or 'away' — the side the human player controls. The director
  // never proposes tactics for this side; the human owns it via the modal.
  // If undefined (e.g. fully-headless fixtures), both sides adapt.
  private humanSide: TeamSide | undefined;

  constructor(state: MatchState, humanSide: TeamSide | undefined) {
    this.state = state;
    this.humanSide = humanSide;
    this.baseline = {
      home: { ...state.homeTeam.tactics },
      away: { ...state.awayTeam.tactics },
    };
  }

  evaluate(): void {
    for (const side of ['home', 'away'] as const) {
      if (side === this.humanSide) continue;
      const desired = this.pickIntent(side);
      const team = side === 'home' ? this.state.homeTeam : this.state.awayTeam;
      if (!tacticsEqual(team.tactics, desired)) {
        applyMatchEvent(this.state, { type: 'TACTICS_UPDATED', side, tactics: desired });
      }
    }
  }

  private pickIntent(side: TeamSide): TeamTactics {
    const minutesRemaining = CLOCK_VALUES.fullTimeMinute - this.state.clock.gameMinute;
    if (minutesRemaining > AI_DIRECTOR_VALUES.minutesRemainingTrigger) {
      return this.baseline[side];
    }
    const myScore  = this.state.score[side];
    const oppScore = side === 'home' ? this.state.score.away : this.state.score.home;
    const gap = myScore - oppScore;
    if (gap <= -AI_DIRECTOR_VALUES.scoreGapTrigger) return AI_INTENT_CHASING;
    if (gap >=  AI_DIRECTOR_VALUES.scoreGapTrigger) return AI_INTENT_PROTECTING;
    return this.baseline[side];
  }
}
