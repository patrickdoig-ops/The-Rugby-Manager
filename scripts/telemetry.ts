// Balance + realism telemetry. Runs every (home, away) pairing of the 10-club
// league through a silent MatchCoordinator (no UI, zero tick delay) under
// multiple root seeds, aggregates per-event / per-team / per-player statistics,
// and prints a markdown report.
//
// Not part of `npm run verify` — this is a tuning tool, not a correctness
// gate. Run via `npm run telemetry` when iterating on balance.
//
// Determinism: each fixture derives its own seed via deriveFixtureSeed (same
// recipe as the headless season AI fixtures). With a fixed ROOT_SEEDS list the
// full report is reproducible.
//
// Telemetry raises `commentaryBufferCap` on each MatchCoordinator so the full
// per-match event log survives for offline analysis — the live default of 300
// would truncate the events list and undercount penalty/TMO/phase frequencies.

import { MatchCoordinator } from '../src/engine/MatchCoordinator.js';
import { deriveFixtureSeed } from '../src/game/derive.js';
import { eventBus } from '../src/utils/eventBus.js';
import { applyStarBoost } from '../src/team/applyStarBoost.js';
import type { TeamJson } from '../src/team/teamProfile.js';
import type { RawTeamInput } from '../src/types/teamData.js';
import type { TeamTactics, AttackingGamePlan, AttackingBreakdown, BackfieldDefence, DefensiveLine } from '../src/types/team.js';
import type { MatchState } from '../src/types/match.js';
import type { Player } from '../src/types/player.js';
import { MatchPhase } from '../src/types/engine.js';

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

const ROOT_SEEDS = [0xDEADBEEF, 0xCAFEBABE, 0xBEEFCAFE, 0xFACEFEED, 0xC0FFEE00];
const COMMENTARY_CAP_HIGH = 10000;
const MIN_APPEARANCES_FOR_RATE = 9; // half a season — used for per-game leaderboards

const ALL_TEAMS = ([
  bathRaw, bristolRaw, exeterRaw, gloucesterRaw, harlequinsRaw,
  leicesterRaw, newcastleRaw, northamptonRaw, saleRaw, saracensRaw,
] as unknown as TeamJson[]).map(applyStarBoost) as unknown as RawTeamInput[];

// ── Per-club aggregator ──────────────────────────────────────────────────
interface ClubAgg {
  games: number;
  wins: number; draws: number; losses: number;
  pointsFor: number; pointsAgainst: number;
  // Bonus points: try bonus = ≥4 tries, losing bonus = lost by ≤7
  tryBonusPoints: number;
  losingBonusPoints: number;
  // Per-player matchStats sums
  tries: number;
  carries: number;
  metresCarried: number;
  lineBreaks: number;
  defendersBeaten: number;
  knockOns: number;
  passes: number;
  tacklesAttempted: number;
  tacklesMade: number;
  dominantTackles: number;
  turnoversWon: number;
  penaltiesConceded: number;
  kicksFromHand: number;
  kickMetres: number;
  rucksHit: number;
  yellowCards: number;
  redCards: number;
  lineoutSteals: number;
  scrumPenaltiesWon: number;
  // Goal-kicking split (derived from score arithmetic)
  conversionsAttempted: number;
  conversionsMade: number;
  penaltyKicksAttempted: number;
  penaltyKicksMade: number;
  // Set piece & possession (from state.stats)
  ownLineoutsThrown: number;
  ownLineoutsWon: number;
  ownScrumsPutIn: number;
  ownScrumsWon: number;
  possessionTicks: number;
  territoryTicks: number;
  totalTicks: number;
  handlingErrors: number;
  entries22Count: number;
  entries22Points: number;
}

function emptyClubAgg(): ClubAgg {
  return {
    games: 0, wins: 0, draws: 0, losses: 0,
    pointsFor: 0, pointsAgainst: 0,
    tryBonusPoints: 0, losingBonusPoints: 0,
    tries: 0, carries: 0, metresCarried: 0, lineBreaks: 0, defendersBeaten: 0,
    knockOns: 0, passes: 0, tacklesAttempted: 0, tacklesMade: 0, dominantTackles: 0,
    turnoversWon: 0, penaltiesConceded: 0,
    kicksFromHand: 0, kickMetres: 0, rucksHit: 0,
    yellowCards: 0, redCards: 0, lineoutSteals: 0, scrumPenaltiesWon: 0,
    conversionsAttempted: 0, conversionsMade: 0,
    penaltyKicksAttempted: 0, penaltyKicksMade: 0,
    ownLineoutsThrown: 0, ownLineoutsWon: 0,
    ownScrumsPutIn: 0, ownScrumsWon: 0,
    possessionTicks: 0, territoryTicks: 0, totalTicks: 0,
    handlingErrors: 0,
    entries22Count: 0, entries22Points: 0,
  };
}

// ── Per-player aggregator ────────────────────────────────────────────────
interface PlayerAgg {
  name: string;
  teamId: string;
  position: string;
  appearances: number;
  tries: number;
  carries: number;
  metresCarried: number;
  lineBreaks: number;
  defendersBeaten: number;
  passes: number;
  tacklesMade: number;
  tacklesAttempted: number;
  dominantTackles: number;
  turnoversWon: number;
  knockOns: number;
  penaltiesConceded: number;
  kicksFromHand: number;
  kickMetres: number;
  kicksAtGoal: number;
  kicksMade: number;
  rucksHit: number;
  yellowCards: number;
  redCards: number;
  ratingSum: number;
}

function emptyPlayerAgg(name: string, teamId: string, position: string): PlayerAgg {
  return {
    name, teamId, position, appearances: 0,
    tries: 0, carries: 0, metresCarried: 0, lineBreaks: 0, defendersBeaten: 0,
    passes: 0, tacklesMade: 0, tacklesAttempted: 0, dominantTackles: 0,
    turnoversWon: 0, knockOns: 0, penaltiesConceded: 0,
    kicksFromHand: 0, kickMetres: 0, kicksAtGoal: 0, kicksMade: 0,
    rucksHit: 0, yellowCards: 0, redCards: 0, ratingSum: 0,
  };
}

// ── Per-season aggregator ────────────────────────────────────────────────
interface PlanAgg { games: number; tries: number; kickMetres: number; possessionPct: number; pointsFor: number; pointsAgainst: number; }
interface BdAgg   { games: number; metresCarried: number; carries: number; turnoversWon: number; pointsFor: number; }
interface BfAgg   { games: number; concededLineBreaks: number; concededKickMetres: number; pointsAgainst: number; }
interface DlAgg   { games: number; concededLineBreaks: number; dominantTacklesMade: number; concededMetresCarried: number; concededCarries: number; pointsAgainst: number; }

interface SeasonAgg {
  clubs: Map<string, ClubAgg>;
  players: Map<string, PlayerAgg>; // key: `${teamId}|${firstName} ${lastName}`
  homeWins: number; awayWins: number; draws: number;
  homePoints: number; awayPoints: number;
  matchCount: number;
  // Penalty offence taxonomy (sourced from narration phase_outcome keys)
  penOffence: { highTackle: number; breakdown: number; scrum: number; offsideAtRuck: number; obstruction: number; dangerousCleanout: number; notRollingAway: number };
  // 50/22 outcomes — sourced from TacticalKick narration keys. 'fifty_twenty_two'
  // covers both deliberate-success and accidental side-effect (territory kick
  // that happens to land in opp 22); the two attempt-failed keys are emitted
  // only by the deliberate fifty_22 path (KickDecisionDirector family).
  fiftyTwoTwo: { success: number; failedTouch: number; failedCaught: number };
  // Attacking kicks (cross-field + grubber). Both sub-types resolve to one
  // of three outcomes via resolveAttackingKick.
  attackingKicks: {
    crossFieldCaught: number;     crossFieldContested: number;     crossFieldDead: number;
    grubberRegathered: number;    grubberCollected: number;        grubberDead: number;
  };
  // Penalty kick decisions (the manager / AI choice on every awarded penalty)
  penChoice: { kickForGoal: number; kickToTouch: number; tapAndGo: number; tapAndKickDead: number };
  // TMO lifecycle
  tmoTriggers: number;
  tmoOutcomes: { noCard: number; yellow: number; red20: number };
  // Per-phase event frequency (uncapped — telemetry runs raise the buffer)
  phaseCount: Map<MatchPhase, number>;
  // Phase immediately before each TRY_SCORED event
  tryOrigin: Map<MatchPhase, number>;
  totalTries: number;
  // Existing tactic slices
  planAgg: Map<AttackingGamePlan, PlanAgg>;
  bdAgg:   Map<AttackingBreakdown, BdAgg>;
  bfAgg:   Map<BackfieldDefence, BfAgg>;
  dlAgg:   Map<DefensiveLine, DlAgg>;
}

