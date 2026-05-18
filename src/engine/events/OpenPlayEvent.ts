import type { PhaseContext, PhaseResult } from './types';
import { MatchPhase } from '../../types/engine';
import { resolveOpenPlay } from '../resolvers/OpenPlayResolver';
import { getCommentary } from '../CommentaryEngine';
import { rng } from '../../utils/rng';
import { clamp } from '../../utils/math';

function tacticNote(chancePct: number, ...lines: string[]): string {
  return rng(1, 100) <= chancePct ? ' ' + lines[rng(0, lines.length - 1)] : '';
}

export function handleOpenPlay({ state, attackTeam, defendTeam, attackDir, isTryScored, inOwnHalf, inOwn22, adjustRating, randomPlayer, pickPlayer, draftEvent }: PhaseContext): PhaseResult {
  // Step 0 — Kick or carry decision
  // Propensity is driven by attacking team tactics and pitch location
  const plan = attackTeam.tactics.attackingGamePlan;
  let kickProb = 15;

  if (plan === 'possession') {
    kickProb = inOwn22() ? 10 : (inOwnHalf() ? 5 : 0);
  } else if (plan === 'kicking') {
    kickProb = inOwn22() ? 35 : (inOwnHalf() ? 25 : 15);
  } else {
    // balanced
    kickProb = inOwn22() ? 20 : (inOwnHalf() ? 15 : 10);
  }

  if (rng(1, 100) <= kickProb) {
    state.breakdownMod = { attack: 0, defend: 0 };
    const flyHalf = attackTeam.players.find(p => p.id === 10) ?? attackTeam.players[0];
    return {
      nextPhase: MatchPhase.TacticalKick,
      commentary: getCommentary({ ...draftEvent(MatchPhase.OpenPlay) }, 'kick_decision'),
      primaryPlayer: flyHalf,
    };
  }

  // Step 1 — Carrier handling gate (inline)
  const carrier  = randomPlayer(attackTeam);
  const defender = randomPlayer(defendTeam);
  const { attack: attackMod, defend: defendMod } = state.breakdownMod;
  state.breakdownMod = { attack: 0, defend: 0 };
  const backfieldPenalty = defendTeam.tactics.backfieldDefence === 'three_back' ? -10
                         : defendTeam.tactics.backfieldDefence === 'two_back'   ? -5 : 0;

  if (carrier.currentStats.handling + rng(1, 20) < 30) {
    adjustRating(carrier, -0.45);
    state.stats.handlingErrors[state.possession]++;
    state.possession = state.possession === 'home' ? 'away' : 'home';
    return {
      nextPhase: MatchPhase.Scrum,
      commentary: getCommentary({ ...draftEvent(MatchPhase.OpenPlay), primaryPlayer: carrier, secondaryPlayer: defender }, 'knock_on'),
      primaryPlayer: carrier,
      secondaryPlayer: defender,
    };
  }

  // Step 2 — Hard Carry / Out the Back decision
  const style = attackTeam.tactics.attackingStyle;
  const hardCarryThreshold = style === 'keep_it_tight' ? 90 : style === 'wide_wide' ? 50 : 70;
  const goWide = carrier.id !== 10 && rng(1, 100) > hardCarryThreshold;

  let ballCarrier = carrier;
  let wideIntro = '';

  if (goWide) {
    const flyHalf = pickPlayer(attackTeam, 10);
    wideIntro = getCommentary({ ...draftEvent(MatchPhase.OpenPlay), primaryPlayer: carrier, secondaryPlayer: flyHalf }, 'out_the_back') + ' ';

    // Fly half handling gate
    if (flyHalf.currentStats.handling + rng(1, 20) < 30) {
      adjustRating(flyHalf, -0.45);
      state.stats.handlingErrors[state.possession]++;
      state.possession = state.possession === 'home' ? 'away' : 'home';
      return {
        nextPhase: MatchPhase.Scrum,
        commentary: wideIntro + getCommentary({ ...draftEvent(MatchPhase.OpenPlay), primaryPlayer: flyHalf, secondaryPlayer: defender }, 'knock_on'),
        primaryPlayer: flyHalf,
        secondaryPlayer: defender,
      };
    }

    // Outside back handling gate (outside centre, both wings, fullback)
    const obPool = attackTeam.players.filter(p => [11, 13, 14, 15].includes(p.id));
    const outsideBack = obPool.length > 0 ? obPool[rng(0, obPool.length - 1)] : randomPlayer(attackTeam);
    if (outsideBack.currentStats.handling + rng(1, 20) < 30) {
      adjustRating(outsideBack, -0.45);
      state.stats.handlingErrors[state.possession]++;
      state.possession = state.possession === 'home' ? 'away' : 'home';
      return {
        nextPhase: MatchPhase.Scrum,
        commentary: wideIntro + getCommentary({ ...draftEvent(MatchPhase.OpenPlay), primaryPlayer: outsideBack, secondaryPlayer: defender }, 'knock_on'),
        primaryPlayer: outsideBack,
        secondaryPlayer: defender,
      };
    }

    ballCarrier = outsideBack;
  }

  // Step 3 — Evasion → Step 4 Collision (handling gate already cleared)
  const res = resolveOpenPlay(ballCarrier, defender, attackMod, defendMod + backfieldPenalty);

  let nextPhase: MatchPhase;
  let commentary: string;

  if (res.outcome === 'line_break') {
    adjustRating(ballCarrier, +0.375);
    state.ballX = clamp(state.ballX + attackDir() * res.gainMetres, 0, 100);
    nextPhase = isTryScored() ? MatchPhase.TryScored : MatchPhase.Breakdown;
    const lineBreakNote = (backfieldPenalty < 0 && state.possession !== 'home')
      ? tacticNote(30,
          "The backfield commitment is leaving them short in the defensive line — and they've been cut through.",
          "Three in the backfield means only twelve in the line and there's the gap — a costly trade-off.",
        )
      : '';
    commentary = wideIntro + getCommentary({ ...draftEvent(MatchPhase.OpenPlay), primaryPlayer: ballCarrier, secondaryPlayer: defender }, 'line_break') + lineBreakNote;
  } else if (res.outcome === 'dominant_tackle') {
    adjustRating(defender, +0.3);
    adjustRating(ballCarrier, -0.075);
    state.stats.tackles[state.possession === 'home' ? 'away' : 'home'].attempted++;
    state.stats.tackles[state.possession === 'home' ? 'away' : 'home'].made++;
    state.ballX = clamp(state.ballX + attackDir() * res.gainMetres, 0, 100);
    nextPhase = MatchPhase.Breakdown;
    commentary = wideIntro + getCommentary({ ...draftEvent(MatchPhase.OpenPlay), primaryPlayer: ballCarrier, secondaryPlayer: defender }, 'dominant_tackle');
  } else {
    if (res.outcome === 'dominant_carry') adjustRating(ballCarrier, +0.225);
    state.stats.tackles[state.possession === 'home' ? 'away' : 'home'].attempted++;
    state.stats.tackles[state.possession === 'home' ? 'away' : 'home'].made++;
    state.ballX = clamp(state.ballX + attackDir() * res.gainMetres, 0, 100);
    nextPhase = MatchPhase.Breakdown;
    commentary = wideIntro + getCommentary({ ...draftEvent(MatchPhase.OpenPlay), primaryPlayer: ballCarrier, secondaryPlayer: defender }, res.outcome);
  }

  return { nextPhase, commentary, primaryPlayer: ballCarrier, secondaryPlayer: defender, outcome: res.outcome };
}
