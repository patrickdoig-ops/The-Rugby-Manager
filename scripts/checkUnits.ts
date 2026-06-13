// Fast unit assertions for pure / near-pure helpers — no match simulations, so
// it runs in well under a second and is part of `npm run verify`. The career /
// determinism harnesses cover end-to-end behaviour; this isolates specific
// contracts they don't pin down on their own, and regression-guards the exact
// logic touched in the v3.4x review pass (save-parser field preservation, the
// training-period split contract, budget accounting, contract-expiry dates).
//
// Add a check by calling `check(name, condition)`; a failure prints and the
// script exits 1.

import { splitGapIntoPeriods } from '../src/game/trainingCalendar.js';
import { expiryAfterYears } from '../src/game/aiTransferDirector.js';
import { clubBudgetUsage } from '../src/game/teamStats.js';
import { GameCoordinator } from '../src/game/GameCoordinator.js';
import { parseRawSave, SAVE_VERSION } from '../src/ui/SaveManager.js';
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

let failures = 0;
function check(name: string, condition: boolean, detail = ''): void {
  if (!condition) {
    failures++;
    console.error(`FAIL: ${name}${detail ? ' — ' + detail : ''}`);
  }
}
const sum = (a: number[]): number => a.reduce((x, y) => x + y, 0);

// ── splitGapIntoPeriods: exactly `weeks` spans, each ≥ 1, summing to `days`
//    when days ≥ weeks (the span COUNT is the load-bearing contract) ─────────
check('split (36,5) sum', sum(splitGapIntoPeriods(36, 5)) === 36);
check('split (36,5) count', splitGapIntoPeriods(36, 5).length === 5);
check('split (36,5) front-loaded', JSON.stringify(splitGapIntoPeriods(36, 5)) === JSON.stringify([8, 7, 7, 7, 7]));
check('split (6,1)', JSON.stringify(splitGapIntoPeriods(6, 1)) === JSON.stringify([6]));
check('split count preserved when days<weeks', splitGapIntoPeriods(3, 5).length === 5);
check('split every span ≥ 1', splitGapIntoPeriods(3, 5).every(x => x >= 1));

// ── Save-parser field preservation (regression guard for the load-path Blocker:
//    parseSavedGame rebuilds SavedSeason field-by-field; a dropped field is lost
//    on every Continue). Round-trip a fresh payload through the REAL load path. ─
{
  const coord = await GameCoordinator.newSeason('bath', 0xBEEF, allTeams);
  const payload = JSON.parse(JSON.stringify(coord.toSavePayload())) as Record<string, unknown>;
  const parsed = parseRawSave(JSON.stringify({ ...payload, version: SAVE_VERSION })) as Record<string, unknown> | null;
  check('parser returns non-null on a fresh payload', parsed !== null);
  if (parsed) {
    // Every top-level key the writer emits must survive the parser.
    for (const key of Object.keys(payload)) {
      check(`parser preserves top-level "${key}"`, key in parsed, 'dropped on load');
    }
    // careerRngOffset must round-trip as the same number (resumes the career RNG
    // stream; dropping it silently reset every reloaded career to offset 0).
    check('parser preserves careerRngOffset value',
      typeof payload.careerRngOffset !== 'number' || parsed.careerRngOffset === payload.careerRngOffset,
      `wrote ${String(payload.careerRngOffset)}, read ${String(parsed.careerRngOffset)}`);
    // career sub-object must keep its key set (loanPool etc.).
    const wroteCareer = payload.career as Record<string, unknown> | undefined;
    const readCareer = parsed.career as Record<string, unknown> | undefined;
    if (wroteCareer && readCareer) {
      for (const key of Object.keys(wroteCareer)) {
        check(`parser preserves career."${key}"`, key in readCareer, 'dropped on load');
      }
    }
  }
}

// ── clubBudgetUsage: sums the managed club's non-marquee squad wages ─────────
{
  const coord = await GameCoordinator.newSeason('bath', 0x1234, allTeams);
  const state = coord.getState();
  const club = state.career.clubs.find(c => c.id === 'bath')!;
  let expected = 0;
  for (const rid of club.squad) {
    const p = state.career.roster[rid];
    if (p && !p.contract.isMarquee) expected += p.contract.annualWage;
  }
  // Fresh season: no pending poaches / bids, so usage == squad non-marquee wages.
  check('clubBudgetUsage == squad non-marquee wages on a fresh season',
    clubBudgetUsage(state, 'bath') === expected,
    `expected ${expected}, got ${clubBudgetUsage(state, 'bath')}`);
  check('clubBudgetUsage is within the club budget on a fresh season',
    clubBudgetUsage(state, 'bath') <= club.salaryBudget);
}

// ── expiryAfterYears: a length-L renewal in season "Y/.." expires Y+1+L ──────
{
  const coord = await GameCoordinator.newSeason('bath', 0xABCD, allTeams);
  const state = coord.getState();
  const startYear = Number(state.calendar.seasonLabel.slice(0, 4));
  check('expiryAfterYears(3) = startYear+4-06-30',
    expiryAfterYears(state, 3) === `${startYear + 4}-06-30`,
    expiryAfterYears(state, 3));
  check('expiryAfterYears(1) clears the current end-of-season cutoff',
    expiryAfterYears(state, 1) === `${startYear + 2}-06-30`);
}

if (failures > 0) {
  console.error(`\n${failures} unit check(s) failed.`);
  process.exit(1);
}
console.log('OK: all unit checks pass (split-periods, save-parser preservation, budget accounting, contract expiry).');
