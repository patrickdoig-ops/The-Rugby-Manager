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
import {
  EC_POOLS_2025_26, ES_POOLS_2025_26,
  EC_FIXTURES_2025_26, ES_FIXTURES_2025_26,
  EURO_CUP_SEED_ROUNDS, EURO_SHIELD_SEED_ROUNDS,
  buildEuropeanCompSeed,
} from './europeanScheduler';

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

  // Run all unplayed pool fixtures headlessly for one competition.
  async runPoolStage(competition: 'europeanCup' | 'europeanShield'): Promise<void> {
    const comp = this.state.league[competition];
    if (!comp) return;
    for (const fx of comp.fixtures.filter(f => !f.result)) {
      await this.simulatePoolFixture(competition, fx);
    }
  }

  // Seed and run the knockout stage for one competition.
  // Must be called after runPoolStage().
  async runKnockoutStage(competition: 'europeanCup' | 'europeanShield'): Promise<void> {
    const comp = this.state.league[competition];
    if (!comp || comp.knockout !== null) return;
    const shieldDropdowns = competition === 'europeanShield'
      ? this.computeEcDropdowns()
      : [];
    const r16 = this.seedR16(competition, shieldDropdowns);
    applySeasonEvent(this.state, {
      type: 'EUROPEAN_KNOCKOUT_SEEDED',
      competition,
      r16,
      quarterfinals: Array.from({ length: 4 }, (_, i) => ({ matchIndex: i, homeId: null, awayId: null })),
      semifinals: [{ matchIndex: 0, homeId: null, awayId: null }, { matchIndex: 1, homeId: null, awayId: null }],
      final: { matchIndex: 0, homeId: null, awayId: null },
    });
    await this.runKnockoutRound(competition, 'r16');
    await this.runKnockoutRound(competition, 'quarterfinal');
    await this.runKnockoutRound(competition, 'semifinal');
    await this.runKnockoutRound(competition, 'final');
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
      // 4 pools × 4 = 16 teams. Cross-pool seeding: pool winners avoid each other.
      // Match 0: Pool1[0] h vs Pool2[3] a
      // Match 1: Pool2[0] h vs Pool1[3] a
      // Match 2: Pool3[0] h vs Pool4[3] a
      // Match 3: Pool4[0] h vs Pool3[3] a
      // Match 4: Pool1[1] h vs Pool3[2] a
      // Match 5: Pool2[1] h vs Pool4[2] a
      // Match 6: Pool3[1] h vs Pool1[2] a
      // Match 7: Pool4[1] h vs Pool2[2] a
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
      // Shield: 3 pools' top 4 = 12 teams + 4 EC dropdowns = 16.
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

  private async runKnockoutRound(
    competition: 'europeanCup' | 'europeanShield',
    stage: 'r16' | 'quarterfinal' | 'semifinal' | 'final',
  ): Promise<void> {
    const comp = this.state.league[competition];
    const ko = comp?.knockout;
    if (!ko) return;
    const seedRounds = competition === 'europeanCup' ? EURO_CUP_SEED_ROUNDS : EURO_SHIELD_SEED_ROUNDS;
    const seedRound = stage === 'r16' ? seedRounds.r16
      : stage === 'quarterfinal' ? seedRounds.qf
      : stage === 'semifinal' ? seedRounds.sf
      : seedRounds.final;
    const matches: EuropeanKnockoutMatch[] = stage === 'r16' ? ko.r16
      : stage === 'quarterfinal' ? ko.quarterfinals
      : stage === 'semifinal' ? (ko.semifinals as EuropeanKnockoutMatch[])
      : [ko.final];
    for (const match of matches) {
      if (match.result || !match.homeId || !match.awayId) continue;
      const homeTeam = this.teamsById.get(match.homeId) ?? buildEuropeanOpponent(match.homeId);
      const awayTeam = this.teamsById.get(match.awayId) ?? buildEuropeanOpponent(match.awayId);
      if (!homeTeam || !awayTeam) continue;
      const sim = await simulateFixture(homeTeam, awayTeam, this.state.seed, seedRound);
      applySeasonEvent(this.state, {
        type: 'EUROPEAN_KNOCKOUT_RECORDED',
        competition,
        stage,
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
