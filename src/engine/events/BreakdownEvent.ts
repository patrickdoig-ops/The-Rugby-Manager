import type { Player } from '../../types/player';
import type { PhaseContext, PhaseResult } from './types';
import type { MatchEvent } from '../../types/matchEvent';
import type { NarrationStep } from '../../types/narration';
import { MatchPhase } from '../../types/engine';
import { resolveBreakdown } from '../resolvers/BreakdownResolver';
import { rng } from '../../utils/rng';
import { HOME_ADVANTAGE, TACTIC_MODIFIERS, COMMENTARY_CHANCES, BREAKDOWN_PENALTIES, CARRY_HANDOFF_BONUSES } from '../balance';
import { homeEdge } from '../HomeAdvantage';
import { availableForwards, onFieldPlayers } from '../FieldPosition';

export function handleBreakdown({ state, attackTeam, defendTeam }: PhaseContext): PhaseResult {
  const attPlan = attackTeam.tactics.attackingBreakdown;
  const defPlan = defendTeam.tactics.defendingBreakdown;

  const lastEvent = state.events[state.events.length - 1];
  const carrierId = lastEvent?.primaryPlayer?.id;
  // Carry → breakdown handoff. A line break commits the defence — the
  // attacker has thin cover for the NEXT carry, so the bonus flows into
  // nextAttackMod only (the front-foot next-phase carry boost). We do
  // NOT also pump the current breakdown's attackScore — that was the
  // v2.62a double-dip: a line break converted slow_ball → clean_ball at
  // the immediate breakdown, killing ~0.7 box kicks/match. The line
  // break has already produced a successful carry contest; the
  // breakdown contest is its own thing and should resolve on its own
  // merits. dominant_carry remains a current-breakdown-only bonus
  // (smaller-effect cousin — it never had a next-phase mod). Constants
  // live in CARRY_HANDOFF_BONUSES (balance/breakdown.ts).
  //
  // The line-break chain is then multiplied by lineBreakChainMultiplier
  // for THIS defender's defensiveLine — blitz cover regroups faster
  // than drift cover, so the cascade is muted. Without this, the
  // immediate line-break gain (defensiveLineBreakBonus) compounded
  // into the chain, double-counting blitz's "cover behind the runner"
  // effect and overpunishing blitz teams.
  const lineBreakFollowUp = lastEvent?.outcome === 'line_break';
  const lineBreakChainMult = TACTIC_MODIFIERS.lineBreakChainMultiplier[defendTeam.tactics.defensiveLine];
  const lineBreakHandoff = lineBreakFollowUp
    ? CARRY_HANDOFF_BONUSES.lineBreak * lineBreakChainMult
    : 0;
  const attackBonus = lastEvent?.outcome === 'dominant_carry' ? CARRY_HANDOFF_BONUSES.dominantCarry : 0;

  // Next-phase modifier: more players committed to ruck = fewer on feet for the next phase
  const nextAttackMod = TACTIC_MODIFIERS.breakdownAttack[attPlan] + lineBreakHandoff;
  const nextDefendMod = TACTIC_MODIFIERS.breakdownDefend[defPlan];

  const attackSide = state.possession;
  const defSide: 'home' | 'away' = attackSide === 'home' ? 'away' : 'home';

  const attackFwds = availableForwards(attackTeam, state, attackSide);
  const defendFwds = availableForwards(defendTeam, state, defSide);
  const attackOnField = onFieldPlayers(attackTeam, state, attackSide);
  const defendOnField = onFieldPlayers(defendTeam, state, defSide);

  const forwardPool = attackFwds.filter(p => p.id !== carrierId);
  if (forwardPool.length === 0) forwardPool.push(attackOnField[0] ?? attackTeam.players[0]);
  const pool = [...forwardPool];

  const count = TACTIC_MODIFIERS.breakdownSupporterCount[attPlan];
  const supporters: Player[] = [];
  while (supporters.length < count && pool.length > 0) {
    supporters.push(...pool.splice(rng(0, pool.length - 1), 1));
  }

  const backRow = defendFwds.filter(p => p.id >= 6 && p.id <= 8);
  const jackal  = backRow.length > 0 ? backRow[rng(0, backRow.length - 1)] : (defendOnField[0] ?? defendTeam.players[0]);
  const primary = supporters[0];

  const defendPack = defendFwds;
  const ha = homeEdge(state, HOME_ADVANTAGE.breakdownMod);

  // Set the breakdown mod and credit the ruck hit for every supporter — both happen
  // regardless of outcome.
  const events: MatchEvent[] = [
    { type: 'BREAKDOWN_MOD_SET', attack: nextAttackMod, defend: nextDefendMod },
    { type: 'BREAKDOWN_HIT', players: supporters },
  ];

  // ── Pre-resolve penalty rolls (fixed RNG order: cleanout → not-rolling) ───
  // Each rolls one rng(1, 100) call only when reached, in this exact order, so
  // the rng stream stays deterministic. If a roll fires, the breakdown
  // short-circuits to MatchPhase.Penalty before resolveBreakdown is called —
  // the existing 4-way contest is skipped for this breakdown.

  // 1. dangerous_cleanout — attacker, TMO-eligible (40/40/20 via OFFENCE_SPEC).
  //    Offender: a random supporter (the cleaner). Penalty flips possession.
  const cleanoutPct = BREAKDOWN_PENALTIES.dangerousCleanoutBasePct
                    + TACTIC_MODIFIERS.dangerousCleanoutAttackMod[attPlan];
  if (rng(1, 100) <= cleanoutPct) {
    const offender = supporters[rng(0, supporters.length - 1)];
    events.push({ type: 'PENALTY_AWARDED', offence: 'dangerous_cleanout', offender, offendingSide: attackSide });
    return {
      nextPhase: MatchPhase.Penalty,
      narration: { steps: [{ kind: 'phase_outcome', phase: MatchPhase.Breakdown, key: 'dangerous_cleanout_penalty', primary: offender, secondary: jackal }] },
      primaryPlayer: offender,
      secondaryPlayer: jackal,
      events,
    };
  }

  // 2. not_rolling_away — defender, no TMO. Offender is the jackal (the
  //    nearest defender to the tackle, already picked above).
  const notRollingPct = BREAKDOWN_PENALTIES.notRollingAwayBasePct
                      + TACTIC_MODIFIERS.notRollingAwayDefendMod[defPlan];
  if (rng(1, 100) <= notRollingPct) {
    events.push({ type: 'PENALTY_AWARDED', offence: 'not_rolling_away', offender: jackal, offendingSide: defSide });
    return {
      nextPhase: MatchPhase.Penalty,
      narration: { steps: [{ kind: 'phase_outcome', phase: MatchPhase.Breakdown, key: 'not_rolling_away_penalty', primary: jackal, secondary: primary }] },
      primaryPlayer: jackal,
      secondaryPlayer: primary,
      events,
    };
  }

  const res = resolveBreakdown(supporters, jackal, defPlan, defendPack, attackBonus + ha.attack, ha.defend);

  // 3. offside_at_ruck — defender, post-resolve, fires ONLY on the
  //    transitions that put the ball back into phase play (clean_ball /
  //    slow_ball). Skipped on turnover (possession changed) and on
  //    penalty_defending (the existing breakdown_infringement already wins
  //    the whistle). Offender: a random on-field defender.
  if (res.result === 'clean_ball' || res.result === 'slow_ball') {
    const offsidePct = BREAKDOWN_PENALTIES.offsideAtRuckBasePct
                     + TACTIC_MODIFIERS.offsideAtRuckDefendMod[defendTeam.tactics.defensiveLine];
    if (rng(1, 100) <= offsidePct) {
      const offender = defendOnField[rng(0, defendOnField.length - 1)] ?? jackal;
      events.push({ type: 'PENALTY_AWARDED', offence: 'offside_at_ruck', offender, offendingSide: defSide });
      return {
        nextPhase: MatchPhase.Penalty,
        narration: { steps: [{ kind: 'phase_outcome', phase: MatchPhase.Breakdown, key: 'offside_at_ruck_penalty', primary: offender, secondary: primary }] },
        primaryPlayer: offender,
        secondaryPlayer: primary,
        events,
      };
    }
  }

  if (res.result === 'clean_ball') {
    events.push({ type: 'BALL_QUALITY_SET', quality: 'clean' });
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
    // Slow ball → biases the next-phase KickDecisionDirector toward kicking
    // (any family — clearance / territory / fifty_22 / attacking), replacing
    // the pre-v2.83a deterministic slow_ball → BoxKick gate that lived here.
    // The +SLOW_BALL_KICK_BONUS shift in balance/kickDecision.ts is the
    // probabilistic equivalent.
    events.push({ type: 'BALL_QUALITY_SET', quality: 'slow' });
    const steps: NarrationStep[] = [
      { kind: 'phase_outcome', phase: MatchPhase.Breakdown, key: 'slow_ball', primary, secondary: jackal },
    ];
    if (attPlan === 'wide_play') {
      steps.push({ kind: 'tactic_note', cause: 'breakdown_wide_play_slow', chancePct: COMMENTARY_CHANCES.breakdownWidePlaySlow, params: { attackTeamName: attackTeam.name } });
    } else if (defPlan === 'counter_ruck') {
      steps.push({ kind: 'tactic_note', cause: 'breakdown_counter_ruck_slow', chancePct: COMMENTARY_CHANCES.breakdownCounterRuckSlow });
    }
    return {
      nextPhase: MatchPhase.PhasePlay,
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
  events.push({
    type: 'PENALTY_AWARDED',
    offence: 'breakdown_infringement',
    offender: primary,
    offendingSide: attackSide,
  });
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
