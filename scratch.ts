import { MatchCoordinator } from './src/engine/MatchCoordinator.js';
import { deriveFixtureSeed } from './src/game/derive.js';
import { eventBus } from './src/utils/eventBus.js';
import { setInvariantsEnabled } from './src/utils/invariantsMode.js';
import { MatchPhase } from './src/types/engine.js';
import type { MatchState } from './src/types/match.js';
import type { RawTeamInput } from './src/types/teamData.js';

import bathRaw        from './src/data/team-bath.json'        with { type: 'json' };
import bristolRaw     from './src/data/team-bristol.json'     with { type: 'json' };
import exeterRaw      from './src/data/team-exeter.json'      with { type: 'json' };
import gloucesterRaw  from './src/data/team-gloucester.json'  with { type: 'json' };
import harlequinsRaw  from './src/data/team-harlequins.json'  with { type: 'json' };
import leicesterRaw   from './src/data/team-leicester.json'   with { type: 'json' };
import newcastleRaw   from './src/data/team-newcastle.json'   with { type: 'json' };
import northamptonRaw from './src/data/team-northampton.json' with { type: 'json' };
import saleRaw        from './src/data/team-sale.json'        with { type: 'json' };
import saracensRaw    from './src/data/team-saracens.json'    with { type: 'json' };

setInvariantsEnabled(false);

const ALL_TEAMS = [
  bathRaw, bristolRaw, exeterRaw, gloucesterRaw, harlequinsRaw,
  leicesterRaw, newcastleRaw, northamptonRaw, saleRaw, saracensRaw,
] as unknown as RawTeamInput[];

const ROOT_SEEDS = [0xDEADBEEF, 0xCAFEBABE, 0xBEEFCAFE, 0xFACEFEED, 0xC0FFEE00];

async function runSeason(rootSeed: number, stats: Record<string, any>) {
  let round = 1;
  for (const home of ALL_TEAMS) {
    for (const away of ALL_TEAMS) {
      if (home.id === away.id) continue;
      const seed = deriveFixtureSeed(rootSeed, round++, home.id, away.id);

      await new Promise<void>(resolve => {
        const engine = new MatchCoordinator(home, away, { tickDelayMs: 0, seed, silent: true, commentaryBufferCap: 10000 });
        const off = eventBus.on('engine:finished', ({ state }) => {
          off();
          
          let lastPhase = MatchPhase.KickOff;
          for (const e of state.events) {
            if (e.phase === MatchPhase.TryScored && e.narration.steps.length > 0) {
              const concedeId = e.primaryPlayer?.teamId === home.id ? away.id : home.id;
              stats[concedeId].triesConceded++;
              if (lastPhase === MatchPhase.Maul) {
                stats[concedeId].maulTriesConceded++;
              }
            }
            if (e.phase !== MatchPhase.TryScored && e.phase !== MatchPhase.ConversionKick) {
              lastPhase = e.phase;
            }

            if (e.type === 'MAUL_RESOLVED') {
              const defId = e.attackSide === 'home' ? away.id : home.id;
              if (e.outcome === 'maul_held') stats[defId].maulHeld++;
              if (e.outcome === 'maul_collapse_penalty') stats[defId].maulCollapse++;
              if (e.outcome === 'maul_won') stats[defId].maulLost++;
            }
          }

          engine.destroy();
          resolve();
        });
        engine.initialize();
        engine.start();
      });
    }
  }
}

async function main() {
  const stats: Record<string, any> = {};
  for (const t of ALL_TEAMS) {
    stats[t.id] = { maulTriesConceded: 0, triesConceded: 0, maulHeld: 0, maulCollapse: 0, maulLost: 0 };
  }

  for (const seed of ROOT_SEEDS) {
    await runSeason(seed, stats);
  }

  console.log('| Club | Tries Con | Maul Tries Con | Maul Held | Maul Collapse | Maul Lost | % Maul Lost |');
  console.log('|---|---:|---:|---:|---:|---:|---:|');
  for (const t of ALL_TEAMS) {
    const s = stats[t.id];
    const total = s.maulHeld + s.maulCollapse + s.maulLost;
    const pct = total > 0 ? (s.maulLost / total * 100).toFixed(1) + '%' : '-';
    console.log(`| ${t.shortName} | ${s.triesConceded} | ${s.maulTriesConceded} | ${s.maulHeld} | ${s.maulCollapse} | ${s.maulLost} | ${pct} |`);
  }
}

main().catch(console.error);
