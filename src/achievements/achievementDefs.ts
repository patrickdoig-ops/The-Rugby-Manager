// Achievement catalog — pure data + predicate functions. No side effects, no
// persistence; the AchievementEngine owns evaluation, unlocking and toasts.
//
// Each predicate reads only fields that are guaranteed present on GameState /
// FixtureResult. Match-category predicates require `ctx.result` (the just-
// recorded fixture) and only return true when the player's team played it
// (`result.playerSide !== null`). Season / career predicates derive purely
// from persisted state, so they're idempotent under repeated re-evaluation.

import type { GameState, FixtureResult } from '../types/gameState';
import { playerOverall } from '../engine/RatingEngine';

export type AchievementCategory = 'match' | 'season' | 'career';

export interface AchievementCtx {
  state: GameState;
  playerTeamId: string;
  // Present only on the game:fixtureRecorded evaluation pass. The player's
  // own match plus every headless AI fixture of the round both fire that
  // event, so match predicates must check playerSide before trusting scores.
  result?: FixtureResult;
}

export interface AchievementDef {
  id: string;          // stable internal id (localStorage key + UI key)
  gcId: string;        // Game Centre achievement identifier (App Store Connect)
  title: string;
  description: string;
  category: AchievementCategory;
  check: (ctx: AchievementCtx) => boolean;
}

// Score / try totals from the player's perspective for the just-played
// fixture. Returns null when the fixture isn't the player's own match.
function playerView(ctx: AchievementCtx): { for: number; against: number; tries: number } | null {
  const r = ctx.result;
  if (!r || r.playerSide === null) return null;
  const isHome = r.playerSide === 'home';
  return {
    for:     isHome ? r.homeScore : r.awayScore,
    against: isHome ? r.awayScore : r.homeScore,
    tries:   isHome ? r.homeTries : r.awayTries,
  };
}

// Count of in-game seasons the player's club has been crowned champion of,
// read from the archive. weightedLeaguePosition-style historical fallbacks
// aren't relevant here — only seasons actually played in this career count.
function titlesWon(ctx: AchievementCtx): number {
  return ctx.state.career.archive.filter(a => a.championTeamId === ctx.playerTeamId).length;
}

// Is the player's club in the current playoff bracket (any of the four slots)?
function inPlayoffBracket(ctx: AchievementCtx): boolean {
  const p = ctx.state.league.playoffs;
  if (!p) return false;
  const id = ctx.playerTeamId;
  return p.semifinals.some(m => m.homeId === id || m.awayId === id)
      || p.final.homeId === id || p.final.awayId === id;
}

// Did the player's club win a semi-final in the current bracket?
function wonSemiFinal(ctx: AchievementCtx): boolean {
  const p = ctx.state.league.playoffs;
  if (!p) return false;
  const id = ctx.playerTeamId;
  return p.semifinals.some(m => {
    if (!m.result || (m.homeId !== id && m.awayId !== id)) return false;
    const isHome = m.homeId === id;
    const myScore  = isHome ? m.result.homeScore : m.result.awayScore;
    const oppScore = isHome ? m.result.awayScore : m.result.homeScore;
    return myScore > oppScore;
  });
}

// Is the player's club participating in a European competition this season?
function inEuropean(ctx: AchievementCtx): boolean {
  const id = ctx.playerTeamId;
  for (const comp of [ctx.state.league.europeanCup, ctx.state.league.europeanShield]) {
    if (comp?.pools.some(pool => pool.teamIds.includes(id))) return true;
  }
  return false;
}

// Has the player's club been seeded into the European knockout stage?
function inEuropeanKnockout(ctx: AchievementCtx): boolean {
  const id = ctx.playerTeamId;
  for (const comp of [ctx.state.league.europeanCup, ctx.state.league.europeanShield]) {
    const ko = comp?.knockout;
    if (!ko) continue;
    const all = [...ko.r16, ...ko.quarterfinals, ...ko.semifinals, ko.final];
    if (all.some(m => m.homeId === id || m.awayId === id)) return true;
  }
  return false;
}

// Has the player's club been drawn into a European final?
function inEuropeanFinal(ctx: AchievementCtx): boolean {
  const id = ctx.playerTeamId;
  for (const comp of [ctx.state.league.europeanCup, ctx.state.league.europeanShield]) {
    const f = comp?.knockout?.final;
    if (f && (f.homeId === id || f.awayId === id)) return true;
  }
  return false;
}

// Has the player's club won a European title (live state or career archive)?
function wonEuropean(ctx: AchievementCtx): boolean {
  const id = ctx.playerTeamId;
  if (ctx.state.league.europeanCup?.knockout?.championTeamId === id) return true;
  if (ctx.state.league.europeanShield?.knockout?.championTeamId === id) return true;
  return ctx.state.career.archive.some(
    a => a.europeanCupChampionTeamId === id || a.europeanShieldChampionTeamId === id,
  );
}

