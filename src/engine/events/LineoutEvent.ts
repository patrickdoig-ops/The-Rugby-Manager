import type { PhaseContext, PhaseResult } from './types';
import type { MatchEvent } from '../../types/matchEvent';
import { MatchPhase } from '../../types/engine';
import { resolveLineout } from '../resolvers/LineoutResolver';
import { getCommentary } from '../CommentaryEngine';
import { rng } from '../../utils/rng';

export function handleLineout({ state, attackTeam, defendTeam, pickPlayer, draftEvent }: PhaseContext): PhaseResult {
  const hooker       = pickPlayer(attackTeam, 2);
  const jumperIds    = [4, 5, 7];
  const chosenId     = jumperIds[rng(0, 2)];
  const attackJumper = attackTeam.players.find(p => p.id === chosenId)
                    ?? attackTeam.players.find(p => p.id === 4)
                    ?? attackTeam.players[0];
  const defendJumper = pickPlayer(defendTeam, 4, 5, 6);
  const res = resolveLineout(hooker, attackJumper, defendJumper);

  const attackSide = state.possession;
  const flipSide: 'home' | 'away' = attackSide === 'home' ? 'away' : 'home';

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
      commentary: getCommentary({ ...draftEvent(MatchPhase.Lineout), primaryPlayer: hooker }, 'crooked_throw'),
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
      // secondaryPlayer in commentary is the hooker (thrower); in the event it is the defend jumper
      commentary: getCommentary({ ...draftEvent(MatchPhase.Lineout), primaryPlayer: attackJumper, secondaryPlayer: hooker }, 'clean_catch'),
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
      commentary: getCommentary({ ...draftEvent(MatchPhase.Lineout), primaryPlayer: attackJumper, secondaryPlayer: defendJumper }, 'scrappy_knock_on'),
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
    commentary: getCommentary({ ...draftEvent(MatchPhase.Lineout), primaryPlayer: defendJumper, secondaryPlayer: attackJumper }, 'steal'),
    narration: { steps: [{ kind: 'phase_outcome', phase: MatchPhase.Lineout, key: 'steal', primary: defendJumper, secondary: attackJumper }] },
    primaryPlayer: defendJumper,
    secondaryPlayer: attackJumper,
    events,
  };
}
