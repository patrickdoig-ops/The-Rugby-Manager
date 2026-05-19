import type { PhaseContext, PhaseResult } from './types';
import type { MatchEvent } from '../../types/matchEvent';
import { MatchPhase } from '../../types/engine';
import { resolveScrum } from '../resolvers/ScrumResolver';
import { getCommentary } from '../CommentaryEngine';

export function handleScrum({ state, attackTeam, defendTeam, draftEvent }: PhaseContext): PhaseResult {
  const attackForwards = attackTeam.players.filter(p => p.id <= 8);
  const defendForwards = defendTeam.players.filter(p => p.id <= 8);
  const attackFrontRow = attackTeam.players.filter(p => p.id <= 3);
  const defendFrontRow = defendTeam.players.filter(p => p.id <= 3);
  const attackHooker   = attackTeam.players.find(p => p.id === 2)!;
  const defendHooker   = defendTeam.players.find(p => p.id === 2)!;
  const res = resolveScrum(attackForwards, defendForwards);

  const attackSide = state.possession;
  const flipSide: 'home' | 'away' = attackSide === 'home' ? 'away' : 'home';

  const events: MatchEvent[] = [
    { type: 'BREAKDOWN_MOD_SET', attack: 0, defend: 0 },
  ];

  if (res.result === 'attacking_dominant_penalty') {
    events.push({
      type: 'SCRUM_RESOLVED',
      outcome: 'attacking_dominant_penalty',
      attackFrontRow, defendFrontRow,
      possessionSideAfter: attackSide,
    });
    return {
      nextPhase: MatchPhase.Penalty,
      commentary: getCommentary({ ...draftEvent(MatchPhase.Scrum), primaryPlayer: defendHooker, secondaryPlayer: attackHooker }, 'attacking_dominant_penalty'),
      primaryPlayer: attackHooker,
      secondaryPlayer: defendHooker,
      events,
    };
  }

  if (res.result === 'stable_win') {
    events.push({
      type: 'SCRUM_RESOLVED',
      outcome: 'stable_win',
      attackFrontRow, defendFrontRow,
      possessionSideAfter: attackSide,
    });
    return {
      nextPhase: MatchPhase.FirstPhase,
      commentary: getCommentary({ ...draftEvent(MatchPhase.Scrum), primaryPlayer: attackHooker, secondaryPlayer: defendHooker }, 'stable_win'),
      primaryPlayer: attackHooker,
      secondaryPlayer: defendHooker,
      events,
    };
  }

  if (res.result === 'wheel') {
    events.push({
      type: 'SCRUM_RESOLVED',
      outcome: 'wheel',
      attackFrontRow, defendFrontRow,
      possessionSideAfter: attackSide,
    });
    return {
      nextPhase: MatchPhase.Scrum,
      commentary: getCommentary({ ...draftEvent(MatchPhase.Scrum), primaryPlayer: attackHooker, secondaryPlayer: defendHooker }, 'wheel'),
      primaryPlayer: attackHooker,
      secondaryPlayer: defendHooker,
      events,
    };
  }

  // defending_dominant_penalty — defending team wins the penalty
  events.push({
    type: 'SCRUM_RESOLVED',
    outcome: 'defending_dominant_penalty',
    attackFrontRow, defendFrontRow,
    possessionSideAfter: flipSide,
  });
  return {
    nextPhase: MatchPhase.Penalty,
    commentary: getCommentary({ ...draftEvent(MatchPhase.Scrum), primaryPlayer: attackHooker, secondaryPlayer: defendHooker }, 'defending_dominant_penalty'),
    primaryPlayer: defendHooker,
    secondaryPlayer: attackHooker,
    events,
  };
}
