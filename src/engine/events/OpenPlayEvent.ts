import type { PhaseContext, PhaseResult } from './types';
import type { MatchEvent } from '../../types/matchEvent';
import type { NarrationStep } from '../../types/narration';
import { MatchPhase } from '../../types/engine';
import { resolveOpenPlay } from '../resolvers/OpenPlayResolver';
import { isTryScoredAt } from '../FieldPosition';
import { clamp } from '../../utils/math';
import { rng } from '../../utils/rng';

export function handlePhasePlay({ state, attackTeam, defendTeam, attackDir, isTryScored, inOwnHalf, inOwn22, randomPlayer, pickPlayer }: PhaseContext): PhaseResult {
  // Step 0 — Kick or carry decision
  // Propensity is driven by attacking team tactics and pitch location
  const plan = attackTeam.tactics.attackingGamePlan;
  let kickProb = 15;

  if (plan === 'possession') {
    kickProb = inOwn22() ? 50 : (inOwnHalf() ? 15 : 0);
  } else if (plan === 'kicking') {
    kickProb = inOwn22() ? 90 : (inOwnHalf() ? 65 : 15);
  } else {
    // balanced
    kickProb = inOwn22() ? 75 : (inOwnHalf() ? 50 : 10);
  }

  if (rng(1, 100) <= kickProb) {
    const flyHalf = attackTeam.players.find(p => p.id === 10) ?? attackTeam.players[0];
    return {
      nextPhase: MatchPhase.TacticalKick,
      narration: { steps: [{ kind: 'phase_outcome', phase: MatchPhase.PhasePlay, key: 'kick_decision' }] },
      primaryPlayer: flyHalf,
      events: [{ type: 'BREAKDOWN_MOD_SET', attack: 0, defend: 0 }],
    };
  }

  // Step 1 — Carrier handling gate (inline)
  const carrier   = randomPlayer(attackTeam);
  const defender  = randomPlayer(defendTeam);
  const scrumHalf = attackTeam.players.find(p => p.id === 9) ?? attackTeam.players[0];
  const attackSide = state.possession;
  const defSide: 'home' | 'away' = attackSide === 'home' ? 'away' : 'home';

  const events: MatchEvent[] = [];
  if (scrumHalf !== carrier) events.push({ type: 'PASS_COMPLETED', passer: scrumHalf });

  const { attack: attackMod, defend: defendMod } = state.breakdownMod;
  events.push({ type: 'BREAKDOWN_MOD_SET', attack: 0, defend: 0 });

  const backfieldPenalty = defendTeam.tactics.backfieldDefence === 'three_back' ? -10
                         : defendTeam.tactics.backfieldDefence === 'two_back'   ? -5 : 0;

  const koThreshold = state.clock.clockInTheRed
    ? Math.min(99, 85 + Math.round(Math.max(0, 85 - carrier.currentStats.handling) * 0.4))
    : 85;
  if (carrier.currentStats.handling + rng(1, 100) < koThreshold) {
    events.push({ type: 'KNOCK_ON', player: carrier, attackSide });
    return {
      nextPhase: MatchPhase.Scrum,
      narration: { steps: [{ kind: 'phase_outcome', phase: MatchPhase.PhasePlay, key: 'knock_on', primary: carrier, secondary: defender }] },
      primaryPlayer: carrier,
      secondaryPlayer: defender,
      events,
    };
  }

  // Step 2 — Hard Carry / Out the Back decision
  const style = attackTeam.tactics.attackingStyle;
  const hardCarryThreshold = style === 'keep_it_tight' ? 90 : style === 'wide_wide' ? 50 : 70;
  const goWide = carrier.id === 10 || rng(1, 100) > hardCarryThreshold;

  let ballCarrier = carrier;
  // Tracks the most-recent "out the back" pass step that prefixes the eventual
  // outcome commentary (mirrors the original wideIntro string concatenation).
  let wideIntroSteps: NarrationStep[] = [];

  if (goWide) {
    const flyHalf = pickPlayer(attackTeam, 10);

    if (carrier.id !== 10) {
      wideIntroSteps = [{ kind: 'phase_outcome', phase: MatchPhase.PhasePlay, key: 'out_the_back', primary: carrier, secondary: flyHalf }];

      // Fly half handling gate
      const fhThreshold = state.clock.clockInTheRed
        ? Math.min(99, 85 + Math.round(Math.max(0, 85 - flyHalf.currentStats.handling) * 0.4))
        : 85;
      if (flyHalf.currentStats.handling + rng(1, 100) < fhThreshold) {
        events.push({ type: 'KNOCK_ON', player: flyHalf, attackSide });
        return {
          nextPhase: MatchPhase.Scrum,
          narration: { steps: [...wideIntroSteps, { kind: 'phase_outcome', phase: MatchPhase.PhasePlay, key: 'knock_on', primary: flyHalf, secondary: defender }] },
          primaryPlayer: flyHalf,
          secondaryPlayer: defender,
          events,
        };
      }
    }

    // Outside back handling gate (outside centre, both wings, fullback)
    const obPool = attackTeam.players.filter(p => [11, 13, 14, 15].includes(p.id));
    const outsideBack = obPool.length > 0 ? obPool[rng(0, obPool.length - 1)] : randomPlayer(attackTeam);
    if (carrier.id === 10) {
      wideIntroSteps = [{ kind: 'phase_outcome', phase: MatchPhase.PhasePlay, key: 'out_the_back', primary: flyHalf, secondary: outsideBack }];
    }
    const obThreshold = state.clock.clockInTheRed
      ? Math.min(99, 85 + Math.round(Math.max(0, 85 - outsideBack.currentStats.handling) * 0.4))
      : 85;
    if (outsideBack.currentStats.handling + rng(1, 100) < obThreshold) {
      events.push({ type: 'KNOCK_ON', player: outsideBack, attackSide });
      return {
        nextPhase: MatchPhase.Scrum,
        narration: { steps: [...wideIntroSteps, { kind: 'phase_outcome', phase: MatchPhase.PhasePlay, key: 'knock_on', primary: outsideBack, secondary: defender }] },
        primaryPlayer: outsideBack,
        secondaryPlayer: defender,
        events,
      };
    }

    events.push({ type: 'PASS_COMPLETED', passer: flyHalf });
    ballCarrier = outsideBack;
  }

  // Step 3 — Evasion → Step 4 Collision (handling gate already cleared)
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
  const outcomeSteps: NarrationStep[] = [...wideIntroSteps];

  if (res.outcome === 'line_break') {
    // Try-scored check uses the projected ballX; the CARRY_RESOLVED event will apply
    // the actual ball move once PhaseRouter reduces the queue.
    const projectedBallX = clamp(state.ball.x + direction * res.gainMetres, 0, 100);
    const tryScored = isTryScoredAt(projectedBallX, attackSide, state.clock.halfTimeDone);
    nextPhase = tryScored ? MatchPhase.TryScored : MatchPhase.Breakdown;
    if (tryScored) {
      outcomeSteps.push({ kind: 'phase_outcome', phase: MatchPhase.PhasePlay, key: 'line_break_try', primary: ballCarrier, secondary: defender });
    } else {
      outcomeSteps.push({ kind: 'phase_outcome', phase: MatchPhase.PhasePlay, key: 'line_break', primary: ballCarrier, secondary: defender });
      if (backfieldPenalty < 0 && attackSide !== 'home') {
        outcomeSteps.push({
          kind: 'tactic_note',
          cause: 'line_break_backfield_thin',
          chancePct: 30,
          params: { defendTeamName: defendTeam.name, backfieldDefence: defendTeam.tactics.backfieldDefence },
        });
      }
    }
  } else if (res.outcome === 'dominant_tackle') {
    nextPhase = MatchPhase.Breakdown;
    outcomeSteps.push({ kind: 'phase_outcome', phase: MatchPhase.PhasePlay, key: 'dominant_tackle', primary: ballCarrier, secondary: defender });
  } else {
    nextPhase = MatchPhase.Breakdown;
    outcomeSteps.push({ kind: 'phase_outcome', phase: MatchPhase.PhasePlay, key: res.outcome, primary: ballCarrier, secondary: defender });
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
