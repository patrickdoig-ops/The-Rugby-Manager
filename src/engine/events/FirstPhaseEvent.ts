import type { PhaseContext, PhaseResult } from './types';
import type { MatchEvent } from '../../types/matchEvent';
import type { NarrationStep } from '../../types/narration';
import { MatchPhase } from '../../types/engine';
import { resolveOpenPlay } from '../resolvers/OpenPlayResolver';
import { getCommentary } from '../CommentaryEngine';
import { isTryScoredAt } from '../FieldPosition';
import { rng, pickRandom, commentaryChance } from '../../utils/rng';
import { clamp } from '../../utils/math';

function tacticNote(chancePct: number, ...lines: string[]): string {
  return commentaryChance(chancePct) ? ' ' + pickRandom(lines) : '';
}

export function handleFirstPhase({ state, attackTeam, defendTeam, attackDir, isTryScored, inOwnHalf, inOwn22, randomPlayer, pickPlayer, draftEvent }: PhaseContext): PhaseResult {
  // Step 0 — Kick or carry decision
  const plan = attackTeam.tactics.attackingGamePlan;
  let kickProb = 15;

  if (plan === 'possession') {
    kickProb = inOwn22() ? 50 : (inOwnHalf() ? 15 : 0);
  } else if (plan === 'kicking') {
    kickProb = inOwn22() ? 90 : (inOwnHalf() ? 65 : 15);
  } else {
    kickProb = inOwn22() ? 75 : (inOwnHalf() ? 50 : 10);
  }

  if (rng(1, 100) <= kickProb) {
    const flyHalf = attackTeam.players.find(p => p.id === 10) ?? attackTeam.players[0];
    return {
      nextPhase: MatchPhase.TacticalKick,
      commentary: getCommentary({ ...draftEvent(MatchPhase.FirstPhase) }, 'kick_decision'),
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

  const backfieldPenalty = defendTeam.tactics.backfieldDefence === 'three_back' ? -10
                         : defendTeam.tactics.backfieldDefence === 'two_back'   ? -5 : 0;

  const carrierKoThreshold = state.clock.clockInTheRed
    ? Math.min(99, 85 + Math.round(Math.max(0, 85 - carrier.currentStats.handling) * 0.4))
    : 85;
  if (carrier.currentStats.handling + rng(1, 100) < carrierKoThreshold) {
    events.push({ type: 'KNOCK_ON', player: carrier, attackSide });
    const defender = randomPlayer(defendTeam);
    return {
      nextPhase: MatchPhase.Scrum,
      commentary: getCommentary({ ...draftEvent(MatchPhase.FirstPhase), primaryPlayer: carrier, secondaryPlayer: defender }, 'knock_on'),
      narration: { steps: [{ kind: 'phase_outcome', phase: MatchPhase.FirstPhase, key: 'knock_on', primary: carrier, secondary: defender }] },
      primaryPlayer: carrier,
      secondaryPlayer: defender,
      events,
    };
  }

  // Step 2 — Crash Ball or Wide Play
  const style = attackTeam.tactics.attackingStyle;
  const crashBallThreshold = style === 'keep_it_tight' ? 90 : style === 'wide_wide' ? 50 : 70;
  const goCrashBall = rng(1, 100) <= crashBallThreshold;

  let ballCarrier;
  let defender;
  let playIntro = '';
  const playIntroSteps: NarrationStep[] = [];

  if (goCrashBall) {
    // Crash Ball: #10 → #12 (inside centre)
    const insideCentre = pickPlayer(attackTeam, 12);
    playIntro = getCommentary({ ...draftEvent(MatchPhase.FirstPhase), primaryPlayer: carrier, secondaryPlayer: insideCentre }, 'crash_ball') + ' ';
    playIntroSteps.push({ kind: 'phase_outcome', phase: MatchPhase.FirstPhase, key: 'crash_ball', primary: carrier, secondary: insideCentre });

    const icKoThreshold = state.clock.clockInTheRed
      ? Math.min(99, 85 + Math.round(Math.max(0, 85 - insideCentre.currentStats.handling) * 0.4))
      : 85;
    if (insideCentre.currentStats.handling + rng(1, 100) < icKoThreshold) {
      events.push({ type: 'KNOCK_ON', player: insideCentre, attackSide });
      return {
        nextPhase: MatchPhase.Scrum,
        commentary: playIntro + getCommentary({ ...draftEvent(MatchPhase.FirstPhase), primaryPlayer: insideCentre, secondaryPlayer: carrier }, 'knock_on'),
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
    playIntro = getCommentary({ ...draftEvent(MatchPhase.FirstPhase), primaryPlayer: carrier, secondaryPlayer: outsideCentre }, 'out_the_back') + ' ';
    playIntroSteps.push({ kind: 'phase_outcome', phase: MatchPhase.FirstPhase, key: 'out_the_back', primary: carrier, secondary: outsideCentre });

    const ocKoThreshold = state.clock.clockInTheRed
      ? Math.min(99, 85 + Math.round(Math.max(0, 85 - outsideCentre.currentStats.handling) * 0.4))
      : 85;
    if (outsideCentre.currentStats.handling + rng(1, 100) < ocKoThreshold) {
      events.push({ type: 'KNOCK_ON', player: outsideCentre, attackSide });
      return {
        nextPhase: MatchPhase.Scrum,
        commentary: playIntro + getCommentary({ ...draftEvent(MatchPhase.FirstPhase), primaryPlayer: outsideCentre, secondaryPlayer: carrier }, 'knock_on'),
        narration: { steps: [...playIntroSteps, { kind: 'phase_outcome', phase: MatchPhase.FirstPhase, key: 'knock_on', primary: outsideCentre, secondary: carrier }] },
        primaryPlayer: outsideCentre,
        secondaryPlayer: carrier,
        events,
      };
    }

    events.push({ type: 'PASS_COMPLETED', passer: carrier });

    const wingPool = attackTeam.players.filter(p => p.id === 11 || p.id === 14);
    const wing = wingPool.length > 0 ? wingPool[rng(0, wingPool.length - 1)] : randomPlayer(attackTeam);
    playIntro += getCommentary({ ...draftEvent(MatchPhase.FirstPhase), primaryPlayer: outsideCentre, secondaryPlayer: wing }, 'out_the_back') + ' ';
    playIntroSteps.push({ kind: 'phase_outcome', phase: MatchPhase.FirstPhase, key: 'out_the_back', primary: outsideCentre, secondary: wing });

    const wingKoThreshold = state.clock.clockInTheRed
      ? Math.min(99, 85 + Math.round(Math.max(0, 85 - wing.currentStats.handling) * 0.4))
      : 85;
    if (wing.currentStats.handling + rng(1, 100) < wingKoThreshold) {
      events.push({ type: 'KNOCK_ON', player: wing, attackSide });
      return {
        nextPhase: MatchPhase.Scrum,
        commentary: playIntro + getCommentary({ ...draftEvent(MatchPhase.FirstPhase), primaryPlayer: wing, secondaryPlayer: outsideCentre }, 'knock_on'),
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
  let commentary: string;
  const outcomeSteps: NarrationStep[] = [...playIntroSteps];

  if (res.outcome === 'line_break') {
    const projectedBallX = clamp(state.ball.x + direction * res.gainMetres, 0, 100);
    const tryScored = isTryScoredAt(projectedBallX, attackSide, state.clock.halfTimeDone);
    nextPhase = tryScored ? MatchPhase.TryScored : MatchPhase.Breakdown;
    if (tryScored) {
      commentary = playIntro + getCommentary({ ...draftEvent(MatchPhase.FirstPhase), primaryPlayer: ballCarrier, secondaryPlayer: defender }, 'line_break_try');
      outcomeSteps.push({ kind: 'phase_outcome', phase: MatchPhase.FirstPhase, key: 'line_break_try', primary: ballCarrier, secondary: defender });
    } else {
      const lineBreakNote = (backfieldPenalty < 0 && attackSide !== 'home')
        ? tacticNote(30,
            `The backfield commitment is leaving ${defendTeam.name} short in the defensive line — and they've been cut through.`,
            `Three in the backfield means only twelve in the line for ${defendTeam.name} — and there's the gap.`,
          )
        : '';
      commentary = playIntro + getCommentary({ ...draftEvent(MatchPhase.FirstPhase), primaryPlayer: ballCarrier, secondaryPlayer: defender }, 'line_break') + lineBreakNote;
      outcomeSteps.push({ kind: 'phase_outcome', phase: MatchPhase.FirstPhase, key: 'line_break', primary: ballCarrier, secondary: defender });
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
    commentary = playIntro + getCommentary({ ...draftEvent(MatchPhase.FirstPhase), primaryPlayer: ballCarrier, secondaryPlayer: defender }, 'dominant_tackle');
    outcomeSteps.push({ kind: 'phase_outcome', phase: MatchPhase.FirstPhase, key: 'dominant_tackle', primary: ballCarrier, secondary: defender });
  } else {
    nextPhase = MatchPhase.Breakdown;
    commentary = playIntro + getCommentary({ ...draftEvent(MatchPhase.FirstPhase), primaryPlayer: ballCarrier, secondaryPlayer: defender }, res.outcome);
    outcomeSteps.push({ kind: 'phase_outcome', phase: MatchPhase.FirstPhase, key: res.outcome, primary: ballCarrier, secondary: defender });
  }

  void isTryScored;  // ctx helper unused — we project ballX ourselves for the try-line check
  return {
    nextPhase,
    commentary,
    narration: { steps: outcomeSteps },
    primaryPlayer: ballCarrier,
    secondaryPlayer: defender,
    outcome: res.outcome,
    events,
  };
}
