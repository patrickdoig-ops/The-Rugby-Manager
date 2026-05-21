import type { PhaseContext, PhaseResult } from './types';
import type { MatchEvent } from '../../types/matchEvent';
import { MatchPhase } from '../../types/engine';
import { resolveScrum } from '../resolvers/ScrumResolver';
import { availableForwards, onFieldPlayers } from '../FieldPosition';

export function handleScrum({ state, attackTeam, defendTeam }: PhaseContext): PhaseResult {
  const attackSide = state.possession;
  const flipSide: 'home' | 'away' = attackSide === 'home' ? 'away' : 'home';

  const attackForwards = availableForwards(attackTeam, state, attackSide);
  const defendForwards = availableForwards(defendTeam, state, flipSide);
  const attackFrontRow = attackForwards.filter(p => p.id <= 3);
  const defendFrontRow = defendForwards.filter(p => p.id <= 3);
  // Hooker (#2) — fallback to first available forward, then any on-field player,
  // covering the (extreme) case of all hookers off.
  const attackOnField  = onFieldPlayers(attackTeam, state, attackSide);
  const defendOnField  = onFieldPlayers(defendTeam, state, flipSide);
  const attackHooker   = attackForwards.find(p => p.id === 2) ?? attackForwards[0] ?? attackOnField[0]!;
  const defendHooker   = defendForwards.find(p => p.id === 2) ?? defendForwards[0] ?? defendOnField[0]!;
  const res = resolveScrum(attackForwards, defendForwards);

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
    events.push({
      type: 'PENALTY_AWARDED',
      offence: 'scrum_infringement',
      offender: defendHooker,
      offendingSide: flipSide,
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
  events.push({
    type: 'PENALTY_AWARDED',
    offence: 'scrum_infringement',
    offender: attackHooker,
    offendingSide: attackSide,
  });
  return {
    nextPhase: MatchPhase.Penalty,
    narration: { steps: [{ kind: 'phase_outcome', phase: MatchPhase.Scrum, key: 'defending_dominant_penalty', primary: attackHooker, secondary: defendHooker }] },
    primaryPlayer: defendHooker,
    secondaryPlayer: attackHooker,
    events,
  };
}
