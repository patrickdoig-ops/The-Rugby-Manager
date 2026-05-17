import type { PhaseContext, PhaseResult } from './types';
import { MatchPhase } from '../../types/engine';
import { resolveOpenPlay } from '../resolvers/OpenPlayResolver';
import { getCommentary } from '../CommentaryEngine';
import { rng } from '../../utils/rng';
import { clamp } from '../../utils/math';

function tacticNote(chancePct: number, ...lines: string[]): string {
  return rng(1, 100) <= chancePct ? ' ' + lines[rng(0, lines.length - 1)] : '';
}

export function handleOpenPlay({ state, attackTeam, defendTeam, attackDir, isTryScored, inOwnHalf, inOwn22, adjustRating, randomPlayer, draftEvent }: PhaseContext): PhaseResult {
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

  // Step 1 — Handling gate → Step 2 Evasion → Step 3 Collision
  const carrier  = randomPlayer(attackTeam);
  const defender = randomPlayer(defendTeam);
  const { attack: attackMod, defend: defendMod } = state.breakdownMod;
  state.breakdownMod = { attack: 0, defend: 0 };
  const backfieldPenalty = defendTeam.tactics.backfieldDefence === 'three_back' ? -10
                         : defendTeam.tactics.backfieldDefence === 'two_back'   ? -5 : 0;
  const res = resolveOpenPlay(carrier, defender, attackMod, defendMod + backfieldPenalty);

  let nextPhase: MatchPhase;
  let commentary: string;

  if (res.outcome === 'knock_on') {
    adjustRating(carrier, -0.3);
    state.stats.handlingErrors[state.possession]++;
    state.possession = state.possession === 'home' ? 'away' : 'home';
    nextPhase = MatchPhase.Scrum;
    commentary = getCommentary({ ...draftEvent(MatchPhase.OpenPlay), primaryPlayer: carrier, secondaryPlayer: defender }, 'knock_on');
  } else if (res.outcome === 'line_break') {
    adjustRating(carrier, +0.25);
    state.ballX = clamp(state.ballX + attackDir() * res.gainMetres, 0, 100);
    nextPhase = isTryScored() ? MatchPhase.TryScored : MatchPhase.Breakdown;
    const lineBreakNote = (backfieldPenalty < 0 && state.possession !== 'home')
      ? tacticNote(30,
          "The backfield commitment is leaving them short in the defensive line — and they've been cut through.",
          "Three in the backfield means only twelve in the line and there's the gap — a costly trade-off.",
        )
      : '';
    commentary = getCommentary({ ...draftEvent(MatchPhase.OpenPlay), primaryPlayer: carrier, secondaryPlayer: defender }, 'line_break') + lineBreakNote;
  } else if (res.outcome === 'dominant_tackle') {
    adjustRating(defender, +0.2);
    adjustRating(carrier, -0.05);
    state.stats.tackles[state.possession === 'home' ? 'away' : 'home'].attempted++;
    state.stats.tackles[state.possession === 'home' ? 'away' : 'home'].made++;
    state.ballX = clamp(state.ballX + attackDir() * res.gainMetres, 0, 100);
    nextPhase = MatchPhase.Breakdown;
    commentary = getCommentary({ ...draftEvent(MatchPhase.OpenPlay), primaryPlayer: carrier, secondaryPlayer: defender }, 'dominant_tackle');
  } else {
    if (res.outcome === 'dominant_carry') adjustRating(carrier, +0.15);
    state.stats.tackles[state.possession === 'home' ? 'away' : 'home'].attempted++;
    state.ballX = clamp(state.ballX + attackDir() * res.gainMetres, 0, 100);
    nextPhase = MatchPhase.Breakdown;
    commentary = getCommentary({ ...draftEvent(MatchPhase.OpenPlay), primaryPlayer: carrier, secondaryPlayer: defender }, res.outcome);
  }

  return { nextPhase, commentary, primaryPlayer: carrier, secondaryPlayer: defender, outcome: res.outcome };
}
