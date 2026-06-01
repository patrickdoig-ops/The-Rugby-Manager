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
import type { TeamTactics, TeamSide, Intensity, Discipline } from '../types/team';
import { applyMatchEvent } from './applyMatchEvent';
import { AI_DIRECTOR_VALUES, AI_EFFORT_VALUES, AI_INTENT_CHASING, AI_INTENT_PROTECTING, CLOCK_VALUES, HUMAN_RESPONSE_RULES, TACTIC_ORDERS } from './balance';

export type IntentCategory = 'baseline' | 'chasing' | 'protecting';

export interface TacticsChangeSignal {
  side: TeamSide;
  teamName: string;
  category: IntentCategory;
  scoreGap: number;
  minutesLeft: number;
}

function tacticsEqual(a: TeamTactics, b: TeamTactics): boolean {
  return a.attackingGamePlan === b.attackingGamePlan
    && a.attackingStyle === b.attackingStyle
    && a.attackingBreakdown === b.attackingBreakdown
    && a.defendingBreakdown === b.defendingBreakdown
    && a.backfieldDefence === b.backfieldDefence
    && a.defensiveLine === b.defensiveLine
    && a.offloadStrategy === b.offloadStrategy
    && a.intensity === b.intensity
    && a.discipline === b.discipline;
}

// Reads the human side's current tactics and returns a copy of aiBaseline with
// up to one dimension per rule nudged ±1 step. Each dimension is clamped to
// [baselineIndex - 1, baselineIndex + 1] so club identity is always preserved.
// Conflicting rules on the same AI dimension cancel out (sum → 0 → no change).
function computeHumanResponse(humanTactics: TeamTactics, aiBaseline: TeamTactics): TeamTactics {
  const accumulated: Partial<Record<keyof TeamTactics, number>> = {};
  for (const rule of HUMAN_RESPONSE_RULES) {
    if ((humanTactics[rule.humanDimension] as string) === rule.humanValue) {
      accumulated[rule.aiDimension] = (accumulated[rule.aiDimension] ?? 0) + rule.delta;
    }
  }
  const result: TeamTactics = { ...aiBaseline };
  for (const [dimStr, sum] of Object.entries(accumulated) as [keyof TeamTactics, number][]) {
    if (sum === 0) continue;
    const order = TACTIC_ORDERS[dimStr];
    const baseIdx = order.indexOf(aiBaseline[dimStr] as string);
    const newIdx = Math.max(0, Math.min(order.length - 1, baseIdx + Math.sign(sum)));
    (result as unknown as Record<string, string>)[dimStr] = order[newIdx];
  }
  return result;
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
  private prevIntentCategory: { home: IntentCategory; away: IntentCategory };

  constructor(state: MatchState, humanSide: TeamSide | undefined) {
    this.state = state;
    this.humanSide = humanSide;
    this.baseline = {
      home: { ...state.homeTeam.tactics },
      away: { ...state.awayTeam.tactics },
    };
    this.prevIntentCategory = { home: 'baseline', away: 'baseline' };
  }

  evaluate(): TacticsChangeSignal | null {
    let signal: TacticsChangeSignal | null = null;
    for (const side of ['home', 'away'] as const) {
      if (side === this.humanSide) continue;
      const desired = { ...this.pickIntent(side), ...this.pickEffort(side) };
      const team = side === 'home' ? this.state.homeTeam : this.state.awayTeam;
      if (!tacticsEqual(team.tactics, desired)) {
        applyMatchEvent(this.state, { type: 'TACTICS_UPDATED', side, tactics: desired });
      }
      const category = this.getIntentCategory(side);
      if (category !== this.prevIntentCategory[side]) {
        this.prevIntentCategory[side] = category;
        if (signal === null) {
          const myScore  = this.state.score[side];
          const oppScore = side === 'home' ? this.state.score.away : this.state.score.home;
          signal = {
            side,
            teamName: team.name,
            category,
            scoreGap: myScore - oppScore,
            minutesLeft: CLOCK_VALUES.fullTimeMinute - this.state.clock.gameMinute,
          };
        }
      }
    }
    return signal;
  }

  private getIntentCategory(side: TeamSide): IntentCategory {
    const minutesRemaining = CLOCK_VALUES.fullTimeMinute - this.state.clock.gameMinute;
    if (minutesRemaining <= AI_DIRECTOR_VALUES.minutesRemainingTrigger) {
      const myScore  = this.state.score[side];
      const oppScore = side === 'home' ? this.state.score.away : this.state.score.home;
      const gap = myScore - oppScore;
      if (gap <= -AI_DIRECTOR_VALUES.scoreGapTrigger) return 'chasing';
      if (gap >=  AI_DIRECTOR_VALUES.scoreGapTrigger) return 'protecting';
    }
    return 'baseline';
  }

  private pickIntent(side: TeamSide): TeamTactics {
    const minutesRemaining = CLOCK_VALUES.fullTimeMinute - this.state.clock.gameMinute;

    // Late-game score gap: CHASING / PROTECTING fully override everything else.
    if (minutesRemaining <= AI_DIRECTOR_VALUES.minutesRemainingTrigger) {
      const myScore  = this.state.score[side];
      const oppScore = side === 'home' ? this.state.score.away : this.state.score.home;
      const gap = myScore - oppScore;
      if (gap <= -AI_DIRECTOR_VALUES.scoreGapTrigger) return AI_INTENT_CHASING;
      if (gap >=  AI_DIRECTOR_VALUES.scoreGapTrigger) return AI_INTENT_PROTECTING;
    }

    // From minute 20 onwards, nudge up to one step per dimension in response to
    // what the human side is running. Only applies when there is a human side —
    // headless fixtures have no opponent to react to.
    if (this.state.clock.gameMinute >= AI_DIRECTOR_VALUES.humanResponseMinute
        && this.humanSide !== undefined) {
      const humanTeam = this.humanSide === 'home' ? this.state.homeTeam : this.state.awayTeam;
      return computeHumanResponse(humanTeam.tactics, this.baseline[side]);
    }

    return this.baseline[side];
  }

  // Intensity / discipline are decided separately from the 7-dimension intent
  // bundles and merged over them in evaluate(). They track the scoreboard
  // situation rather than club identity: behind late → empty the tank; big
  // lead late → ease off to protect players; derby kick-off → high to set the
  // tone. RNG-free (reads clock, score, isDerby only).
  private pickEffort(side: TeamSide): { intensity: Intensity; discipline: Discipline } {
    const minutesRemaining = CLOCK_VALUES.fullTimeMinute - this.state.clock.gameMinute;
    const myScore  = this.state.score[side];
    const oppScore = side === 'home' ? this.state.score.away : this.state.score.home;
    const gap = myScore - oppScore;

    if (minutesRemaining <= AI_EFFORT_VALUES.lateGameMinutesRemaining) {
      if (gap < 0) return { intensity: 'high', discipline: 'risky' };
      if (gap >= AI_EFFORT_VALUES.largeLeadGap) return { intensity: 'light', discipline: 'cautious' };
    }

    if (this.state.engine.isDerby && this.state.clock.gameMinute < AI_EFFORT_VALUES.derbyEarlyMinute) {
      return { intensity: 'high', discipline: 'balanced' };
    }

    return { intensity: 'balanced', discipline: 'balanced' };
  }
}
