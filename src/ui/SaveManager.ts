// Persists the player's in-progress career to localStorage so the Home
// Screen's "Continue Game" button can resume mid-season after a browser
// close. Schema is versioned — bump SAVE_VERSION whenever the shape changes.
//
// Storage layout: three fixed slots (rugby-manager-save-{1,2,3}) plus an
// active-slot pointer (rugby-manager-active-slot). Each slot envelope adds
// `slotName` + `savedAt` alongside the flat SavedGame fields — a storage
// concern, NOT a game-schema bump, so SAVE_VERSION is unaffected. The public
// loadSave()/saveGame()/clearSave() functions are thin wrappers that target the
// active slot, preserving the original autosave contract for every call site.
// The native iCloud-backup mirror lives in saveBackup.ts and hooks in via
// setSlotWriteHook — SaveManager itself has no Capacitor dependency.

import type { SavedCareer, SavedSeason, SavedSeasonResult } from '../game/GameCoordinator';
import type { ArchivedPlayerSeason, ArchivedSeason, ClubState, CupFixture, CupKnockout, CupKnockoutMatch, Fixture, MarketState, PlayerRef, PlayoffMatch, PlayoffState, PremCupState, PreAgreement, SeasonAwards, TeamSeasonStats, TransferBid, TransferOffer } from '../types/gameState';
import type { Player, PlayerSeasonStats } from '../types/player';
import { zeroSeasonStats } from '../types/player';
import { zeroStanding, zeroTeamSeasonStats } from '../types/gameState';
import type { TeamTactics } from '../types/team';
import type { TrainingPlan } from '../types/training';
import { SENIOR_CAP, EFFECTIVE_CAP_CREDITS } from '../engine/balance';

const DEFAULT_SALARY_BUDGET = SENIOR_CAP + EFFECTIVE_CAP_CREDITS;

// Three fixed named slots. The envelope adds `slotName` + `savedAt` alongside
// the existing flat SavedGame fields — the game-state SAVE_VERSION is
// unchanged (the slot wrapper is a storage concern, not a schema change).
export type SlotId = 1 | 2 | 3;
export const SLOT_IDS: readonly SlotId[] = [1, 2, 3];
const SLOT_KEY: Record<SlotId, string> = {
  1: 'rugby-manager-save-1',
  2: 'rugby-manager-save-2',
  3: 'rugby-manager-save-3',
};
const ACTIVE_KEY = 'rugby-manager-active-slot';
const SAVE_VERSION = 1;
// Including SAVE_VERSION here is load-bearing — without it a freshly written
// save is rejected on the very next load.
const ACCEPTED_VERSIONS = new Set([SAVE_VERSION]);

export type SavedGame = SavedSeason & { version: number; slotName?: string; savedAt?: number };

// Metadata for the Saves screen — `save` is null for an empty slot.
export interface SlotInfo {
  id: SlotId;
  name: string;
  savedAt: number | null;
  save: SavedSeason | null;
}

function defaultSlotName(id: SlotId): string {
  return `Save ${id}`;
}

// Fired after a slot's raw JSON is written to localStorage so the native
// backup layer (saveBackup.ts) can mirror it to disk. Decouples SaveManager
// from Capacitor — set once at boot via setSlotWriteHook, no-op on web.
let slotWriteHook: ((id: SlotId, raw: string) => void) | null = null;
export function setSlotWriteHook(fn: ((id: SlotId, raw: string) => void) | null): void {
  slotWriteHook = fn;
}

