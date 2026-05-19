import type { MatchState, GameEvent } from '../types/match';
import { MatchPhase, type KickOffStrategy } from '../types/engine';
import type { StateMachine } from './StateMachine';
import { rng } from '../utils/rng';
import { makeId } from './eventId';
import { attackDir, isTryScored, inOpposition22, inOppositionHalf, inOwn22, inOwnHalf } from './FieldPosition';
import type { PhaseContext, PhaseResult } from './events/types';
import { handleKickOff }        from './events/KickOffEvent';
import { handlePhasePlay }      from './events/OpenPlayEvent';
import { handleFirstPhase }     from './events/FirstPhaseEvent';
import { handleKickReturn }     from './events/KickReturnEvent';
import { handleBreakdown }      from './events/BreakdownEvent';
import { handleScrum }          from './events/ScrumEvent';
import { handleLineout }        from './events/LineoutEvent';
import { handleTacticalKick }   from './events/TacticalKickEvent';
import { handleBoxKick }        from './events/BoxKickEvent';
import { handleTryScored }      from './events/TryScoredEvent';
import { handleConversionKick } from './events/ConversionKickEvent';

const PHASE_HANDLERS: Partial<Record<MatchPhase, (ctx: PhaseContext) => PhaseResult>> = {
  [MatchPhase.KickOff]:        handleKickOff,
  [MatchPhase.PhasePlay]:      handlePhasePlay,
  [MatchPhase.FirstPhase]:     handleFirstPhase,
  [MatchPhase.KickReturn]:     handleKickReturn,
  [MatchPhase.Breakdown]:      handleBreakdown,
  [MatchPhase.Scrum]:          handleScrum,
  [MatchPhase.Lineout]:        handleLineout,
  [MatchPhase.TacticalKick]:   handleTacticalKick,
  [MatchPhase.BoxKick]:        handleBoxKick,
  [MatchPhase.TryScored]:      handleTryScored,
  [MatchPhase.ConversionKick]: handleConversionKick,
};

// Builds a "template" GameEvent populated with the current state's possession context.
// Used to seed the PhaseContext and as a base for one-off announce / coin-toss / penalty
// commentary events outside the main resolver pipeline.
export function draftEvent(state: MatchState, phase: MatchPhase): GameEvent {
  const team    = state.possession === 'home' ? state.homeTeam : state.awayTeam;
  const defTeam = state.possession === 'home' ? state.awayTeam : state.homeTeam;
  return {
    id: '',
    gameMinute: state.gameMinute,
    phase,
    side: state.possession,
    sideName: team.name,
    defSideName: defTeam.name,
    ballX: state.ballX,
    ballY: state.ballY,
    commentary: '',
  };
}

export function resolvePhase(state: MatchState, sm: StateMachine, kickOffStrategy: KickOffStrategy): GameEvent {
  const attackTeam = state.possession === 'home' ? state.homeTeam : state.awayTeam;
  const defendTeam = state.possession === 'home' ? state.awayTeam : state.homeTeam;
  // Capture before the handler runs — possession may flip inside the handler.
  // ConversionKick flips possession to set up the kick-off, but the event itself
  // belongs to the scoring team, so we preserve the pre-handler side for that case.
  const phaseAtStart    = state.phase;
  const sideAtStart     = state.possession;
  const sideNameAtStart = attackTeam.name;

  const ctx: PhaseContext = {
    state,
    attackTeam,
    defendTeam,
    attackDir:        () => attackDir(state),
    isTryScored:      () => isTryScored(state),
    inOpposition22:   () => inOpposition22(state),
    inOppositionHalf: () => inOppositionHalf(state),
    inOwn22:          () => inOwn22(state),
    inOwnHalf:        () => inOwnHalf(state),
    randomPlayer: (team) => team.players[rng(0, team.players.length - 1)],
    pickPlayer:   (team, ...ids) => team.players.find(p => ids.includes(p.id)) ?? team.players[0],
    draftEvent:   (phase) => draftEvent(state, phase),
    kickOffStrategy,
  };

  const handler = PHASE_HANDLERS[state.phase];
  const { nextPhase, commentary, primaryPlayer, secondaryPlayer, outcome } = handler
    ? handler(ctx)
    : { nextPhase: state.phase, commentary: 'Match event.', primaryPlayer: undefined, secondaryPlayer: undefined, outcome: undefined };

  try {
    sm.transition(nextPhase);
  } catch {
    sm.forceTransition(nextPhase);
  }
  state.phase = nextPhase;

  const isConversion = phaseAtStart === MatchPhase.ConversionKick;
  // Carry phases that score a try emit with TryScored phase so they get the try highlight.
  // All other events use the phase being resolved (phaseAtStart), not the next phase.
  const isCarryToTry = (
    phaseAtStart === MatchPhase.PhasePlay ||
    phaseAtStart === MatchPhase.FirstPhase ||
    phaseAtStart === MatchPhase.KickReturn
  ) && nextPhase === MatchPhase.TryScored;
  const eventPhase = isCarryToTry ? MatchPhase.TryScored : phaseAtStart;
  return {
    id: makeId(),
    gameMinute: state.gameMinute,
    phase: eventPhase,
    side:     isConversion ? sideAtStart     : state.possession,
    sideName: isConversion ? sideNameAtStart : (state.possession === 'home' ? state.homeTeam : state.awayTeam).name,
    primaryPlayer,
    secondaryPlayer,
    ballX: state.ballX,
    ballY: state.ballY,
    commentary,
    outcome,
  };
}
