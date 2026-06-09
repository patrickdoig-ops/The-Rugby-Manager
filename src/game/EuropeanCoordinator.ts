// European competition coordinator. Owns pool-stage and knockout simulation
// for the Champions Cup and Challenge Cup. Methods are async because
// simulateFixture is async (driven by the event bus). GameCoordinator holds
// one instance per session (same `state` reference as all other coordinators).

import type { EuropeanFixture, EuropeanKnockoutMatch, GameState } from '../types/gameState';
import type { RawTeamInput } from '../types/teamData';
import { applySeasonEvent } from './applySeasonEvent';
import { simulateFixture } from './simulateFixture';
import { buildEuropeanOpponent } from './buildEuropeanOpponent';
import { sortStandings } from './leagueTable';
import { collectSeasonEvents, collectConditionEvents, type MatchSnapshot } from './seasonStatsCollector';
import { rollNewInjuryEvents } from './injuryEffects';
import {
  EC_POOLS_2025_26, ES_POOLS_2025_26,
  EC_FIXTURES_2025_26, ES_FIXTURES_2025_26,
  EURO_CUP_SEED_ROUNDS, EURO_SHIELD_SEED_ROUNDS,
  buildEuropeanCompSeed, europeanKnockoutDates,
} from './europeanScheduler';
import { parseSeasonStartYear } from './age';

export class EuropeanCoordinator {
  constructor(private state: GameState, private teamsById: Map<string, RawTeamInput>) {}

  // Seed both competitions for the season. Year 1 uses hardcoded pools.
  seedEuropeanComps(seasonLabel: string): void {
    applySeasonEvent(this.state, {
      type: 'EUROPEAN_COMP_SEEDED',
      ...buildEuropeanCompSeed(EC_POOLS_2025_26, EC_FIXTURES_2025_26, seasonLabel, 'europeanCup'),
    });
    applySeasonEvent(this.state, {
      type: 'EUROPEAN_COMP_SEEDED',
      ...buildEuropeanCompSeed(ES_POOLS_2025_26, ES_FIXTURES_2025_26, seasonLabel, 'europeanShield'),
    });
  }

  // True once every pool fixture in the competition has a result.
  allPoolFixturesDone(competition: 'europeanCup' | 'europeanShield'): boolean {
    const comp = this.state.league[competition];
    if (!comp) return true;
    return comp.fixtures.every(f => !!f.result);
  }

  // Run all unplayed pool fixtures headlessly, skipping the player's team.
  async runPoolStage(competition: 'europeanCup' | 'europeanShield'): Promise<void> {
    const comp = this.state.league[competition];
    if (!comp) return;
    const playerTeamId = this.state.player.teamId;
    for (const fx of comp.fixtures.filter(f => !f.result)) {
      if (fx.homeId === playerTeamId || fx.awayId === playerTeamId) continue;
      await this.simulatePoolFixture(competition, fx);
    }
  }

  // Seed and run the knockout stage headlessly, skipping the player's team.
  // Must be called after all pool fixtures (including the player's) are done.
  async runKnockoutStage(competition: 'europeanCup' | 'europeanShield'): Promise<void> {
    const comp = this.state.league[competition];
    if (!comp || comp.knockout !== null) return;
    const shieldDropdowns = competition === 'europeanShield' ? this.computeEcDropdowns() : [];
    const r16 = this.seedR16(competition, shieldDropdowns);
    const startYear = parseSeasonStartYear(this.state.calendar.seasonLabel);
    const koDates = europeanKnockoutDates(startYear);
    applySeasonEvent(this.state, {
      type: 'EUROPEAN_KNOCKOUT_SEEDED',
      competition,
      r16: r16.map(m => ({ ...m, date: koDates.r16 })),
      quarterfinals: Array.from({ length: 4 }, (_, i) => ({ matchIndex: i, homeId: null, awayId: null, date: koDates.qf })),
      semifinals: [
        { matchIndex: 0, homeId: null, awayId: null, date: koDates.sf },
        { matchIndex: 1, homeId: null, awayId: null, date: koDates.sf },
      ],
      final: { matchIndex: 0, homeId: null, awayId: null, date: koDates.final },
    });
    const playerTeamId = this.state.player.teamId;
    await this.runKnockoutRound(competition, 'r16', playerTeamId);
    await this.runKnockoutRound(competition, 'quarterfinal', playerTeamId);
    await this.runKnockoutRound(competition, 'semifinal', playerTeamId);
    await this.runKnockoutRound(competition, 'final', playerTeamId);
  }

