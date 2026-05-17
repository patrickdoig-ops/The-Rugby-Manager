import type { PhaseContext, PhaseResult } from './types';
import { MatchPhase } from '../../types/engine';
import { resolveOpenPlay } from '../resolvers/OpenPlayResolver';
import { getCommentary } from '../CommentaryEngine';
import { rng } from '../../utils/rng';
import { clamp } from '../../utils/math';

export function handleOpenPlay({ state, attackTeam, defendTeam, attackDir, isTryScored, adjustRating, randomPlayer, draftEvent }: PhaseContext): PhaseResult {
  const carrier  = randomPlayer(attackTeam);
  const defender = randomPlayer(defendTeam);
  const res = resolveOpenPlay(carrier, defender);

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
    commentary = getCommentary({ ...draftEvent(MatchPhase.OpenPlay), primaryPlayer: carrier, secondaryPlayer: defender }, 'line_break');
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

  if (nextPhase === MatchPhase.Breakdown && rng(1, 100) <= 15) {
    nextPhase = MatchPhase.TacticalKick;
  }

  return { nextPhase, commentary, primaryPlayer: carrier, secondaryPlayer: defender };
}
