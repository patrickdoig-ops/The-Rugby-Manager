import type { PhaseContext, PhaseResult } from './types';
import { MatchPhase } from '../../types/engine';
import { resolveOpenPlay } from '../resolvers/OpenPlayResolver';
import { getCommentary } from '../CommentaryEngine';
import { rng } from '../../utils/rng';
import { clamp } from '../../utils/math';

function tacticNote(chancePct: number, ...lines: string[]): string {
  return rng(1, 100) <= chancePct ? ' ' + lines[rng(0, lines.length - 1)] : '';
}

export function handleFirstPhase({ state, attackTeam, defendTeam, attackDir, isTryScored, inOwnHalf, inOwn22, adjustRating, randomPlayer, pickPlayer, draftEvent }: PhaseContext): PhaseResult {
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
    state.breakdownMod = { attack: 0, defend: 0 };
    const flyHalf = attackTeam.players.find(p => p.id === 10) ?? attackTeam.players[0];
    return {
      nextPhase: MatchPhase.TacticalKick,
      commentary: getCommentary({ ...draftEvent(MatchPhase.FirstPhase) }, 'kick_decision'),
      primaryPlayer: flyHalf,
    };
  }

  // Step 1 — Carrier is always #10 (fly-half); handling gate
  const carrier  = pickPlayer(attackTeam, 10);
  const { attack: attackMod, defend: defendMod } = state.breakdownMod;
  state.breakdownMod = { attack: 0, defend: 0 };
  const backfieldPenalty = defendTeam.tactics.backfieldDefence === 'three_back' ? -10
                         : defendTeam.tactics.backfieldDefence === 'two_back'   ? -5 : 0;

  if (carrier.currentStats.handling + rng(1, 20) < 30) {
    adjustRating(carrier, -0.45);
    state.stats.handlingErrors[state.possession]++;
    state.possession = state.possession === 'home' ? 'away' : 'home';
    const defender = randomPlayer(defendTeam);
    return {
      nextPhase: MatchPhase.Scrum,
      commentary: getCommentary({ ...draftEvent(MatchPhase.FirstPhase), primaryPlayer: carrier, secondaryPlayer: defender }, 'knock_on'),
      primaryPlayer: carrier,
      secondaryPlayer: defender,
    };
  }

  // Step 2 — Crash Ball or Wide Play
  const style = attackTeam.tactics.attackingStyle;
  const crashBallThreshold = style === 'keep_it_tight' ? 90 : style === 'wide_wide' ? 50 : 70;
  const goCrashBall = rng(1, 100) <= crashBallThreshold;

  let ballCarrier;
  let defender;
  let playIntro = '';

  if (goCrashBall) {
    // Crash Ball: #10 → #12 (inside centre)
    const insideCentre = pickPlayer(attackTeam, 12);
    playIntro = getCommentary({ ...draftEvent(MatchPhase.FirstPhase), primaryPlayer: carrier, secondaryPlayer: insideCentre }, 'crash_ball') + ' ';

    if (insideCentre.currentStats.handling + rng(1, 20) < 30) {
      adjustRating(insideCentre, -0.45);
      state.stats.handlingErrors[state.possession]++;
      state.possession = state.possession === 'home' ? 'away' : 'home';
      return {
        nextPhase: MatchPhase.Scrum,
        commentary: playIntro + getCommentary({ ...draftEvent(MatchPhase.FirstPhase), primaryPlayer: insideCentre, secondaryPlayer: carrier }, 'knock_on'),
        primaryPlayer: insideCentre,
        secondaryPlayer: carrier,
      };
    }

    ballCarrier = insideCentre;
    defender = pickPlayer(defendTeam, 12);
  } else {
    // Wide Play: #10 → #13 → random of #11/#14
    const outsideCentre = pickPlayer(attackTeam, 13);
    playIntro = getCommentary({ ...draftEvent(MatchPhase.FirstPhase), primaryPlayer: carrier, secondaryPlayer: outsideCentre }, 'out_the_back') + ' ';

    if (outsideCentre.currentStats.handling + rng(1, 20) < 30) {
      adjustRating(outsideCentre, -0.45);
      state.stats.handlingErrors[state.possession]++;
      state.possession = state.possession === 'home' ? 'away' : 'home';
      return {
        nextPhase: MatchPhase.Scrum,
        commentary: playIntro + getCommentary({ ...draftEvent(MatchPhase.FirstPhase), primaryPlayer: outsideCentre, secondaryPlayer: carrier }, 'knock_on'),
        primaryPlayer: outsideCentre,
        secondaryPlayer: carrier,
      };
    }

    const wingPool = attackTeam.players.filter(p => p.id === 11 || p.id === 14);
    const wing = wingPool.length > 0 ? wingPool[rng(0, wingPool.length - 1)] : randomPlayer(attackTeam);
    playIntro += getCommentary({ ...draftEvent(MatchPhase.FirstPhase), primaryPlayer: outsideCentre, secondaryPlayer: wing }, 'out_the_back') + ' ';

    if (wing.currentStats.handling + rng(1, 20) < 30) {
      adjustRating(wing, -0.45);
      state.stats.handlingErrors[state.possession]++;
      state.possession = state.possession === 'home' ? 'away' : 'home';
      return {
        nextPhase: MatchPhase.Scrum,
        commentary: playIntro + getCommentary({ ...draftEvent(MatchPhase.FirstPhase), primaryPlayer: wing, secondaryPlayer: outsideCentre }, 'knock_on'),
        primaryPlayer: wing,
        secondaryPlayer: outsideCentre,
      };
    }

    ballCarrier = wing;
    const defWingPool = defendTeam.players.filter(p => p.id === 11 || p.id === 14);
    defender = defWingPool.length > 0 ? defWingPool[rng(0, defWingPool.length - 1)] : randomPlayer(defendTeam);
  }

  // Step 3 — Evasion → Step 4 Collision
  const res = resolveOpenPlay(ballCarrier, defender, attackMod, defendMod + backfieldPenalty);

  let nextPhase: MatchPhase;
  let commentary: string;

  if (res.outcome === 'line_break') {
    adjustRating(ballCarrier, +0.375);
    state.ballX = clamp(state.ballX + attackDir() * res.gainMetres, 0, 100);
    const tryScored = isTryScored();
    nextPhase = tryScored ? MatchPhase.TryScored : MatchPhase.Breakdown;
    if (tryScored) {
      commentary = playIntro + getCommentary({ ...draftEvent(MatchPhase.FirstPhase), primaryPlayer: ballCarrier, secondaryPlayer: defender }, 'line_break_try');
    } else {
      const lineBreakNote = (backfieldPenalty < 0 && state.possession !== 'home')
        ? tacticNote(30,
            `The backfield commitment is leaving ${defendTeam.name} short in the defensive line — and they've been cut through.`,
            `Three in the backfield means only twelve in the line for ${defendTeam.name} — and there's the gap.`,
          )
        : '';
      commentary = playIntro + getCommentary({ ...draftEvent(MatchPhase.FirstPhase), primaryPlayer: ballCarrier, secondaryPlayer: defender }, 'line_break') + lineBreakNote;
    }
  } else if (res.outcome === 'dominant_tackle') {
    adjustRating(defender, +0.3);
    adjustRating(ballCarrier, -0.075);
    state.stats.tackles[state.possession === 'home' ? 'away' : 'home'].attempted++;
    state.stats.tackles[state.possession === 'home' ? 'away' : 'home'].made++;
    state.ballX = clamp(state.ballX + attackDir() * res.gainMetres, 0, 100);
    nextPhase = MatchPhase.Breakdown;
    commentary = playIntro + getCommentary({ ...draftEvent(MatchPhase.FirstPhase), primaryPlayer: ballCarrier, secondaryPlayer: defender }, 'dominant_tackle');
  } else {
    if (res.outcome === 'dominant_carry') adjustRating(ballCarrier, +0.225);
    state.stats.tackles[state.possession === 'home' ? 'away' : 'home'].attempted++;
    state.stats.tackles[state.possession === 'home' ? 'away' : 'home'].made++;
    state.ballX = clamp(state.ballX + attackDir() * res.gainMetres, 0, 100);
    nextPhase = MatchPhase.Breakdown;
    commentary = playIntro + getCommentary({ ...draftEvent(MatchPhase.FirstPhase), primaryPlayer: ballCarrier, secondaryPlayer: defender }, res.outcome);
  }

  return { nextPhase, commentary, primaryPlayer: ballCarrier, secondaryPlayer: defender, outcome: res.outcome };
}