  // Record the result of a live European pool match the player just played.
  // Applies player/condition/injury stats, then triggers knockout seeding
  // once all pool fixtures are done.
  async recordPlayerEuropeanPoolResult(
    competition: 'europeanCup' | 'europeanShield',
    poolId: number,
    round: number,
    homeId: string,
    awayId: string,
    homeScore: number,
    awayScore: number,
    snapshot: MatchSnapshot,
  ): Promise<void> {
    const comp = this.state.league[competition];
    if (!comp) return;
    const fx = comp.fixtures.find(f =>
      f.poolId === poolId && f.round === round && f.homeId === homeId && f.awayId === awayId,
    );
    if (!fx || fx.result) return; // idempotent
    const playerTeamId = this.state.player.teamId;
    const playerSide: 'home' | 'away' | null = homeId === playerTeamId ? 'home' : awayId === playerTeamId ? 'away' : null;
    applySeasonEvent(this.state, {
      type: 'EUROPEAN_FIXTURE_RECORDED',
      competition, poolId, round, homeId, awayId,
      homeScore, awayScore,
      homeTries: snapshot.homeSummary.tries,
      awayTries: snapshot.awaySummary.tries,
      playerSide,
    });
    for (const ev of collectSeasonEvents(snapshot, competition)) applySeasonEvent(this.state, ev);
    for (const ev of collectConditionEvents(snapshot)) applySeasonEvent(this.state, ev);
    for (const ev of rollNewInjuryEvents(this.state, snapshot.playerSnapshots)) applySeasonEvent(this.state, ev);
    // Seed and run the knockout once all pool fixtures (including the player's) are done.
    if (this.allPoolFixturesDone(competition) && !comp.knockout) {
      await this.runKnockoutStage(competition);
    }
  }

  // Record the result of a live European knockout match the player just played.
  // Applies stats, then sims remaining matches in the current stage and all
  // subsequent stages, skipping the player's team.
  async recordPlayerEuropeanKnockoutResult(
    competition: 'europeanCup' | 'europeanShield',
    stage: 'r16' | 'quarterfinal' | 'semifinal' | 'final',
    matchIndex: number,
    homeScore: number,
    awayScore: number,
    snapshot: MatchSnapshot,
  ): Promise<void> {
    const comp = this.state.league[competition];
    const ko = comp?.knockout;
    if (!ko) return;
    const matches = this.getKoMatches(ko, stage);
    const match = matches[matchIndex];
    if (!match || match.result) return; // idempotent
    const playerTeamId = this.state.player.teamId;
    const playerSide: 'home' | 'away' | null =
      match.homeId === playerTeamId ? 'home' : match.awayId === playerTeamId ? 'away' : null;
    applySeasonEvent(this.state, {
      type: 'EUROPEAN_KNOCKOUT_RECORDED',
      competition, stage, matchIndex,
      homeScore, awayScore,
      homeTries: snapshot.homeSummary.tries,
      awayTries: snapshot.awaySummary.tries,
      playerSide,
    });
    for (const ev of collectSeasonEvents(snapshot, competition)) applySeasonEvent(this.state, ev);
    for (const ev of collectConditionEvents(snapshot)) applySeasonEvent(this.state, ev);
    for (const ev of rollNewInjuryEvents(this.state, snapshot.playerSnapshots)) applySeasonEvent(this.state, ev);
    // Sim remaining matches in current and subsequent stages, skipping player.
    const allStages: Array<'r16' | 'quarterfinal' | 'semifinal' | 'final'> = ['r16', 'quarterfinal', 'semifinal', 'final'];
    for (const s of allStages.slice(allStages.indexOf(stage))) {
      await this.runKnockoutRound(competition, s, playerTeamId);
    }
  }

  private async simulatePoolFixture(competition: 'europeanCup' | 'europeanShield', fx: EuropeanFixture): Promise<void> {
    const seedRounds = competition === 'europeanCup' ? EURO_CUP_SEED_ROUNDS : EURO_SHIELD_SEED_ROUNDS;
    const seedRound = [seedRounds.r1, seedRounds.r2, seedRounds.r3, seedRounds.r4][fx.round - 1] ?? seedRounds.r1;
    const homeTeam = this.teamsById.get(fx.homeId) ?? buildEuropeanOpponent(fx.homeId);
    const awayTeam = this.teamsById.get(fx.awayId) ?? buildEuropeanOpponent(fx.awayId);
    if (!homeTeam || !awayTeam) return;
    const sim = await simulateFixture(homeTeam, awayTeam, this.state.seed, seedRound);
    applySeasonEvent(this.state, {
      type: 'EUROPEAN_FIXTURE_RECORDED',
      competition,
      poolId: fx.poolId,
      round: fx.round,
      homeId: fx.homeId,
      awayId: fx.awayId,
      homeScore: sim.homeScore,
      awayScore: sim.awayScore,
      homeTries: sim.snapshot.homeSummary.tries,
      awayTries: sim.snapshot.awaySummary.tries,
      playerSide: null,
    });
  }

  // Returns the 5th-placed team from each EC pool (dropouts into Shield R16).
  private computeEcDropdowns(): string[] {
    const ecComp = this.state.league.europeanCup;
    if (!ecComp) return [];
    return ecComp.pools.map(pool => {
      const sorted = sortStandings([...pool.standings]);
      return sorted[4]?.teamId ?? '';
    }).filter(Boolean);
  }