// Parse a raw SavedGame object into a validated SavedSeason. Shared by every
// slot loader (and parseRawSave). Returns null on any structural problem so
// callers fall back to "no save" rather than corrupting state.
function parseSavedGame(parsed: SavedGame): SavedSeason | null {
  try {
    if (!ACCEPTED_VERSIONS.has(parsed.version)) return null;
    if (typeof parsed.playerTeamId !== 'string') return null;
    if (typeof parsed.seed !== 'number') return null;
    if (typeof parsed.currentWeek !== 'number') return null;
    if (!Array.isArray(parsed.results)) return null;
    if (!Array.isArray(parsed.fixtures)) return null;
    if (!parsed.career) return null;
    // Each recorded result must carry numeric scores / round and string team
    // ids. A non-numeric score (corrupt or hand-edited save) would otherwise
    // flow into FIXTURE_RESULT_RECORDED → NaN standings.
    if (!parsed.results.every(r =>
      typeof r.round === 'number' &&
      typeof r.homeId === 'string' &&
      typeof r.awayId === 'string' &&
      typeof r.homeScore === 'number' &&
      typeof r.awayScore === 'number'
    )) return null;
    const fixtures: Fixture[] = parsed.fixtures.map(f => ({
      round: f.round,
      homeId: f.homeId,
      awayId: f.awayId,
      ...(f.date !== undefined ? { date: f.date } : {}),
    }));
    const tactics: TeamTactics | undefined = parsed.tactics
      ? { ...parsed.tactics } as TeamTactics
      : undefined;
    const matchdaySquad: PlayerRef[] | undefined =
      Array.isArray(parsed.matchdaySquad) && parsed.matchdaySquad.length === 23
        ? parsed.matchdaySquad.map(r => ({ firstName: r.firstName, lastName: r.lastName }))
        : undefined;
    const training: TrainingPlan | undefined =
      parsed.training && isValidTrainingPlan(parsed.training)
        ? { ...parsed.training }
        : undefined;
    const career = parseCareer(parsed.career);
    if (!career) return null;
    const teamSeasonStats = typeof parsed.teamSeasonStats === 'object' && parsed.teamSeasonStats
      ? parseTeamSeasonStats(parsed.teamSeasonStats as Record<string, unknown>)
      : undefined;
    const playoffs = parsed.playoffs !== undefined
      ? parsePlayoffs(parsed.playoffs)
      : undefined;
    const premCup = parsed.premCup !== undefined
      ? parsePremCup(parsed.premCup)
      : undefined;
    const cupDirection = parsed.cupDirection === 'rest_first_15' || parsed.cupDirection === 'best'
      ? parsed.cupDirection
      : undefined;
    return {
      playerTeamId: parsed.playerTeamId,
      seed: parsed.seed >>> 0,
      currentWeek: parsed.currentWeek,
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
      fixtures,
      ...(tactics !== undefined ? { tactics } : {}),
      ...(matchdaySquad !== undefined ? { matchdaySquad } : {}),
      ...(training !== undefined ? { training } : {}),
      career,
      ...(teamSeasonStats !== undefined ? { teamSeasonStats } : {}),
      ...(playoffs !== undefined ? { playoffs } : {}),
      ...(premCup !== undefined ? { premCup } : {}),
      ...(cupDirection !== undefined ? { cupDirection } : {}),
    };
  } catch {
    return null;
  }
}

// Best-effort structural parse of the career envelope. Returns undefined if
// any required field is missing — callers (fromSave) then fall through to
// fresh-seed behaviour rather than corrupting state.
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
  const takeoverHistory = Array.isArray(c.takeoverHistory)
    ? (c.takeoverHistory as unknown[]).filter((x): x is string => typeof x === 'string')
    : undefined;
  const midseasonRejections = typeof c.midseasonRejections === 'object'
    && c.midseasonRejections !== null
    && !Array.isArray(c.midseasonRejections)
    ? Object.fromEntries(
        Object.entries(c.midseasonRejections as Record<string, unknown>)
          .filter(([k, v]) => Number.isFinite(Number(k)) && typeof v === 'number')
          .map(([k, v]) => [Number(k), v as number]),
      )
    : undefined;
  const activePoachedIds = Array.isArray(c.activePoachedIds)
    ? (c.activePoachedIds as unknown[]).filter((x): x is number => typeof x === 'number')
    : [];
  return {
    seasonsCompleted: c.seasonsCompleted,
    nextRosterId: c.nextRosterId,
    clubs: (c.clubs as Partial<ClubState>[]).map(cl => ({
      id: cl.id as string,
      squad: [...(cl.squad ?? [])],
      salaryBudget: typeof cl.salaryBudget === 'number' ? cl.salaryBudget : DEFAULT_SALARY_BUDGET,
    })),
    roster: backfillRosterSeasonStats(c.roster as Record<number, Player>),
    archive: (c.archive as ArchivedSeason[]).map(a => ({
      seasonLabel: a.seasonLabel,
      standings: a.standings.map(s => ({ ...s })),
      topScorerRosterId: a.topScorerRosterId,
      mvpRosterId: a.mvpRosterId,
      championTeamId: a.championTeamId ?? null,
      ...(a.leaders ? { leaders: cloneLeaders(a.leaders) } : {}),
      ...(a.playerSeasonHistory ? { playerSeasonHistory: clonePlayerHistory(a.playerSeasonHistory) } : {}),
    })),
    freeAgents,
    market,
    pendingMoves,
    ...(preSeasonStep !== undefined ? { preSeasonStep } : {}),
    ...(takeoverHistory !== undefined ? { takeoverHistory } : {}),
    ...(midseasonRejections !== undefined ? { midseasonRejections } : {}),
    activePoachedIds,
  };
}

