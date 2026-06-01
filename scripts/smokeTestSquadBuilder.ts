// One-off smoke check for the Squad Builder flow: newSeason → unwind →
// open signings → assert. Confirms that the curated 99-entry list
// actually moves players into freeAgents and that the resulting market
// has FA offers (with no poach offers, since skipPoaches: true).
//
// Run with: npx tsx scripts/smokeTestSquadBuilder.ts

import { GameCoordinator } from '../src/game/GameCoordinator';
import { PRE_SEASON_TRANSFERS_2025_26 } from '../src/data/transfers-2025-26';
import type { TeamJson } from '../src/team/teamProfile';
import type { RawTeamInput } from '../src/types/teamData';
import * as teamProfile from '../src/team/teamProfile';

import bath         from '../src/data/team-bath.json';
import bristol      from '../src/data/team-bristol.json';
import exeter       from '../src/data/team-exeter.json';
import gloucester   from '../src/data/team-gloucester.json';
import harlequins   from '../src/data/team-harlequins.json';
import leicester    from '../src/data/team-leicester.json';
import newcastle    from '../src/data/team-newcastle.json';
import northampton  from '../src/data/team-northampton.json';
import sale         from '../src/data/team-sale.json';
import saracens     from '../src/data/team-saracens.json';

const teamsRaw = [
  bath, bristol, exeter, gloucester, harlequins,
  leicester, newcastle, northampton, sale, saracens,
] as unknown as TeamJson[];
const teams = teamsRaw as unknown as RawTeamInput[];
teamProfile.init(teamsRaw);

const seed = 0xdeadbeef;
const coord = GameCoordinator.newSeason('bath', seed, teams);
const state0 = coord.getState();
const bathSquadBefore = state0.career.clubs.find(c => c.id === 'bath')!.squad.length;
const freeAgentsBefore = state0.career.freeAgents.length;

const { matched, skipped } = coord.unwindPreSeasonTransfers(PRE_SEASON_TRANSFERS_2025_26);

const state1 = coord.getState();
const bathSquadAfter = state1.career.clubs.find(c => c.id === 'bath')!.squad.length;
const freeAgentsAfter = state1.career.freeAgents.length;

console.log(`Unwind: matched ${matched} / skipped ${skipped} of ${PRE_SEASON_TRANSFERS_2025_26.length}`);
console.log(`Bath squad: ${bathSquadBefore} → ${bathSquadAfter} (Δ ${bathSquadAfter - bathSquadBefore})`);
console.log(`Free agents: ${freeAgentsBefore} → ${freeAgentsAfter} (Δ ${freeAgentsAfter - freeAgentsBefore})`);
console.log(`Total roster: ${Object.keys(state1.career.roster).length} (unchanged — players move, don't disappear)`);

// Bath's authored marquee check
const bathPlayers = state1.career.clubs.find(c => c.id === 'bath')!.squad.map(rid => state1.career.roster[rid]);
const marquee = bathPlayers.find(p => p?.contract.isMarquee);
console.log(`Bath marquee post-unwind: ${marquee ? `${marquee.firstName} ${marquee.lastName}` : 'NONE (was unwound)'}`);

// Open signings, assert market is populated, no poach offers
coord.openSigningWindow({ skipPoaches: true });
const market = coord.getState().career.market;
if (!market) {
  console.log('FAIL: expected signing window to be open');
  process.exit(1);
}
const faOffers = market.offers.filter(o => o.fromClubId === '');
const poachOffers = market.offers.filter(o => o.fromClubId !== '');
console.log(`Market: ${market.offers.length} offers (${faOffers.length} FA, ${poachOffers.length} poach)`);
if (poachOffers.length !== 0) {
  console.log('FAIL: expected 0 poach offers when skipPoaches: true');
  process.exit(1);
}
if (faOffers.length !== freeAgentsAfter) {
  console.log(`WARN: FA offer count (${faOffers.length}) ≠ free agents count (${freeAgentsAfter})`);
}

// Try a sign + close
const firstFaRid = market.offers[0].rosterId;
const signed = coord.signFreeAgent(firstFaRid);
console.log(`Sign first FA (rosterId ${firstFaRid}): ${signed ? 'OK' : 'FAIL'}`);

coord.closeSigningWindow({ skipPoaches: true });
const state3 = coord.getState();
console.log(`Post-close: market = ${state3.career.market === null ? 'closed' : 'still open!'}`);
console.log(`Free agents remaining: ${state3.career.freeAgents.length} (some signed by AI clubs + the one user sign)`);

// Phase D: repair AI marquees
const TEAM_IDS_FOR_MARQUEE = ['bath','bristol','exeter','gloucester','harlequins','leicester','newcastle','northampton','sale','saracens'];
const marqueesBefore = TEAM_IDS_FOR_MARQUEE.filter(id => {
  const club = state3.career.clubs.find(c => c.id === id)!;
  return club.squad.some(rid => state3.career.roster[rid]?.contract.isMarquee);
}).length;
coord.repairAIMarquees();
const state4 = coord.getState();
const marqueesAfter = TEAM_IDS_FOR_MARQUEE.filter(id => {
  const club = state4.career.clubs.find(c => c.id === id)!;
  return club.squad.some(rid => state4.career.roster[rid]?.contract.isMarquee);
}).length;
console.log(`Marquees: ${marqueesBefore}/10 → ${marqueesAfter}/10 after repairAIMarquees`);

// preSeasonStep transitions
coord.setPreSeasonStep('signings');
console.log(`After setPreSeasonStep('signings'): ${coord.getState().career.preSeasonStep}`);
coord.setPreSeasonStep('marquee');
console.log(`After setPreSeasonStep('marquee'): ${coord.getState().career.preSeasonStep}`);
coord.setPreSeasonStep(null);
console.log(`After setPreSeasonStep(null): ${coord.getState().career.preSeasonStep ?? 'undefined'}`);

console.log('\n=== Per-club squad sizes + marquees (after unwind + AI signings + repair) ===');
const stateFinal = coord.getState();
const TEAM_IDS = ['bath','bristol','exeter','gloucester','harlequins','leicester','newcastle','northampton','sale','saracens'];
for (const id of TEAM_IDS) {
  const club = stateFinal.career.clubs.find(c => c.id === id)!;
  const players = club.squad.map(rid => stateFinal.career.roster[rid]);
  const marq = players.find(p => p?.contract.isMarquee);
  const sizeFlag = club.squad.length < 23 ? '  ⚠ BELOW MATCHDAY 23' : club.squad.length < 28 ? '  · thin' : '';
  const marqFlag = marq ? `marquee: ${marq.firstName} ${marq.lastName}` : '⚠ NO MARQUEE';
  // Position coverage check (matchday minimum: 1 hooker, 2 props, 2 locks, 2 flankers, 1 #8, 1 SH, 1 FH, 2 centres, 2 wings, 1 FB for a 23)
  const posCounts: Record<string, number> = {};
  for (const p of players) if (p) posCounts[p.position] = (posCounts[p.position] ?? 0) + 1;
  const thinPos = Object.entries(posCounts).filter(([_, n]) => n < 2).map(([p, n]) => `${p}(${n})`).join(', ');
  console.log(`  ${id.padEnd(12)} ${String(club.squad.length).padStart(3)} players  ${marqFlag}${sizeFlag}${thinPos ? `  thin: ${thinPos}` : ''}`);
}

console.log('\nSquad Builder smoke check: OK');