function emptySeasonAgg(): SeasonAgg {
  const clubs = new Map<string, ClubAgg>();
  for (const t of ALL_TEAMS) clubs.set(t.id, emptyClubAgg());

  const planAgg = new Map<AttackingGamePlan, PlanAgg>();
  for (const plan of ['possession', 'balanced', 'kicking'] as AttackingGamePlan[]) {
    planAgg.set(plan, { games: 0, tries: 0, kickMetres: 0, possessionPct: 0, pointsFor: 0, pointsAgainst: 0 });
  }
  const bdAgg = new Map<AttackingBreakdown, BdAgg>();
  for (const bd of ['commit_numbers', 'balanced', 'minimal_ruck'] as AttackingBreakdown[]) {
    bdAgg.set(bd, { games: 0, metresCarried: 0, carries: 0, turnoversWon: 0, pointsFor: 0 });
  }
  const bfAgg = new Map<BackfieldDefence, BfAgg>();
  for (const bf of ['one_back', 'two_back', 'three_back'] as BackfieldDefence[]) {
    bfAgg.set(bf, { games: 0, concededLineBreaks: 0, concededKickMetres: 0, pointsAgainst: 0 });
  }
  const dlAgg = new Map<DefensiveLine, DlAgg>();
  for (const dl of ['blitz', 'hybrid', 'drift'] as DefensiveLine[]) {
    dlAgg.set(dl, { games: 0, concededLineBreaks: 0, dominantTacklesMade: 0, concededMetresCarried: 0, concededCarries: 0, pointsAgainst: 0 });
  }

  return {
    clubs,
    players: new Map<string, PlayerAgg>(),
    homeWins: 0, awayWins: 0, draws: 0,
    homePoints: 0, awayPoints: 0,
    matchCount: 0,
    penOffence: { highTackle: 0, breakdown: 0, scrum: 0, offsideAtRuck: 0, obstruction: 0, dangerousCleanout: 0, notRollingAway: 0 },
    fiftyTwoTwo: { success: 0, failedTouch: 0, failedCaught: 0 },
    attackingKicks: {
      crossFieldCaught: 0, crossFieldContested: 0, crossFieldDead: 0,
      grubberRegathered: 0, grubberCollected: 0, grubberDead: 0,
    },
    penChoice: { kickForGoal: 0, kickToTouch: 0, tapAndGo: 0, tapAndKickDead: 0 },
    tmoTriggers: 0,
    tmoOutcomes: { noCard: 0, yellow: 0, red20: 0 },
    phaseCount: new Map<MatchPhase, number>(),
    tryOrigin: new Map<MatchPhase, number>(),
    totalTries: 0,
    planAgg, bdAgg, bfAgg, dlAgg,
  };
}

// ── Single-match aggregation ─────────────────────────────────────────────
function sumPlayersInto(agg: ClubAgg, players: Player[]): void {
  for (const p of players) {
    agg.tries += p.matchStats.tries;
    agg.carries += p.matchStats.carries;
    agg.metresCarried += p.matchStats.metresCarried;
    agg.lineBreaks += p.matchStats.lineBreaks;
    agg.defendersBeaten += p.matchStats.defendersBeaten;
    agg.knockOns += p.matchStats.knockOns;
    agg.passes += p.matchStats.passes;
    agg.tacklesAttempted += p.matchStats.tacklesAttempted;
    agg.tacklesMade += p.matchStats.tacklesMade;
    agg.dominantTackles += p.matchStats.dominantTackles;
    agg.turnoversWon += p.matchStats.turnoversWon;
    agg.penaltiesConceded += p.matchStats.penaltiesConceded;
    agg.kicksFromHand += p.matchStats.kicksFromHand;
    agg.kickMetres += p.matchStats.kickMetres;
    agg.rucksHit += p.matchStats.rucksHit;
    agg.yellowCards += p.matchStats.yellowCards;
    agg.redCards += p.matchStats.redCards;
    agg.lineoutSteals += p.matchStats.lineoutSteals;
    agg.scrumPenaltiesWon += p.matchStats.scrumPenaltiesWon;
  }
}

function accumulatePlayer(agg: SeasonAgg, p: Player, teamId: string): void {
  // CLAUDE.md "Team data": full names are unique league-wide — safe key.
  const name = `${p.firstName} ${p.lastName}`;
  const key = `${teamId}|${name}`;
  let pa = agg.players.get(key);
  if (!pa) {
    pa = emptyPlayerAgg(name, teamId, p.position);
    agg.players.set(key, pa);
  }
  pa.appearances++;
  pa.tries += p.matchStats.tries;
  pa.carries += p.matchStats.carries;
  pa.metresCarried += p.matchStats.metresCarried;
  pa.lineBreaks += p.matchStats.lineBreaks;
  pa.defendersBeaten += p.matchStats.defendersBeaten;
  pa.passes += p.matchStats.passes;
  pa.tacklesMade += p.matchStats.tacklesMade;
  pa.tacklesAttempted += p.matchStats.tacklesAttempted;
  pa.dominantTackles += p.matchStats.dominantTackles;
  pa.turnoversWon += p.matchStats.turnoversWon;
  pa.knockOns += p.matchStats.knockOns;
  pa.penaltiesConceded += p.matchStats.penaltiesConceded;
  pa.kicksFromHand += p.matchStats.kicksFromHand;
  pa.kickMetres += p.matchStats.kickMetres;
  pa.kicksAtGoal += p.matchStats.kicksAtGoal;
  pa.kicksMade += p.matchStats.kicksMade;
  pa.rucksHit += p.matchStats.rucksHit;
  pa.yellowCards += p.matchStats.yellowCards;
  pa.redCards += p.matchStats.redCards;
  pa.ratingSum += p.rating;
}

// Side-scoped helper used by the existing tactic slices.
function sumSideMatchStats(team: 'home' | 'away', state: MatchState): {
  tries: number; lineBreaks: number; kickMetres: number;
  metresCarried: number; carries: number; turnoversWon: number;
  dominantTackles: number;
  possessionPct: number;
} {
  const t = team === 'home' ? state.homeTeam : state.awayTeam;
  const all = [...t.players, ...t.substitutedOff];
  const r = all.reduce((acc, p) => ({
    tries:           acc.tries           + p.matchStats.tries,
    lineBreaks:      acc.lineBreaks      + p.matchStats.lineBreaks,
    kickMetres:      acc.kickMetres      + p.matchStats.kickMetres,
    metresCarried:   acc.metresCarried   + p.matchStats.metresCarried,
    carries:         acc.carries         + p.matchStats.carries,
    turnoversWon:    acc.turnoversWon    + p.matchStats.turnoversWon,
    dominantTackles: acc.dominantTackles + p.matchStats.dominantTackles,
  }), { tries: 0, lineBreaks: 0, kickMetres: 0, metresCarried: 0, carries: 0, turnoversWon: 0, dominantTackles: 0 });
  const possTotal = state.stats.possession.home + state.stats.possession.away || 1;
  return { ...r, possessionPct: 100 * state.stats.possession[team] / possTotal };
}

