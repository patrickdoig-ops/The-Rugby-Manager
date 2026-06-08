import type { PhaseContext, PhaseResult } from './types';
import type { MatchEvent } from '../../types/matchEvent';
import type { Player } from '../../types/player';
import { MatchPhase } from '../../types/engine';
import { resolveMaul } from '../resolvers/MaulResolver';
import { availableForwards, onFieldPlayers, attackDir, isTryScoredAt } from '../FieldPosition';
import { rng } from '../../utils/rng';
import { clamp } from '../../utils/math';
import { SLOT } from '../Slot';
import { TACTIC_MODIFIERS } from '../balance';
import { effIntensityScalar, effDisciplineScalar } from '../tacticsResolve';

// Random forward from the cited side — mirrors ScrumEvent.pickFrontRowOffender
// but draws from the whole pack (a maul collapse is typically a defender
// dragging the ball-carrier down or pulling the maul to ground, which any
// pack member can do). Falls back to the hooker if the pack is empty.
function pickPackOffender(pack: Player[], hookerFallback: Player): Player {
  if (pack.length === 0) return hookerFallback;
  return pack[rng(0, pack.length - 1)];
}

// Hooker pick mirrors LineoutEvent's fallback chain — exact #2 first, then
// any available forward, then any on-field player. The hooker is the canonical
// maul finisher (controls the ball at the back of the drive); on a try crossing,
// they're credited as the scorer via TryScoredEvent reading lastEvent.primaryPlayer.
function pickHooker(forwards: Player[], onField: Player[]): Player {
  return forwards.find(p => p.id === SLOT.HOOKER) ?? forwards[0] ?? onField[0]!;
}

export function handleMaul({ state, attackTeam, defendTeam }: PhaseContext): PhaseResult {
  const attackSide = state.possession;
  const flipSide: 'home' | 'away' = attackSide === 'home' ? 'away' : 'home';

  const attackForwards = availableForwards(attackTeam, state, attackSide);
  const defendForwards = availableForwards(defendTeam, state, flipSide);
  const attackOnField  = onFieldPlayers(attackTeam, state, attackSide);
  const defendOnField  = onFieldPlayers(defendTeam, state, flipSide);
  const attackHooker   = pickHooker(attackForwards, attackOnField);
  const defendHooker   = pickHooker(defendForwards, defendOnField);

  // Intensity adds a flat drive edge to each side; the defender's discipline
  // biases the cynical-collapse roll (risky cracks more to stop the drive).
  const res = resolveMaul(
    attackForwards, defendForwards,
    effIntensityScalar(attackTeam, TACTIC_MODIFIERS.intensityMaulMod),
    effIntensityScalar(defendTeam, TACTIC_MODIFIERS.intensityMaulMod),
    effDisciplineScalar(defendTeam, TACTIC_MODIFIERS.disciplineMaulCollapseMod),
  );

  const events: MatchEvent[] = [
    { type: 'BREAKDOWN_MOD_SET', attack: 0, defend: 0 },
  ];

  if (res.result === 'maul_won') {
    // Advance the ball by the drive gain, then check whether it crossed the
    // try line. If yes → TryScored with the hooker as primaryPlayer so the
    // try is credited to them. If no → FirstPhase with possession intact.
    const projectedBallX = clamp(state.ball.x + attackDir(state) * res.gainMetres, 0, 100);
    const tryScored = isTryScoredAt(projectedBallX, attackSide, state.clock.halfTimeDone);

    events.push({
      type: 'MAUL_RESOLVED',
      outcome: 'maul_won',
      attackForwards, defendForwards,
      attackSide,
      possessionSideAfter: attackSide,
      gainMetres: res.gainMetres,
    });
    events.push({ type: 'BALL_REPOSITIONED', x: projectedBallX });

    if (tryScored) {
      return {
        nextPhase: MatchPhase.TryScored,
        narration: {
          steps: [
            { kind: 'announcement', key: 'maul_drive_strong' },
            { kind: 'phase_outcome', phase: MatchPhase.Maul, key: 'maul_try', primary: attackHooker },
          ],
        },
        primaryPlayer: attackHooker,
        secondaryPlayer: defendHooker,
        events,
      };
    }

    return {
      nextPhase: MatchPhase.FirstPhase,
      narration: { steps: [{ kind: 'phase_outcome', phase: MatchPhase.Maul, key: 'maul_won', primary: attackHooker, secondary: defendHooker }] },
      primaryPlayer: attackHooker,
      secondaryPlayer: defendHooker,
      events,
    };
  }

  if (res.result === 'maul_held') {
    // Defenders stop the drive, the ball doesn't come out cleanly,
    // turnover scrum to the defending side. No ground gained.
    events.push({
      type: 'MAUL_RESOLVED',
      outcome: 'maul_held',
      attackForwards, defendForwards,
      attackSide,
      possessionSideAfter: flipSide,
      gainMetres: 0,
    });
    return {
      nextPhase: MatchPhase.Scrum,
      narration: { steps: [{ kind: 'phase_outcome', phase: MatchPhase.Maul, key: 'maul_held', primary: defendHooker, secondary: attackHooker }] },
      primaryPlayer: defendHooker,
      secondaryPlayer: attackHooker,
      events,
    };
  }

  // maul_collapse_penalty — defending side cited for illegally bringing
  // the maul down. Penalty to the attacking team; CardHandler's
  // maul_collapse branch may convert this into a yellow card on top
  // (zone-scaled probability — see MAUL_COLLAPSE_YELLOW).
  const defendOffender = pickPackOffender(defendForwards, defendHooker);
  events.push({
    type: 'MAUL_RESOLVED',
    outcome: 'maul_collapse_penalty',
    attackForwards, defendForwards,
    attackSide,
    possessionSideAfter: attackSide,
    gainMetres: 0,
  });
  events.push({
    type: 'PENALTY_AWARDED',
    offence: 'maul_collapse',
    offender: defendOffender,
    offendingSide: flipSide,
  });
  return {
    nextPhase: MatchPhase.Penalty,
    narration: { steps: [{ kind: 'phase_outcome', phase: MatchPhase.Maul, key: 'maul_collapse_penalty', primary: defendOffender, secondary: attackHooker }] },
    primaryPlayer: attackHooker,
    secondaryPlayer: defendOffender,
    events,
  };
}
