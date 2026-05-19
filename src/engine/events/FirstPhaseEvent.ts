import type { PhaseContext, PhaseResult } from './types';
import type { MatchEvent } from '../../types/matchEvent';
import type { NarrationStep } from '../../types/narration';
import { MatchPhase } from '../../types/engine';
import { resolveOpenPlay } from '../resolvers/OpenPlayResolver';
import { isTryScoredAt } from '../FieldPosition';
import { rng } from '../../utils/rng';
import { clamp } from '../../utils/math';
import { KICK_PROBABILITIES, HARD_CARRY_THRESHOLDS, TACTIC_MODIFIERS, COMMENTARY_CHANCES, knockOnThreshold } from '../balance';

export function handleFirstPhase({ state, attackTeam, defendTeam, attackDir, isTryScored, inOwnHalf, inOwn22, randomPlayer, pickPlayer }: PhaseContext): PhaseResult {
  // Step 0 — Kick or carry decision
  const plan = attackTeam.tactics.attackingGamePlan;
  const probs = KICK_PROBABILITIES[plan];
  const kickProb = inOwn22() ? probs.own22 : (inOwnHalf() ? probs.ownHalf : probs.opposition);

  if (rng(1, 100) <= kickProb) {
    const flyHalf = attackTeam.players.find(p => p.id === 10) ?? attackTeam.players[0];
    return {
      nextPhase: MatchPhase.TacticalKick,
      narration: { steps: [{ kind: 'phase_outcome', phase: MatchPhase.FirstPhase, key: 'kick_decision' }] },
      primaryPlayer: flyHalf,
      events: [{ type: 'BREAKDOWN_MOD_SET', attack: 0, defend: 0 }],
    };
  }

  // Step 1 — Carrier is always #10 (fly-half); handling gate
  const carrier   = pickPlayer(attackTeam, 10);
  const scrumHalf = attackTeam.players.find(p => p.id === 9) ?? attackTeam.players[0];
  const attackSide = state.possession;
  const defSide: 'home' | 'away' = attackSide === 'home' ? 'away' : 'home';

  const events: MatchEvent[] = [
    { type: 'PASS_COMPLETED', passer: scrumHalf },
  ];

  const { attack: attackMod, defend: defendMod } = state.breakdownMod;
  events.push({ type: 'BREAKDOWN_MOD_SET', attack: 0, defend: 0 });

  const backfieldPenalty = TACTIC_MODIFIERS.backfieldLineBreakPenalty[defendTeam.tactics.backfieldDefence];

  if (carrier.currentStats.handling + rng(1, 100) < knockOnThreshold(carrier.currentStats.handling, state.clock.clockInTheRed)) {
    events.push({ type: 'KNOCK_ON', player: carrier, attackSide });
    const defender = randomPlayer(defendTeam);
    return {
      nextPhase: MatchPhase.Scrum,
      narration: { steps: [{ kind: 'phase_outcome', phase: MatchPhase.FirstPhase, key: 'knock_on', primary: carrier, secondary: defender }] },
      primaryPlayer: carrier,
      secondaryPlayer: defender,
      events,
    };
  }

  // Step 2 — Crash Ball or Wide Play
  const style = attackTeam.tactics.attackingStyle;
  const goCrashBall = rng(1, 100) <= HARD_CARRY_THRESHOLDS[style];

  let ballCarrier;
  let defender;
  // Structural pass steps prefix the outcome step in the descriptor (mirrors
  // the playIntro string concatenation in the previous implementation).
  const playIntroSteps: NarrationStep[] = [];

  if (goCrashBall) {
    // Crash Ball: #10 → #12 (inside centre)
    const insideCentre = pickPlayer(attackTeam, 12);
    playIntroSteps.push({ kind: 'phase_outcome', phase: MatchPhase.FirstPhase, key: 'crash_ball', primary: carrier, secondary: insideCentre });

    if (insideCentre.currentStats.handling + rng(1, 100) < knockOnThreshold(insideCentre.currentStats.handling, state.clock.clockInTheRed)) {
      events.push({ type: 'KNOCK_ON', player: insideCentre, attackSide });
      return {
        nextPhase: MatchPhase.Scrum,
        narration: { steps: [...playIntroSteps, { kind: 'phase_outcome', phase: MatchPhase.FirstPhase, key: 'knock_on', primary: insideCentre, secondary: carrier }] },
        primaryPlayer: insideCentre,
        secondaryPlayer: carrier,
        events,
      };
    }

    events.push({ type: 'PASS_COMPLETED', passer: carrier });
    ballCarrier = insideCentre;
    defender = pickPlayer(defendTeam, 12);
  } else {
    // Wide Play: #10 → #13 → random of #11/#14
    const outsideCentre = pickPlayer(attackTeam, 13);
    playIntroSteps.push({ kind: 'phase_outcome', phase: MatchPhase.FirstPhase, key: 'out_the_back', primary: carrier, secondary: outsideCentre });

    if (outsideCentre.currentStats.handling + rng(1, 100) < knockOnThreshold(outsideCentre.currentStats.handling, state.clock.clockInTheRed)) {
      events.push({ type: 'KNOCK_ON', player: outsideCentre, attackSide });
      return {
        nextPhase: MatchPhase.Scrum,
        narration: { steps: [...playIntroSteps, { kind: 'phase_outcome', phase: MatchPhase.FirstPhase, key: 'knock_on', primary: outsideCentre, secondary: carrier }] },
        primaryPlayer: outsideCentre,
        secondaryPlayer: carrier,
        events,
      };
    }

    events.push({ type: 'PASS_COMPLETED', passer: carrier });

    const wingPool = attackTeam.players.filter(p => p.id === 11 || p.id === 14);
    const wing = wingPool.length > 0 ? wingPool[rng(0, wingPool.length - 1)] : randomPlayer(attackTeam);
    playIntroSteps.push({ kind: 'phase_outcome', phase: MatchPhase.FirstPhase, key: 'out_the_back', primary: outsideCentre, secondary: wing });

    if (wing.currentStats.handling + rng(1, 100) < knockOnThreshold(wing.currentStats.handling, state.clock.clockInTheRed)) {
      events.push({ type: 'KNOCK_ON', player: wing, attackSide });
      return {
        nextPhase: MatchPhase.Scrum,
        narration: { steps: [...playIntroSteps, { kind: 'phase_outcome', phase: MatchPhase.FirstPhase, key: 'knock_on', primary: wing, secondary: outsideCentre }] },
        primaryPlayer: wing,
        secondaryPlayer: outsideCentre,
        events,
      };
    }

    events.push({ type: 'PASS_COMPLETED', passer: outsideCentre });
    ballCarrier = wing;
    const defWingPool = defendTeam.players.filter(p => p.id === 11 || p.id === 14);
    defender = defWingPool.length > 0 ? defWingPool[rng(0, defWingPool.length - 1)] : randomPlayer(defendTeam);
  }

  // Step 3 — Evasion → Step 4 Collision
  const res = resolveOpenPlay(ballCarrier, defender, attackMod, defendMod + backfieldPenalty);
  const direction = attackDir();

  events.push({
    type: 'CARRY_RESOLVED',
    carrier: ballCarrier,
    defender,
    metres: res.gainMetres,
    direction,
    outcome: res.outcome,
    defSide,
  });

  let nextPhase: MatchPhase;
  const outcomeSteps: NarrationStep[] = [...playIntroSteps];

  if (res.outcome === 'line_break') {
    const projectedBallX = clamp(state.ball.x + direction * res.gainMetres, 0, 100);
    const tryScored = isTryScoredAt(projectedBallX, attackSide, state.clock.halfTimeDone);
    nextPhase = tryScored ? MatchPhase.TryScored : MatchPhase.Breakdown;
    if (tryScored) {
      outcomeSteps.push({ kind: 'phase_outcome', phase: MatchPhase.FirstPhase, key: 'line_break_try', primary: ballCarrier, secondary: defender });
    } else {
      outcomeSteps.push({ kind: 'phase_outcome', phase: MatchPhase.FirstPhase, key: 'line_break', primary: ballCarrier, secondary: defender });
      if (backfieldPenalty < 0 && attackSide !== 'home') {
        outcomeSteps.push({
          kind: 'tactic_note',
          cause: 'line_break_backfield_thin',
          chancePct: COMMENTARY_CHANCES.lineBreakBackfieldThin,
          params: { defendTeamName: defendTeam.name, backfieldDefence: defendTeam.tactics.backfieldDefence },
        });
      }
    }
  } else if (res.outcome === 'dominant_tackle') {
    nextPhase = MatchPhase.Breakdown;
    outcomeSteps.push({ kind: 'phase_outcome', phase: MatchPhase.FirstPhase, key: 'dominant_tackle', primary: ballCarrier, secondary: defender });
  } else {
    nextPhase = MatchPhase.Breakdown;
    outcomeSteps.push({ kind: 'phase_outcome', phase: MatchPhase.FirstPhase, key: res.outcome, primary: ballCarrier, secondary: defender });
  }

  void isTryScored;  // ctx helper unused — we project ballX ourselves for the try-line check
  return {
    nextPhase,
    narration: { steps: outcomeSteps },
    primaryPlayer: ballCarrier,
    secondaryPlayer: defender,
    outcome: res.outcome,
    events,
  };
}
