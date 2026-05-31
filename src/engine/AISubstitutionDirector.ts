// In-match AI substitution. A pure, RNG-free orchestrator that swaps a tired
// starter out for a like-for-like bench replacement. Called once per tick by
// MatchCoordinator alongside AITacticalDirector — both run after the fatigue
// accumulator drains and before resolvePhase(), so a new player participates
// in the same tick they came on.
//
// Per-side rules:
//   - never touches the human side (in a live match) — the manager owns subs
//     via the modal. In silent fixtures both sides adapt (humanSide undefined).
//   - inactive until earliestSubMinute (default 50') — matches real rugby
//     where the bench is mostly used after half-time.
//   - bulk subs are allowed: every tick the director keeps swapping while a
//     starter sits below the fatigue threshold and the bench has a like-for-
//     like replacement. Real-world coaches do clear the bench in a single
//     window around the 50-55' mark.
//   - prefers an exact position match on the bench, with a forward/back
//     group fallback. Sin-binned / sent-off players are not on-field
//     candidates (filtered via FieldPosition.onFieldPlayers).
//
// Determinism: no RNG, no time-of-day reads, no side effects beyond the
// substitute() callback (which itself goes through applyMatchEvent +
// MatchCoordinator's emit gate). The same MatchState produces the same
// queued subs every run.

import type { MatchState } from '../types/match';
import type { Player } from '../types/player';
import { isForward } from '../types/player';
import type { Team } from '../types/team';
import type { PossessionSide } from '../types/engine';
import { onFieldPlayers } from './FieldPosition';
import { AI_SUBS_VALUES } from './balance';

export class AISubstitutionDirector {
  private state: MatchState;
  // 'home' or 'away' — the side the human player controls; the director
  // never proposes subs for this side. undefined in silent fixtures so both
  // teams adapt.
  private humanSide: PossessionSide | undefined;
  private substitute: (side: PossessionSide, benchSquadNum: number, fieldSquadNum: number) => void;

  constructor(
    state: MatchState,
    humanSide: PossessionSide | undefined,
    substitute: (side: PossessionSide, benchSquadNum: number, fieldSquadNum: number) => void,
  ) {
    this.state = state;
    this.humanSide = humanSide;
    this.substitute = substitute;
  }

  evaluate(): void {
    if (this.state.clock.gameMinute < AI_SUBS_VALUES.earliestSubMinute) return;
    for (const side of ['home', 'away'] as const) {
      if (side === this.humanSide) continue;
      const team = side === 'home' ? this.state.homeTeam : this.state.awayTeam;
      // Keep subbing until either the bench is empty, no starter is still
      // tired, or no remaining bench player covers the tired starter's slot.
      // In immediate mode (silent fixtures), substitute() mutates team.players
      // and team.bench in place, so each pass re-evaluates against the updated
      // rosters. In queued mode (live matches), substitute() doesn't mutate
      // state, so queuedThisTick tracks players decided in this call so the
      // loop terminates when all eligible tired players have been queued.
      const queuedThisTick = new Set<number>();
      while (team.bench.length > 0) {
        const tired = this.pickTiredCandidate(team, side, queuedThisTick);
        if (!tired) break;
        const replacement = this.pickReplacement(team.bench, tired);
        if (!replacement) break;
        this.substitute(side, replacement.squadNumber, tired.squadNumber);
        queuedThisTick.add(tired.squadNumber);
      }
    }
  }

  // Most-fatigued on-field player below the threshold, excluding any already
  // queued this evaluate() call. Ties broken by id ascending so iteration is
  // stable across runs.
  private pickTiredCandidate(team: Team, side: PossessionSide, exclude: Set<number>): Player | null {
    const onField = onFieldPlayers(team, this.state, side);
    let best: Player | null = null;
    for (const p of onField) {
      if (exclude.has(p.squadNumber)) continue;
      if (p.fatiguePct > AI_SUBS_VALUES.fatigueThreshold) continue;
      if (!best || p.fatiguePct < best.fatiguePct || (p.fatiguePct === best.fatiguePct && p.id < best.id)) {
        best = p;
      }
    }
    return best;
  }

  // Exact position match first, then forward/back group. No "any bench"
  // fallback — a back coming on for a prop weakens the scrum more than a
  // 60% prop staying on does.
  private pickReplacement(bench: Player[], off: Player): Player | null {
    const exact = bench.find(p => p.position === off.position);
    if (exact) return exact;
    const offIsForward = isForward(off.position);
    return bench.find(p => isForward(p.position) === offIsForward) ?? null;
  }
}
