import type { MatchState, GameEvent } from '../types/match';
import { MatchPhase, type KickOffStrategy } from '../types/engine';
import { rng } from '../utils/rng';
import { makeId } from './eventId';
import type { PhaseContext, PhaseResult } from './events/types';
import { applyMatchEvent } from './applyMatchEvent';
import { handleKickOff }        from './events/KickOffEvent';
import { handleDropOut }        from './events/DropOutEvent';
import { handlePhasePlay }      from './events/OpenPlayEvent';
import { handleFirstPhase }     from './events/FirstPhaseEvent';
import { handleKickReturn }     from './events/KickReturnEvent';
import { handleBreakdown }      from './events/BreakdownEvent';
import { handleScrum }          from './events/ScrumEvent';
import { handleLineout }        from './events/LineoutEvent';
import { handleMaul }           from './events/MaulEvent';
import { handleTacticalKick }   from './events/TacticalKickEvent';
import { handleBoxKick }        from './events/BoxKickEvent';
import { handleTryScored }      from './events/TryScoredEvent';
import { handleConversionKick } from './events/ConversionKickEvent';

const PHASE_HANDLERS: Partial<Record<MatchPhase, (ctx: PhaseContext) => PhaseResult>> = {
  [MatchPhase.KickOff]:        handleKickOff,
  [MatchPhase.DropOut22]:      handleDropOut,
  [MatchPhase.PhasePlay]:      handlePhasePlay,
  [MatchPhase.FirstPhase]:     handleFirstPhase,
  [MatchPhase.KickReturn]:     handleKickReturn,
  [MatchPhase.Breakdown]:      handleBreakdown,
  [MatchPhase.Scrum]:          handleScrum,
  [MatchPhase.Lineout]:        handleLineout,
  [MatchPhase.Maul]:           handleMaul,
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
    gameMinute: state.clock.gameMinute,
    phase,
    side: state.possession,
    sideName: team.name,
    defSideName: defTeam.name,
    ballX: state.ball.x,
    ballY: state.ball.y,
    narration: { steps: [] },
  };
}

export function resolvePhase(state: MatchState, kickOffStrategy: KickOffStrategy): GameEvent {
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
    randomPlayer: (team) => team.players[rng(0, team.players.length - 1)],
    pickPlayer:   (team, ...ids) => team.players.find(p => ids.includes(p.id)) ?? team.players[0],
    draftEvent:   (phase) => draftEvent(state, phase),
    kickOffStrategy,
  };

  const handler = PHASE_HANDLERS[state.phase];
  if (!handler) {
    // Penalty / HalfTime / FullTime / Substitution are driven by orchestrators
    // outside resolvePhase. Reaching this branch means a programming error.
    throw new Error(`No phase handler registered for ${state.phase}`);
  }
  const result: PhaseResult = handler(ctx);

  // Apply all handler-emitted MatchEvents in order — these are the only mutations
  // the handler can make to MatchState / player stats. While applying, record a
  // keyframe after every ball-moving event so the GameEvent carries the in-phase
  // ball path (carry leg → lateral sweep → kick landing) for the 2D pitch to
  // animate through. Read-only over the path: no new mutation, no RNG draw.
  const movements: { x: number; y: number }[] = [];
  for (const e of result.events) {
    applyMatchEvent(state, e);
    if (e.type === 'CARRY_RESOLVED' || e.type === 'BALL_REPOSITIONED') {
      const last = movements[movements.length - 1];
      if (!last || last.x !== state.ball.x || last.y !== state.ball.y) {
        movements.push({ x: state.ball.x, y: state.ball.y });
      }
    }
  }

  // A carry that crossed the line transitions to TryScored with the scorer as
  // its primaryPlayer. Thread that player through state so handleTryScored reads
  // it next tick rather than re-deriving from the event log — an AI sub can land
  // between the two ticks and leave an opponent's substitution at the log tail.
  // Single chokepoint for every carry handler (PhasePlay / FirstPhase /
  // KickReturn / Maul). See pendingTryScorer in match.ts.
  if (result.nextPhase === MatchPhase.TryScored && result.primaryPlayer) {
    applyMatchEvent(state, { type: 'PENDING_TRY_SCORER_SET', scorer: result.primaryPlayer });
  }

  // Phase transition is its own MatchEvent — applyMatchEvent owns state.phase.
  applyMatchEvent(state, { type: 'PHASE_CHANGED', phase: result.nextPhase });

  // Ratings are a derived quantity recomputed from matchStats after every phase resolve.
  applyMatchEvent(state, { type: 'RATINGS_RECALCULATED' });

  const isConversion = phaseAtStart === MatchPhase.ConversionKick;
  // Conversion is the only phase whose narration is from the pre-swap
  // possession side: the kicker just scored, possession then flips to set
  // up the kick-off restart, but the event still belongs to the scoring
  // team. Kick-off outcomes (poor_kick / clean_receive) DO swap to the
  // receiver — and their {primary} + {side} both refer to the receiver
  // now in possession ("Scrum awarded to {side} at halfway", "Great start
  // for {side}"), so they must read state.possession after the swap.
  const preserveSide = isConversion;
  // Carry phases that score a try emit with TryScored phase so they get the try highlight.
  // All other events use the phase being resolved (phaseAtStart), not the next phase.
  const isCarryToTry = (
    phaseAtStart === MatchPhase.PhasePlay ||
    phaseAtStart === MatchPhase.FirstPhase ||
    phaseAtStart === MatchPhase.KickReturn ||
    phaseAtStart === MatchPhase.Maul
  ) && result.nextPhase === MatchPhase.TryScored;
  const eventPhase = isCarryToTry ? MatchPhase.TryScored : phaseAtStart;
  const sideName = preserveSide ? sideNameAtStart : (state.possession === 'home' ? state.homeTeam : state.awayTeam).name;
  const defSideName = preserveSide
    ? (sideAtStart === 'home' ? state.awayTeam.name : state.homeTeam.name)
    : (state.possession === 'home' ? state.awayTeam : state.homeTeam).name;
  return {
    id: makeId(),
    gameMinute: state.clock.gameMinute,
    phase: eventPhase,
    // Carry-to-try beats use phaseAtStart so the phase badge stays on the carry
    // phase until the TryScored handler's beat fires with the confirming commentary.
    displayPhase: isCarryToTry ? phaseAtStart : undefined,
    side:     preserveSide ? sideAtStart : state.possession,
    sideName,
    defSideName,
    primaryPlayer: result.primaryPlayer,
    secondaryPlayer: result.secondaryPlayer,
    ballX: state.ball.x,
    ballY: state.ball.y,
    movements: movements.length > 1 ? movements : undefined,
    narration: result.narration,
    outcome: result.outcome,
  };
}
