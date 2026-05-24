// Compares each club's authored marquee + seeded wage against an
// external 2025-26 marquee list.
// Run with: npx tsx scripts/auditMarquees.ts

import { GameCoordinator } from '../src/game/GameCoordinator';
import { applyStarBoost } from '../src/team/applyStarBoost';
import type { TeamJson } from '../src/team/teamProfile';
import type { RawTeamInput } from '../src/types/teamData';
import * as teamProfile from '../src/team/teamProfile';

import bath from '../src/data/team-bath.json';
import bristol from '../src/data/team-bristol.json';
import exeter from '../src/data/team-exeter.json';
import gloucester from '../src/data/team-gloucester.json';
import harlequins from '../src/data/team-harlequins.json';
import leicester from '../src/data/team-leicester.json';
import newcastle from '../src/data/team-newcastle.json';
import northampton from '../src/data/team-northampton.json';
import sale from '../src/data/team-sale.json';
import saracens from '../src/data/team-saracens.json';

const teamsRaw = ([
  bath, bristol, exeter, gloucester, harlequins,
  leicester, newcastle, northampton, sale, saracens,
] as unknown as TeamJson[]).map(applyStarBoost);
const teams = teamsRaw as unknown as RawTeamInput[];
teamProfile.init(teamsRaw);

const coord = GameCoordinator.newSeason('bath', 0xdeadbeef, teams);
const state = coord.getState();

interface Expected { club: string; name: string; wage: number; note?: string }
const EXPECTED: Expected[] = [
  { club: 'bath',        name: 'Finn Russell',           wage: 1_000_000 },
  { club: 'leicester',   name: 'Ollie Chessum',          wage:   550_000 },
  { club: 'sale',        name: 'George Ford',            wage:   750_000 },
  { club: 'bristol',     name: 'Louis Rees-Zammit',      wage:   550_000 },
  { club: 'saracens',    name: 'Maro Itoje',             wage:   800_000 },
  { club: 'gloucester',  name: 'Tomos Williams',         wage:   550_000 },
  { club: 'harlequins',  name: 'Marcus Smith',           wage:   525_000 },
  { club: 'northampton', name: 'Fin Smith',              wage:   600_000 },
  { club: 'exeter',      name: 'Immanuel Feyi-Waboso',   wage:   500_000 },
  { club: 'newcastle',   name: 'Liam Williams',          wage:         0, note: 'article: no true marquee; closest fit Liam Williams (1-year deal, wage not specified)' },
];

function fmtWage(n: number): string {
  if (n >= 1_000_000) return `£${(n / 1_000_000).toFixed(2)}m`;
  if (n >= 1_000) return `£${Math.round(n / 1_000)}k`;
  return `£${n}`;
}

console.log('Authored marquee vs the user-provided list (Quick Start state, pre-unwind):\n');
console.log('Club          | Authored marquee + seeded wage    | Article                      | Verdict');
console.log('--------------|-----------------------------------|------------------------------|--------');

for (const e of EXPECTED) {
  const club = state.career.clubs.find(c => c.id === e.club)!;
  const players = club.squad.map(rid => state.career.roster[rid]).filter(p => p);
  const marquee = players.find(p => p!.contract.isMarquee);
  const marqueeStr = marquee
    ? `${marquee.firstName} ${marquee.lastName} (${fmtWage(marquee.contract.annualWage)})`
    : 'NONE';

  // Try to find the expected player on the roster (any club) — for cases
  // where the article's marquee isn't yet flagged as marquee.
  let expectedOnRoster: { teamId: string; wage: number } | null = null;
  for (const c of state.career.clubs) {
    for (const rid of c.squad) {
      const p = state.career.roster[rid];
      if (p && `${p.firstName} ${p.lastName}` === e.name) {
        expectedOnRoster = { teamId: c.id, wage: p.contract.annualWage };
        break;
      }
    }
    if (expectedOnRoster) break;
  }

  const articleStr = `${e.name} (${fmtWage(e.wage)})`;
  let verdict = '';
  if (marquee && `${marquee.firstName} ${marquee.lastName}` === e.name) {
    verdict = `✓ match — wage ${fmtWage(marquee.contract.annualWage)} vs target ${fmtWage(e.wage)}`;
  } else if (marquee) {
    verdict = `✗ different marquee`;
    if (expectedOnRoster) verdict += ` (article's pick is on ${expectedOnRoster.teamId} at ${fmtWage(expectedOnRoster.wage)})`;
    else verdict += ` (article's pick not in seed roster)`;
  } else {
    verdict = `✗ no authored marquee`;
    if (expectedOnRoster) verdict += ` — article's pick on ${expectedOnRoster.teamId} at ${fmtWage(expectedOnRoster.wage)}`;
  }
  console.log(`${e.club.padEnd(13)} | ${marqueeStr.padEnd(33)} | ${articleStr.padEnd(28)} | ${verdict}`);
  if (e.note) console.log(`              | ${e.note}`);
}
