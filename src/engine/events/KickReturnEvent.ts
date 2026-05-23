import type { PhaseContext, PhaseResult } from './types';
import type { MatchEvent } from '../../types/matchEvent';
import type { NarrationDescriptor } from '../../types/narration';
import { MatchPhase } from '../../types/engine';
import { resolveOpenPlay } from '../resolvers/OpenPlayResolver';
import { tackleInfringement } from '../resolvers/TackleInfringementResolver';
import { tryLandingY, tryLocationBand } from '../resolvers/TryLocationResolver';
import { attackDir, isTryScoredAt, onFieldPlayers, availableBacks } from '../FieldPosition';
import { homeEdge } from '../HomeAdvantage';
import { rng } from '../../utils/rng';
import { clamp } from '../../utils/math';
import { HOME_ADVANTAGE, KICK_RETURN_VALUES, TACTIC_MODIFIERS, COMMENTARY_CHANCES, SHORT_HANDED } from '../balance';
import { decideKick, buildKickTransition } from '../KickDecisionDirector';

const FULL_BACKLINE = 7;

export function handleKickReturn({ state, attackTeam, defendTeam, randomPlayer }: PhaseContext): PhaseResult {
  const attackSide = state.possession;
  const defSide: 'home' | 'away' = attackSide === 'home' ? 'away' : 'home';
  const attackOnField = onFieldPlayers(attackTeam, state, attackSide);
  const defendOnField = onFieldPlayers(defendTeam, state, defSide);

  // Step 0 — Kick or carry decision (see KickDecisionDirector)
  const decision = decideKick({ state, attackTeam, attackOnField });
  if (decision.kick) {
    return buildKickTransition(decision, MatchPhase.KickReturn);
  }

  // Step 1 — Carrier is whoever caught the kick; no handling gate
  const carrier = state.kickReturnCarrier ?? (attackOnField.length > 0 ? attackOnField[rng(0, attackOnField.length - 1)] : randomPlayer(attackTeam));
  const defender = defendOnField.length > 0 ? defendOnField[rng(0, defendOnField.length - 1)] : randomPlayer(defendTeam);

  const { attack: attackMod, defend: defendMod } = state.breakdownMod;
  const events: MatchEvent[] = [
    { type: 'KICK_RETURN_CARRIER_SET', player: undefined },
    { type: 'BREAKDOWN_MOD_SET', attack: 0, defend: 0 },
  ];

  const backfieldPenalty = TACTIC_MODIFIERS.backfieldLineBreakPenalty[defendTeam.tactics.backfieldDefence];
  const missingBacks = FULL_BACKLINE - availableBacks(defendTeam, state, defSide).length;
  const shortHandedMod = missingBacks * SHORT_HANDED.missingBackDefendPenalty;

  // Step 2 — Run: carrier pace/agility vs chaser pace/tackling
  const runAttack = (carrier.currentStats.pace + carrier.currentStats.agility) / 2 + rng(1, 20);
  const runDefend = (defender.currentStats.pace + defender.currentStats.tackling) / 2 + rng(1, 20);
  const runRange  = runAttack >= runDefend ? KICK_RETURN_VALUES.successfulRunMetres : KICK_RETURN_VALUES.failedRunMetres;
  const runMetres = rng(runRange[0], runRange[1]);

  // Step 3 — Evasion → Step 4 Collision
  const ha = homeEdge(state, HOME_ADVANTAGE.carryMod);
  const defensiveLine = defendTeam.tactics.defensiveLine;
  const dlEvasion   = TACTIC_MODIFIERS.defensiveLineEvasionMod[defensiveLine];
  const dlCollision = TACTIC_MODIFIERS.defensiveLineCollisionMod[defensiveLine];
  const res = resolveOpenPlay(
    carrier, defender,
    attackMod + ha.attack,
    defendMod + backfieldPenalty + shortHandedMod + dlEvasion + ha.defend,
    dlCollision,
  );
  if (res.outcome === 'line_break') {
    res.gainMetres += TACTIC_MODIFIERS.defensiveLineBreakBonus[defensiveLine];
  }
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

  // Try check — any forward-progress carry whose projected ballX
  // (run metres + carry metres combined) crosses the try line scores.
  // Line breaks AND dominant carries qualify. See OpenPlayEvent for
  // the full rationale.
  const projectedBallX = clamp(state.ball.x + direction * totalMetres, 0, 100);
  const canScore = res.outcome === 'line_break' || res.outcome === 'dominant_carry';
  const tryScored = canScore && isTryScoredAt(projectedBallX, attackSide, state.clock.halfTimeDone);

  if (tryScored) {
    nextPhase = MatchPhase.TryScored;
    const tryKey: 'line_break_try' | 'dominant_carry_try' =
      res.outcome === 'line_break' ? 'line_break_try' : 'dominant_carry_try';
    steps.push({ kind: 'phase_outcome', phase: MatchPhase.KickReturn, key: tryKey, primary: carrier, secondary: defender });
    const y = tryLandingY(attackTeam.tactics.attackingStyle);
    events.push({ type: 'BALL_REPOSITIONED', y });
    steps.push({ kind: 'announcement', key: `try_location_${tryLocationBand(y)}` });
  } else if (res.outcome === 'line_break') {
    nextPhase = MatchPhase.Breakdown;
    steps.push({ kind: 'phase_outcome', phase: MatchPhase.KickReturn, key: 'line_break', primary: carrier, secondary: defender });
    if (backfieldPenalty < 0) {
      steps.push({
        kind: 'tactic_note',
        cause: 'line_break_backfield_thin',
        chancePct: COMMENTARY_CHANCES.lineBreakBackfieldThin,
        params: { defendTeamName: defendTeam.name, backfieldDefence: defendTeam.tactics.backfieldDefence },
      });
    }
    if (defensiveLine === 'blitz') {
      steps.push({
        kind: 'tactic_note',
        cause: 'blitz_line_break_punished',
        chancePct: COMMENTARY_CHANCES.blitzLineBreakPunished,
        params: { defendTeamName: defendTeam.name, attackTeamName: attackTeam.name },
      });
    }
  } else if (res.outcome === 'dominant_tackle') {
    nextPhase = MatchPhase.Breakdown;
    steps.push({ kind: 'phase_outcome', phase: MatchPhase.KickReturn, key: 'dominant_tackle', primary: carrier, secondary: defender });
    if (defensiveLine === 'blitz') {
      steps.push({
        kind: 'tactic_note',
        cause: 'blitz_dominant_tackle',
        chancePct: COMMENTARY_CHANCES.blitzDominantTackle,
        params: { defendTeamName: defendTeam.name, attackTeamName: attackTeam.name },
      });
    }
  } else {
    nextPhase = MatchPhase.Breakdown;
    steps.push({ kind: 'phase_outcome', phase: MatchPhase.KickReturn, key: res.outcome, primary: carrier, secondary: defender });
    if (defensiveLine === 'drift' && res.outcome === 'play_on') {
      steps.push({
        kind: 'tactic_note',
        cause: 'drift_shepherd_to_touch',
        chancePct: COMMENTARY_CHANCES.driftShepherdToTouch,
        params: { defendTeamName: defendTeam.name, attackTeamName: attackTeam.name },
      });
    }
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
