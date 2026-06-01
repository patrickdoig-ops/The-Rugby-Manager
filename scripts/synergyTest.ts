import { MatchCoordinator } from '../src/engine/MatchCoordinator.js';
import { deriveFixtureSeed } from '../src/game/derive.js';
import { eventBus } from '../src/utils/eventBus.js';
import type { RawTeamInput } from '../src/types/teamData.js';
import type { MatchState } from '../src/types/match.js';

import bathRaw        from '../src/data/team-bath.json'        with { type: 'json' };
import bristolRaw     from '../src/data/team-bristol.json'     with { type: 'json' };
import exeterRaw      from '../src/data/team-exeter.json'      with { type: 'json' };
import gloucesterRaw  from '../src/data/team-gloucester.json'  with { type: 'json' };
import harlequinsRaw  from '../src/data/team-harlequins.json'  with { type: 'json' };
import leicesterRaw   from '../src/data/team-leicester.json'   with { type: 'json' };
import newcastleRaw   from '../src/data/team-newcastle.json'   with { type: 'json' };
import northamptonRaw from '../src/data/team-northampton.json' with { type: 'json' };
import saleRaw        from '../src/data/team-sale.json'        with { type: 'json' };
import saracensRaw    from '../src/data/team-saracens.json'    with { type: 'json' };

const ROOT_SEEDS = [0xDEADBEEF, 0xCAFEBABE];
const TEST_TEAM_ID = 'bath';

const BOOSTED_TEAMS = [
  bathRaw, bristolRaw, exeterRaw, gloucesterRaw, harlequinsRaw,
  leicesterRaw, newcastleRaw, northamptonRaw, saleRaw, saracensRaw,
] as unknown as RawTeamInput[];

function runSilent(home: RawTeamInput, away: RawTeamInput, seed: number, consume: (state: MatchState) => void): Promise<void> {
  return new Promise(resolve => {
    const engine = new MatchCoordinator(home, away, { tickDelayMs: 0, seed, silent: true, commentaryBufferCap: 10000 });
    const off = eventBus.on('engine:finished', ({ state }) => { off(); consume(state); engine.destroy(); resolve(); });
    engine.initialize();
    engine.start();
  });
}

async function testSynergy(style: any, breakdown: any, label: string) {
  const testTeamIdx = BOOSTED_TEAMS.findIndex(t => t.id === TEST_TEAM_ID);
  const baselineTest = BOOSTED_TEAMS[testTeamIdx];
  const overriddenTest = {
    ...baselineTest,
    suggestedTactics: {
      ...baselineTest.suggestedTactics!,
      attackingStyle: style,
      attackingBreakdown: breakdown,
    }
  };

  let played = 0;
  let wins = 0;
  let pointsFor = 0;
  
  for (const rootSeed of ROOT_SEEDS) {
    let round = 1;
    for (const home of BOOSTED_TEAMS) {
      for (const away of BOOSTED_TEAMS) {
        if (home.id === away.id) continue;
        if (home.id !== TEST_TEAM_ID && away.id !== TEST_TEAM_ID) continue;
        const fixtureSeed = deriveFixtureSeed(rootSeed, round++, home.id, away.id);
        const homeRun = home.id === TEST_TEAM_ID ? overriddenTest : home;
        const awayRun = away.id === TEST_TEAM_ID ? overriddenTest : away;
        
        await runSilent(homeRun, awayRun, fixtureSeed, state => {
          played++;
          const testScore = state.score[home.id === TEST_TEAM_ID ? 'home' : 'away'];
          const oppScore = state.score[home.id === TEST_TEAM_ID ? 'away' : 'home'];
          if (testScore > oppScore) wins++;
          pointsFor += testScore;
        });
      }
    }
  }

  console.log(`| ${label.padEnd(30)} | ${(100 * wins / played).toFixed(1)}% | ${(pointsFor / played).toFixed(2)} |`);
}

async function run() {
  console.log('# Attacking Synergy Test — BATH\n');
  console.log('| strategy combo                 | win % | PF/g |');
  console.log('|--------------------------------|-------|------|');

  await testSynergy('keep_it_tight', 'commit_numbers', 'keep_it_tight + commit_numbers');
  await testSynergy('wide_wide', 'minimal_ruck', 'wide_wide + minimal_ruck');
  await testSynergy('wide_wide', 'commit_numbers', 'wide_wide + commit_numbers');
  await testSynergy('keep_it_tight', 'minimal_ruck', 'keep_it_tight + minimal_ruck');
}

run().catch(console.error);
