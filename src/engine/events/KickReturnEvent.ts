import type { PhaseContext, PhaseResult } from './types';
import type { MatchEvent } from '../../types/matchEvent';
import type { NarrationDescriptor } from '../../types/narration';
import { MatchPhase } from '../../types/engine';
import { resolveOpenPlay } from '../resolvers/OpenPlayResolver';
import { tackleInfringement } from '../resolvers/TackleInfringementResolver';
import { tryLandingY, tryLocationBand } from '../resolvers/TryLocationResolver';
import { attackDir, isTryScoredAt, inOwnHalf, inOwn22 } from '../FieldPosition';
import { homeEdge } from '../HomeAdvantage';
import { rng } from '../../utils/rng';
import { clamp } from '../../utils/math';
import { HOME_ADVANTAGE, KICK_PROBABILITIES, KICK_RETURN_VALUES, TACTIC_MODIFIERS, COMMENTARY_CHANCES } from '../balance';

export function handleKickReturn({ state, attackTeam, defendTeam, randomPlayer }: PhaseContext): PhaseResult {
  // Step 0 — Kick or carry decision
  const plan = attackTeam.tactics.attackingGamePlan;
  const probs = KICK_PROBABILITIES[plan];
  const kickProb = inOwn22(state) ? probs.own22 : (inOwnHalf(state) ? probs.ownHalf : probs.opposition);

  if (rng(1, 100) <= kickProb) {
    const flyHalf = attackTeam.players.find(p => p.id === 10) ?? attackTeam.players[0];
    return {
      nextPhase: MatchPhase.TacticalKick,
      narration: { steps: [{ kind: 'phase_outcome', phase: MatchPhase.KickReturn, key: 'kick_decision' }] },
      primaryPlayer: flyHalf,
      events: [
        { type: 'KICK_RETURN_CARRIER_SET', player: undefined },
        { type: 'BREAKDOWN_MOD_SET', attack: 0, defend: 0 },
      ],
    };
  }

  // Step 1 — Carrier is whoever caught the kick; no handling gate
  const carrier = state.kickReturnCarrier ?? randomPlayer(attackTeam);
  const defender = randomPlayer(defendTeam);
  const attackSide = state.possession;
  const defSide: 'home' | 'away' = attackSide === 'home' ? 'away' : 'home';

  const { attack: attackMod, defend: defendMod } = state.breakdownMod;
  const events: MatchEvent[] = [
    { type: 'KICK_RETURN_CARRIER_SET', player: undefined },
    { type: 'BREAKDOWN_MOD_SET', attack: 0, defend: 0 },
  ];

  const backfieldPenalty = TACTIC_MODIFIERS.backfieldLineBreakPenalty[defendTeam.tactics.backfieldDefence];

  // Step 2 — Run: carrier pace/agility vs chaser pace/tackling
  const runAttack = (carrier.currentStats.pace + carrier.currentStats.agility) / 2 + rng(1, 20);
  const runDefend = (defender.currentStats.pace + defender.currentStats.tackling) / 2 + rng(1, 20);
  const runRange  = runAttack >= runDefend ? KICK_RETURN_VALUES.successfulRunMetres : KICK_RETURN_VALUES.failedRunMetres;
  const runMetres = rng(runRange[0], runRange[1]);

  // Step 3 — Evasion → Step 4 Collision
  const ha = homeEdge(state, HOME_ADVANTAGE.carryMod);
  const res = resolveOpenPlay(carrier, defender, attackMod + ha.attack, defendMod + backfieldPenalty + ha.defend);
  const totalMetres = runMetres + res.gainMetres;
  const direction = attackDir(state);

  events.push({
    type: 'CARRY_RESOLVED',
    carrier,
    defender,
    metres: totalMetres,
    direction,
    outcome: res.outcome,
    defSide,
  });

  let nextPhase: MatchPhase;
  const steps: NarrationDescriptor['steps'] = [];

  if (res.outcome === 'line_break') {
    const projectedBallX = clamp(state.ball.x + direction * totalMetres, 0, 100);
    const tryScored = isTryScoredAt(projectedBallX, attackSide, state.clock.halfTimeDone);
    nextPhase = tryScored ? MatchPhase.TryScored : MatchPhase.Breakdown;
    if (tryScored) {
      steps.push({ kind: 'phase_outcome', phase: MatchPhase.KickReturn, key: 'line_break_try', primary: carrier, secondary: defender });
      const y = tryLandingY(attackTeam.tactics.attackingStyle);
      events.push({ type: 'BALL_REPOSITIONED', y });
      steps.push({ kind: 'announcement', key: `try_location_${tryLocationBand(y)}` });
    } else {
      steps.push({ kind: 'phase_outcome', phase: MatchPhase.KickReturn, key: 'line_break', primary: carrier, secondary: defender });
      if (backfieldPenalty < 0) {
        steps.push({
          kind: 'tactic_note',
          cause: 'line_break_backfield_thin',
          chancePct: COMMENTARY_CHANCES.lineBreakBackfieldThin,
          params: { defendTeamName: defendTeam.name, backfieldDefence: defendTeam.tactics.backfieldDefence },
        });
      }
    }
  } else if (res.outcome === 'dominant_tackle') {
    nextPhase = MatchPhase.Breakdown;
    steps.push({ kind: 'phase_outcome', phase: MatchPhase.KickReturn, key: 'dominant_tackle', primary: carrier, secondary: defender });
  } else {
    nextPhase = MatchPhase.Breakdown;
    steps.push({ kind: 'phase_outcome', phase: MatchPhase.KickReturn, key: res.outcome, primary: carrier, secondary: defender });
  }

  // High-tackle check: applies on top of the carry result (carrier keeps the
  // metres — advantage law). Skipped on line breaks.
  if (res.outcome !== 'line_break' && tackleInfringement(defender) === 'high_tackle') {
    events.push({ type: 'PENALTY_AWARDED', offence: 'high_tackle', offender: defender, offendingSide: defSide });
    steps.push({ kind: 'phase_outcome', phase: MatchPhase.KickReturn, key: 'high_tackle_penalty', primary: defender, secondary: carrier });
    nextPhase = MatchPhase.Penalty;
  }

  return {
    nextPhase,
    narration: { steps },
    primaryPlayer: carrier,
    secondaryPlayer: defender,
    outcome: res.outcome,
    events,
  };
}
