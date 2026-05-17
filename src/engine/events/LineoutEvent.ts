import type { PhaseContext, PhaseResult } from './types';
import { MatchPhase } from '../../types/engine';
import { resolveLineout } from '../resolvers/LineoutResolver';
import { getCommentary } from '../CommentaryEngine';
import { rng } from '../../utils/rng';

export function handleLineout({ state, attackTeam, defendTeam, adjustRating, pickPlayer, draftEvent }: PhaseContext): PhaseResult {
  const hooker       = pickPlayer(attackTeam, 2);
  const jumperIds    = [4, 5, 7];
  const attackJumper = attackTeam.players.find(p => p.id === jumperIds[rng(0, 2)])!;
  const defendJumper = pickPlayer(defendTeam, 4, 5, 6);
  const res = resolveLineout(hooker, attackJumper, defendJumper);

  if (res.result === 'clean_catch') {
    adjustRating(attackJumper, +0.15);
    state.stats.lineouts[state.possession]++;
    return {
      nextPhase: MatchPhase.OpenPlay,
      // secondaryPlayer in commentary is the hooker (thrower); in the event it is the defend jumper
      commentary: getCommentary({ ...draftEvent(MatchPhase.Lineout), primaryPlayer: attackJumper, secondaryPlayer: hooker }, 'clean_catch'),
      primaryPlayer: attackJumper,
      secondaryPlayer: defendJumper,
    };
  }

  if (res.result === 'scrappy_knock_on') {
    adjustRating(attackJumper, -0.2);
    state.stats.handlingErrors[state.possession]++;
    state.possession = state.possession === 'home' ? 'away' : 'home';
    return {
      nextPhase: MatchPhase.Scrum,
      commentary: getCommentary({ ...draftEvent(MatchPhase.Lineout), primaryPlayer: attackJumper, secondaryPlayer: defendJumper }, 'scrappy_knock_on'),
      primaryPlayer: attackJumper,
      secondaryPlayer: defendJumper,
    };
  }

  // steal
  adjustRating(defendJumper, +0.3);
  adjustRating(attackJumper, -0.1);
  state.possession = state.possession === 'home' ? 'away' : 'home';
  return {
    nextPhase: MatchPhase.OpenPlay,
    commentary: getCommentary({ ...draftEvent(MatchPhase.Lineout), primaryPlayer: defendJumper, secondaryPlayer: attackJumper }, 'steal'),
    primaryPlayer: defendJumper,
    secondaryPlayer: attackJumper,
  };
}
