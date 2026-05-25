// Persists the player's in-progress career to localStorage so the Home
// Screen's "Continue Game" button can resume mid-season after a browser
// close. Schema is versioned — bump SAVE_VERSION whenever the shape changes.
//
// v9 (current) adds the injury system. Persistent injury state lives on
// each roster Player as the optional `injury` field (PlayerInjury —
// kind, severity, weeksRemaining, injuredOn, isRecurrence). Absent ⇔
// fit. Decremented weekly on WEEK_ADVANCED; cleared by PLAYER_RECOVERED.
// Older saves load with every player at `injury: undefined` — purely
// additive, no migration shim needed.
//
// v7 extended v6 with the Phase 4 market layer — state.career.
// freeAgents (rosterIds whose contracts expired without renewal) and an
// optional state.career.market (open during the end-of-season renewal
// window, null otherwise). Mid-window saves let the player resume on
// the same offers; closed-window saves carry forward the accumulating
// free-agent pool for Phase 5+ to consume.
//
// v6 extended v5 with PlayerContract + reputation embedded in each
// persisted roster Player. Loading a v5 save triggers a per-player
// backfill in GameCoordinator.fromSave via contractSeeder. v6 saves
// load on v7 with freeAgents / market defaulting to [] / null.
//
// v5 extended v4 with a persistent career snapshot —
// state.career.roster (every player, with current baseStats), per-club
// squad pointers, archived standings + awards from prior seasons, and the
// seasonsCompleted / nextRosterId allocator. Lets the career span multiple
// seasons with stat development and retirements that survive a tab close.
//
// v4 extended v3 with persisted pre-match choices — `tactics` and
// `matchdaySquad` — that carry forward as defaults for the next match.
//
// v3 extended v2 with `seasonLabel` and `fixtures` snapshots so the schedule
// the user saw at save time is reconstructed verbatim on load.
//
// v2 stored the minimal slice for replay (playerTeamId, seed, currentWeek,
// results).
//
// v1 saves are discarded — they predate AI-vs-AI results.

import type { SavedCareer, SavedSeason, SavedSeasonResult } from '../game/GameCoordinator';
import type { ArchivedSeason, ClubState, Fixture, MarketState, PlayerRef, PlayoffMatch, PlayoffState, PreAgreement, SeasonAwards, TeamSeasonStats, TransferOffer } from '../types/gameState';
import type { Player, PlayerSeasonStats } from '../types/player';
import { zeroSeasonStats } from '../types/player';
import { zeroTeamSeasonStats } from '../types/gameState';
import type { TeamTactics } from '../types/team';

const SAVE_KEY = 'rugby-manager-save';
const SAVE_VERSION = 13;
const ACCEPTED_VERSIONS = new Set([13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);

export type SavedGame = SavedSeason & { version: number };

export function loadSave(): SavedSeason | null {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as SavedGame;
    if (!ACCEPTED_VERSIONS.has(parsed.version)) return null;
    if (typeof parsed.playerTeamId !== 'string') return null;
    if (typeof parsed.seed !== 'number') return null;
    if (typeof parsed.currentWeek !== 'number') return null;
    if (!Array.isArray(parsed.results)) return null;
    // v3+ includes the schedule snapshot; v2 omits it and GameCoordinator
    // falls back to the canonical PREMIERSHIP_2025_26 during fromSave.
    const fixtures: Fixture[] | undefined =
      parsed.version >= 3 && Array.isArray(parsed.fixtures)
        ? parsed.fixtures.map(f => ({
            round: f.round,
            homeId: f.homeId,
            awayId: f.awayId,
            ...(f.date !== undefined ? { date: f.date } : {}),
          }))
        : undefined;
    // v4+ persists pre-match preferences (tactics + matchday squad).
    // v10 added `defensiveLine` to TeamTactics; older saves get 'hybrid'
    // (numerically neutral) backfilled so the engine doesn't see undefined.
    // The cast to Partial<TeamTactics> reflects the runtime truth — JSON
    // from a pre-v10 save genuinely lacks the field, even though the
    // SavedGame type pretends it's required.
    const tactics: TeamTactics | undefined =
      parsed.version >= 4 && parsed.tactics
        ? {
            ...(parsed.tactics as Partial<TeamTactics>),
            defensiveLine: (parsed.tactics as Partial<TeamTactics>).defensiveLine ?? 'hybrid',
          } as TeamTactics
        : undefined;
    const matchdaySquad: PlayerRef[] | undefined =
      parsed.version >= 4 && Array.isArray(parsed.matchdaySquad) && parsed.matchdaySquad.length === 23
        ? parsed.matchdaySquad.map(r => ({ firstName: r.firstName, lastName: r.lastName }))
        : undefined;
    // v5+ persists the full career snapshot. v4 and older fall through —
    // GameCoordinator.fromSave seeds a fresh roster from JSONs.
    const career: SavedCareer | undefined =
      parsed.version >= 5 && parsed.career ? parseCareer(parsed.career) : undefined;
    // v9+ persists the per-team season aggregates. v8 and older load
    // without it; SEASON_INITIALIZED + CAREER_ARCHIVE_RESTORED leave the
    // map empty / zeroed for those saves.
    const teamSeasonStats = parsed.version >= 9 && typeof parsed.teamSeasonStats === 'object' && parsed.teamSeasonStats
      ? parseTeamSeasonStats(parsed.teamSeasonStats as Record<string, unknown>)
      : undefined;
    // v13+ persists the playoff bracket (if active) at the top level of
    // the save. Pre-v13 saves never had one; they load with playoffs
    // undefined and the engine starts the bracket fresh after the last
    // R18 fixture is recorded.
    const playoffs = parsed.version >= 13 && parsed.playoffs !== undefined
      ? parsePlayoffs(parsed.playoffs)
      : undefined;
    return {
      playerTeamId: parsed.playerTeamId,
      seed: parsed.seed >>> 0,
      currentWeek: parsed.currentWeek,
      // v11 adds homeTries/awayTries for the bonus-points system. Pre-v11
      // saves default to 0 — those rounds were played without try-bonus
      // tracking, so we don't fabricate retroactive bonuses.
      results: parsed.results.map(r => ({
        round: r.round,
        homeId: r.homeId,
        awayId: r.awayId,
        playerSide: r.playerSide ?? null,
        homeScore: r.homeScore,
        awayScore: r.awayScore,
        homeTries: typeof r.homeTries === 'number' ? r.homeTries : 0,
        awayTries: typeof r.awayTries === 'number' ? r.awayTries : 0,
      } satisfies SavedSeasonResult)),
      ...(parsed.seasonLabel !== undefined ? { seasonLabel: parsed.seasonLabel } : {}),
      ...(fixtures !== undefined ? { fixtures } : {}),
      ...(tactics !== undefined ? { tactics } : {}),
      ...(matchdaySquad !== undefined ? { matchdaySquad } : {}),
      ...(career !== undefined ? { career } : {}),
      ...(teamSeasonStats !== undefined ? { teamSeasonStats } : {}),
      ...(playoffs !== undefined ? { playoffs } : {}),
    };
  } catch {
    return null;
  }
}