  private seedR16(competition: 'europeanCup' | 'europeanShield', extraTeams: string[]): EuropeanKnockoutMatch[] {
    const comp = this.state.league[competition];
    if (!comp) return [];
    const topTeams: string[][] = comp.pools.map(pool => {
      const sorted = sortStandings([...pool.standings]);
      return sorted.slice(0, 4).map(s => s.teamId);
    });

    if (competition === 'europeanCup') {
      return [
        { matchIndex: 0, homeId: topTeams[0]?.[0] ?? null, awayId: topTeams[1]?.[3] ?? null },
        { matchIndex: 1, homeId: topTeams[1]?.[0] ?? null, awayId: topTeams[0]?.[3] ?? null },
        { matchIndex: 2, homeId: topTeams[2]?.[0] ?? null, awayId: topTeams[3]?.[3] ?? null },
        { matchIndex: 3, homeId: topTeams[3]?.[0] ?? null, awayId: topTeams[2]?.[3] ?? null },
        { matchIndex: 4, homeId: topTeams[0]?.[1] ?? null, awayId: topTeams[2]?.[2] ?? null },
        { matchIndex: 5, homeId: topTeams[1]?.[1] ?? null, awayId: topTeams[3]?.[2] ?? null },
        { matchIndex: 6, homeId: topTeams[2]?.[1] ?? null, awayId: topTeams[0]?.[2] ?? null },
        { matchIndex: 7, homeId: topTeams[3]?.[1] ?? null, awayId: topTeams[1]?.[2] ?? null },
      ];
    } else {
      const dropouts = [...extraTeams];
      return [
        { matchIndex: 0, homeId: topTeams[0]?.[0] ?? null, awayId: dropouts[0] ?? null },
        { matchIndex: 1, homeId: topTeams[1]?.[0] ?? null, awayId: dropouts[1] ?? null },
        { matchIndex: 2, homeId: topTeams[2]?.[0] ?? null, awayId: dropouts[2] ?? null },
        { matchIndex: 3, homeId: topTeams[0]?.[1] ?? null, awayId: dropouts[3] ?? null },
        { matchIndex: 4, homeId: topTeams[1]?.[1] ?? null, awayId: topTeams[2]?.[3] ?? null },
        { matchIndex: 5, homeId: topTeams[2]?.[1] ?? null, awayId: topTeams[1]?.[3] ?? null },
        { matchIndex: 6, homeId: topTeams[0]?.[2] ?? null, awayId: topTeams[2]?.[2] ?? null },
        { matchIndex: 7, homeId: topTeams[1]?.[2] ?? null, awayId: topTeams[0]?.[3] ?? null },
      ];
    }
  }

  private getKoMatches(ko: { r16: EuropeanKnockoutMatch[]; quarterfinals: EuropeanKnockoutMatch[]; semifinals: [EuropeanKnockoutMatch, EuropeanKnockoutMatch]; final: EuropeanKnockoutMatch }, stage: 'r16' | 'quarterfinal' | 'semifinal' | 'final'): EuropeanKnockoutMatch[] {
    if (stage === 'r16') return ko.r16;
    if (stage === 'quarterfinal') return ko.quarterfinals;
    if (stage === 'semifinal') return ko.semifinals as EuropeanKnockoutMatch[];
    return [ko.final];
  }

  private async runKnockoutRound(
    competition: 'europeanCup' | 'europeanShield',
    stage: 'r16' | 'quarterfinal' | 'semifinal' | 'final',
    skipTeamId?: string,
  ): Promise<void> {
    const comp = this.state.league[competition];
    const ko = comp?.knockout;
    if (!ko) return;
    const seedRounds = competition === 'europeanCup' ? EURO_CUP_SEED_ROUNDS : EURO_SHIELD_SEED_ROUNDS;
    const seedRound = stage === 'r16' ? seedRounds.r16
      : stage === 'quarterfinal' ? seedRounds.qf
      : stage === 'semifinal' ? seedRounds.sf
      : seedRounds.final;
    for (const match of this.getKoMatches(ko, stage)) {
      if (match.result || !match.homeId || !match.awayId) continue;
      if (skipTeamId && (match.homeId === skipTeamId || match.awayId === skipTeamId)) continue;
      const homeTeam = this.teamsById.get(match.homeId) ?? buildEuropeanOpponent(match.homeId);
      const awayTeam = this.teamsById.get(match.awayId) ?? buildEuropeanOpponent(match.awayId);
      if (!homeTeam || !awayTeam) continue;
      const sim = await simulateFixture(homeTeam, awayTeam, this.state.seed, seedRound);
      applySeasonEvent(this.state, {
        type: 'EUROPEAN_KNOCKOUT_RECORDED',
        competition, stage,
        matchIndex: match.matchIndex,
        homeScore: sim.homeScore,
        awayScore: sim.awayScore,
        homeTries: sim.snapshot.homeSummary.tries,
        awayTries: sim.snapshot.awaySummary.tries,
        playerSide: null,
      });
    }
  }
}
