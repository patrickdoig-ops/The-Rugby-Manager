// Builds the per-event DisplaySnapshot consumed by the visual panels
// (Scoreboard, PitchStrip). Captured at event-production time by
// CommentaryStreamer so those panels can be driven independently of the live
// MatchState — once the sim runs ahead of the commentary, the live state is
// further along than the line currently being narrated. Scalars + the small
// card list only; per-player data stays live (read straight off MatchState by
// StatsPanel). Pure read, no RNG, no mutation — never called in silent mode.

import type { MatchState, DisplaySnapshot, DisplayCards, SinBinEntry } from '../types/match';
import type { Player } from '../types/player';
import { shortName } from '../utils/playerName';

function displayCards(sinBin: SinBinEntry[], sentOff: Player[]): DisplayCards {
  return {
    sinBin:  sinBin.map(e => ({ name: shortName(e.player), kind: e.kind })),
    sentOff: sentOff.map(p => shortName(p)),
  };
}

export function buildDisplaySnapshot(state: MatchState): DisplaySnapshot {
  return {
    gameMinute:    state.clock.gameMinute,
    halfTimeDone:  state.clock.halfTimeDone,
    clockInTheRed: state.clock.clockInTheRed,
    phase:         state.phase,
    possession:    state.possession,
    score:         { home: state.score.home, away: state.score.away },
    ballX:         state.ball.x,
    ballY:         state.ball.y,
    cards: {
      home: displayCards(state.cards.sinBin.home, state.cards.sentOff.home),
      away: displayCards(state.cards.sinBin.away, state.cards.sentOff.away),
    },
  };
}