// Ensure all PlayerSeasonStats fields exist on every roster entry (guards
// against corrupt or hand-edited saves where a field was written as a
// non-numeric value).
function backfillRosterSeasonStats(roster: Record<number, Player>): Record<number, Player> {
  const zero = zeroSeasonStats();
  for (const k of Object.keys(roster)) {
    const p = roster[Number(k)];
    if (!p.seasonStats) {
      p.seasonStats = { ...zero };
    } else {
      for (const f of Object.keys(zero) as (keyof PlayerSeasonStats)[]) {
        if (typeof p.seasonStats[f] !== 'number') p.seasonStats[f] = 0;
      }
    }
    if (typeof p.condition !== 'number') p.condition = 100;
  }
  return roster;
}

// Validate a candidate TrainingPlan from save JSON — fall through to
// undefined (and let DEFAULT_TRAINING_PLAN take over) rather than trust
// arbitrary user-edited JSON straight into the engine.
function isValidTrainingPlan(raw: unknown): raw is TrainingPlan {
  if (typeof raw !== 'object' || raw === null) return false;
  const r = raw as Record<string, unknown>;
  const intensities = ['rest', 'light', 'medium', 'high'];
  const fwd = ['set_piece', 'strength', 'stamina', 'handling'];
  const bck = ['tackling', 'defensive_organisation', 'attacking_skills', 'kicking'];
  return typeof r.intensity === 'string'      && intensities.includes(r.intensity)
      && typeof r.forwardsFocus === 'string'  && fwd.includes(r.forwardsFocus)
      && typeof r.backsFocus === 'string'     && bck.includes(r.backsFocus);
}

function cloneLeaders(l: SeasonAwards): SeasonAwards {
  return {
    topTries:   l.topTries.map(x => ({ ...x })),
    topCarries: l.topCarries.map(x => ({ ...x })),
    topTackles: l.topTackles.map(x => ({ ...x })),
    topRating:  l.topRating.map(x => ({ ...x })),
  };
}

function clonePlayerHistory(h: Record<number, ArchivedPlayerSeason>): Record<number, ArchivedPlayerSeason> {
  const out: Record<number, ArchivedPlayerSeason> = {};
  for (const k of Object.keys(h)) {
    const rid = Number(k);
    if (!Number.isFinite(rid)) continue;
    const v = h[rid];
    if (typeof v !== 'object' || v === null) continue;
    out[rid] = { ...v };
  }
  return out;
}

// Defensive against malformed entries — any non-numeric field falls back to 0.
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

// Returns null when no bracket is active. Returns undefined when the shape is
// malformed so callers fall through to "no playoff state restored".
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

// Defensive parse of the Prem Cup subtree. Returns null when explicitly
// null, undefined when malformed (so the cup re-seeds at the next break
// rather than crashing fromSave on a corrupt save). Trusts our own writer's
// numeric consistency, recomputing only pointsDiff to keep the season
// invariant happy.
function parsePremCup(raw: unknown): PremCupState | null | undefined {
  if (raw === null) return null;
  if (typeof raw !== 'object') return undefined;
  const c = raw as Record<string, unknown>;
  if (typeof c.seasonLabel !== 'string') return undefined;
  if (!Array.isArray(c.pools) || c.pools.length !== 2) return undefined;
  if (!Array.isArray(c.fixtures)) return undefined;
  const poolA = parseCupPool(c.pools[0], 'A');
  const poolB = parseCupPool(c.pools[1], 'B');
  if (!poolA || !poolB) return undefined;
  const fixtures: CupFixture[] = [];
  for (const f of c.fixtures) {
    const fx = parseCupFixture(f);
    if (!fx) return undefined;
    fixtures.push(fx);
  }
  const knockout = c.knockout === null || c.knockout === undefined ? null : parseCupKnockout(c.knockout);
  if (knockout === undefined) return undefined;
  return { seasonLabel: c.seasonLabel, pools: [poolA, poolB], fixtures, knockout };
}

function parseCupPool(raw: unknown, expectedId: 'A' | 'B'): PremCupState['pools'][number] | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const p = raw as Record<string, unknown>;
  if (p.id !== expectedId) return null;
  if (!Array.isArray(p.teamIds) || p.teamIds.length !== 5) return null;
  if (!Array.isArray(p.standings) || p.standings.length !== 5) return null;
  const teamIds = p.teamIds.filter((t): t is string => typeof t === 'string');
  if (teamIds.length !== 5) return null;
  const standings = p.standings.map(parseStanding);
  if (standings.some(s => s === null)) return null;
  return { id: expectedId, teamIds, standings: standings as ReturnType<typeof zeroStanding>[] };
}