// Best-effort structural parse of the v5+ career envelope. Returns
// undefined if any required field is missing — callers (fromSave) then
// fall through to fresh-seed behaviour rather than corrupting state.
// v7 adds optional freeAgents + market.
function parseCareer(raw: unknown): SavedCareer | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const c = raw as Record<string, unknown>;
  if (typeof c.seasonsCompleted !== 'number') return undefined;
  if (typeof c.nextRosterId !== 'number') return undefined;
  if (!Array.isArray(c.clubs)) return undefined;
  if (typeof c.roster !== 'object' || c.roster === null) return undefined;
  if (!Array.isArray(c.archive)) return undefined;
  const freeAgents = Array.isArray(c.freeAgents)
    ? c.freeAgents.filter((n): n is number => typeof n === 'number')
    : [];
  const market = parseMarket(c.market);
  const pendingMoves = Array.isArray(c.pendingMoves)
    ? (c.pendingMoves as PreAgreement[]).map(m => ({ ...m }))
    : [];
  const preSeasonStep = c.preSeasonStep === 'overview' || c.preSeasonStep === 'signings' || c.preSeasonStep === 'marquee'
    ? c.preSeasonStep
    : undefined;
  return {
    seasonsCompleted: c.seasonsCompleted,
    nextRosterId: c.nextRosterId,
    clubs: (c.clubs as ClubState[]).map(cl => ({ id: cl.id, squad: [...cl.squad] })),
    roster: backfillRosterSeasonStats(c.roster as Record<number, Player>),
    archive: (c.archive as ArchivedSeason[]).map(a => ({
      seasonLabel: a.seasonLabel,
      standings: a.standings.map(s => ({ ...s })),
      topScorerRosterId: a.topScorerRosterId,
      mvpRosterId: a.mvpRosterId,
      // v13+ field; pre-v13 archive entries omit it and load as null.
      championTeamId: a.championTeamId ?? null,
      ...(a.leaders ? { leaders: cloneLeaders(a.leaders) } : {}),
    })),
    freeAgents,
    market,
    pendingMoves,
    ...(preSeasonStep !== undefined ? { preSeasonStep } : {}),
  };
}

// Backfill new PlayerSeasonStats fields onto an old-save roster. The v8
// shape only carried 11 fields (appearances / tries / 2 cards / 3 goal-kick
// reserves / 3 tackle-flavoured + ratingSum). Newer fields (carries,
// metresCarried, line breaks, etc.) default to 0 so applySeasonEvent's
// additive deltas don't NaN out on the next match.
function backfillRosterSeasonStats(roster: Record<number, Player>): Record<number, Player> {
  const zero = zeroSeasonStats();
  for (const k of Object.keys(roster)) {
    const p = roster[Number(k)];
    if (!p.seasonStats) {
      p.seasonStats = { ...zero };
      continue;
    }
    const merged: PlayerSeasonStats = { ...zero };
    for (const f of Object.keys(zero) as (keyof PlayerSeasonStats)[]) {
      const v = p.seasonStats[f];
      if (typeof v === 'number') merged[f] = v;
    }
    p.seasonStats = merged;
  }
  return roster;
}

