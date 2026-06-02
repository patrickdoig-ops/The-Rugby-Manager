import type { PhaseContext, PhaseResult } from './types';
import type { MatchEvent } from '../../types/matchEvent';
import type { NarrationDescriptor } from '../../types/narration';
import { MatchPhase } from '../../types/engine';
import { resolveBoxKick } from '../resolvers/BoxKickResolver';
import { rng } from '../../utils/rng';
import { clamp } from '../../utils/math';
import { TACTIC_MODIFIERS, COMMENTARY_CHANCES } from '../balance';
import { attackDir, onFieldPlayers, pickScrumHalf, pickFullback } from '../FieldPosition';
import { boxKickLandingY, lineoutFormationY } from '../Lateral';
import { SLOT } from '../Slot';

export function handleBoxKick({ state, attackTeam, defendTeam, randomPlayer }: PhaseContext): PhaseResult {
  const attackSide = state.possession;
  const defendSide: 'home' | 'away' = attackSide === 'home' ? 'away' : 'home';
  const scrumHalf  = pickScrumHalf(attackTeam, state, attackSide);
  const wingerPool = onFieldPlayers(attackTeam, state, attackSide).filter(p => p.id === SLOT.WING_11 || p.id === SLOT.WING_14);
  const winger     = wingerPool.length > 0 ? wingerPool[rng(0, wingerPool.length - 1)] : randomPlayer(attackTeam);
  const fullback   = pickFullback(defendTeam, state, defendSide);
  const backfield = defendTeam.tactics.backfieldDefence;
  const fullbackMod = TACTIC_MODIFIERS.boxKickFullbackBonus[backfield];
  // KickDecisionDirector's clearance sub-choice (long_and_on vs
  // long_and_off) routes through state.pendingKick. Only used by the
  // touch-finder branch in the resolver; other families ignore it.
  const clearanceStyle = state.pendingKick?.family === 'clearance' ? state.pendingKick.clearanceStyle : undefined;
  const res = resolveBoxKick(scrumHalf, winger, fullback, fullbackMod, clearanceStyle);

  const events: MatchEvent[] = [
    { type: 'KICK_FROM_HAND', kicker: scrumHalf, metres: res.distance },
    // Box kicks are nearly straight (±5°) so the chaser can compete under it.
    { type: 'BALL_REPOSITIONED', x: clamp(state.ball.x + attackDir(state) * res.distance, 5, 95), y: boxKickLandingY(state, res.distance) },
  ];

  if (res.outcome === 'goes_to_touch') {
    // Long-and-off clearance found touch. Opposition gets the lineout
    // throw, but the kicking team has cleared the danger zone.
    events.push({ type: 'BALL_REPOSITIONED', y: lineoutFormationY(state) });
    events.push({ type: 'POSSESSION_SWAPPED' });
    return {
      nextPhase: MatchPhase.Lineout,
      narration: { steps: [{ kind: 'phase_outcome', phase: MatchPhase.BoxKick, key: 'box_kick_to_touch', primary: scrumHalf }] },
      primaryPlayer: scrumHalf,
      events,
    };
  }

  if (res.outcome === 'attack_retain') {
    events.push({ type: 'KICK_RETURN_CARRIER_SET', player: winger });
    return {
      nextPhase: MatchPhase.KickReturn,
      narration: { steps: [{ kind: 'phase_outcome', phase: MatchPhase.BoxKick, key: 'attack_retain', primary: scrumHalf, secondary: winger }] },
      primaryPlayer: scrumHalf,
      secondaryPlayer: winger,
      events,
    };
  }

  if (res.outcome === 'defend_knock_on') {
    events.push({ type: 'HANDLING_ERROR', side: defendSide });
    return {
      nextPhase: MatchPhase.Scrum,
      narration: { steps: [{ kind: 'phase_outcome', phase: MatchPhase.BoxKick, key: 'defend_knock_on', primary: scrumHalf, secondary: winger }] },
      primaryPlayer: scrumHalf,
      secondaryPlayer: winger,
      events,
    };
  }

  if (res.outcome === 'defend_catch_contested') {
    events.push({ type: 'POSSESSION_SWAPPED' });
    events.push({ type: 'KICK_RETURN_CARRIER_SET', player: fullback });
    return {
      nextPhase: MatchPhase.KickReturn,
      narration: { steps: [{ kind: 'phase_outcome', phase: MatchPhase.BoxKick, key: 'defend_catch_contested', primary: scrumHalf, secondary: fullback }] },
      primaryPlayer: scrumHalf,
      secondaryPlayer: fullback,
      events,
    };
  }

  if (res.outcome === 'defend_catch') {
    events.push({ type: 'POSSESSION_SWAPPED' });
    events.push({ type: 'KICK_RETURN_CARRIER_SET', player: fullback });
    const steps: NarrationDescriptor['steps'] = [
      { kind: 'phase_outcome', phase: MatchPhase.BoxKick, key: 'defend_catch', primary: scrumHalf, secondary: fullback },
    ];
    if (fullbackMod > 0) {
      steps.push({
        kind: 'tactic_note',
        cause: 'boxkick_backfield_caught',
        chancePct: COMMENTARY_CHANCES.boxKickBackfieldCaught,
        params: { defendTeamName: defendTeam.name, fullback, backfieldDefence: defendTeam.tactics.backfieldDefence },
      });
    }
    return {
      nextPhase: MatchPhase.KickReturn,
      narration: { steps },
      primaryPlayer: scrumHalf,
      secondaryPlayer: fullback,
      events,
    };
  }

  // knock_on — poor kick, fullback drops uncontested
  events.push({ type: 'HANDLING_ERROR', side: defendSide });
  return {
    nextPhase: MatchPhase.Scrum,
    narration: { steps: [{ kind: 'phase_outcome', phase: MatchPhase.BoxKick, key: 'knock_on', primary: scrumHalf, secondary: fullback }] },
    primaryPlayer: scrumHalf,
    secondaryPlayer: fullback,
    events,
  };
}
