// Save-schema snapshot guard.
//
// Enforces the "shape change ⇒ SAVE_VERSION bump" policy that is otherwise
// only a convention. Boots a fresh, deterministic new-season career through
// GameCoordinator, serialises it via toSavePayload(), and compares the
// serialised SavedSeason / SavedCareer key sets (plus the live SAVE_VERSION)
// against a pinned snapshot. On any drift it fails (exit 1) and prints the
// remediation: either the change is additive-optional (confirm, then update
// the EXPECTED snapshot below) or it changes the shape (bump SAVE_VERSION and
// add the matching MIGRATIONS[N] step in src/ui/SaveManager.ts).
//
// Scope/limitation: this snapshots the *fresh new-season* payload, so it
// reliably catches removal / rename / addition of fields that are always
// present at season start. New strictly-optional fields that are absent on a
// fresh save are the documented no-bump case and won't trip it — that's the
// intended behaviour. Companion to checkDeterminism.ts / checkSeasonDeterminism.ts.

import { GameCoordinator } from '../src/game/GameCoordinator.js';
import { SAVE_VERSION } from '../src/ui/SaveManager.js';
import type { RawTeamInput } from '../src/types/teamData.js';

import bathRaw         from '../src/data/team-bath.json' with { type: 'json' };
import bristolRaw      from '../src/data/team-bristol.json' with { type: 'json' };
import exeterRaw       from '../src/data/team-exeter.json' with { type: 'json' };
import gloucesterRaw   from '../src/data/team-gloucester.json' with { type: 'json' };
import harlequinsRaw   from '../src/data/team-harlequins.json' with { type: 'json' };
import leicesterRaw    from '../src/data/team-leicester.json' with { type: 'json' };
import newcastleRaw    from '../src/data/team-newcastle.json' with { type: 'json' };
import northamptonRaw  from '../src/data/team-northampton.json' with { type: 'json' };
import saleRaw         from '../src/data/team-sale.json' with { type: 'json' };
import saracensRaw     from '../src/data/team-saracens.json' with { type: 'json' };

const allTeams = [
  bathRaw, bristolRaw, exeterRaw, gloucesterRaw, harlequinsRaw,
  leicesterRaw, newcastleRaw, northamptonRaw, saleRaw, saracensRaw,
] as unknown as RawTeamInput[];

// Pinned snapshot — bump `version` and update the key lists together whenever
// the serialised shape legitimately changes (and add a MIGRATIONS step).
// The nested key sets (player / club / fixture) catch shape drift inside
// representative records that the two top-level key sets can't see.
const EXPECTED = {
  version: 2,
  topKeys: 'board,career,careerRngOffset,currentWeek,europeanCup,europeanShield,fixtures,mediaStories,playerTeamId,premCup,results,seasonLabel,seed,teamSeasonStats',
  careerKeys: 'activePoachedIds,archive,clubs,freeAgents,loanPool,market,midseasonRejections,nextRosterId,nextStaffId,pendingMoves,roster,seasonsCompleted,staff,takeoverHistory',
  playerKeys: 'baseStats,condition,contract,currentStats,dob,fatiguePct,firstName,formModifier,id,lastName,matchStats,morale,nationality,position,potential,rating,reputation,rosterId,seasonStats,squadNumber,x,y',
  clubKeys: 'id,salaryBudget,squad',
  fixtureKeys: 'awayId,date,homeId,round',
};

const coord = await GameCoordinator.newSeason('bath', 0xDEADBEEF, allTeams);
const payload = coord.toSavePayload() as Record<string, unknown>;
const career = payload.career as Record<string, unknown>;
const topKeys = Object.keys(payload).sort().join(',');
const careerKeys = Object.keys(career).sort().join(',');
const roster = career.roster as Record<number, object>;
const firstRid = Object.keys(roster).map(Number).sort((a, b) => a - b)[0];
const playerKeys = Object.keys(roster[firstRid]).sort().join(',');
const clubKeys = Object.keys((career.clubs as object[])[0]).sort().join(',');
const fixtureKeys = Object.keys((payload.fixtures as object[])[0]).sort().join(',');

const problems: string[] = [];
if (SAVE_VERSION !== EXPECTED.version) {
  problems.push(`SAVE_VERSION is ${SAVE_VERSION}, snapshot expects ${EXPECTED.version}`);
}
if (topKeys !== EXPECTED.topKeys) {
  problems.push(`SavedSeason keys changed:\n  expected: ${EXPECTED.topKeys}\n  actual:   ${topKeys}`);
}
if (careerKeys !== EXPECTED.careerKeys) {
  problems.push(`SavedCareer keys changed:\n  expected: ${EXPECTED.careerKeys}\n  actual:   ${careerKeys}`);
}
if (playerKeys !== EXPECTED.playerKeys) {
  problems.push(`Player keys changed:\n  expected: ${EXPECTED.playerKeys}\n  actual:   ${playerKeys}`);
}
if (clubKeys !== EXPECTED.clubKeys) {
  problems.push(`ClubState keys changed:\n  expected: ${EXPECTED.clubKeys}\n  actual:   ${clubKeys}`);
}
if (fixtureKeys !== EXPECTED.fixtureKeys) {
  problems.push(`Fixture keys changed:\n  expected: ${EXPECTED.fixtureKeys}\n  actual:   ${fixtureKeys}`);
}

if (problems.length > 0) {
  console.error('SAVE SCHEMA DRIFT\n' + problems.join('\n'));
  console.error(
    '\nIf this change is additive-optional (a new optional field), update the\n' +
    'EXPECTED snapshot in scripts/checkSaveSchema.ts. If it changes the shape of\n' +
    'an existing save, bump SAVE_VERSION + ACCEPTED_VERSIONS and add the matching\n' +
    'MIGRATIONS[N] step in src/ui/SaveManager.ts, then update the snapshot.',
  );
  process.exit(1);
}

console.log(`OK: save schema v${SAVE_VERSION} unchanged (${topKeys.split(',').length} top keys, ${careerKeys.split(',').length} career keys).`);
