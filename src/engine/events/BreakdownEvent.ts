import type { Player } from '../../types/player';
import type { PhaseContext, PhaseResult } from './types';
import type { MatchEvent } from '../../types/matchEvent';
import type { NarrationStep } from '../../types/narration';
import { MatchPhase } from '../../types/engine';
import { resolveBreakdown } from '../resolvers/BreakdownResolver';
import { rng } from '../../utils/rng';
import { HOME_ADVANTAGE, TACTIC_MODIFIERS, COMMENTARY_CHANCES, BREAKDOWN_PENALTIES, BREAKDOWN_VALUES, CARRY_HANDOFF_BONUSES } from '../balance';
import { homeEdge } from '../HomeAdvantage';
import { availableForwards, onFieldPlayers } from '../FieldPosition';
import { effAttackingBreakdown, effDefendingBreakdown, effDefensiveLine, effIntensityScalar, effDisciplineScalar } from '../tacticsResolve';
import { isBackRowSlot } from '../Slot';
import { commitRuck } from '../spatial/RuckCommitment';
import { attackDir } from '../FieldPosition';

// Fastest player in a group — the "first to the breakdown" arrival pace.
// Empty group returns the pivot (neutral, zero edge).
function fastestPace(players: Player[]): number {
  if (players.length === 0) return BREAKDOWN_VALUES.paceArrivalPivot;
  let max = players[0].currentStats.pace;
  for (let i = 1; i < players.length; i++) {
    if (players[i].currentStats.pace > max) max = players[i].currentStats.pace;
  }
  return max;
}