function parseStanding(raw: unknown): ReturnType<typeof zeroStanding> | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.teamId !== 'string') return null;
  const num = (v: unknown): number => (typeof v === 'number' ? v : 0);
  const s = zeroStanding(r.teamId);
  s.played = num(r.played);
  s.won = num(r.won);
  s.drawn = num(r.drawn);
  s.lost = num(r.lost);
  s.pointsFor = num(r.pointsFor);
  s.pointsAgainst = num(r.pointsAgainst);
  s.pointsDiff = s.pointsFor - s.pointsAgainst; // recompute to satisfy invariant
  s.tryBonus = num(r.tryBonus);
  s.losingBonus = num(r.losingBonus);
  s.leaguePoints = num(r.leaguePoints);
  return s;
}

function parseCupFixture(raw: unknown): CupFixture | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const f = raw as Record<string, unknown>;
  if (f.pool !== 'A' && f.pool !== 'B') return null;
  if (f.leg !== 1 && f.leg !== 2) return null;
  if (typeof f.homeId !== 'string' || typeof f.awayId !== 'string') return null;
  if (typeof f.date !== 'string') return null;
  return {
    pool: f.pool, leg: f.leg, homeId: f.homeId, awayId: f.awayId, date: f.date,
    ...(parseCupResult(f.result) ? { result: parseCupResult(f.result)! } : {}),
  };
}

function parseCupKnockout(raw: unknown): CupKnockout | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const k = raw as Record<string, unknown>;
  if (!Array.isArray(k.semifinals) || k.semifinals.length !== 2) return undefined;
  const sf1 = parseCupKnockoutMatch(k.semifinals[0], 'semifinal_1');
  const sf2 = parseCupKnockoutMatch(k.semifinals[1], 'semifinal_2');
  const fin = parseCupKnockoutMatch(k.final, 'final');
  if (!sf1 || !sf2 || !fin) return undefined;
  return {
    semifinals: [sf1, sf2],
    final: fin,
    championTeamId: typeof k.championTeamId === 'string' ? k.championTeamId : null,
  };
}

function parseCupKnockoutMatch(raw: unknown, expectedKind: CupKnockoutMatch['kind']): CupKnockoutMatch | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const m = raw as Record<string, unknown>;
  if (m.kind !== expectedKind) return null;
  if (typeof m.date !== 'string') return null;
  return {
    kind: expectedKind,
    homeId: typeof m.homeId === 'string' ? m.homeId : null,
    awayId: typeof m.awayId === 'string' ? m.awayId : null,
    date: m.date,
    ...(parseCupResult(m.result) ? { result: parseCupResult(m.result)! } : {}),
  };
}

function parseCupResult(raw: unknown): CupFixture['result'] | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const r = raw as Record<string, unknown>;
  if (typeof r.homeScore !== 'number' || typeof r.awayScore !== 'number') return undefined;
  return {
    homeScore: r.homeScore,
    awayScore: r.awayScore,
    homeTries: typeof r.homeTries === 'number' ? r.homeTries : 0,
    awayTries: typeof r.awayTries === 'number' ? r.awayTries : 0,
  };
}

function parseMarket(raw: unknown): MarketState | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const m = raw as Record<string, unknown>;
  if (typeof m.openedAfterSeason !== 'string') return null;
  if (!Array.isArray(m.expiringRosterIds)) return null;
  if (!Array.isArray(m.offers)) return null;
  const phase: MarketState['phase'] =
    m.phase === 'signings'           ? 'signings'
  : m.phase === 'signings-midseason' ? 'signings-midseason'
  : m.phase === 'poach-midseason'    ? 'poach-midseason'
  :                                    'renewals';
  const bids = Array.isArray(m.bids)
    ? (m.bids as unknown[]).filter(isValidBid).map(b => ({ ...b }))
    : [];
  const offers = (m.offers as unknown[]).filter(isValidOffer).map(o => ({ ...o }));
  return {
    phase,
    openedAfterSeason: m.openedAfterSeason,
    expiringRosterIds: m.expiringRosterIds.filter((n): n is number => typeof n === 'number'),
    offers,
    bids,
  };
}

function isValidBid(b: unknown): b is TransferBid {
  if (typeof b !== 'object' || b === null) return false;
  const o = b as Record<string, unknown>;
  return typeof o.id === 'string'
      && typeof o.rosterId === 'number'
      && typeof o.clubId === 'string'
      && typeof o.kind === 'string'
      && typeof o.annualWage === 'number'
      && typeof o.lengthYears === 'number'
      && typeof o.status === 'string';
}

