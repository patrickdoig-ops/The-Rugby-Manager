import type { PhaseContext, PhaseResult } from './types';
import type { MatchEvent } from '../../types/matchEvent';
import type { NarrationDescriptor } from '../../types/narration';
import { MatchPhase } from '../../types/engine';
import { resolveOpenPlay } from '../resolvers/OpenPlayResolver';
import { tackleInfringement } from '../resolvers/TackleInfringementResolver';
import { tryLandingY, tryLocationBand } from '../resolvers/TryLocationResolver';
import { attackDir, isTryScoredAt, onFieldPlayers, availableBacks, pickCoverDefender, pickKickReturnDefender, pickAssistTackler, pickPodCarrier } from '../FieldPosition';
import { homeEdge } from '../HomeAdvantage';
import { rng } from '../../utils/rng';
import { clamp } from '../../utils/math';
import { HOME_ADVANTAGE, KICK_RETURN_VALUES, TACTIC_MODIFIERS, COMMENTARY_CHANCES, SHORT_HANDED, POD_PICKUP_PCT } from '../balance';
import { decideKick, buildKickTransition } from '../KickDecisionDirector';
import { tryOffloadChain } from './offloadChain';
import type { NarrationStep } from '../../types/narration';

const FULL_BACKLINE = 7;

export function handleKickReturn({ state, attackTeam, defendTeam, randomPlayer }: PhaseContext): PhaseResult {
  const attackSide = state.possession;
  const defSide: 'home' | 'away' = attackSide === 'home' ? 'away' : 'home';
  const attackOnField = onFieldPlayers(attackTeam, state, attackSide);

  // Step 0 — Kick or carry decision (see KickDecisionDirector)
  const decision = decideKick({ state, attackTeam, attackOnField });
  if (decision.kick) {
    return buildKickTransition(decision, MatchPhase.KickReturn);
  }

  // Step 1 — Carrier is whoever caught the kick; no handling gate.
  // Defender is drawn from the chase pack — back-row + hookers do most of
  // the chase-and-tackle work (flat forward-weighted, no carrier awareness).
  let carrier = state.kickReturnCarrier ?? (attackOnField.length > 0 ? attackOnField[rng(0, attackOnField.length - 1)] : randomPlayer(attackTeam));

  // Pod pickup — catcher (typically FB / wing) pops to a trailing back-row
  // pod runner who actually takes contact. Tactics-keyed: tight teams build
  // platforms more, expansive teams let the backs run. Falls through to the
  // catcher when no back-row / lock is on the field.
  if (rng(1, 100) <= POD_PICKUP_PCT[attackTeam.tactics.attackingStyle]) {
    const pod = pickPodCarrier(attackTeam, state, attackSide, carrier);
    if (pod) carrier = pod;
  }

  let defender = pickKickReturnDefender(defendTeam, state, defSide);

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
  const baseAttackMod = attackMod + ha.attack;
  const baseDefendMod = defendMod + backfieldPenalty + shortHandedMod + dlEvasion + TACTIC_MODIFIERS.defendingBreakdownTackleMod[defendTeam.tactics.defendingBreakdown] + ha.defend;
  let res = resolveOpenPlay(carrier, defender, baseAttackMod, baseDefendMod, dlCollision);
  const direction = attackDir(state);

  let chainNarration: NarrationStep[] = [];
  let chainFired = false;
  if (res.outcome !== 'line_break') {
    const chain = tryOffloadChain({
      state, attackTeam, defendTeam, attackSide, defSide,
      phase: MatchPhase.KickReturn,
      initialRes: res, initialCarrier: carrier, initialDefender: defender,
      baseAttackMod, baseDefendMod, dlCollision, direction,
    });
    events.push(...chain.chainEvents);
    if (chain.knockedOn) {
      return {
        nextPhase: MatchPhase.Scrum,
        narration: { steps: chain.chainNarration },
        primaryPlayer: chain.finalCarrier,
        secondaryPlayer: chain.finalDefender,
        events,
      };
    }
    res = chain.finalRes;
    carrier = chain.finalCarrier;
    defender = chain.finalDefender;
    chainNarration = chain.chainNarration;
    chainFired = chain.chainFired;
  }

  if (res.outcome === 'line_break') {
    res.gainMetres += TACTIC_MODIFIERS.defensiveLineBreakBonus[defensiveLine];
  }
  // runMetres only credit on the original returner's contact metres — when
  // an offload fires, the new carrier picks up the ball at the contact
  // point and the kick-return run is already past.
  const totalMetres = chainFired ? res.gainMetres : runMetres + res.gainMetres;

  // Try check hoisted above CARRY_RESOLVED so the cover-tackler pick can
  // be gated on a non-try line break.
  const projectedBallX = clamp(state.ball.x + direction * totalMetres, 0, 100);
  const canScore = res.outcome === 'line_break' || res.outcome === 'dominant_carry';
  const tryScored = canScore && isTryScoredAt(projectedBallX, attackSide, state.clock.halfTimeDone);

  const coverTackler = res.outcome === 'line_break' && !tryScored
    ? pickCoverDefender(defendTeam, state, defSide)
    : undefined;

  const assistTackler = (res.outcome === 'dominant_carry' || res.outcome === 'play_on' || res.outcome === 'dominant_tackle')
    ? pickAssistTackler(defendTeam, state, defSide, defender)
    : undefined;

  events.push({
    type: 'CARRY_RESOLVED',
    carrier,
    defender,
    metres: totalMetres,
    direction,
    outcome: res.outcome,
    defSide,
    coverTackler,
    assistTackler,
  });

  let nextPhase: MatchPhase;
  const steps: NarrationDescriptor['steps'] = [...chainNarration];

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
    if (coverTackler) {
      steps.push({ kind: 'phase_outcome', phase: MatchPhase.KickReturn, key: 'cover_tackle', primary: carrier, secondary: coverTackler });
    }
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
