import type { PhaseContext, PhaseResult } from './types';
import type { MatchEvent } from '../../types/matchEvent';
import { MatchPhase } from '../../types/engine';
import { resolveOpenPlay } from '../resolvers/OpenPlayResolver';
import { getCommentary } from '../CommentaryEngine';
import { isTryScoredAt } from '../FieldPosition';
import { clamp } from '../../utils/math';
import { rng } from '../../utils/rng';

function tacticNote(chancePct: number, ...lines: string[]): string {
  return rng(1, 100) <= chancePct ? ' ' + lines[rng(0, lines.length - 1)] : '';
}

export function handlePhasePlay({ state, attackTeam, defendTeam, attackDir, isTryScored, inOwnHalf, inOwn22, randomPlayer, pickPlayer, draftEvent }: PhaseContext): PhaseResult {
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
      commentary: getCommentary({ ...draftEvent(MatchPhase.PhasePlay) }, 'kick_decision'),
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

  const koThreshold = state.clockInTheRed
    ? Math.min(99, 85 + Math.round(Math.max(0, 85 - carrier.currentStats.handling) * 0.4))
    : 85;
  if (carrier.currentStats.handling + rng(1, 100) < koThreshold) {
    events.push({ type: 'KNOCK_ON', player: carrier, attackSide });
    return {
      nextPhase: MatchPhase.Scrum,
      commentary: getCommentary({ ...draftEvent(MatchPhase.PhasePlay), primaryPlayer: carrier, secondaryPlayer: defender }, 'knock_on'),
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
  let wideIntro = '';

  if (goWide) {
    const flyHalf = pickPlayer(attackTeam, 10);

    if (carrier.id !== 10) {
      wideIntro = getCommentary({ ...draftEvent(MatchPhase.PhasePlay), primaryPlayer: carrier, secondaryPlayer: flyHalf }, 'out_the_back') + ' ';

      // Fly half handling gate
      const fhThreshold = state.clockInTheRed
        ? Math.min(99, 85 + Math.round(Math.max(0, 85 - flyHalf.currentStats.handling) * 0.4))
        : 85;
      if (flyHalf.currentStats.handling + rng(1, 100) < fhThreshold) {
        events.push({ type: 'KNOCK_ON', player: flyHalf, attackSide });
        return {
          nextPhase: MatchPhase.Scrum,
          commentary: wideIntro + getCommentary({ ...draftEvent(MatchPhase.PhasePlay), primaryPlayer: flyHalf, secondaryPlayer: defender }, 'knock_on'),
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
      wideIntro = getCommentary({ ...draftEvent(MatchPhase.PhasePlay), primaryPlayer: flyHalf, secondaryPlayer: outsideBack }, 'out_the_back') + ' ';
    }
    const obThreshold = state.clockInTheRed
      ? Math.min(99, 85 + Math.round(Math.max(0, 85 - outsideBack.currentStats.handling) * 0.4))
      : 85;
    if (outsideBack.currentStats.handling + rng(1, 100) < obThreshold) {
      events.push({ type: 'KNOCK_ON', player: outsideBack, attackSide });
      return {
        nextPhase: MatchPhase.Scrum,
        commentary: wideIntro + getCommentary({ ...draftEvent(MatchPhase.PhasePlay), primaryPlayer: outsideBack, secondaryPlayer: defender }, 'knock_on'),
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
  let commentary: string;

  if (res.outcome === 'line_break') {
    // Try-scored check uses the projected ballX; the CARRY_RESOLVED event will apply
    // the actual ball move once PhaseRouter reduces the queue.
    const projectedBallX = clamp(state.ballX + direction * res.gainMetres, 0, 100);
    const tryScored = isTryScoredAt(projectedBallX, attackSide, state.halfTimeDone);
    nextPhase = tryScored ? MatchPhase.TryScored : MatchPhase.Breakdown;
    if (tryScored) {
      commentary = wideIntro + getCommentary({ ...draftEvent(MatchPhase.PhasePlay), primaryPlayer: ballCarrier, secondaryPlayer: defender }, 'line_break_try');
    } else {
      const lineBreakNote = (backfieldPenalty < 0 && attackSide !== 'home')
        ? tacticNote(30,
            `The backfield commitment is leaving ${defendTeam.name} short in the defensive line — and they've been cut through.`,
            `Three in the backfield means only twelve in the line for ${defendTeam.name} — and there's the gap.`,
          )
        : '';
      commentary = wideIntro + getCommentary({ ...draftEvent(MatchPhase.PhasePlay), primaryPlayer: ballCarrier, secondaryPlayer: defender }, 'line_break') + lineBreakNote;
    }
  } else if (res.outcome === 'dominant_tackle') {
    nextPhase = MatchPhase.Breakdown;
    commentary = wideIntro + getCommentary({ ...draftEvent(MatchPhase.PhasePlay), primaryPlayer: ballCarrier, secondaryPlayer: defender }, 'dominant_tackle');
  } else {
    nextPhase = MatchPhase.Breakdown;
    commentary = wideIntro + getCommentary({ ...draftEvent(MatchPhase.PhasePlay), primaryPlayer: ballCarrier, secondaryPlayer: defender }, res.outcome);
  }
  void isTryScored;  // ctx helper unused — we project ballX ourselves for the try-line check
  return { nextPhase, commentary, primaryPlayer: ballCarrier, secondaryPlayer: defender, outcome: res.outcome, events };
}