function isValidOffer(o: unknown): o is TransferOffer {
  if (typeof o !== 'object' || o === null) return false;
  const r = o as Record<string, unknown>;
  return typeof r.id === 'string'
      && typeof r.rosterId === 'number'
      && typeof r.annualWage === 'number'
      && typeof r.lengthYears === 'number';
}

// ── Slot storage ──────────────────────────────────────────────────────────

// Raw localStorage accessors — the native backup layer (saveBackup.ts) reads
// and writes through these so all key knowledge stays here.
export function getRawSlot(id: SlotId): string | null {
  try {
    return localStorage.getItem(SLOT_KEY[id]);
  } catch {
    return null;
  }
}

// Write a raw envelope string straight into a slot, firing the mirror hook.
// Used by the backup reconcile path (disk → localStorage) and by saveToSlot.
export function setRawSlot(id: SlotId, raw: string): void {
  try {
    localStorage.setItem(SLOT_KEY[id], raw);
    slotWriteHook?.(id, raw);
  } catch {
    // Best-effort — used by the backup-reconcile path. saveToSlot owns the
    // user-facing failure on the explicit-save path.
  }
}

export function getActiveSlot(): SlotId {
  try {
    const v = Number(localStorage.getItem(ACTIVE_KEY));
    if (v === 1 || v === 2 || v === 3) return v;
  } catch {
    // ignore
  }
  return 1;
}

export function setActiveSlot(id: SlotId): void {
  try {
    localStorage.setItem(ACTIVE_KEY, String(id));
  } catch {
    // ignore
  }
}

// Read just the envelope metadata (name + timestamp) without a full parse.
function readEnvelope(id: SlotId): SavedGame | null {
  const raw = getRawSlot(id);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SavedGame;
  } catch {
    return null;
  }
}

export function loadSlot(id: SlotId): SavedSeason | null {
  const env = readEnvelope(id);
  if (!env) return null;
  return parseSavedGame(env);
}

// Validate + parse a raw envelope string (from an imported file). Returns the
// validated SavedSeason, or null if the JSON / version / shape is unusable.
export function parseRawSave(raw: string): SavedSeason | null {
  try {
    return parseSavedGame(JSON.parse(raw) as SavedGame);
  } catch {
    return null;
  }
}

export function slotInfo(id: SlotId): SlotInfo {
  const env = readEnvelope(id);
  const save = env ? parseSavedGame(env) : null;
  return {
    id,
    name: (env && typeof env.slotName === 'string' && env.slotName.trim()) || defaultSlotName(id),
    savedAt: env && typeof env.savedAt === 'number' ? env.savedAt : null,
    save,
  };
}

export function listSlots(): SlotInfo[] {
  return SLOT_IDS.map(slotInfo);
}

// Write a game into a slot, preserving the slot's existing name unless a new
// one is supplied. Throws on quota failure so the UI can surface it (the
// legacy saveGame wrapper swallows it to preserve the old autosave contract).
export function saveToSlot(id: SlotId, save: SavedSeason, name?: string): void {
  const existing = readEnvelope(id);
  const slotName = (name ?? existing?.slotName ?? defaultSlotName(id));
  const payload: SavedGame = { version: SAVE_VERSION, slotName, savedAt: Date.now(), ...save };
  const raw = JSON.stringify(payload);
  localStorage.setItem(SLOT_KEY[id], raw);
  slotWriteHook?.(id, raw);
}

export function clearSlot(id: SlotId): void {
  try {
    localStorage.removeItem(SLOT_KEY[id]);
    slotWriteHook?.(id, '');
  } catch {
    // ignore
  }
}

export function renameSlot(id: SlotId, name: string): void {
  const env = readEnvelope(id);
  if (!env) return;
  env.slotName = name.trim() || defaultSlotName(id);
  const raw = JSON.stringify(env);
  setRawSlot(id, raw);
}

// ── Active-slot wrappers (preserve the original autosave contract) ──────────
// The ~15 autosave call sites in main.ts and HomeScreen's Continue card use
// these unchanged — they now simply target the active slot.

export function loadSave(): SavedSeason | null {
  return loadSlot(getActiveSlot());
}

export function saveGame(save: SavedSeason): void {
  try {
    saveToSlot(getActiveSlot(), save);
  } catch {
    // Storage full / disabled / private mode. Autosave stays silent to keep
    // the old contract; the explicit Save action surfaces failures via toast.
  }
}

export function clearSave(): void {
  clearSlot(getActiveSlot());
}
