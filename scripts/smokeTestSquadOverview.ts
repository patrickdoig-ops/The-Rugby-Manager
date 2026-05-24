// One-off smoke check for the SquadOverview depth chart. Runs the
// Squad Builder flow up to the point where the overview would render
// (post-unwind, pre-signings) and dumps the 9-group bucket counts +
// top-2 for the human player's club so we can sanity-check the data
// before clicking through in a browser.
//
// Run with: npx tsx scripts/smokeTestSquadOverview.ts

import { GameCoordinator } from '../src/game/GameCoordinator';
import { PRE_SEASON_TRANSFERS_2025_26 } from '../src/data/transfers-2025-26';
import { applyStarBoost } from '../src/team/applyStarBoost';
import type { TeamJson } from '../src/team/teamProfile';
import type { RawTeamInput } from '../src/types/teamData';
import * as teamProfile from '../src/team/teamProfile';
import { playerOverall } from '../src/engine/RatingEngine';
import { getAge } from '../src/game/age';
import { POSITION_GROUPS_ORDER, POSITION_TO_GROUP, POSITION_GROUP_DEPTH_TARGET } from '../src/game/positionGroups';

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

const teamsRaw = ([
  bath, bristol, exeter, gloucester, harlequins,
  leicester, newcastle, northampton, sale, saracens,
] as unknown as TeamJson[]).map(applyStarBoost);
const teams = teamsRaw as unknown as RawTeamInput[];
teamProfile.init(teamsRaw);

const club = process.argv[2] ?? 'newcastle';
const seed = 0xdeadbeef;

const coord = GameCoordinator.newSeason(club, seed, teams);
coord.unwindPreSeasonTransfers(PRE_SEASON_TRANSFERS_2025_26);
const state = coord.getState();
const calendarDate = state.calendar.date;

const clubState = state.career.clubs.find(c => c.id === club)!;
const players = clubState.squad
  .map(rid => state.career.roster[rid])
  .filter((p): p is NonNullable<typeof p> => !!p);

const buckets = new Map<string, typeof players>();
for (const p of players) {
  const gid = POSITION_TO_GROUP[p.position];
  const arr = buckets.get(gid) ?? [];
  arr.push(p);
  buckets.set(gid, arr);
}

console.log(`\nSquad Overview — ${club} (post-unwind, ${players.length} players)\n`);
let thinCount = 0;
for (const group of POSITION_GROUPS_ORDER) {
  if (group.id === 'all') continue;
  const bucket = (buckets.get(group.id) ?? [])
    .slice()
    .sort((a, b) => playerOverall(b.baseStats, b.position) - playerOverall(a.baseStats, a.position));
  const count = bucket.length;
  const depthTarget = POSITION_GROUP_DEPTH_TARGET[group.id];
  const thin = count < depthTarget;
  if (thin) thinCount++;
  const flag = thin ? `  ⚠ THIN (target ${depthTarget})` : '';
  console.log(`  ${group.label.padEnd(16)} count=${String(count).padStart(2)} (target ${depthTarget})${flag}`);
  for (let i = 0; i < depthTarget; i++) {
    const p = bucket[i];
    if (!p) {
      console.log(`    [empty slot — No depth — sign a player]`);
      continue;
    }
    const ovr = playerOverall(p.baseStats, p.position);
    const age = getAge(p.dob, calendarDate);
    console.log(`    ${p.firstName.padEnd(14)} ${p.lastName.padEnd(20)} ${p.position.padEnd(14)} age=${age} OVR=${ovr}`);
  }
}
console.log(`\nThin positions: ${thinCount}`);
