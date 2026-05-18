import type { Player } from '../../types/player';
import type { PhaseContext, PhaseResult } from './types';
import { MatchPhase } from '../../types/engine';
import { resolveBreakdown } from '../resolvers/BreakdownResolver';
import { getCommentary } from '../CommentaryEngine';
import { rng } from '../../utils/rng';

function tacticNote(chancePct: number, ...lines: string[]): string {
  return rng(1, 100) <= chancePct ? ' ' + lines[rng(0, lines.length - 1)] : '';
}

export function handleBreakdown({ state, attackTeam, defendTeam, inOpposition22, inOwn22, inOwnHalf, adjustRating, draftEvent }: PhaseContext): PhaseResult {
  const attPlan = attackTeam.tactics.attackingBreakdown;
  const defPlan = defendTeam.tactics.defendingBreakdown;

  const lastEvent = state.events[state.events.length - 1];
  const carrierId = lastEvent?.primaryPlayer?.id;
  const dominantCarryBonus = lastEvent?.outcome === 'dominant_carry' ? 6 : 0;
  const attackBonus = dominantCarryBonus;

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

  const homeIsAttacking = state.possession === 'home';
  const homeIsDefending = !homeIsAttacking;

  if (res.result === 'clean_ball') {
    adjustRating(primary, +0.15);
    let note = '';
    if (homeIsAttacking && attPlan === 'pick_and_drive') {
      note = tacticNote(30,
        'The pick-and-drive is working a treat — the forwards are dominating at the breakdown.',
        "That's the reward for flooding the ruck — quick, clean ball.",
      );
    } else if (homeIsDefending && defPlan === 'shadow') {
      note = tacticNote(30,
        'The shadow defence is giving them a platform — they were already set before the ball arrived.',
        "Conceding the ruck but giving nothing else — the defensive line is already organised.",
      );
    } else if (homeIsDefending && defPlan === 'jackal') {
      note = tacticNote(25,
        "The jackal threat is still there even when they can't get the turnover — slowing things down.",
      );
    }
    return {
      nextPhase: MatchPhase.PhasePlay,
      commentary: getCommentary({ ...draftEvent(MatchPhase.Breakdown), primaryPlayer: primary, secondaryPlayer: jackal }, 'clean_ball') + note,
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

    let note = '';
    if (homeIsAttacking && attPlan === 'wide_play') {
      note = tacticNote(30,
        "The wide game plan is leaving them thin at the ruck — they're having to work hard for this ball.",
        "A price to pay for the wide-play approach: not enough bodies to secure quick ball there.",
      );
    } else if (homeIsDefending && defPlan === 'counter_ruck') {
      note = tacticNote(30,
        "The counter-ruck is making a mess of things at the breakdown — the attack is struggling to get away.",
        "That's what the counter-ruck does: wins the physical battle and slows everything down.",
      );
    }
    return {
      nextPhase: boxKick ? MatchPhase.BoxKick : MatchPhase.PhasePlay,
      commentary: getCommentary({ ...draftEvent(MatchPhase.Breakdown), primaryPlayer: primary, secondaryPlayer: jackal }, 'slow_ball') + note,
      primaryPlayer: primary,
      secondaryPlayer: jackal,
    };
  }

  if (res.result === 'turnover') {
    adjustRating(jackal, +0.75);
    adjustRating(primary, -0.15);
    state.possession = state.possession === 'home' ? 'away' : 'home';
    state.breakdownMod = { attack: 0, defend: 0 };
    let note = '';
    // After possession flip, home is now attacking if they just won the turnover
    if (homeIsDefending && defPlan === 'jackal') {
      note = tacticNote(35,
        "That's the jackal game paying off — huge work-rate at the breakdown and they've stolen possession.",
        "Exactly what the jackal strategy is designed for — patience at the breakdown and they've come away with the ball.",
      );
    } else if (homeIsDefending && defPlan === 'counter_ruck') {
      note = tacticNote(30,
        "The counter-ruck overwhelms the opposition and they've turned it over — sheer forward power.",
      );
    } else if (homeIsAttacking && attPlan === 'wide_play') {
      note = tacticNote(25,
        "The wide game plan leaves too few at the ruck and they've paid the price — possession gone.",
        "That's the danger with going wide — not enough bodies to secure that ball.",
      );
    }
    return {
      nextPhase: MatchPhase.PhasePlay,
      commentary: getCommentary({ ...draftEvent(MatchPhase.Breakdown), primaryPlayer: primary, secondaryPlayer: jackal }, 'turnover') + note,
      primaryPlayer: jackal,
      secondaryPlayer: primary,
    };
  }

  // penalty_defending — defending team awarded the penalty, so possession flips to them
  adjustRating(primary, -0.375);
  state.possession = state.possession === 'home' ? 'away' : 'home';
  state.breakdownMod = { attack: 0, defend: 0 };
  let penaltyNote = '';
  if (homeIsAttacking && attPlan === 'pick_and_drive') {
    penaltyNote = tacticNote(25,
      "The pick-and-drive is aggressive but they've gone too far — penalty given away at the ruck.",
      "Too many bodies piling in and the referee has had enough — a penalty against them at the breakdown.",
    );
  } else if (homeIsAttacking && attPlan === 'wide_play') {
    penaltyNote = tacticNote(25,
      "With so few at the ruck they've struggled to stay legal — and the referee penalises them.",
    );
  } else if (homeIsDefending && defPlan === 'jackal') {
    penaltyNote = tacticNote(25,
      "The jackal is a high-risk strategy and here it backfires — penalty for not releasing.",
      "That's the danger of the jackal — get it slightly wrong and the referee penalises you.",
    );
  }
  return {
    nextPhase: MatchPhase.Penalty,
    commentary: getCommentary({ ...draftEvent(MatchPhase.Breakdown), primaryPlayer: primary, secondaryPlayer: jackal }, 'penalty_defending') + penaltyNote,
    primaryPlayer: primary,
    secondaryPlayer: jackal,
  };
}
