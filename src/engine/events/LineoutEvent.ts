import type { PhaseContext, PhaseResult } from './types';
import type { MatchEvent } from '../../types/matchEvent';
import { MatchPhase } from '../../types/engine';
import { resolveLineout } from '../resolvers/LineoutResolver';
import { rng } from '../../utils/rng';
import { LINEOUT_VALUES } from '../balance';
import { availableForwards, onFieldPlayers } from '../FieldPosition';

export function handleLineout({ state, attackTeam, defendTeam }: PhaseContext): PhaseResult {
  const attackSide = state.possession;
  const flipSide: 'home' | 'away' = attackSide === 'home' ? 'away' : 'home';

  // Hooker (#2) and jumpers (#4/#5/#6) filtered to on-field players; if a
  // primary jumper is sin-binned, the find() chain falls back to the next
  // available forward — weaker jumper score is the natural penalty for being
  // a forward down at the lineout.
  const attackFwds   = availableForwards(attackTeam, state, attackSide);
  const defendFwds   = availableForwards(defendTeam, state, flipSide);
  const attackOnField = onFieldPlayers(attackTeam, state, attackSide);
  const defendOnField = onFieldPlayers(defendTeam, state, flipSide);
  const hooker       = attackFwds.find(p => p.id === 2) ?? attackFwds[0] ?? attackOnField[0]!;
  const jumperIds    = LINEOUT_VALUES.jumperIds;
  const chosenId     = jumperIds[rng(0, jumperIds.length - 1)];
  const attackJumper = attackFwds.find(p => p.id === chosenId)
                    ?? attackFwds.find(p => p.id === 4)
                    ?? attackFwds[0]
                    ?? attackOnField[0]!;
  const defendJumper = defendFwds.find(p => p.id === 4)
                    ?? defendFwds.find(p => p.id === 5)
                    ?? defendFwds.find(p => p.id === 6)
                    ?? defendFwds[0]
                    ?? defendOnField[0]!;
  const res = resolveLineout(hooker, attackJumper, defendJumper);

  const events: MatchEvent[] = [
    { type: 'LINEOUT_THROWN', hooker },
  ];

  if (res.result === 'crooked_throw') {
    events.push({
      type: 'LINEOUT_RESOLVED',
      outcome: 'crooked_throw',
      hooker, attackJumper, defendJumper,
      attackSide, possessionSideAfter: flipSide,
    });
    return {
      nextPhase: MatchPhase.Scrum,
      narration: { steps: [{ kind: 'phase_outcome', phase: MatchPhase.Lineout, key: 'crooked_throw', primary: hooker }] },
      primaryPlayer: hooker,
      events,
    };
  }

  if (res.result === 'clean_catch') {
    events.push({
      type: 'LINEOUT_RESOLVED',
      outcome: 'clean_catch',
      hooker, attackJumper, defendJumper,
      attackSide, possessionSideAfter: attackSide,
    });
    return {
      nextPhase: MatchPhase.FirstPhase,
      // narration step's secondary is the hooker (thrower) for {secondary} interpolation;
      // PhaseResult.secondaryPlayer is the defend jumper (the contested defender) for stats.
      narration: { steps: [{ kind: 'phase_outcome', phase: MatchPhase.Lineout, key: 'clean_catch', primary: attackJumper, secondary: hooker }] },
      primaryPlayer: attackJumper,
      secondaryPlayer: defendJumper,
      events,
    };
  }

  if (res.result === 'scrappy_knock_on') {
    events.push({
      type: 'LINEOUT_RESOLVED',
      outcome: 'scrappy_knock_on',
      hooker, attackJumper, defendJumper,
      attackSide, possessionSideAfter: flipSide,
    });
    return {
      nextPhase: MatchPhase.Scrum,
      narration: { steps: [{ kind: 'phase_outcome', phase: MatchPhase.Lineout, key: 'scrappy_knock_on', primary: attackJumper, secondary: defendJumper }] },
      primaryPlayer: attackJumper,
      secondaryPlayer: defendJumper,
      events,
    };
  }

  // steal
  events.push({
    type: 'LINEOUT_RESOLVED',
    outcome: 'steal',
    hooker, attackJumper, defendJumper,
    attackSide, possessionSideAfter: flipSide,
  });
  return {
    nextPhase: MatchPhase.FirstPhase,
    narration: { steps: [{ kind: 'phase_outcome', phase: MatchPhase.Lineout, key: 'steal', primary: defendJumper, secondary: attackJumper }] },
    primaryPlayer: defendJumper,
    secondaryPlayer: attackJumper,
    events,
  };
}
