// Playoff collaborator — owns the end-of-season bracket: seeding it from the
// final regular-season standings, the player's playoff result tick, and the
// headless AI playoff sims. Holds the same GameState reference GameCoordinator
// holds (mutations visible across both) plus the teamsById lookup for sims; all
// writes go through applySeasonEvent. Emits its own bracket / playoff / season
// events on the bus, inline alongside the mutations (CLAUDE.md §5).
//
// Reuses the shared Phase-0 helpers (injuryEffects, moraleEffects) and the
// season-stats collectors so the playoff tick mirrors the regular-season match
// tick exactly. GameCoordinator keeps thin public delegations so screens /
// main.ts / the determinism harness keep talking to it.

import type { GameState, PlayoffMatch } from '../types/gameState';
import type { RawTeamInput } from '../types/teamData';
import type { MatchSnapshot } from './seasonStatsCollector';
import { sortStandings } from './leagueTable';
import { applySeasonEvent } from './applySeasonEvent';
import { tickInjuryEvents, rollNewInjuryEvents } from './injuryEffects';
import { computeFixtureMoraleEvents } from './moraleEffects';
import { collectSeasonEvents, collectConditionEvents } from './seasonStatsCollector';
import { buildAutoSelectedTeamFromRoster } from './rosterTeamBuilder';
import { simulateFixture } from './simulateFixture';
import { addDaysIso } from './age';
import { eventBus } from '../utils/eventBus';

export class PlayoffCoordinator {
  constructor(private state: GameState, private teamsById: Map<string, RawTeamInput>) {}

  // True when every fixture in league.fixtures (regular season) has a
  // result. Plays the role getCurrentFixture() === null used to play,
  // but is league-wide rather than player-only — the bracket seeds off
  // the league's final standings, not just the player's results.
  allRegularFixturesPlayed(): boolean {
    return this.state.league.fixtures.every(f =>
      this.state.league.results.some(r =>
        r.round === f.round && r.homeId === f.homeId && r.awayId === f.awayId
      )
    );
  }

  // Seeds the bracket from the final regular-season standings (top 4).
  // Idempotent — exits early if already seeded or the regular season
  // isn't done. Public so the determinism harness can call it directly.
  seedPlayoffBracket(): void {
    if (this.state.league.playoffs !== null) return;
    if (!this.allRegularFixturesPlayed()) return;
    const top4 = sortStandings(this.state.league.standings).slice(0, 4);
    if (top4.length < 4) return;
    const [s1, s2, s3, s4] = top4;
    // Real-world league cadence: SFs the weekend after R18, final
    // the weekend after the SFs. Anchored to the last R18 fixture date
    // when available; falls back to the current calendar date.
    const r18LastDate = this.state.league.fixtures
      .filter(f => f.round === 18 && f.date)
      .map(f => f.date!)
      .sort()
      .pop() ?? this.state.calendar.date;
    const sfDate    = addDaysIso(r18LastDate, 6);
    const finalDate = addDaysIso(r18LastDate, 13);
    const semifinals: [PlayoffMatch, PlayoffMatch] = [
      {
        kind: 'semifinal_1',
        homeId: s1.teamId, awayId: s4.teamId,
        homeSeed: 1, awaySeed: 4,
        date: sfDate,
      },
      {
        kind: 'semifinal_2',
        homeId: s2.teamId, awayId: s3.teamId,
        homeSeed: 2, awaySeed: 3,
        date: sfDate,
      },
    ];
    const final: PlayoffMatch = {
      kind: 'final',
      homeId: null, awayId: null,
      homeSeed: null, awaySeed: null,
      date: finalDate,
    };
    applySeasonEvent(this.state, { type: 'PLAYOFF_BRACKET_SEEDED', semifinals, final });
    eventBus.emit('game:bracketSeeded', { state: this.state });
  }

  // Returns the next unresolved playoff match where the player's team is
  // involved, walking SF1 → SF2 → Final. Null when the player is not in
  // playoffs or their playoff run is complete (lost an SF, or won the
  // Final). The Final entry can still be returned with homeId/awayId
  // unset — call sites should treat that as "not yet decided".
  getPlayerPlayoffMatch(): PlayoffMatch | null {
    const playoffs = this.state.league.playoffs;
    if (!playoffs) return null;
    const playerId = this.state.player.teamId;
    const isPlayer = (m: PlayoffMatch): boolean =>
      (m.homeId === playerId || m.awayId === playerId) && !m.result;
    if (isPlayer(playoffs.semifinals[0])) return playoffs.semifinals[0];
    if (isPlayer(playoffs.semifinals[1])) return playoffs.semifinals[1];
    if (isPlayer(playoffs.final))         return playoffs.final;
    return null;
  }

