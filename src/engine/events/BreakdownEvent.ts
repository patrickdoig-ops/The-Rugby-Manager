import type { Player } from '../../types/player';
import type { PhaseContext, PhaseResult } from './types';
import { MatchPhase } from '../../types/engine';
import { resolveBreakdown } from '../resolvers/BreakdownResolver';
import { getCommentary } from '../CommentaryEngine';
import { rng } from '../../utils/rng';

export function handleBreakdown({ state, attackTeam, defendTeam, inOpposition22, inOwn22, inOwnHalf, adjustRating, draftEvent }: PhaseContext): PhaseResult {
  const attPlan = attackTeam.tactics.attackingBreakdown;
  const defPlan = defendTeam.tactics.defendingBreakdown;

  const lastEvent = state.events[state.events.length - 1];
  const lastOpenPlay = lastEvent?.phase === MatchPhase.OpenPlay ? lastEvent : undefined;
  const carrierId = lastOpenPlay?.primaryPlayer?.id;
  const dominantCarryBonus = lastOpenPlay?.outcome === 'dominant_carry' ? 6 : 0;
  const commitBonus = attPlan === 'pick_and_drive' ? 8 : (attPlan === 'wide_play' ? -5 : 0);
  const attackBonus = dominantCarryBonus + commitBonus;

  // Next-phase modifier: more players committed to ruck = fewer on feet for the next phase
  const nextAttackMod = attPlan === 'pick_and_drive' ? -8 : (attPlan === 'wide_play' ? 8 : 0);
  const nextDefendMod = defPlan === 'shadow' ? 10 : (defPlan === 'counter_ruck' ? -8 : 0);
  state.breakdownMod = { attack: nextAttackMod, defend: nextDefendMod };

  const forwardPool = attackTeam.players.filter(p => p.id <= 8 && p.id !== carrierId);
  if (forwardPool.length === 0) forwardPool.push(attackTeam.players[0]);
  const pool = [...forwardPool];

  const count = attPlan === 'pick_and_drive' ? 4 : (attPlan === 'wide_play' ? 2 : 3);
  const supporters: Player[] = [];
  while (supporters.length < count && pool.length > 0) {
    supporters.push(...pool.splice(rng(0, pool.length - 1), 1));
  }

  const backRow = defendTeam.players.filter(p => p.id >= 6 && p.id <= 8);
  const jackal  = backRow.length > 0 ? backRow[rng(0, backRow.length - 1)] : defendTeam.players[0];
  const primary = supporters[0];

  const defendPack = defendTeam.players.filter(p => p.id <= 8);
  const res = resolveBreakdown(supporters, jackal, defPlan, defendPack, attackBonus);

  if (res.result === 'clean_ball') {
    adjustRating(primary, +0.1);
    return {
      nextPhase: MatchPhase.OpenPlay,
      commentary: getCommentary({ ...draftEvent(MatchPhase.Breakdown), primaryPlayer: primary, secondaryPlayer: jackal }, 'clean_ball'),
      primaryPlayer: primary,
      secondaryPlayer: jackal,
    };
  }

  if (res.result === 'slow_ball') {
    const plan = attackTeam.tactics.attackingGamePlan;
    let boxKick = false;

    if (plan === 'possession') {
      boxKick = false;
    } else if (plan === 'kicking') {
      boxKick = !inOpposition22() && !inOwn22();
    } else {
      boxKick = inOwnHalf() && !inOwn22();
    }

    return {
      nextPhase: boxKick ? MatchPhase.BoxKick : MatchPhase.OpenPlay,
      commentary: getCommentary({ ...draftEvent(MatchPhase.Breakdown), primaryPlayer: primary, secondaryPlayer: jackal }, 'slow_ball'),
      primaryPlayer: primary,
      secondaryPlayer: jackal,
    };
  }

  if (res.result === 'turnover') {
    adjustRating(jackal, +0.3);
    adjustRating(primary, -0.1);
    state.possession = state.possession === 'home' ? 'away' : 'home';
    state.breakdownMod = { attack: 0, defend: 0 };
    return {
      nextPhase: MatchPhase.OpenPlay,
      commentary: getCommentary({ ...draftEvent(MatchPhase.Breakdown), primaryPlayer: jackal, secondaryPlayer: primary }, 'turnover'),
      primaryPlayer: jackal,
      secondaryPlayer: primary,
    };
  }

  // penalty_defending — defending team awarded the penalty, so possession flips to them
  adjustRating(primary, -0.25);
  state.possession = state.possession === 'home' ? 'away' : 'home';
  state.breakdownMod = { attack: 0, defend: 0 };
  return {
    nextPhase: MatchPhase.Penalty,
    commentary: getCommentary({ ...draftEvent(MatchPhase.Breakdown), primaryPlayer: primary, secondaryPlayer: jackal }, 'penalty_defending'),
    primaryPlayer: primary,
    secondaryPlayer: jackal,
  };
}