function aggregateMatch(
  agg: SeasonAgg,
  state: MatchState,
  home: RawTeamInput,
  away: RawTeamInput,
  homeTactics: TeamTactics,
  awayTactics: TeamTactics,
): void {
  agg.matchCount++;

  const homeScore = state.score.home;
  const awayScore = state.score.away;
  agg.homePoints += homeScore;
  agg.awayPoints += awayScore;
  if (homeScore > awayScore) agg.homeWins++;
  else if (homeScore < awayScore) agg.awayWins++;
  else agg.draws++;

  const homeAgg = agg.clubs.get(home.id)!;
  const awayAgg = agg.clubs.get(away.id)!;
  homeAgg.games++; awayAgg.games++;
  if (homeScore > awayScore) { homeAgg.wins++; awayAgg.losses++; }
  else if (homeScore < awayScore) { awayAgg.wins++; homeAgg.losses++; }
  else { homeAgg.draws++; awayAgg.draws++; }
  homeAgg.pointsFor += homeScore; homeAgg.pointsAgainst += awayScore;
  awayAgg.pointsFor += awayScore; awayAgg.pointsAgainst += homeScore;

  const homeTries = state.stats.tries.home;
  const awayTries = state.stats.tries.away;
  if (homeTries >= 4) homeAgg.tryBonusPoints++;
  if (awayTries >= 4) awayAgg.tryBonusPoints++;
  if (homeScore < awayScore && (awayScore - homeScore) <= 7) homeAgg.losingBonusPoints++;
  if (awayScore < homeScore && (homeScore - awayScore) <= 7) awayAgg.losingBonusPoints++;

  const homeAllPlayers = [...state.homeTeam.players, ...state.homeTeam.substitutedOff];
  const awayAllPlayers = [...state.awayTeam.players, ...state.awayTeam.substitutedOff];

  sumPlayersInto(homeAgg, homeAllPlayers);
  sumPlayersInto(awayAgg, awayAllPlayers);

  homeAgg.handlingErrors += state.stats.handlingErrors.home;
  awayAgg.handlingErrors += state.stats.handlingErrors.away;
  homeAgg.ownLineoutsThrown += state.stats.ownLineouts.home.thrown;
  homeAgg.ownLineoutsWon    += state.stats.ownLineouts.home.won;
  awayAgg.ownLineoutsThrown += state.stats.ownLineouts.away.thrown;
  awayAgg.ownLineoutsWon    += state.stats.ownLineouts.away.won;
  homeAgg.ownScrumsPutIn    += state.stats.ownScrums.home.putIn;
  homeAgg.ownScrumsWon      += state.stats.ownScrums.home.won;
  awayAgg.ownScrumsPutIn    += state.stats.ownScrums.away.putIn;
  awayAgg.ownScrumsWon      += state.stats.ownScrums.away.won;
  homeAgg.possessionTicks += state.stats.possession.home;
  awayAgg.possessionTicks += state.stats.possession.away;
  homeAgg.territoryTicks  += state.stats.territory.home;
  awayAgg.territoryTicks  += state.stats.territory.away;
  const totalTicks = state.stats.possession.home + state.stats.possession.away;
  homeAgg.totalTicks += totalTicks;
  awayAgg.totalTicks += totalTicks;
  homeAgg.entries22Count  += state.stats.entries22.home.count;
  homeAgg.entries22Points += state.stats.entries22.home.pointsScored;
  awayAgg.entries22Count  += state.stats.entries22.away.count;
  awayAgg.entries22Points += state.stats.entries22.away.pointsScored;

  // Goal-kicking split: matchStats lumps kicksAtGoal / kicksMade. Algebra:
  //   score   = 5·tries + 2·convMade + 3·penGoalMade
  //   kicksMade   = convMade + penGoalMade
  //   kicksAtGoal = convAttempts + penGoalAttempts   (convAttempts = tries — handleConversionKick always fires)
  // ⇒ penGoalMade = score − 5·tries − 2·kicksMade   (clamped at 0 for safety)
  for (const [players, agg, tries, score] of [
    [homeAllPlayers, homeAgg, homeTries, homeScore] as const,
    [awayAllPlayers, awayAgg, awayTries, awayScore] as const,
  ]) {
    const kicksAtGoal = players.reduce((s, p) => s + p.matchStats.kicksAtGoal, 0);
    const kicksMade   = players.reduce((s, p) => s + p.matchStats.kicksMade,   0);
    const penMade     = Math.max(0, score - 5 * tries - 2 * kicksMade);
    const convMade    = Math.max(0, kicksMade - penMade);
    const penAttempts = Math.max(0, kicksAtGoal - tries);
    agg.conversionsAttempted   += tries;
    agg.conversionsMade        += convMade;
    agg.penaltyKicksAttempted  += penAttempts;
    agg.penaltyKicksMade       += penMade;
  }

  // Walk the (uncapped) events log for phase frequency, try origin, penalty
  // offence taxonomy, penalty choices, TMO lifecycle.
  for (let i = 0; i < state.events.length; i++) {
    const e = state.events[i];
    // A try fires two events with phase=TryScored: the carry-to-try event
    // (relabeled by PhaseRouter, carries the score commentary) and the
    // handleTryScored follow-up (empty narration — see TryScoredEvent.ts).
    // Skip the duplicate so phaseCount and try-origin reflect actual tries.
    if (e.phase === MatchPhase.TryScored && e.narration.steps.length === 0) continue;
    agg.phaseCount.set(e.phase, (agg.phaseCount.get(e.phase) ?? 0) + 1);

    for (const step of e.narration.steps) {
      if (step.kind === 'phase_outcome') {
        if      (step.key === 'high_tackle_penalty')          agg.penOffence.highTackle++;
        else if (step.key === 'penalty_defending')            agg.penOffence.breakdown++;
        else if (step.key === 'attacking_dominant_penalty' || step.key === 'defending_dominant_penalty') agg.penOffence.scrum++;
        else if (step.key === 'offside_at_ruck_penalty')      agg.penOffence.offsideAtRuck++;
        else if (step.key === 'obstruction_penalty')          agg.penOffence.obstruction++;
        else if (step.key === 'dangerous_cleanout_penalty')   agg.penOffence.dangerousCleanout++;
        else if (step.key === 'not_rolling_away_penalty')     agg.penOffence.notRollingAway++;
        else if (step.key === 'fifty_twenty_two')                 agg.fiftyTwoTwo.success++;
        else if (step.key === 'fifty_twenty_two_attempt_failed_touch')  agg.fiftyTwoTwo.failedTouch++;
        else if (step.key === 'fifty_twenty_two_attempt_failed_caught') agg.fiftyTwoTwo.failedCaught++;
        else if (step.key === 'cross_field_caught')      agg.attackingKicks.crossFieldCaught++;
        else if (step.key === 'cross_field_contested')   agg.attackingKicks.crossFieldContested++;
        else if (step.key === 'cross_field_dead')        agg.attackingKicks.crossFieldDead++;
        else if (step.key === 'grubber_regathered')      agg.attackingKicks.grubberRegathered++;
        else if (step.key === 'grubber_collected')       agg.attackingKicks.grubberCollected++;
        else if (step.key === 'grubber_dead')            agg.attackingKicks.grubberDead++;
        else if (step.key === 'kick_for_goal')                agg.penChoice.kickForGoal++;
        else if (step.key === 'kick_to_touch')                agg.penChoice.kickToTouch++;
        else if (step.key === 'tap_and_go')                   agg.penChoice.tapAndGo++;
        else if (step.key === 'tap_and_kick_dead')            agg.penChoice.tapAndKickDead++;
      } else if (step.kind === 'announcement') {
        if      (step.key === 'tmo_intervenes')         agg.tmoTriggers++;
        else if (step.key === 'tmo_decision_no_card')   agg.tmoOutcomes.noCard++;
        else if (step.key === 'tmo_decision_yellow')    agg.tmoOutcomes.yellow++;
        else if (step.key === 'tmo_decision_red_20')    agg.tmoOutcomes.red20++;
      }
    }

    if (e.phase === MatchPhase.TryScored) {
      agg.totalTries++;
      let origin: MatchPhase = MatchPhase.KickOff;
      for (let j = i - 1; j >= 0; j--) {
        const p = state.events[j].phase;
        if (p !== MatchPhase.TryScored && p !== MatchPhase.ConversionKick) {
          origin = p;
          break;
        }
      }
      agg.tryOrigin.set(origin, (agg.tryOrigin.get(origin) ?? 0) + 1);
    }
  }

  // Tactic slices — baseline (kick-off) tactics drive the bucket; in-game
  // adaptations by AITacticalDirector are intentionally ignored here.
  const ha = sumSideMatchStats('home', state);
  const aa = sumSideMatchStats('away', state);

  for (const [tactics, mine, opp, myScore, oppScore] of [
    [homeTactics, ha, aa, homeScore, awayScore] as const,
    [awayTactics, aa, ha, awayScore, homeScore] as const,
  ]) {
    const p = agg.planAgg.get(tactics.attackingGamePlan)!;
    p.games++; p.tries += mine.tries; p.kickMetres += mine.kickMetres; p.possessionPct += mine.possessionPct;
    p.pointsFor += myScore; p.pointsAgainst += oppScore;

    const b = agg.bdAgg.get(tactics.attackingBreakdown)!;
    b.games++; b.metresCarried += mine.metresCarried; b.carries += mine.carries; b.turnoversWon += mine.turnoversWon; b.pointsFor += myScore;

    const bf = agg.bfAgg.get(tactics.backfieldDefence)!;
    bf.games++; bf.concededLineBreaks += opp.lineBreaks; bf.concededKickMetres += opp.kickMetres; bf.pointsAgainst += oppScore;

    // defensiveLine slice — `mine` is THIS team's stats, `opp` is the
    // opposition's. Concede = what the opposition managed against this
    // team's defensive line. dominantTacklesMade = how often THIS team's
    // defenders win the collision while running their defensive line.
    const dl = agg.dlAgg.get(tactics.defensiveLine)!;
    dl.games++;
    dl.concededLineBreaks    += opp.lineBreaks;
    dl.concededMetresCarried += opp.metresCarried;
    dl.concededCarries       += opp.carries;
    dl.dominantTacklesMade   += mine.dominantTackles;
    dl.pointsAgainst         += oppScore;
  }

  for (const p of homeAllPlayers) accumulatePlayer(agg, p, home.id);
  for (const p of awayAllPlayers) accumulatePlayer(agg, p, away.id);
}

