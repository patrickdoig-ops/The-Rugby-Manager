// Builds the per-event DisplaySnapshot consumed by the visual panels
// (Scoreboard, PitchStrip, StatsPanel summary). Captured at event-production
// time by CommentaryStreamer so those panels can be driven independently of
// the live MatchState — with the producer running ahead, the live state is
// further along than the line currently being narrated. Scalars + the team-
// stats summary block + the three player-derived totals the summary rows
// need; per-player data stays live (StatsPanel's player list + detail table
// read straight off MatchState). Pure read, no RNG, no mutation — never
// called in silent mode.

import type { MatchState, MatchStats, DisplaySnapshot, DisplayCards, SinBinEntry } from '../types/match';
import type { Team } from '../types/team';
import type { Player } from '../types/player';
import { MatchPhase } from '../types/engine';
import { attackDir } from './FieldPosition';
import { shortName } from '../utils/playerName';

function displayCards(sinBin: SinBinEntry[], sentOff: Player[]): DisplayCards {
  return {
    sinBin:  sinBin.map(e => ({ name: shortName(e.player), kind: e.kind })),
    sentOff: sentOff.map(p => shortName(p)),
  };
}

// Structured copy of the live stats so later mutations don't bleed into a
// captured frame (the nested objects are mutated in place by applyMatchEvent).
function cloneStats(s: MatchStats): MatchStats {
  return {
    possession:     { home: s.possession.home, away: s.possession.away },
    territory:      { home: s.territory.home,  away: s.territory.away },
    tackles:        { home: { ...s.tackles.home }, away: { ...s.tackles.away } },
    handlingErrors: { home: s.handlingErrors.home, away: s.handlingErrors.away },
    scrums:         { home: s.scrums.home,   away: s.scrums.away },
    lineouts:       { home: s.lineouts.home, away: s.lineouts.away },
    tries:          { home: s.tries.home,    away: s.tries.away },
    mauls:          { home: s.mauls.home,    away: s.mauls.away },
    maulMetres:     { home: s.maulMetres.home, away: s.maulMetres.away },
    ownLineouts:    { home: { ...s.ownLineouts.home }, away: { ...s.ownLineouts.away } },
    ownScrums:      { home: { ...s.ownScrums.home },   away: { ...s.ownScrums.away } },
    entries22:      { home: { ...s.entries22.home },   away: { ...s.entries22.away } },
  };
}

// Sum of a per-player matchStats key across a team's on-field + subbed-off
// players (matches StatsPanel's historical teamSum for the summary rows).
function teamSum(team: Team, key: 'carries' | 'metresCarried' | 'passes' | 'kicksFromHand' | 'kickMetres' | 'penaltiesConceded' | 'offloadsCompleted'): number {
  let sum = 0;
  for (const p of team.players) sum += p.matchStats[key];
  for (const p of team.substitutedOff) sum += p.matchStats[key];
  return sum;
}

export function buildDisplaySnapshot(state: MatchState): DisplaySnapshot {
  return {
    gameMinute:    state.clock.gameMinute,
    halfTimeDone:  state.clock.halfTimeDone,
    clockInTheRed: state.clock.clockInTheRed,
    phase:         state.phase,
    possession:    state.possession,
    score:         { home: state.score.home, away: state.score.away },
    // For TryScored, show the ball grounded in the in-goal, measured from the TRY LINE
    // (x=100 or x=0). A try requires the ball to REACH the line (isTryScoredAt), and
    // the [0,100] invariant clamp means state.ball.x rests exactly ON the line — so
    // pushing off the raw position would render the grounding on the line itself;
    // line + dir*4 (x=104 / x=-4) reads as grounded inside the in-goal. toTop()
    // handles values outside 0–100; the invariant check is on state.ball.x, not this.
    ballX: state.phase === MatchPhase.TryScored
      ? (attackDir(state) > 0 ? 100 : 0) + attackDir(state) * 4
      : state.ball.x,
    ballY:         state.ball.y,
    cards: {
      home: displayCards(state.cards.sinBin.home, state.cards.sentOff.home),
      away: displayCards(state.cards.sinBin.away, state.cards.sentOff.away),
    },
    stats: cloneStats(state.stats),
    aggregates: {
      carries:           { home: teamSum(state.homeTeam, 'carries'),           away: teamSum(state.awayTeam, 'carries') },
      runMetres:         { home: teamSum(state.homeTeam, 'metresCarried'),     away: teamSum(state.awayTeam, 'metresCarried') },
      passes:            { home: teamSum(state.homeTeam, 'passes'),            away: teamSum(state.awayTeam, 'passes') },
      offloads:          { home: teamSum(state.homeTeam, 'offloadsCompleted'), away: teamSum(state.awayTeam, 'offloadsCompleted') },
      kicks:             { home: teamSum(state.homeTeam, 'kicksFromHand'),     away: teamSum(state.awayTeam, 'kicksFromHand') },
      kickMetres:        { home: teamSum(state.homeTeam, 'kickMetres'),        away: teamSum(state.awayTeam, 'kickMetres') },
      penaltiesConceded: { home: teamSum(state.homeTeam, 'penaltiesConceded'), away: teamSum(state.awayTeam, 'penaltiesConceded') },
    },
  };
}
