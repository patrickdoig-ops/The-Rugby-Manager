import type { PhaseContext, PhaseResult } from './types';
import { MatchPhase } from '../../types/engine';
import { resolveBoxKick } from '../resolvers/BoxKickResolver';
import { getCommentary } from '../CommentaryEngine';
import { rng } from '../../utils/rng';
import { clamp } from '../../utils/math';

function tacticNote(chancePct: number, ...lines: string[]): string {
  return rng(1, 100) <= chancePct ? ' ' + lines[rng(0, lines.length - 1)] : '';
}

export function handleBoxKick({ state, attackTeam, defendTeam, attackDir, randomPlayer, draftEvent }: PhaseContext): PhaseResult {
  const scrumHalf  = attackTeam.players.find(p => p.id === 9) ?? attackTeam.players[0];
  scrumHalf.matchStats.kicksFromHand++;
  const wingerPool = attackTeam.players.filter(p => p.id === 11 || p.id === 14);
  const winger     = wingerPool.length > 0 ? wingerPool[rng(0, wingerPool.length - 1)] : randomPlayer(attackTeam);
  const fullback   = defendTeam.players.find(p => p.id === 15) ?? randomPlayer(defendTeam);
  const backfield = defendTeam.tactics.backfieldDefence;
  const fullbackMod = backfield === 'three_back' ? 15 : backfield === 'two_back' ? 8 : 0;
  const res = resolveBoxKick(scrumHalf, winger, fullback, fullbackMod);

  state.ballX = clamp(state.ballX + attackDir() * res.distance, 5, 95);
  scrumHalf.matchStats.kickMetres += res.distance;

  if (res.outcome === 'attack_retain') {
    state.kickReturnCarrier = winger;
    return {
      nextPhase: MatchPhase.KickReturn,
      commentary: getCommentary({ ...draftEvent(MatchPhase.BoxKick), primaryPlayer: scrumHalf, secondaryPlayer: winger }, 'attack_retain'),
      primaryPlayer: scrumHalf,
      secondaryPlayer: winger,
    };
  }

  if (res.outcome === 'defend_knock_on') {
    state.stats.handlingErrors[state.possession === 'home' ? 'away' : 'home']++;
    return {
      nextPhase: MatchPhase.Scrum,
      commentary: getCommentary({ ...draftEvent(MatchPhase.BoxKick), primaryPlayer: scrumHalf, secondaryPlayer: winger }, 'defend_knock_on'),
      primaryPlayer: scrumHalf,
      secondaryPlayer: winger,
    };
  }

  if (res.outcome === 'defend_catch_contested') {
    state.possession = state.possession === 'home' ? 'away' : 'home';
    state.kickReturnCarrier = fullback;
    return {
      nextPhase: MatchPhase.KickReturn,
      commentary: getCommentary({ ...draftEvent(MatchPhase.BoxKick), primaryPlayer: scrumHalf, secondaryPlayer: fullback }, 'defend_catch_contested'),
      primaryPlayer: scrumHalf,
      secondaryPlayer: fullback,
    };
  }

  if (res.outcome === 'defend_catch') {
    // home team is defending (not possessing) when the box kick goes up
    const homeIsDefending = state.possession !== 'home';
    const catchNote = (homeIsDefending && fullbackMod > 0)
      ? tacticNote(30,
          `The backfield numbers are making the difference — ${fullback.name} had plenty of cover and took that cleanly.`,
          fullbackMod >= 15
            ? `Three in the backfield: the box kick had no chance, ${defendTeam.name} had the numbers to deal with it comfortably.`
            : "The extra cover in the backfield paid off — that kick never had a chance of being contested.",
        )
      : '';
    state.possession = state.possession === 'home' ? 'away' : 'home';
    state.kickReturnCarrier = fullback;
    return {
      nextPhase: MatchPhase.KickReturn,
      commentary: getCommentary({ ...draftEvent(MatchPhase.BoxKick), primaryPlayer: scrumHalf, secondaryPlayer: fullback }, 'defend_catch') + catchNote,
      primaryPlayer: scrumHalf,
      secondaryPlayer: fullback,
    };
  }

  // knock_on — poor kick, fullback drops uncontested
  state.stats.handlingErrors[state.possession === 'home' ? 'away' : 'home']++;
  return {
    nextPhase: MatchPhase.Scrum,
    commentary: getCommentary({ ...draftEvent(MatchPhase.BoxKick), primaryPlayer: scrumHalf, secondaryPlayer: fullback }, 'knock_on'),
    primaryPlayer: scrumHalf,
    secondaryPlayer: fullback,
  };
}