// ── Match runner ─────────────────────────────────────────────────────────
function runSilent(home: RawTeamInput, away: RawTeamInput, seed: number, consume: (state: MatchState) => void): Promise<void> {
  return new Promise(resolve => {
    const engine = new MatchCoordinator(home, away, {
      tickDelayMs: 0,
      seed,
      silent: true,
      commentaryBufferCap: COMMENTARY_CAP_HIGH,
    });
    const off = eventBus.on('engine:finished', ({ state }) => {
      off();
      consume(state);
      engine.destroy();
      resolve();
    });
    engine.initialize();
    engine.start();
  });
}

async function runSeason(rootSeed: number): Promise<SeasonAgg> {
  const agg = emptySeasonAgg();
  let round = 1;
  for (const home of ALL_TEAMS) {
    for (const away of ALL_TEAMS) {
      if (home.id === away.id) continue;
      const seed = deriveFixtureSeed(rootSeed, round++, home.id, away.id);
      await runSilent(home, away, seed, state => {
        aggregateMatch(agg, state, home, away, home.suggestedTactics!, away.suggestedTactics!);
      });
    }
  }
  return agg;
}

// ── Stats helpers ────────────────────────────────────────────────────────
function meanStddev(values: number[]): { mean: number; stddev: number } {
  if (values.length === 0) return { mean: 0, stddev: 0 };
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  return { mean, stddev: Math.sqrt(variance) };
}

function fmt(n: number, digits = 1): string {
  return n.toFixed(digits);
}

function fmtMS(values: number[], digits = 1): string {
  const { mean, stddev } = meanStddev(values);
  return `${mean.toFixed(digits)} ± ${stddev.toFixed(digits)}`;
}

function pct(num: number, den: number, digits = 1): string {
  if (den === 0) return '—';
  return `${(100 * num / den).toFixed(digits)}%`;
}

// ── Multi-seed combination helpers ───────────────────────────────────────
type ClubField = Exclude<keyof ClubAgg, 'games'>;

function sumClubField(aggs: SeasonAgg[], teamId: string, field: ClubField): number {
  return aggs.reduce((s, a) => s + a.clubs.get(teamId)![field], 0);
}

function totalGames(aggs: SeasonAgg[], teamId: string): number {
  return aggs.reduce((s, a) => s + a.clubs.get(teamId)!.games, 0);
}

// Merge per-seed player aggregators by key; appearances + each stat
// summed across seeds. Used by leaderboards.
function mergePlayerAggs(aggs: SeasonAgg[]): Map<string, PlayerAgg> {
  const merged = new Map<string, PlayerAgg>();
  for (const a of aggs) {
    for (const [key, pa] of a.players) {
      let m = merged.get(key);
      if (!m) {
        m = emptyPlayerAgg(pa.name, pa.teamId, pa.position);
        merged.set(key, m);
      }
      m.appearances       += pa.appearances;
      m.tries             += pa.tries;
      m.carries           += pa.carries;
      m.metresCarried     += pa.metresCarried;
      m.lineBreaks        += pa.lineBreaks;
      m.defendersBeaten   += pa.defendersBeaten;
      m.passes            += pa.passes;
      m.tacklesMade       += pa.tacklesMade;
      m.tacklesAttempted  += pa.tacklesAttempted;
      m.dominantTackles   += pa.dominantTackles;
      m.turnoversWon      += pa.turnoversWon;
      m.knockOns          += pa.knockOns;
      m.penaltiesConceded += pa.penaltiesConceded;
      m.kicksFromHand     += pa.kicksFromHand;
      m.kickMetres        += pa.kickMetres;
      m.kicksAtGoal       += pa.kicksAtGoal;
      m.kicksMade         += pa.kicksMade;
      m.rucksHit          += pa.rucksHit;
      m.yellowCards       += pa.yellowCards;
      m.redCards          += pa.redCards;
      m.ratingSum         += pa.ratingSum;
    }
  }
  return merged;
}

function shortClubName(teamId: string): string {
  const t = ALL_TEAMS.find(x => x.id === teamId);
  return t?.shortName ?? teamId;
}

