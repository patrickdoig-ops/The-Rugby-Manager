import type { PhaseContext, PhaseResult } from './types';
import type { MatchEvent } from '../../types/matchEvent';
import type { NarrationDescriptor } from '../../types/narration';
import { MatchPhase } from '../../types/engine';
import { resolveBoxKick } from '../resolvers/BoxKickResolver';
import { getCommentary } from '../CommentaryEngine';
import { rng, pickRandom, commentaryChance } from '../../utils/rng';
import { clamp } from '../../utils/math';

function tacticNote(chancePct: number, ...lines: string[]): string {
  return commentaryChance(chancePct) ? ' ' + pickRandom(lines) : '';
}

export function handleBoxKick({ state, attackTeam, defendTeam, attackDir, randomPlayer, draftEvent }: PhaseContext): PhaseResult {
  const scrumHalf  = attackTeam.players.find(p => p.id === 9) ?? attackTeam.players[0];
  const wingerPool = attackTeam.players.filter(p => p.id === 11 || p.id === 14);
  const winger     = wingerPool.length > 0 ? wingerPool[rng(0, wingerPool.length - 1)] : randomPlayer(attackTeam);
  const fullback   = defendTeam.players.find(p => p.id === 15) ?? randomPlayer(defendTeam);
  const backfield = defendTeam.tactics.backfieldDefence;
  const fullbackMod = backfield === 'three_back' ? 15 : backfield === 'two_back' ? 8 : 0;
  const res = resolveBoxKick(scrumHalf, winger, fullback, fullbackMod);

  const events: MatchEvent[] = [
    { type: 'KICK_FROM_HAND', kicker: scrumHalf, metres: res.distance },
    { type: 'BALL_REPOSITIONED', x: clamp(state.ball.x + attackDir() * res.distance, 5, 95) },
  ];

  const attackSide = state.possession;
  const defSide: 'home' | 'away' = attackSide === 'home' ? 'away' : 'home';

  if (res.outcome === 'attack_retain') {
    events.push({ type: 'KICK_RETURN_CARRIER_SET', player: winger });
    return {
      nextPhase: MatchPhase.KickReturn,
      commentary: getCommentary({ ...draftEvent(MatchPhase.BoxKick), primaryPlayer: scrumHalf, secondaryPlayer: winger }, 'attack_retain'),
      narration: { steps: [{ kind: 'phase_outcome', phase: MatchPhase.BoxKick, key: 'attack_retain', primary: scrumHalf, secondary: winger }] },
      primaryPlayer: scrumHalf,
      secondaryPlayer: winger,
      events,
    };
  }

  if (res.outcome === 'defend_knock_on') {
    events.push({ type: 'HANDLING_ERROR', side: defSide });
    return {
      nextPhase: MatchPhase.Scrum,
      commentary: getCommentary({ ...draftEvent(MatchPhase.BoxKick), primaryPlayer: scrumHalf, secondaryPlayer: winger }, 'defend_knock_on'),
      narration: { steps: [{ kind: 'phase_outcome', phase: MatchPhase.BoxKick, key: 'defend_knock_on', primary: scrumHalf, secondary: winger }] },
      primaryPlayer: scrumHalf,
      secondaryPlayer: winger,
      events,
    };
  }

  if (res.outcome === 'defend_catch_contested') {
    events.push({ type: 'POSSESSION_SWAPPED' });
    events.push({ type: 'KICK_RETURN_CARRIER_SET', player: fullback });
    return {
      nextPhase: MatchPhase.KickReturn,
      commentary: getCommentary({ ...draftEvent(MatchPhase.BoxKick), primaryPlayer: scrumHalf, secondaryPlayer: fullback }, 'defend_catch_contested'),
      narration: { steps: [{ kind: 'phase_outcome', phase: MatchPhase.BoxKick, key: 'defend_catch_contested', primary: scrumHalf, secondary: fullback }] },
      primaryPlayer: scrumHalf,
      secondaryPlayer: fullback,
      events,
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
    events.push({ type: 'POSSESSION_SWAPPED' });
    events.push({ type: 'KICK_RETURN_CARRIER_SET', player: fullback });
    const steps: NarrationDescriptor['steps'] = [
      { kind: 'phase_outcome', phase: MatchPhase.BoxKick, key: 'defend_catch', primary: scrumHalf, secondary: fullback },
    ];
    if (homeIsDefending && fullbackMod > 0) {
      steps.push({
        kind: 'tactic_note',
        cause: 'boxkick_backfield_caught',
        chancePct: 30,
        params: { defendTeamName: defendTeam.name, fullback, backfieldDefence: defendTeam.tactics.backfieldDefence },
      });
    }
    return {
      nextPhase: MatchPhase.KickReturn,
      commentary: getCommentary({ ...draftEvent(MatchPhase.BoxKick), primaryPlayer: scrumHalf, secondaryPlayer: fullback }, 'defend_catch') + catchNote,
      narration: { steps },
      primaryPlayer: scrumHalf,
      secondaryPlayer: fullback,
      events,
    };
  }

  // knock_on — poor kick, fullback drops uncontested
  events.push({ type: 'HANDLING_ERROR', side: defSide });
  return {
    nextPhase: MatchPhase.Scrum,
    commentary: getCommentary({ ...draftEvent(MatchPhase.BoxKick), primaryPlayer: scrumHalf, secondaryPlayer: fullback }, 'knock_on'),
    narration: { steps: [{ kind: 'phase_outcome', phase: MatchPhase.BoxKick, key: 'knock_on', primary: scrumHalf, secondary: fullback }] },
    primaryPlayer: scrumHalf,
    secondaryPlayer: fullback,
    events,
  };
}