  // Records the player's playoff result. Mirrors recordPlayerMatchResult's
  // shape (idempotency guard, injury tick + roll, per-player + per-team
  // stats accumulation) but writes through PLAYOFF_RESULT_RECORDED instead
  // of FIXTURE_RESULT_RECORDED, so league standings are not touched.
  // Fires game:seasonComplete when the final resolves.
  async recordPlayerPlayoffResult(
    kind: 'semifinal_1' | 'semifinal_2' | 'final',
    homeScore: number,
    awayScore: number,
    snapshot: MatchSnapshot,
    kickWinner?: 'home' | 'away',
  ): Promise<void> {
    const playoffs = this.state.league.playoffs;
    if (!playoffs) throw new Error('No active playoff bracket');
    const target = kind === 'semifinal_1' ? playoffs.semifinals[0]
                 : kind === 'semifinal_2' ? playoffs.semifinals[1]
                 : playoffs.final;
    if (target.result) return; // idempotency guard
    if (!target.homeId || !target.awayId) {
      throw new Error(`Playoff match ${kind} has no teams yet`);
    }

    // Injury tick — represents the week of rest between matches. Same
    // pattern as recordPlayerMatchResult so cumulative recovery is
    // continuous across regular season → playoffs.
    for (const ev of tickInjuryEvents(this.state)) {
      applySeasonEvent(this.state, ev);
    }

    const playerSide: 'home' | 'away' = target.homeId === this.state.player.teamId ? 'home' : 'away';
    applySeasonEvent(this.state, {
      type: 'PLAYOFF_RESULT_RECORDED',
      kind,
      homeScore,
      awayScore,
      homeTries: snapshot.homeSummary.tries,
      awayTries: snapshot.awaySummary.tries,
      playerSide,
      ...(kickWinner ? { kickWinner } : {}),
    });
    for (const ev of collectSeasonEvents(snapshot)) {
      applySeasonEvent(this.state, ev);
    }
    for (const ev of collectConditionEvents(snapshot)) {
      applySeasonEvent(this.state, ev);
    }
    for (const ev of rollNewInjuryEvents(this.state, snapshot.playerSnapshots)) {
      applySeasonEvent(this.state, ev);
    }
    for (const ev of computeFixtureMoraleEvents(this.state, {
      round: kind === 'final' ? 20 : 19,
      homeId: target.homeId!,
      awayId: target.awayId!,
      homeScore,
      awayScore,
      homeTries: snapshot.homeSummary.tries,
      awayTries: snapshot.awaySummary.tries,
      playerSide,
    }, snapshot, kickWinner)) {
      applySeasonEvent(this.state, ev);
    }
    eventBus.emit('game:playoffsUpdated', { state: this.state });

    if (this.state.league.playoffs?.championTeamId !== null && this.state.league.playoffs?.championTeamId !== undefined) {
      eventBus.emit('game:seasonComplete', { state: this.state });
    }
  }

  // Sims (silent) every pending AI-vs-AI match in the given stage.
  // Stage 'sf' covers SF1 + SF2; stage 'final' covers the Final. Skips
  // any match the player's team is in — those go through
  // recordPlayerPlayoffResult instead. Fires game:playoffsUpdated for
  // each, plus game:seasonComplete once the Final resolves.
  async simulatePendingPlayoffMatches(stage: 'sf' | 'final'): Promise<void> {
    const playoffs = this.state.league.playoffs;
    if (!playoffs) return;
    const playerId = this.state.player.teamId;
    const matches = stage === 'sf'
      ? [playoffs.semifinals[0], playoffs.semifinals[1]]
      : [playoffs.final];
    const pseudoRound = stage === 'sf' ? 19 : 20;
    for (const match of matches) {
      if (match.result) continue;
      if (!match.homeId || !match.awayId) continue;
      if (match.homeId === playerId || match.awayId === playerId) continue;
      const homeJson = this.teamsById.get(match.homeId);
      const awayJson = this.teamsById.get(match.awayId);
      if (!homeJson || !awayJson) continue;
      const home = buildAutoSelectedTeamFromRoster(this.state, homeJson);
      const away = buildAutoSelectedTeamFromRoster(this.state, awayJson);
      const sim = await simulateFixture(
        home, away, this.state.seed, pseudoRound,
        { neutralVenue: match.kind === 'final', allowExtraTime: true },
      );
      applySeasonEvent(this.state, {
        type: 'PLAYOFF_RESULT_RECORDED',
        kind: match.kind,
        homeScore: sim.homeScore,
        awayScore: sim.awayScore,
        homeTries:  sim.snapshot.homeSummary.tries,
        awayTries:  sim.snapshot.awaySummary.tries,
        playerSide: null,
        ...(sim.kickWinner ? { kickWinner: sim.kickWinner } : {}),
      });
      for (const ev of collectSeasonEvents(sim.snapshot)) {
        applySeasonEvent(this.state, ev);
      }
      for (const ev of collectConditionEvents(sim.snapshot)) {
        applySeasonEvent(this.state, ev);
      }
      for (const ev of rollNewInjuryEvents(this.state, sim.snapshot.playerSnapshots)) {
        applySeasonEvent(this.state, ev);
      }
      for (const ev of computeFixtureMoraleEvents(this.state, {
        round: pseudoRound,
        homeId: match.homeId!,
        awayId: match.awayId!,
        homeScore: sim.homeScore,
        awayScore: sim.awayScore,
        homeTries: sim.snapshot.homeSummary.tries,
        awayTries: sim.snapshot.awaySummary.tries,
        playerSide: null,
      }, sim.snapshot, sim.kickWinner)) {
        applySeasonEvent(this.state, ev);
      }
      eventBus.emit('game:playoffsUpdated', { state: this.state });
    }
    if (this.state.league.playoffs?.championTeamId !== null && this.state.league.playoffs?.championTeamId !== undefined) {
      eventBus.emit('game:seasonComplete', { state: this.state });
    }
  }
}
