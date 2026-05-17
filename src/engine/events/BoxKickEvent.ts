import type { PhaseContext, PhaseResult } from './types';
import { MatchPhase } from '../../types/engine';
import { resolveBoxKick } from '../resolvers/BoxKickResolver';
import { getCommentary } from '../CommentaryEngine';
import { rng } from '../../utils/rng';
import { clamp } from '../../utils/math';

export function handleBoxKick({ state, attackTeam, defendTeam, attackDir, adjustRating, randomPlayer, draftEvent }: PhaseContext): PhaseResult {
  const scrumHalf  = attackTeam.players.find(p => p.id === 9) ?? attackTeam.players[0];
  const wingerPool = attackTeam.players.filter(p => p.id === 11 || p.id === 14);
  const winger     = wingerPool.length > 0 ? wingerPool[rng(0, wingerPool.length - 1)] : randomPlayer(attackTeam);
  const fullback   = defendTeam.players.find(p => p.id === 15) ?? randomPlayer(defendTeam);
  const res = resolveBoxKick(scrumHalf, winger, fullback);

  state.ballX = clamp(state.ballX + attackDir() * (res.quality === 'very_good' ? 15 : 8), 5, 95);

  if (res.outcome === 'attack_retain') {
    adjustRating(scrumHalf, +0.1);
    adjustRating(winger, +0.2);
    adjustRating(fullback, -0.1);
    return {
      nextPhase: MatchPhase.OpenPlay,
      commentary: getCommentary({ ...draftEvent(MatchPhase.BoxKick), primaryPlayer: scrumHalf, secondaryPlayer: winger }, 'attack_retain'),
      primaryPlayer: scrumHalf,
      secondaryPlayer: winger,
    };
  }

  if (res.outcome === 'defend_knock_on') {
    adjustRating(scrumHalf, +0.05);
    adjustRating(winger, +0.1);
    adjustRating(fullback, -0.15);
    state.stats.handlingErrors[state.possession === 'home' ? 'away' : 'home']++;
    return {
      nextPhase: MatchPhase.Scrum,
      commentary: getCommentary({ ...draftEvent(MatchPhase.BoxKick), primaryPlayer: scrumHalf, secondaryPlayer: winger }, 'defend_knock_on'),
      primaryPlayer: scrumHalf,
      secondaryPlayer: winger,
    };
  }

  if (res.outcome === 'defend_catch_contested') {
    adjustRating(fullback, +0.2);
    adjustRating(winger, -0.1);
    state.possession = state.possession === 'home' ? 'away' : 'home';
    return {
      nextPhase: MatchPhase.OpenPlay,
      commentary: getCommentary({ ...draftEvent(MatchPhase.BoxKick), primaryPlayer: scrumHalf, secondaryPlayer: winger }, 'defend_catch_contested'),
      primaryPlayer: scrumHalf,
      secondaryPlayer: winger,
    };
  }

  if (res.outcome === 'defend_catch') {
    adjustRating(fullback, +0.1);
    state.possession = state.possession === 'home' ? 'away' : 'home';
    return {
      nextPhase: MatchPhase.OpenPlay,
      commentary: getCommentary({ ...draftEvent(MatchPhase.BoxKick), primaryPlayer: scrumHalf, secondaryPlayer: winger }, 'defend_catch'),
      primaryPlayer: scrumHalf,
      secondaryPlayer: winger,
    };
  }

  // knock_on — poor kick, fullback drops uncontested
  adjustRating(scrumHalf, -0.1);
  adjustRating(fullback, -0.15);
  state.stats.handlingErrors[state.possession === 'home' ? 'away' : 'home']++;
  return {
    nextPhase: MatchPhase.Scrum,
    commentary: getCommentary({ ...draftEvent(MatchPhase.BoxKick), primaryPlayer: scrumHalf, secondaryPlayer: winger }, 'knock_on'),
    primaryPlayer: scrumHalf,
    secondaryPlayer: winger,
  };
}
