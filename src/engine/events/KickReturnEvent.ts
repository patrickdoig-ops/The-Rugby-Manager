import type { PhaseContext, PhaseResult } from './types';
import { MatchPhase } from '../../types/engine';
import { resolveOpenPlay } from '../resolvers/OpenPlayResolver';
import { getCommentary } from '../CommentaryEngine';
import { rng } from '../../utils/rng';
import { clamp } from '../../utils/math';

function tacticNote(chancePct: number, ...lines: string[]): string {
  return rng(1, 100) <= chancePct ? ' ' + lines[rng(0, lines.length - 1)] : '';
}

export function handleKickReturn({ state, attackTeam, defendTeam, attackDir, isTryScored, inOwnHalf, inOwn22, adjustRating, randomPlayer, pickPlayer, draftEvent }: PhaseContext): PhaseResult {
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
    state.kickReturnCarrier = undefined;
    state.breakdownMod = { attack: 0, defend: 0 };
    const flyHalf = attackTeam.players.find(p => p.id === 10) ?? attackTeam.players[0];
    return {
      nextPhase: MatchPhase.TacticalKick,
      commentary: getCommentary({ ...draftEvent(MatchPhase.KickReturn) }, 'kick_decision'),
      primaryPlayer: flyHalf,
    };
  }

  // Step 1 — Carrier is whoever caught the kick; no handling gate
  const carrier = state.kickReturnCarrier ?? randomPlayer(attackTeam);
  state.kickReturnCarrier = undefined;
  const defender = randomPlayer(defendTeam);
  const { attack: attackMod, defend: defendMod } = state.breakdownMod;
  state.breakdownMod = { attack: 0, defend: 0 };
  const backfieldPenalty = defendTeam.tactics.backfieldDefence === 'three_back' ? -10
                         : defendTeam.tactics.backfieldDefence === 'two_back'   ? -5 : 0;

  // Step 2 — Run: carrier pace/agility vs chaser pace/tackling
  const runAttack = (carrier.currentStats.pace + carrier.currentStats.agility) / 2 + rng(1, 20);
  const runDefend = (defender.currentStats.pace + defender.currentStats.tackling) / 2 + rng(1, 20);
  const runMetres = runAttack >= runDefend ? rng(3, 10) : rng(0, 3);

  // Step 3 — Evasion → Step 4 Collision
  const res = resolveOpenPlay(carrier, defender, attackMod, defendMod + backfieldPenalty);

  let nextPhase: MatchPhase;
  let commentary: string;

  if (res.outcome === 'line_break') {
    adjustRating(carrier, +0.375);
    state.ballX = clamp(state.ballX + attackDir() * (runMetres + res.gainMetres), 0, 100);
    const tryScored = isTryScored();
    nextPhase = tryScored ? MatchPhase.TryScored : MatchPhase.Breakdown;
    if (tryScored) {
      commentary = getCommentary({ ...draftEvent(MatchPhase.KickReturn), primaryPlayer: carrier, secondaryPlayer: defender }, 'line_break_try');
    } else {
      const lineBreakNote = (backfieldPenalty < 0 && state.possession !== 'home')
        ? tacticNote(30,
            "The backfield commitment is leaving them short in the defensive line — and they've been cut through.",
            "Three in the backfield means only twelve in the line and there's the gap — a costly trade-off.",
          )
        : '';
      commentary = getCommentary({ ...draftEvent(MatchPhase.KickReturn), primaryPlayer: carrier, secondaryPlayer: defender }, 'line_break') + lineBreakNote;
    }
  } else if (res.outcome === 'dominant_tackle') {
    adjustRating(defender, +0.3);
    adjustRating(carrier, -0.075);
    state.stats.tackles[state.possession === 'home' ? 'away' : 'home'].attempted++;
    state.stats.tackles[state.possession === 'home' ? 'away' : 'home'].made++;
    state.ballX = clamp(state.ballX + attackDir() * (runMetres + res.gainMetres), 0, 100);
    nextPhase = MatchPhase.Breakdown;
    commentary = getCommentary({ ...draftEvent(MatchPhase.KickReturn), primaryPlayer: carrier, secondaryPlayer: defender }, 'dominant_tackle');
  } else {
    if (res.outcome === 'dominant_carry') adjustRating(carrier, +0.225);
    state.stats.tackles[state.possession === 'home' ? 'away' : 'home'].attempted++;
    state.stats.tackles[state.possession === 'home' ? 'away' : 'home'].made++;
    state.ballX = clamp(state.ballX + attackDir() * (runMetres + res.gainMetres), 0, 100);
    nextPhase = MatchPhase.Breakdown;
    commentary = getCommentary({ ...draftEvent(MatchPhase.KickReturn), primaryPlayer: carrier, secondaryPlayer: defender }, res.outcome);
  }

  return { nextPhase, commentary, primaryPlayer: carrier, secondaryPlayer: defender, outcome: res.outcome };
}