// Highest OVR among the player's current senior squad.
function squadPeakOvr(ctx: AchievementCtx): number {
  const club = ctx.state.career.clubs.find(c => c.id === ctx.playerTeamId);
  if (!club) return 0;
  let peak = 0;
  for (const rid of club.squad) {
    const p = ctx.state.career.roster[rid];
    if (!p) continue;
    const ovr = playerOverall(p.baseStats, p.position);
    if (ovr > peak) peak = ovr;
  }
  return peak;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  // ── Match milestones ───────────────────────────────────────────────
  {
    id: 'first_win',
    gcId: 'com.patrickdoig.rugbymanager.first_win',
    title: 'First Whistle',
    description: 'Win your first match.',
    category: 'match',
    check: (ctx) => { const v = playerView(ctx); return v !== null && v.for > v.against; },
  },
  {
    id: 'statement_win',
    gcId: 'com.patrickdoig.rugbymanager.statement_win',
    title: 'Statement Win',
    description: 'Win a match by 50 points or more.',
    category: 'match',
    check: (ctx) => { const v = playerView(ctx); return v !== null && v.for - v.against >= 50; },
  },
  {
    id: 'shut_out',
    gcId: 'com.patrickdoig.rugbymanager.shut_out',
    title: 'Shut Out',
    description: 'Win a match without conceding a point.',
    category: 'match',
    check: (ctx) => { const v = playerView(ctx); return v !== null && v.for > v.against && v.against === 0; },
  },
  {
    id: 'five_star',
    gcId: 'com.patrickdoig.rugbymanager.five_star',
    title: 'Five-Star Display',
    description: 'Score 5 or more tries in a single match.',
    category: 'match',
    check: (ctx) => { const v = playerView(ctx); return v !== null && v.tries >= 5; },
  },

  // ── Season milestones ──────────────────────────────────────────────
  {
    id: 'top_four',
    gcId: 'com.patrickdoig.rugbymanager.top_four',
    title: 'Top Four',
    description: 'Reach the playoffs.',
    category: 'season',
    check: inPlayoffBracket,
  },
  {
    id: 'semi_slayer',
    gcId: 'com.patrickdoig.rugbymanager.semi_slayer',
    title: 'Final Bound',
    description: 'Win a playoff semi-final.',
    category: 'season',
    check: wonSemiFinal,
  },
  {
    id: 'champions',
    gcId: 'com.patrickdoig.rugbymanager.champions',
    title: 'Champions',
    description: 'Win the league.',
    category: 'season',
    check: (ctx) => ctx.state.league.playoffs?.championTeamId === ctx.playerTeamId
                 || titlesWon(ctx) >= 1,
  },
  {
    id: 'survivor',
    gcId: 'com.patrickdoig.rugbymanager.survivor',
    title: 'Full Campaign',
    description: 'Complete a full season.',
    category: 'season',
    check: (ctx) => ctx.state.career.seasonsCompleted >= 1,
  },

  // ── European competition milestones ───────────────────────────────────
  {
    id: 'euro_qualify',
    gcId: 'com.patrickdoig.rugbymanager.euro_qualify',
    title: 'European Adventure',
    description: 'Qualify for a European competition.',
    category: 'season',
    check: inEuropean,
  },
  {
    id: 'euro_knockout',
    gcId: 'com.patrickdoig.rugbymanager.euro_knockout',
    title: 'Beyond the Pool',
    description: 'Reach the knockout stages of a European competition.',
    category: 'season',
    check: inEuropeanKnockout,
  },
  {
    id: 'euro_final',
    gcId: 'com.patrickdoig.rugbymanager.euro_final',
    title: 'Continental Final',
    description: 'Reach a European Cup or Shield final.',
    category: 'season',
    check: inEuropeanFinal,
  },
  {
    id: 'euro_champion',
    gcId: 'com.patrickdoig.rugbymanager.euro_champion',
    title: 'Continental Champion',
    description: 'Win a European title.',
    category: 'season',
    check: wonEuropean,
  },

  // ── Career / transfer milestones ───────────────────────────────────
  {
    id: 'dynasty',
    gcId: 'com.patrickdoig.rugbymanager.dynasty',
    title: 'Dynasty',
    description: 'Win the league twice.',
    category: 'career',
    check: (ctx) => titlesWon(ctx) >= 2,
  },
  {
    id: 'veteran',
    gcId: 'com.patrickdoig.rugbymanager.veteran',
    title: 'Veteran Manager',
    description: 'Manage through five complete seasons.',
    category: 'career',
    check: (ctx) => ctx.state.career.seasonsCompleted >= 5,
  },
  {
    id: 'star_maker',
    gcId: 'com.patrickdoig.rugbymanager.star_maker',
    title: 'Star Maker',
    description: 'Have a player in your squad rated 90 OVR or higher.',
    category: 'career',
    check: (ctx) => squadPeakOvr(ctx) >= 90,
  },
];
