// Zone-aware tactics resolution — the seam that lets advanced (per-zone) tactics
// flow through the engine. Each accessor takes the live state + the team and
// returns the value that applies *right now*, given where the ball is.
//
// Behaviour-preserving contract: when a team has no advanced override for a
// dimension, the accessor short-circuits to the preset enum WITHOUT reading the
// ball or computing a zone — so preset matches are byte-identical and consume
// no extra work. The zone is only computed when an advanced override is set.
//
// Perspective: zoneForSide is relative to the team's OWN try line, so an
// attacking dim read off the ball-carrier and a defensive dim read off the
// defending team both resolve "own22" to that team's own deep territory.

import type { MatchState } from '../types/match';
import type {
  Team,
  AttackingBreakdown,
  DefendingBreakdown,
  BackfieldDefence,
  DefensiveLine,
} from '../types/team';
import type { PossessionSide } from '../types/engine';
import { zoneForSide } from './FieldPosition';

function sideOf(state: MatchState, team: Team): PossessionSide {
  return team === state.homeTeam ? 'home' : 'away';
}

// ── Discrete per-zone dimensions — return the effective enum for the zone ──

export function effAttackingBreakdown(state: MatchState, team: Team): AttackingBreakdown {
  const adv = team.tactics.advanced?.attackingBreakdown;
  return adv ? adv[zoneForSide(state, sideOf(state, team))] : team.tactics.attackingBreakdown;
}

export function effDefendingBreakdown(state: MatchState, team: Team): DefendingBreakdown {
  const adv = team.tactics.advanced?.defendingBreakdown;
  return adv ? adv[zoneForSide(state, sideOf(state, team))] : team.tactics.defendingBreakdown;
}

export function effBackfieldDefence(state: MatchState, team: Team): BackfieldDefence {
  const adv = team.tactics.advanced?.backfieldDefence;
  return adv ? adv[zoneForSide(state, sideOf(state, team))] : team.tactics.backfieldDefence;
}

export function effDefensiveLine(state: MatchState, team: Team): DefensiveLine {
  const adv = team.tactics.advanced?.defensiveLine;
  return adv ? adv[zoneForSide(state, sideOf(state, team))] : team.tactics.defensiveLine;
}