export function handleBreakdown({ state, attackTeam, defendTeam, spatial, world }: PhaseContext): PhaseResult {
  const attPlan = effAttackingBreakdown(state, attackTeam);
  const defPlan = effDefendingBreakdown(state, defendTeam);
  // Intensity (physical edge) + discipline (turnover edge) at the contest —
  // each side's own settings add to its breakdown score below.
  const attContestEdge = effIntensityScalar(attackTeam, TACTIC_MODIFIERS.intensityContestMod)
                       + effDisciplineScalar(attackTeam, TACTIC_MODIFIERS.disciplineContestMod);
  const defContestEdge = effIntensityScalar(defendTeam, TACTIC_MODIFIERS.intensityContestMod)
                       + effDisciplineScalar(defendTeam, TACTIC_MODIFIERS.disciplineContestMod);

  const carrierId = state.lastCarryCarrierId;
  // Carry → breakdown handoff. A line break commits the defence — the
  // attacker has thin cover for the NEXT carry, so the bonus flows into
  // nextAttackMod (the front-foot next-phase carry boost).
  // We ALSO pump the current breakdown's attackScore by applying the
  // dominantCarry bonus. Without this, the carrier is left too exposed
  // and it results in too many penalties or turnovers immediately after
  // a successful line break. Constants live in CARRY_HANDOFF_BONUSES.
  //
  // The line-break chain is then multiplied by lineBreakChainMultiplier
  // for THIS defender's defensiveLine — blitz cover regroups faster
  // than drift cover, so the cascade is muted. Without this, the
  // immediate line-break gain (defensiveLineBreakBonus) compounded
  // into the chain, double-counting blitz's "cover behind the runner"
  // effect and overpunishing blitz teams.
  const lineBreakFollowUp = state.lastCarryOutcome === 'line_break';
  const lineBreakChainMult = TACTIC_MODIFIERS.lineBreakChainMultiplier[effDefensiveLine(state, defendTeam)];
  const lineBreakHandoff = lineBreakFollowUp
    ? CARRY_HANDOFF_BONUSES.lineBreak * lineBreakChainMult
    : 0;
  const attackBonus = (state.lastCarryOutcome === 'dominant_carry' || state.lastCarryOutcome === 'line_break')
    ? CARRY_HANDOFF_BONUSES.dominantCarry
    : 0;

  // Next-phase modifier: lineBreakHandoff only. The tactic-based evasion
  // modifiers (breakdownAttack) are now applied conditionally in OpenPlayEvent.
  const nextAttackMod = lineBreakHandoff;
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

  // Legacy participant selection — the supporter cleaners + jackal. On the
  // SPATIAL path (WP4) the committed bodies come from the World instead, but these
  // rng() draws are STILL consumed here in their exact order/count so the outcome
  // stream stays byte-identical (CLAUDE.md § 7; the spatial override below only
  // swaps WHICH players resolveBreakdown contests with, never an rng draw). They
  // also remain the live values on the non-spatial / revert path.
  const count = TACTIC_MODIFIERS.breakdownSupporterCount[attPlan];
  let supporters: Player[] = [];
  while (supporters.length < count && pool.length > 0) {
    supporters.push(...pool.splice(rng(0, pool.length - 1), 1));
  }

  const backRow = defendFwds.filter(p => isBackRowSlot(p.id));
  let jackal: Player = backRow.length > 0 ? backRow[rng(0, backRow.length - 1)] : (defendOnField[0] ?? defendTeam.players[0]);

  let defendPack = defendFwds;

  // ── Spatial ruck commitment (Upgrade.md § 5.6; WP4) ──────────────────────
  // The committed bodies (count + quality) feed resolveBreakdown as INPUTS — the
  // contest formula is unchanged. RuckCommitment scores every agent near the ruck
  // mark (team tactical cap, REAL measured carrier isolation, breakdown stat,
  // override threshold) over the persistent World, using ONLY the spatial RNG
  // stream (confined to RuckCommitment.ts). We map
  // the committed agents back to on-field Players; the legacy rng()-selected
  // supporters/jackal stay as fallbacks for any slot that didn't commit.
  if (spatial && world) {
    const direction = attackDir(state);
    const commitment = commitRuck(world, {
      attackSide,
      defendSide: defSide,
      attackDir: direction,
      mark: { x: state.ball.x, y: state.ball.y },
      carrierSlot: carrierId ?? (supporters[0]?.id ?? attackOnField[0]?.id ?? 1),
      attackCap: count,
      defendPlan: defPlan,
    });
    // Map committed attacking agents → Players (the resolver's supporters). Skip
    // the carrier (already grounded). Fall back to the legacy supporters if the
    // commitment produced nothing on the field.
    const committedSupporters = commitment.committedAttackers
      .map(a => attackOnField.find(p => p.id === a.slot))
      .filter((p): p is Player => p !== undefined && p.id !== carrierId);
    if (committedSupporters.length > 0) supporters = committedSupporters;

    // Map committed defenders → Players (the counter-ruck pack). The jackal is the
    // best-placed committed defender; fall back to the legacy back-row pick.
    const committedDefenders = commitment.committedDefenders
      .map(a => defendOnField.find(p => p.id === a.slot))
      .filter((p): p is Player => p !== undefined);
    if (committedDefenders.length > 0) {
      jackal = committedDefenders[0];
      defendPack = committedDefenders;
    }
  }

  const primary = supporters[0];
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
                    + TACTIC_MODIFIERS.dangerousCleanoutAttackMod[attPlan]
                    + effDisciplineScalar(attackTeam, TACTIC_MODIFIERS.disciplinePenaltyMod);
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
                      + TACTIC_MODIFIERS.notRollingAwayDefendMod[defPlan]
                      + effDisciplineScalar(defendTeam, TACTIC_MODIFIERS.disciplinePenaltyMod);
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

  // First-to-arrive pace: the fastest loose forward (back row) on each side,
  // measured symmetrically so the edge is a pure pack-pace differential — not
  // an artefact of which random supporters were committed. Falls back to all
  // forwards if a side has no back row on the field.
  const attackBackRow = attackFwds.filter(p => isBackRowSlot(p.id));
  const attackArrivalPace = fastestPace(attackBackRow.length > 0 ? attackBackRow : attackFwds);
  const defendArrivalPace = fastestPace(backRow.length > 0 ? backRow : defendFwds);

  const res = resolveBreakdown(supporters, jackal, defPlan, defendPack, attackBonus + ha.attack + TACTIC_MODIFIERS.breakdownArsMod[attPlan] + attContestEdge, ha.defend + defContestEdge, attackArrivalPace, defendArrivalPace);

  // 3. offside_at_ruck — defender, post-resolve, fires ONLY on the
  //    transitions that put the ball back into phase play (clean_ball /
  //    slow_ball). Skipped on turnover (possession changed) and on
  //    penalty_defending (the existing breakdown_infringement already wins
  //    the whistle). Offender: a random on-field defender.
  if (res.result === 'clean_ball' || res.result === 'slow_ball') {
    const offsidePct = BREAKDOWN_PENALTIES.offsideAtRuckBasePct
                     + TACTIC_MODIFIERS.offsideAtRuckDefendMod[effDefensiveLine(state, defendTeam)]
                     + effDisciplineScalar(defendTeam, TACTIC_MODIFIERS.disciplinePenaltyMod);
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
    if (attPlan === 'commit_numbers') {
      steps.push({ kind: 'tactic_note', cause: 'breakdown_commit_numbers_clean', chancePct: COMMENTARY_CHANCES.breakdownPickAndDriveClean });
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
    if (attPlan === 'minimal_ruck') {
      steps.push({ kind: 'tactic_note', cause: 'breakdown_minimal_ruck_slow', chancePct: COMMENTARY_CHANCES.breakdownWidePlaySlow, params: { attackTeamName: attackTeam.name } });
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
    } else if (attPlan === 'minimal_ruck') {
      steps.push({ kind: 'tactic_note', cause: 'breakdown_minimal_ruck_turnover', chancePct: COMMENTARY_CHANCES.breakdownWidePlayTurnover, params: { attackTeamName: attackTeam.name } });
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
  if (attPlan === 'commit_numbers') {
    penaltySteps.push({ kind: 'tactic_note', cause: 'breakdown_commit_numbers_penalty', chancePct: COMMENTARY_CHANCES.breakdownPickAndDrivePenalty });
  } else if (attPlan === 'minimal_ruck') {
    penaltySteps.push({ kind: 'tactic_note', cause: 'breakdown_minimal_ruck_penalty', chancePct: COMMENTARY_CHANCES.breakdownWidePlayPenalty, params: { attackTeamName: attackTeam.name } });
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
