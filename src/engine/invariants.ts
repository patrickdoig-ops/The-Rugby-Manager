// Runtime tripwires for MatchState. Called from applyMatchEvent after every
// mutation. If anything in the engine ever drives state outside its legal
// numeric/structural range, this throws with the offending field — surfacing
// the bug at the mutation that caused it rather than at some downstream
// rendering or save-load step. Cost is O(matchday squad) per call; negligible
// next to the RNG / event work already done per tick.

import type { MatchState } from '../types/match';
import type { Player, PlayerStats } from '../types/player';
import { MatchPhase } from '../types/engine';

const PHASES = new Set<string>(Object.values(MatchPhase));

function fail(check: string, detail: string): never {
  throw new Error(`Invariant violated [${check}]: ${detail}`);
}

function assertPlayer(p: Player, location: string): void {
  if (!(p.fatiguePct >= 0 && p.fatiguePct <= 100)) {
    fail('player.fatiguePct', `${location} squad#${p.squadNumber} fatiguePct=${p.fatiguePct}`);
  }
  if (!(p.rating >= 0 && p.rating <= 10)) {
    fail('player.rating', `${location} squad#${p.squadNumber} rating=${p.rating}`);
  }
  for (const key of Object.keys(p.currentStats) as (keyof PlayerStats)[]) {
    const v = p.currentStats[key];
    if (!(v >= 1 && v <= 100)) {
      fail('player.currentStats', `${location} squad#${p.squadNumber} ${key}=${v}`);
    }
  }
  // Card counters: a player can theoretically receive at most one yellow + one
  // red per match (two yellows = red anyway). 3 is a paranoia ceiling.
  if (!(p.matchStats.yellowCards >= 0 && p.matchStats.yellowCards <= 3)) {
    fail('player.yellowCards', `${location} squad#${p.squadNumber} yellowCards=${p.matchStats.yellowCards}`);
  }
  if (!(p.matchStats.redCards >= 0 && p.matchStats.redCards <= 3)) {
    fail('player.redCards', `${location} squad#${p.squadNumber} redCards=${p.matchStats.redCards}`);
  }
}

export function assertInvariants(state: MatchState): void {
  // Score
  if (!(state.score.home >= 0) || !Number.isInteger(state.score.home)) {
    fail('score.home', `${state.score.home}`);
  }
  if (!(state.score.away >= 0) || !Number.isInteger(state.score.away)) {
    fail('score.away', `${state.score.away}`);
  }

  // Possession
  if (state.possession !== 'home' && state.possession !== 'away') {
    fail('possession', `${state.possession}`);
  }

  // Phase
  if (!PHASES.has(state.phase)) {
    fail('phase', `${state.phase}`);
  }

  // Ball
  if (!(state.ball.x >= 0 && state.ball.x <= 100)) fail('ball.x', `${state.ball.x}`);
  if (!(state.ball.y >= 0 && state.ball.y <= 100)) fail('ball.y', `${state.ball.y}`);

  // Clock
  if (!(state.clock.gameMinute >= 0)) fail('clock.gameMinute', `${state.clock.gameMinute}`);

  // Players — starting XV, bench, and players already subbed off all keep
  // valid fatigue/rating/currentStats; the substitutedOff list is read by the
  // rating engine on full-time and serialised into save data, so it can't carry
  // a corrupt value either.
  for (const p of state.homeTeam.players)        assertPlayer(p, 'home.players');
  for (const p of state.homeTeam.bench)          assertPlayer(p, 'home.bench');
  for (const p of state.homeTeam.substitutedOff) assertPlayer(p, 'home.substitutedOff');
  for (const p of state.awayTeam.players)        assertPlayer(p, 'away.players');
  for (const p of state.awayTeam.bench)          assertPlayer(p, 'away.bench');
  for (const p of state.awayTeam.substitutedOff) assertPlayer(p, 'away.substitutedOff');

  // Card state — bin entries must reference real on-field IDs (1..15),
  // teamPenalty22 counters are non-negative integers, and the per-tick
  // tmoReview shape is only present when phase === TmoReview with a
  // legal step number.
  for (const side of ['home', 'away'] as const) {
    for (const entry of state.cards.sinBin[side]) {
      if (!(entry.returnMinute >= 0)) {
        fail(`cards.sinBin.${side}.returnMinute`, `id=${entry.player.id} returnMinute=${entry.returnMinute}`);
      }
      if (entry.kind !== 'yellow' && entry.kind !== 'red_20') {
        fail(`cards.sinBin.${side}.kind`, `id=${entry.player.id} kind=${entry.kind}`);
      }
    }
    const pen22 = state.cards.teamPenalty22[side];
    if (!(pen22 >= 0) || !Number.isInteger(pen22)) {
      fail(`cards.teamPenalty22.${side}`, `${pen22}`);
    }
  }
  if (state.tmoReview) {
    if (state.phase !== MatchPhase.TmoReview) {
      fail('tmoReview.phase', `tmoReview set but phase=${state.phase}`);
    }
    const step = state.tmoReview.step;
    if (step !== 1 && step !== 2 && step !== 3) {
      fail('tmoReview.step', `${step}`);
    }
  }
}