function cloneLeaders(l: SeasonAwards): SeasonAwards {
  return {
    topTries:   l.topTries.map(x => ({ ...x })),
    topCarries: l.topCarries.map(x => ({ ...x })),
    topTackles: l.topTackles.map(x => ({ ...x })),
    topRating:  l.topRating.map(x => ({ ...x })),
  };
}

// v9+ team-season-stats parse. Defensive against malformed entries —
// any non-numeric field falls back to the zero default.
function parseTeamSeasonStats(raw: Record<string, unknown>): Record<string, TeamSeasonStats> {
  const out: Record<string, TeamSeasonStats> = {};
  const zero = zeroTeamSeasonStats();
  for (const [teamId, value] of Object.entries(raw)) {
    if (typeof value !== 'object' || value === null) continue;
    const v = value as Record<string, unknown>;
    const stats: TeamSeasonStats = { ...zero };
    for (const f of Object.keys(zero) as (keyof TeamSeasonStats)[]) {
      const n = v[f];
      if (typeof n === 'number') stats[f] = n;
    }
    out[teamId] = stats;
  }
  return out;
}

// Best-effort structural parse of the v13+ playoff envelope. Returns
// null when the saved field is null (no bracket active). Returns
// undefined when the shape is malformed so callers fall through to "no
// playoff state restored" rather than corrupting league.playoffs.
function parsePlayoffs(raw: unknown): PlayoffState | null | undefined {
  if (raw === null) return null;
  if (typeof raw !== 'object') return undefined;
  const p = raw as Record<string, unknown>;
  if (!Array.isArray(p.semifinals) || p.semifinals.length !== 2) return undefined;
  if (typeof p.final !== 'object' || p.final === null) return undefined;
  const sf1 = parsePlayoffMatch(p.semifinals[0], 'semifinal_1');
  const sf2 = parsePlayoffMatch(p.semifinals[1], 'semifinal_2');
  const fin = parsePlayoffMatch(p.final, 'final');
  if (!sf1 || !sf2 || !fin) return undefined;
  return {
    semifinals: [sf1, sf2],
    final: fin,
    championTeamId: typeof p.championTeamId === 'string' ? p.championTeamId : null,
  };
}

function parsePlayoffMatch(raw: unknown, expectedKind: PlayoffMatch['kind']): PlayoffMatch | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const m = raw as Record<string, unknown>;
  if (m.kind !== expectedKind) return null;
  if (typeof m.date !== 'string') return null;
  const homeId = typeof m.homeId === 'string' ? m.homeId : null;
  const awayId = typeof m.awayId === 'string' ? m.awayId : null;
  const homeSeed = m.homeSeed === 1 || m.homeSeed === 2 || m.homeSeed === 3 || m.homeSeed === 4 ? m.homeSeed : null;
  const awaySeed = m.awaySeed === 1 || m.awaySeed === 2 || m.awaySeed === 3 || m.awaySeed === 4 ? m.awaySeed : null;
  const result = parsePlayoffResult(m.result);
  return {
    kind: expectedKind,
    homeId, awayId, homeSeed, awaySeed,
    date: m.date,
    ...(result ? { result } : {}),
  };
}

function parsePlayoffResult(raw: unknown): PlayoffMatch['result'] | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const r = raw as Record<string, unknown>;
  if (typeof r.homeScore !== 'number' || typeof r.awayScore !== 'number') return undefined;
  return {
    homeScore: r.homeScore,
    awayScore: r.awayScore,
    homeTries: typeof r.homeTries === 'number' ? r.homeTries : 0,
    awayTries: typeof r.awayTries === 'number' ? r.awayTries : 0,
    playerSide: r.playerSide === 'home' || r.playerSide === 'away' ? r.playerSide : null,
  };
}

function parseMarket(raw: unknown): MarketState | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const m = raw as Record<string, unknown>;
  if (typeof m.openedAfterSeason !== 'string') return null;
  if (!Array.isArray(m.expiringRosterIds)) return null;
  if (!Array.isArray(m.offers)) return null;
  // v7 saves predate the phase field; default to 'renewals' so a save
  // mid-window resumes on the correct screen.
  const phase: 'renewals' | 'signings' = m.phase === 'signings' ? 'signings' : 'renewals';
  return {
    phase,
    openedAfterSeason: m.openedAfterSeason,
    expiringRosterIds: m.expiringRosterIds.filter((n): n is number => typeof n === 'number'),
    offers: (m.offers as TransferOffer[]).map(o => ({ ...o })),
  };
}

export function saveGame(save: SavedSeason): void {
  const payload: SavedGame = { version: SAVE_VERSION, ...save };
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
  } catch {
    // Storage full / disabled / private mode — silent for MVP.
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    // ignore
  }
}
