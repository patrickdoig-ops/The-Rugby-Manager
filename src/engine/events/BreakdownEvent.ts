import type { Player } from '../../types/player';
import type { PhaseContext, PhaseResult } from './types';
import type { MatchEvent } from '../../types/matchEvent';
import type { NarrationStep } from '../../types/narration';
import { MatchPhase } from '../../types/engine';
import { resolveBreakdown } from '../resolvers/BreakdownResolver';
import { rng } from '../../utils/rng';
import { TACTIC_MODIFIERS, COMMENTARY_CHANCES } from '../balance';
import { inOpposition22, inOwn22, inOwnHalf } from '../FieldPosition';

export function handleBreakdown({ state, attackTeam, defendTeam }: PhaseContext): PhaseResult {
  const attPlan = attackTeam.tactics.attackingBreakdown;
  const defPlan = defendTeam.tactics.defendingBreakdown;

  const lastEvent = state.events[state.events.length - 1];
  const carrierId = lastEvent?.primaryPlayer?.id;
  const attackBonus = lastEvent?.outcome === 'dominant_carry' ? TACTIC_MODIFIERS.dominantCarryBonus : 0;

  // Next-phase modifier: more players committed to ruck = fewer on feet for the next phase
  const nextAttackMod = TACTIC_MODIFIERS.breakdownAttack[attPlan];
  const nextDefendMod = TACTIC_MODIFIERS.breakdownDefend[defPlan];

  const forwardPool = attackTeam.players.filter(p => p.id <= 8 && p.id !== carrierId);
  if (forwardPool.length === 0) forwardPool.push(attackTeam.players[0]);
  const pool = [...forwardPool];

  const count = TACTIC_MODIFIERS.breakdownSupporterCount[attPlan];
  const supporters: Player[] = [];
  while (supporters.length < count && pool.length > 0) {
    supporters.push(...pool.splice(rng(0, pool.length - 1), 1));
  }

  const backRow = defendTeam.players.filter(p => p.id >= 6 && p.id <= 8);
  const jackal  = backRow.length > 0 ? backRow[rng(0, backRow.length - 1)] : defendTeam.players[0];
  const primary = supporters[0];

  const defendPack = defendTeam.players.filter(p => p.id <= 8);
  const res = resolveBreakdown(supporters, jackal, defPlan, defendPack, attackBonus);

  // Set the breakdown mod and credit the ruck hit for every supporter — both happen
  // regardless of outcome.
  const events: MatchEvent[] = [
    { type: 'BREAKDOWN_MOD_SET', attack: nextAttackMod, defend: nextDefendMod },
    { type: 'BREAKDOWN_HIT', players: supporters },
  ];

  if (res.result === 'clean_ball') {
    const steps: NarrationStep[] = [
      { kind: 'phase_outcome', phase: MatchPhase.Breakdown, key: 'clean_ball', primary, secondary: jackal },
    ];
    if (attPlan === 'pick_and_drive') {
      steps.push({ kind: 'tactic_note', cause: 'breakdown_pick_and_drive_clean', chancePct: COMMENTARY_CHANCES.breakdownPickAndDriveClean });
    } else if (defPlan === 'shadow') {
      steps.push({ kind: 'tactic_note', cause: 'breakdown_shadow_clean', chancePct: COMMENTARY_CHANCES.breakdownShadowClean, params: { defendTeamName: defendTeam.name } });
    } else if (defPlan === 'jackal') {
      steps.push({ kind: 'tactic_note', cause: 'breakdown_jackal_clean', chancePct: COMMENTARY_CHANCES.breakdownJackalClean, params: { defendTeamName: defendTeam.name } });
    }
    return {
      nextPhase: MatchPhase.PhasePlay,
      narration: { steps },
      primaryPlayer: primary,
      secondaryPlayer: jackal,
      events,
    };
  }

  if (res.result === 'slow_ball') {
    const plan = attackTeam.tactics.attackingGamePlan;
    let boxKick = false;

    if (plan === 'possession') {
      boxKick = false;
    } else if (plan === 'kicking') {
      boxKick = !inOpposition22(state) && !inOwn22(state);
    } else {
      boxKick = inOwnHalf(state) && !inOwn22(state);
    }

    const steps: NarrationStep[] = [
      { kind: 'phase_outcome', phase: MatchPhase.Breakdown, key: 'slow_ball', primary, secondary: jackal },
    ];
    if (attPlan === 'wide_play') {
      steps.push({ kind: 'tactic_note', cause: 'breakdown_wide_play_slow', chancePct: COMMENTARY_CHANCES.breakdownWidePlaySlow, params: { attackTeamName: attackTeam.name } });
    } else if (defPlan === 'counter_ruck') {
      steps.push({ kind: 'tactic_note', cause: 'breakdown_counter_ruck_slow', chancePct: COMMENTARY_CHANCES.breakdownCounterRuckSlow });
    }
    return {
      nextPhase: boxKick ? MatchPhase.BoxKick : MatchPhase.PhasePlay,
      narration: { steps },
      primaryPlayer: primary,
      secondaryPlayer: jackal,
      events,
    };
  }

  if (res.result === 'turnover') {
    events.push({ type: 'TURNOVER_AT_BREAKDOWN', jackal });
    const steps: NarrationStep[] = [
      { kind: 'phase_outcome', phase: MatchPhase.Breakdown, key: 'turnover', primary, secondary: jackal },
    ];
    if (defPlan === 'jackal') {
      steps.push({ kind: 'tactic_note', cause: 'breakdown_jackal_turnover', chancePct: COMMENTARY_CHANCES.breakdownJackalTurnover, params: { defendTeamName: defendTeam.name } });
    } else if (defPlan === 'counter_ruck') {
      steps.push({ kind: 'tactic_note', cause: 'breakdown_counter_ruck_turnover', chancePct: COMMENTARY_CHANCES.breakdownCounterRuckTurnover, params: { defendTeamName: defendTeam.name } });
    } else if (attPlan === 'wide_play') {
      steps.push({ kind: 'tactic_note', cause: 'breakdown_wide_play_turnover', chancePct: COMMENTARY_CHANCES.breakdownWidePlayTurnover, params: { attackTeamName: attackTeam.name } });
    }
    return {
      nextPhase: MatchPhase.PhasePlay,
      narration: { steps },
      primaryPlayer: jackal,
      secondaryPlayer: primary,
      events,
    };
  }

  // penalty_defending — defending team awarded the penalty, so possession flips to them
  events.push({ type: 'PENALTY_CONCEDED_AT_BREAKDOWN', player: primary });
  const penaltySteps: NarrationStep[] = [
    { kind: 'phase_outcome', phase: MatchPhase.Breakdown, key: 'penalty_defending', primary, secondary: jackal },
  ];
  if (attPlan === 'pick_and_drive') {
    penaltySteps.push({ kind: 'tactic_note', cause: 'breakdown_pick_and_drive_penalty', chancePct: COMMENTARY_CHANCES.breakdownPickAndDrivePenalty });
  } else if (attPlan === 'wide_play') {
    penaltySteps.push({ kind: 'tactic_note', cause: 'breakdown_wide_play_penalty', chancePct: COMMENTARY_CHANCES.breakdownWidePlayPenalty, params: { attackTeamName: attackTeam.name } });
  } else if (defPlan === 'jackal') {
    penaltySteps.push({ kind: 'tactic_note', cause: 'breakdown_jackal_penalty', chancePct: COMMENTARY_CHANCES.breakdownJackalPenalty });
  }
  return {
    nextPhase: MatchPhase.Penalty,
    narration: { steps: penaltySteps },
    primaryPlayer: primary,
    secondaryPlayer: jackal,
    events,
  };
}