// ── Report builder ───────────────────────────────────────────────────────
function buildReport(aggs: SeasonAgg[], elapsedMs: number): string {
  const N = aggs.length;
  const fixturesPerSeed = aggs[0].matchCount;
  const totalFixtures = aggs.reduce((s, a) => s + a.matchCount, 0);
  const lines: string[] = [];

  lines.push('# Telemetry');
  lines.push('');
  lines.push(`Root seeds: ${ROOT_SEEDS.map(s => `0x${s.toString(16)}`).join(', ')} · ${fixturesPerSeed} fixtures × ${N} seeds = ${totalFixtures} total · ${elapsedMs} ms`);
  lines.push('');
  lines.push('Cells reported as `mean ± σ` are aggregated across the seeds above; cells without a band are per-game means over the full pool.');
  lines.push('');

  // ── Home advantage (variance bands across seeds) ────────────────────────
  lines.push('## Home advantage');
  lines.push('');
  lines.push('| outcome | mean ± σ count | share |');
  lines.push('|---|---:|---:|');
  const homeWinShares = aggs.map(a => 100 * a.homeWins / a.matchCount);
  const awayWinShares = aggs.map(a => 100 * a.awayWins / a.matchCount);
  const drawShares    = aggs.map(a => 100 * a.draws    / a.matchCount);
  lines.push(`| home win | ${fmtMS(aggs.map(a => a.homeWins))} | ${fmtMS(homeWinShares)}% |`);
  lines.push(`| away win | ${fmtMS(aggs.map(a => a.awayWins))} | ${fmtMS(awayWinShares)}% |`);
  lines.push(`| draw     | ${fmtMS(aggs.map(a => a.draws))}    | ${fmtMS(drawShares)}% |`);
  lines.push('');
  const homeAvg = aggs.map(a => a.homePoints / a.matchCount);
  const awayAvg = aggs.map(a => a.awayPoints / a.matchCount);
  const margin  = aggs.map(a => (a.homePoints - a.awayPoints) / a.matchCount);
  lines.push(`Average score: home ${fmtMS(homeAvg)} – ${fmtMS(awayAvg)} away (home margin ${fmtMS(margin)}).`);
  lines.push('');

  // ── League per-match averages (realism check) ───────────────────────────
  lines.push('## League-wide per-match averages');
  lines.push('');
  lines.push('Variance bands cover the spread across root seeds; the mean is the average over all fixtures of that seed.');
  lines.push('');
  lines.push('| stat | per match |');
  lines.push('|---|---:|');
  const perMatch = (extract: (a: SeasonAgg) => number) =>
    fmtMS(aggs.map(a => extract(a) / a.matchCount));

  // tries (state.stats.tries.home + away across all matches)
  lines.push(`| tries | ${perMatch(a => {
    let s = 0;
    for (const c of a.clubs.values()) s += c.tries;
    return s;
  })} |`);
  lines.push(`| points (combined) | ${perMatch(a => a.homePoints + a.awayPoints)} |`);
  lines.push(`| penalties conceded | ${perMatch(a => totalAcrossClubs(a, 'penaltiesConceded'))} |`);
  lines.push(`| knock-ons (player matchStats) | ${perMatch(a => totalAcrossClubs(a, 'knockOns'))} |`);
  lines.push(`| handling errors (team-stat) | ${perMatch(a => totalAcrossClubs(a, 'handlingErrors'))} |`);
  lines.push(`| turnovers won | ${perMatch(a => totalAcrossClubs(a, 'turnoversWon'))} |`);
  lines.push(`| tackles attempted | ${perMatch(a => totalAcrossClubs(a, 'tacklesAttempted'))} |`);
  lines.push(`| tackles made | ${perMatch(a => totalAcrossClubs(a, 'tacklesMade'))} |`);
  lines.push(`| dominant tackles | ${perMatch(a => totalAcrossClubs(a, 'dominantTackles'))} |`);
  lines.push(`| carries | ${perMatch(a => totalAcrossClubs(a, 'carries'))} |`);
  lines.push(`| line breaks | ${perMatch(a => totalAcrossClubs(a, 'lineBreaks'))} |`);
  lines.push(`| passes | ${perMatch(a => totalAcrossClubs(a, 'passes'))} |`);
  lines.push(`| rucks hit | ${perMatch(a => totalAcrossClubs(a, 'rucksHit'))} |`);
  lines.push(`| kicks from hand | ${perMatch(a => totalAcrossClubs(a, 'kicksFromHand'))} |`);
  lines.push(`| scrums (set) | ${perMatch(a => totalAcrossClubs(a, 'ownScrumsPutIn'))} |`);
  lines.push(`| lineouts (set) | ${perMatch(a => totalAcrossClubs(a, 'ownLineoutsThrown'))} |`);
  lines.push(`| yellow cards | ${perMatch(a => totalAcrossClubs(a, 'yellowCards'))} |`);
  lines.push(`| red cards | ${perMatch(a => totalAcrossClubs(a, 'redCards'))} |`);
  lines.push(`| TMO triggers | ${perMatch(a => a.tmoTriggers)} |`);
  lines.push(`| 22-entries | ${perMatch(a => totalAcrossClubs(a, 'entries22Count'))} |`);
  lines.push('');

  // ── Per-club: results + per-game team averages ──────────────────────────
  lines.push('## Per-club results & per-game stats');
  lines.push('');
  lines.push('Aggregated across all seeds. Sorted by total league points (W·4 + D·2 + tryBonus + losingBonus).');
  lines.push('');
  lines.push('| Club | P | W | D | L | PF | PA | LP | TB | LB | tries/g | knock-ons/g | pen/g | poss% | terr% |');
  lines.push('|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
  const sortedClubs = [...ALL_TEAMS].sort((x, y) => leaguePoints(aggs, y.id) - leaguePoints(aggs, x.id));
  for (const c of sortedClubs) {
    const games = totalGames(aggs, c.id);
    const w = sumClubField(aggs, c.id, 'wins');
    const d = sumClubField(aggs, c.id, 'draws');
    const l = sumClubField(aggs, c.id, 'losses');
    const pf = sumClubField(aggs, c.id, 'pointsFor');
    const pa = sumClubField(aggs, c.id, 'pointsAgainst');
    const tb = sumClubField(aggs, c.id, 'tryBonusPoints');
    const lb = sumClubField(aggs, c.id, 'losingBonusPoints');
    const lp = w * 4 + d * 2 + tb + lb;
    const tries = sumClubField(aggs, c.id, 'tries');
    const knockOns = sumClubField(aggs, c.id, 'knockOns');
    const pens = sumClubField(aggs, c.id, 'penaltiesConceded');
    const possT = sumClubField(aggs, c.id, 'possessionTicks');
    const terrT = sumClubField(aggs, c.id, 'territoryTicks');
    const totT  = sumClubField(aggs, c.id, 'totalTicks');
    lines.push(`| ${c.shortName} | ${games} | ${w} | ${d} | ${l} | ${pf} | ${pa} | ${lp} | ${tb} | ${lb} | ${fmt(tries/games)} | ${fmt(knockOns/games)} | ${fmt(pens/games)} | ${pct(possT, totT)} | ${pct(terrT, totT)} |`);
  }
  lines.push('');

  // ── Per-club attacking stats ────────────────────────────────────────────
  lines.push('## Per-club attacking');
  lines.push('');
  lines.push('| Club | carries/g | m/carry | line breaks/g | def beaten/g | dom carries via lb+db | passes/g | kicks/g | kick m/g |');
  lines.push('|---|---:|---:|---:|---:|---:|---:|---:|---:|');
  for (const c of sortedClubs) {
    const games = totalGames(aggs, c.id);
    const carries = sumClubField(aggs, c.id, 'carries');
    const metres  = sumClubField(aggs, c.id, 'metresCarried');
    const lb      = sumClubField(aggs, c.id, 'lineBreaks');
    const db      = sumClubField(aggs, c.id, 'defendersBeaten');
    const passes  = sumClubField(aggs, c.id, 'passes');
    const kicks   = sumClubField(aggs, c.id, 'kicksFromHand');
    const km      = sumClubField(aggs, c.id, 'kickMetres');
    const mpc     = carries > 0 ? metres / carries : 0;
    lines.push(`| ${c.shortName} | ${fmt(carries/games)} | ${fmt(mpc, 2)} | ${fmt(lb/games)} | ${fmt(db/games)} | ${db} | ${fmt(passes/games)} | ${fmt(kicks/games)} | ${fmt(km/games)} |`);
  }
  lines.push('');

  // ── Per-club defence + breakdown ────────────────────────────────────────
  lines.push('## Per-club defence & breakdown');
  lines.push('');
  lines.push('| Club | tackles att/g | tackles made/g | tackle % | dom tackles/g | turnovers won/g | rucks hit/g | handling errors/g |');
  lines.push('|---|---:|---:|---:|---:|---:|---:|---:|');
  for (const c of sortedClubs) {
    const games = totalGames(aggs, c.id);
    const ta = sumClubField(aggs, c.id, 'tacklesAttempted');
    const tm = sumClubField(aggs, c.id, 'tacklesMade');
    const dt = sumClubField(aggs, c.id, 'dominantTackles');
    const tw = sumClubField(aggs, c.id, 'turnoversWon');
    const rh = sumClubField(aggs, c.id, 'rucksHit');
    const he = sumClubField(aggs, c.id, 'handlingErrors');
    lines.push(`| ${c.shortName} | ${fmt(ta/games)} | ${fmt(tm/games)} | ${pct(tm, ta)} | ${fmt(dt/games)} | ${fmt(tw/games)} | ${fmt(rh/games)} | ${fmt(he/games)} |`);
  }
  lines.push('');

  // ── Per-club set piece ──────────────────────────────────────────────────
  lines.push('## Per-club set piece');
  lines.push('');
  lines.push('| Club | LO thrown/g | LO win % | LO steals/g | Scrum/g | Scrum win % | Scrum pen won/g |');
  lines.push('|---|---:|---:|---:|---:|---:|---:|');
  for (const c of sortedClubs) {
    const games = totalGames(aggs, c.id);
    const olt = sumClubField(aggs, c.id, 'ownLineoutsThrown');
    const olw = sumClubField(aggs, c.id, 'ownLineoutsWon');
    const ls  = sumClubField(aggs, c.id, 'lineoutSteals');
    const osp = sumClubField(aggs, c.id, 'ownScrumsPutIn');
    const osw = sumClubField(aggs, c.id, 'ownScrumsWon');
    // applyMatchEvent credits all three front-row players on each scrum
    // penalty (see SCRUM_RESOLVED in applyMatchEvent.ts), so a team-level
    // sum across players triples the underlying penalty count. Divide by 3
    // to recover penalties-per-game; per-player leaderboards still see the
    // full credit so individual ratings stay unchanged.
    const spw = sumClubField(aggs, c.id, 'scrumPenaltiesWon') / 3;
    lines.push(`| ${c.shortName} | ${fmt(olt/games)} | ${pct(olw, olt)} | ${fmt(ls/games)} | ${fmt(osp/games)} | ${pct(osw, osp)} | ${fmt(spw/games)} |`);
  }
  lines.push('');

  // ── Per-club kicking ────────────────────────────────────────────────────
  lines.push('## Per-club kicking');
  lines.push('');
  lines.push('| Club | Conv att/g | Conv % | Pen kick att/g | Pen kick % | Kicks/g | Kick m/g |');
  lines.push('|---|---:|---:|---:|---:|---:|---:|');
  for (const c of sortedClubs) {
    const games = totalGames(aggs, c.id);
    const ca = sumClubField(aggs, c.id, 'conversionsAttempted');
    const cm = sumClubField(aggs, c.id, 'conversionsMade');
    const pa = sumClubField(aggs, c.id, 'penaltyKicksAttempted');
    const pm = sumClubField(aggs, c.id, 'penaltyKicksMade');
    const k  = sumClubField(aggs, c.id, 'kicksFromHand');
    const km = sumClubField(aggs, c.id, 'kickMetres');
    lines.push(`| ${c.shortName} | ${fmt(ca/games)} | ${pct(cm, ca)} | ${fmt(pa/games)} | ${pct(pm, pa)} | ${fmt(k/games)} | ${fmt(km/games)} |`);
  }
  lines.push('');

  // ── Per-club discipline & 22 entries ────────────────────────────────────
  lines.push('## Per-club discipline & 22-entry conversion');
  lines.push('');
  lines.push('| Club | pen conceded/g | yellow | red | 22-entries/g | pts/22-entry |');
  lines.push('|---|---:|---:|---:|---:|---:|');
  for (const c of sortedClubs) {
    const games = totalGames(aggs, c.id);
    const pen = sumClubField(aggs, c.id, 'penaltiesConceded');
    const yc  = sumClubField(aggs, c.id, 'yellowCards');
    const rc  = sumClubField(aggs, c.id, 'redCards');
    const e22 = sumClubField(aggs, c.id, 'entries22Count');
    const p22 = sumClubField(aggs, c.id, 'entries22Points');
    const ppe = e22 > 0 ? p22 / e22 : 0;
    lines.push(`| ${c.shortName} | ${fmt(pen/games)} | ${yc} | ${rc} | ${fmt(e22/games)} | ${fmt(ppe, 2)} |`);
  }
  lines.push('');

  // ── Penalty offence taxonomy ────────────────────────────────────────────
  lines.push('## Penalty offence breakdown');
  lines.push('');
  const totalPenOff = aggs.reduce((s, a) => s + a.penOffence.highTackle + a.penOffence.breakdown + a.penOffence.scrum + a.penOffence.offsideAtRuck + a.penOffence.obstruction + a.penOffence.dangerousCleanout + a.penOffence.notRollingAway, 0);
  lines.push(`Total offence-classified penalties: ${totalPenOff} (across ${totalFixtures} fixtures = ${fmt(totalPenOff/totalFixtures, 2)}/match).`);
  lines.push('');
  lines.push('| offence | count | share | per match |');
  lines.push('|---|---:|---:|---:|');
  const penRows: Array<[string, number]> = [
    ['breakdown_infringement', aggs.reduce((s, a) => s + a.penOffence.breakdown, 0)],
    ['scrum_infringement',     aggs.reduce((s, a) => s + a.penOffence.scrum, 0)],
    ['high_tackle',            aggs.reduce((s, a) => s + a.penOffence.highTackle, 0)],
    ['offside_at_ruck',        aggs.reduce((s, a) => s + a.penOffence.offsideAtRuck, 0)],
    ['not_rolling_away',       aggs.reduce((s, a) => s + a.penOffence.notRollingAway, 0)],
    ['obstruction',            aggs.reduce((s, a) => s + a.penOffence.obstruction, 0)],
    ['dangerous_cleanout',     aggs.reduce((s, a) => s + a.penOffence.dangerousCleanout, 0)],
  ];
  for (const [name, n] of penRows.sort((a, b) => b[1] - a[1])) {
    lines.push(`| ${name} | ${n} | ${pct(n, totalPenOff)} | ${fmt(n/totalFixtures, 2)} |`);
  }
  lines.push('');

  // ── 50/22 attempts ──────────────────────────────────────────────────────
  lines.push('## 50/22 attempts and outcomes');
  lines.push('');
  const f22Success = aggs.reduce((s, a) => s + a.fiftyTwoTwo.success, 0);
  const f22FailTouch = aggs.reduce((s, a) => s + a.fiftyTwoTwo.failedTouch, 0);
  const f22FailCaught = aggs.reduce((s, a) => s + a.fiftyTwoTwo.failedCaught, 0);
  const f22Deliberate = f22FailTouch + f22FailCaught;
  lines.push('Successes include accidental side-effects (territory kick from own half that lands in opposition 22) plus deliberate-intent fifty_22 attempts that succeeded. Failures are deliberate-intent only.');
  lines.push('');
  lines.push('| outcome | count | per match |');
  lines.push('|---|---:|---:|');
  lines.push(`| success (deliberate + accidental) | ${f22Success} | ${fmt(f22Success/totalFixtures, 2)} |`);
  lines.push(`| failed — touch elsewhere          | ${f22FailTouch} | ${fmt(f22FailTouch/totalFixtures, 2)} |`);
  lines.push(`| failed — caught in field          | ${f22FailCaught} | ${fmt(f22FailCaught/totalFixtures, 2)} |`);
  lines.push(`| total deliberate-intent attempts  | ${f22Deliberate + f22Success} | ${fmt((f22Deliberate + f22Success)/totalFixtures, 2)} |`);
  lines.push('');

  // ── Attacking kicks (cross-field + grubber) ─────────────────────────────
  lines.push('## Attacking kicks (cross-field + grubber)');
  lines.push('');
  const ak = aggs.reduce((s, a) => {
    return {
      crossFieldCaught:    s.crossFieldCaught    + a.attackingKicks.crossFieldCaught,
      crossFieldContested: s.crossFieldContested + a.attackingKicks.crossFieldContested,
      crossFieldDead:      s.crossFieldDead      + a.attackingKicks.crossFieldDead,
      grubberRegathered:   s.grubberRegathered   + a.attackingKicks.grubberRegathered,
      grubberCollected:    s.grubberCollected    + a.attackingKicks.grubberCollected,
      grubberDead:         s.grubberDead         + a.attackingKicks.grubberDead,
    };
  }, { crossFieldCaught: 0, crossFieldContested: 0, crossFieldDead: 0, grubberRegathered: 0, grubberCollected: 0, grubberDead: 0 });
  const cfTotal = ak.crossFieldCaught + ak.crossFieldContested + ak.crossFieldDead;
  const gbTotal = ak.grubberRegathered + ak.grubberCollected + ak.grubberDead;
  lines.push('| sub-type | outcome | count | per match |');
  lines.push('|---|---|---:|---:|');
  lines.push(`| cross-field | attacker catches | ${ak.crossFieldCaught} | ${fmt(ak.crossFieldCaught/totalFixtures, 2)} |`);
  lines.push(`| cross-field | defender catches | ${ak.crossFieldContested} | ${fmt(ak.crossFieldContested/totalFixtures, 2)} |`);
  lines.push(`| cross-field | dead             | ${ak.crossFieldDead} | ${fmt(ak.crossFieldDead/totalFixtures, 2)} |`);
  lines.push(`| cross-field | **total**        | **${cfTotal}** | **${fmt(cfTotal/totalFixtures, 2)}** |`);
  lines.push(`| grubber     | attacker regathers | ${ak.grubberRegathered} | ${fmt(ak.grubberRegathered/totalFixtures, 2)} |`);
  lines.push(`| grubber     | defender collects  | ${ak.grubberCollected} | ${fmt(ak.grubberCollected/totalFixtures, 2)} |`);
  lines.push(`| grubber     | dead               | ${ak.grubberDead} | ${fmt(ak.grubberDead/totalFixtures, 2)} |`);
  lines.push(`| grubber     | **total**          | **${gbTotal}** | **${fmt(gbTotal/totalFixtures, 2)}** |`);
  lines.push('');

  // ── Penalty choices ─────────────────────────────────────────────────────
  lines.push('## Penalty decisions (the kicker / manager call after a penalty award)');
  lines.push('');
  const totalChoices = aggs.reduce((s, a) => s + a.penChoice.kickForGoal + a.penChoice.kickToTouch + a.penChoice.tapAndGo + a.penChoice.tapAndKickDead, 0);
  lines.push('| choice | count | share | per match |');
  lines.push('|---|---:|---:|---:|');
  const choiceRows: Array<[string, number]> = [
    ['kick_for_goal',     aggs.reduce((s, a) => s + a.penChoice.kickForGoal, 0)],
    ['kick_to_touch',     aggs.reduce((s, a) => s + a.penChoice.kickToTouch, 0)],
    ['tap_and_go',        aggs.reduce((s, a) => s + a.penChoice.tapAndGo, 0)],
    ['tap_and_kick_dead', aggs.reduce((s, a) => s + a.penChoice.tapAndKickDead, 0)],
  ];
  for (const [name, n] of choiceRows.sort((a, b) => b[1] - a[1])) {
    lines.push(`| ${name} | ${n} | ${pct(n, totalChoices)} | ${fmt(n/totalFixtures, 2)} |`);
  }
  lines.push('');

  // ── Cards & TMO league-wide ─────────────────────────────────────────────
  lines.push('## Cards & TMO');
  lines.push('');
  const totalYellow = aggs.reduce((s, a) => s + totalAcrossClubs(a, 'yellowCards'), 0);
  const totalRed    = aggs.reduce((s, a) => s + totalAcrossClubs(a, 'redCards'), 0);
  const tmoTrig     = aggs.reduce((s, a) => s + a.tmoTriggers, 0);
  const tmoNo       = aggs.reduce((s, a) => s + a.tmoOutcomes.noCard, 0);
  const tmoY        = aggs.reduce((s, a) => s + a.tmoOutcomes.yellow, 0);
  const tmoR        = aggs.reduce((s, a) => s + a.tmoOutcomes.red20, 0);
  lines.push('| metric | count | per match |');
  lines.push('|---|---:|---:|');
  lines.push(`| yellow cards | ${totalYellow} | ${fmt(totalYellow/totalFixtures, 2)} |`);
  lines.push(`| red cards (yellow + red_20 combined in matchStats.redCards) | ${totalRed} | ${fmt(totalRed/totalFixtures, 2)} |`);
  lines.push(`| TMO reviews | ${tmoTrig} | ${fmt(tmoTrig/totalFixtures, 2)} |`);
  lines.push('');
  lines.push('| TMO outcome | count | share of triggers |');
  lines.push('|---|---:|---:|');
  lines.push(`| no_card | ${tmoNo} | ${pct(tmoNo, tmoTrig)} |`);
  lines.push(`| yellow  | ${tmoY}  | ${pct(tmoY, tmoTrig)} |`);
  lines.push(`| red_20  | ${tmoR}  | ${pct(tmoR, tmoTrig)} |`);
  lines.push('');

  // ── Tactic slices (existing) ────────────────────────────────────────────
  lines.push('## attackingGamePlan slice');
  lines.push('');
  lines.push('| plan | games | tries/g | kick m/g | poss%/g | PF/g | PA/g |');
  lines.push('|---|---:|---:|---:|---:|---:|---:|');
  for (const plan of ['possession', 'balanced', 'kicking'] as AttackingGamePlan[]) {
    const games = aggs.reduce((s, a) => s + a.planAgg.get(plan)!.games, 0);
    if (games === 0) continue;
    const t = aggs.reduce((s, a) => s + a.planAgg.get(plan)!.tries, 0);
    const km = aggs.reduce((s, a) => s + a.planAgg.get(plan)!.kickMetres, 0);
    const pp = aggs.reduce((s, a) => s + a.planAgg.get(plan)!.possessionPct, 0);
    const pf = aggs.reduce((s, a) => s + a.planAgg.get(plan)!.pointsFor, 0);
    const pa = aggs.reduce((s, a) => s + a.planAgg.get(plan)!.pointsAgainst, 0);
    lines.push(`| ${plan} | ${games} | ${fmt(t/games)} | ${fmt(km/games)} | ${fmt(pp/games)} | ${fmt(pf/games)} | ${fmt(pa/games)} |`);
  }
  lines.push('');

  lines.push('## attackingBreakdown slice');
  lines.push('');
  lines.push('| breakdown | games | carries/g | metres/carry | turnovers won/g | PF/g |');
  lines.push('|---|---:|---:|---:|---:|---:|');
  for (const bd of ['commit_numbers', 'balanced', 'minimal_ruck'] as AttackingBreakdown[]) {
    const games = aggs.reduce((s, a) => s + a.bdAgg.get(bd)!.games, 0);
    if (games === 0) continue;
    const c = aggs.reduce((s, a) => s + a.bdAgg.get(bd)!.carries, 0);
    const m = aggs.reduce((s, a) => s + a.bdAgg.get(bd)!.metresCarried, 0);
    const tw = aggs.reduce((s, a) => s + a.bdAgg.get(bd)!.turnoversWon, 0);
    const pf = aggs.reduce((s, a) => s + a.bdAgg.get(bd)!.pointsFor, 0);
    const mpc = c > 0 ? m / c : 0;
    lines.push(`| ${bd} | ${games} | ${fmt(c/games)} | ${fmt(mpc, 2)} | ${fmt(tw/games)} | ${fmt(pf/games)} |`);
  }
  lines.push('');

  lines.push('## backfieldDefence slice (defensive — concede stats are opposition\'s)');
  lines.push('');
  lines.push('| backfield | games | line breaks conceded/g | kick m conceded/g | PA/g |');
  lines.push('|---|---:|---:|---:|---:|');
  for (const bf of ['one_back', 'two_back', 'three_back'] as BackfieldDefence[]) {
    const games = aggs.reduce((s, a) => s + a.bfAgg.get(bf)!.games, 0);
    if (games === 0) continue;
    const lb = aggs.reduce((s, a) => s + a.bfAgg.get(bf)!.concededLineBreaks, 0);
    const km = aggs.reduce((s, a) => s + a.bfAgg.get(bf)!.concededKickMetres, 0);
    const pa = aggs.reduce((s, a) => s + a.bfAgg.get(bf)!.pointsAgainst, 0);
    lines.push(`| ${bf} | ${games} | ${fmt(lb/games)} | ${fmt(km/games)} | ${fmt(pa/games)} |`);
  }
  lines.push('');

  lines.push('## defensiveLine slice (defensive — concede stats are opposition\'s)');
  lines.push('');
  lines.push('| line | games | LB conceded/g | dom tackles made/g | m/carry conceded | PA/g |');
  lines.push('|---|---:|---:|---:|---:|---:|');
  for (const dl of ['blitz', 'hybrid', 'drift'] as DefensiveLine[]) {
    const games = aggs.reduce((s, a) => s + a.dlAgg.get(dl)!.games, 0);
    if (games === 0) continue;
    const lb = aggs.reduce((s, a) => s + a.dlAgg.get(dl)!.concededLineBreaks, 0);
    const dt = aggs.reduce((s, a) => s + a.dlAgg.get(dl)!.dominantTacklesMade, 0);
    const m  = aggs.reduce((s, a) => s + a.dlAgg.get(dl)!.concededMetresCarried, 0);
    const c  = aggs.reduce((s, a) => s + a.dlAgg.get(dl)!.concededCarries, 0);
    const pa = aggs.reduce((s, a) => s + a.dlAgg.get(dl)!.pointsAgainst, 0);
    const mpc = c > 0 ? m / c : 0;
    lines.push(`| ${dl} | ${games} | ${fmt(lb/games)} | ${fmt(dt/games)} | ${fmt(mpc, 2)} | ${fmt(pa/games)} |`);
  }
  lines.push('');

  // ── Phase frequency ─────────────────────────────────────────────────────
  lines.push('## Phase frequency (events across all fixtures)');
  lines.push('');
  const combinedPhases = new Map<MatchPhase, number>();
  for (const a of aggs) {
    for (const [phase, n] of a.phaseCount) {
      combinedPhases.set(phase, (combinedPhases.get(phase) ?? 0) + n);
    }
  }
  lines.push('| phase | events | per match |');
  lines.push('|---|---:|---:|');
  for (const [phase, n] of [...combinedPhases.entries()].sort((a, b) => b[1] - a[1])) {
    lines.push(`| ${phase} | ${n} | ${fmt(n/totalFixtures, 1)} |`);
  }
  lines.push('');

  // ── Try origin ──────────────────────────────────────────────────────────
  lines.push('## Try origin (phase immediately before each TRY_SCORED event)');
  lines.push('');
  const totalTries = aggs.reduce((s, a) => s + a.totalTries, 0);
  lines.push(`Total tries: ${totalTries} (${fmt(totalTries/totalFixtures, 2)} per match).`);
  lines.push('');
  const combinedOrigin = new Map<MatchPhase, number>();
  for (const a of aggs) {
    for (const [phase, n] of a.tryOrigin) {
      combinedOrigin.set(phase, (combinedOrigin.get(phase) ?? 0) + n);
    }
  }
  lines.push('| preceding phase | tries | share |');
  lines.push('|---|---:|---:|');
  for (const [phase, n] of [...combinedOrigin.entries()].sort((a, b) => b[1] - a[1])) {
    lines.push(`| ${phase} | ${n} | ${pct(n, totalTries)} |`);
  }
  lines.push('');

  // ── Player leaderboards ─────────────────────────────────────────────────
  lines.push('## Player leaderboards');
  lines.push('');
  lines.push(`Aggregated across ${totalFixtures} fixtures. Per-game leaderboards require ≥ ${MIN_APPEARANCES_FOR_RATE} appearances to filter out cameos.`);
  lines.push('');
  const merged = mergePlayerAggs(aggs);
  const allPlayers = [...merged.values()];
  const everyone = allPlayers; // alias for clarity

  appendLeaderboard(lines, 'Top try scorers (total)', everyone, p => p.tries, p => `${p.tries}`);
  appendLeaderboard(lines, 'Top metres carried (total)', everyone, p => p.metresCarried, p => `${p.metresCarried}`);
  appendLeaderboard(lines, 'Top line-breakers (total)', everyone, p => p.lineBreaks, p => `${p.lineBreaks}`);
  appendLeaderboard(lines, 'Top defenders beaten (total)', everyone, p => p.defendersBeaten, p => `${p.defendersBeaten}`);
  appendLeaderboard(lines, 'Top tacklers (tackles made, total)', everyone, p => p.tacklesMade, p => `${p.tacklesMade}`);
  appendLeaderboard(lines, 'Top dominant tacklers (total)', everyone, p => p.dominantTackles, p => `${p.dominantTackles}`);
  appendLeaderboard(lines, 'Top jackalers (turnovers won, total)', everyone, p => p.turnoversWon, p => `${p.turnoversWon}`);
  appendLeaderboard(lines, 'Top rucks hit (total)', everyone, p => p.rucksHit, p => `${p.rucksHit}`);
  appendLeaderboard(lines, 'Top kick metres (total)', everyone, p => p.kickMetres, p => `${p.kickMetres}`);
  appendLeaderboard(lines, 'Worst handlers (knock-ons, total)', everyone, p => p.knockOns, p => `${p.knockOns}`);
  appendLeaderboard(lines, 'Worst discipline (penalties conceded, total)', everyone, p => p.penaltiesConceded, p => `${p.penaltiesConceded}`);

  // Goal-kicking accuracy — filter to actual goal kickers
  const goalKickers = everyone.filter(p => p.kicksAtGoal >= 10);
  appendLeaderboard(lines, `Goal-kicking accuracy (min 10 attempts) — ${goalKickers.length} qualifiers`, goalKickers, p => p.kicksAtGoal === 0 ? 0 : p.kicksMade / p.kicksAtGoal, p => `${(100 * p.kicksMade / p.kicksAtGoal).toFixed(1)}% (${p.kicksMade}/${p.kicksAtGoal})`);

  // Average rating — only meaningful with appearances
  const ratedPlayers = everyone.filter(p => p.appearances >= MIN_APPEARANCES_FOR_RATE);
  appendLeaderboard(lines, `Average rating (min ${MIN_APPEARANCES_FOR_RATE} apps) — ${ratedPlayers.length} qualifiers`, ratedPlayers, p => p.ratingSum / p.appearances, p => `${(p.ratingSum / p.appearances).toFixed(2)} (${p.appearances} apps)`);

  return lines.join('\n');
}

function totalAcrossClubs(a: SeasonAgg, field: ClubField): number {
  let s = 0;
  for (const c of a.clubs.values()) s += c[field];
  return s;
}

function leaguePoints(aggs: SeasonAgg[], teamId: string): number {
  const w  = sumClubField(aggs, teamId, 'wins');
  const d  = sumClubField(aggs, teamId, 'draws');
  const tb = sumClubField(aggs, teamId, 'tryBonusPoints');
  const lb = sumClubField(aggs, teamId, 'losingBonusPoints');
  return w * 4 + d * 2 + tb + lb;
}

function appendLeaderboard(
  lines: string[],
  title: string,
  pool: PlayerAgg[],
  sortBy: (p: PlayerAgg) => number,
  fmtValue: (p: PlayerAgg) => string,
): void {
  lines.push(`### ${title}`);
  lines.push('');
  lines.push('| # | player | team | pos | apps | value |');
  lines.push('|---:|---|---|---|---:|---:|');
  const top = [...pool].sort((a, b) => sortBy(b) - sortBy(a)).slice(0, 10);
  for (let i = 0; i < top.length; i++) {
    const p = top[i];
    lines.push(`| ${i + 1} | ${p.name} | ${shortClubName(p.teamId)} | ${p.position} | ${p.appearances} | ${fmtValue(p)} |`);
  }
  lines.push('');
}

// ── Entry point ──────────────────────────────────────────────────────────
async function main(): Promise<void> {
  const t0 = Date.now();
  const aggs: SeasonAgg[] = [];
  for (const seed of ROOT_SEEDS) {
    aggs.push(await runSeason(seed));
  }
  const elapsedMs = Date.now() - t0;
  console.log(buildReport(aggs, elapsedMs));
}

await main();
