import type { PhaseContext, PhaseResult } from './types';
import { MatchPhase } from '../../types/engine';
import { resolveScrum } from '../resolvers/ScrumResolver';
import { getCommentary } from '../CommentaryEngine';

export function handleScrum({ state, attackTeam, defendTeam, adjustRating, draftEvent }: PhaseContext): PhaseResult {
  state.breakdownMod = { attack: 0, defend: 0 };
  const attackForwards = attackTeam.players.filter(p => p.id <= 8);
  const defendForwards = defendTeam.players.filter(p => p.id <= 8);
  const attackHooker   = attackTeam.players.find(p => p.id === 2)!;
  const defendHooker   = defendTeam.players.find(p => p.id === 2)!;
  const res = resolveScrum(attackForwards, defendForwards);

  if (res.result === 'stable_win') {
    adjustRating(attackHooker, +0.1);
    state.stats.scrums[state.possession]++;
    return {
      nextPhase: MatchPhase.OpenPlay,
      commentary: getCommentary({ ...draftEvent(MatchPhase.Scrum), primaryPlayer: attackHooker, secondaryPlayer: defendHooker }, 'stable_win'),
      primaryPlayer: attackHooker,
      secondaryPlayer: defendHooker,
    };
  }

  if (res.result === 'wheel') {
    return {
      nextPhase: MatchPhase.Scrum,
      commentary: getCommentary({ ...draftEvent(MatchPhase.Scrum), primaryPlayer: attackHooker, secondaryPlayer: defendHooker }, 'wheel'),
      primaryPlayer: attackHooker,
      secondaryPlayer: defendHooker,
    };
  }

  // dominant_penalty — defending team wins the penalty
  adjustRating(defendHooker, +0.15);
  adjustRating(attackHooker, -0.2);
  state.possession = state.possession === 'home' ? 'away' : 'home';
  state.stats.scrums[state.possession]++;
  return {
    nextPhase: MatchPhase.Penalty,
    commentary: getCommentary({ ...draftEvent(MatchPhase.Scrum), primaryPlayer: attackHooker, secondaryPlayer: defendHooker }, 'dominant_penalty'),
    primaryPlayer: defendHooker,
    secondaryPlayer: attackHooker,
  };
}
