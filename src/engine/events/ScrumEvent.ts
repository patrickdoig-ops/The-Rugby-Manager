import type { PhaseContext, PhaseResult } from './types';
import type { MatchEvent } from '../../types/matchEvent';
import { MatchPhase } from '../../types/engine';
import { resolveScrum } from '../resolvers/ScrumResolver';

export function handleScrum({ state, attackTeam, defendTeam }: PhaseContext): PhaseResult {
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
      attackSide,
      possessionSideAfter: attackSide,
    });
    return {
      nextPhase: MatchPhase.Penalty,
      narration: { steps: [{ kind: 'phase_outcome', phase: MatchPhase.Scrum, key: 'attacking_dominant_penalty', primary: defendHooker, secondary: attackHooker }] },
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
      attackSide,
      possessionSideAfter: attackSide,
    });
    return {
      nextPhase: MatchPhase.FirstPhase,
      narration: { steps: [{ kind: 'phase_outcome', phase: MatchPhase.Scrum, key: 'stable_win', primary: attackHooker, secondary: defendHooker }] },
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
      attackSide,
      possessionSideAfter: attackSide,
    });
    return {
      nextPhase: MatchPhase.Scrum,
      narration: { steps: [{ kind: 'phase_outcome', phase: MatchPhase.Scrum, key: 'wheel', primary: attackHooker, secondary: defendHooker }] },
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
    attackSide,
    possessionSideAfter: flipSide,
  });
  return {
    nextPhase: MatchPhase.Penalty,
    narration: { steps: [{ kind: 'phase_outcome', phase: MatchPhase.Scrum, key: 'defending_dominant_penalty', primary: attackHooker, secondary: defendHooker }] },
    primaryPlayer: defendHooker,
    secondaryPlayer: attackHooker,
    events,
  };
}
