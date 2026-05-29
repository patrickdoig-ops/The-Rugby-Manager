// Persists the player's in-progress career to localStorage so the Home
// Screen's "Continue Game" button can resume mid-season after a browser
// close. Schema is versioned — bump SAVE_VERSION whenever the shape changes.
//
// Storage layout (since the named-slots feature): three fixed slots
// (rugby-manager-save-{1,2,3}) plus an active-slot pointer
// (rugby-manager-active-slot). Each slot envelope is the flat SavedGame plus
// `slotName` + `savedAt` — a storage concern, NOT a game-schema bump, so
// SAVE_VERSION is unaffected. The legacy single-save key (rugby-manager-save)
// is folded into slot 1 once by migrateLegacySave() at boot. The public
// loadSave()/saveGame()/clearSave() functions are thin wrappers that target the
// active slot, preserving the original autosave contract for every call site.
// The native iCloud-backup mirror lives in saveBackup.ts and hooks in via
// setSlotWriteHook — SaveManager itself has no Capacitor dependency.
//
// v19 (current) adds per-player season history on every ArchivedSeason
// entry — `playerSeasonHistory: Record<rosterId, ArchivedPlayerSeason>`.
// Drives PlayerProfileScreen's Career History table. Pre-v19 archive
// entries load with the field undefined — the profile renders an empty
// Career History column for those historical seasons. New rollovers
// always populate it.
//
// v18 added the training system. Adds `Player.condition` on every
// roster Player (0-100, persistent inter-match freshness) and an optional
// `training?: TrainingPlan` field at the top level (manager's last
// training-week choice). Pre-v18 saves load with condition back-filled to
// 100 on every roster entry and training undefined — TrainingScreen
// resolves both via its DEFAULT_TRAINING_PLAN fallback.
//
// v9 added the injury system. Persistent injury state lives on each
// roster Player as the optional `injury` field (PlayerInjury — kind,
// severity, weeksRemaining, injuredOn, isRecurrence). Absent ⇔ fit.
// Decremented weekly on WEEK_ADVANCED; cleared by PLAYER_RECOVERED.
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
import type { ArchivedPlayerSeason, ArchivedSeason, ClubState, Fixture, MarketState, PlayerRef, PlayoffMatch, PlayoffState, PreAgreement, SeasonAwards, TeamSeasonStats, TransferBid, TransferOffer } from '../types/gameState';
import type { Player, PlayerSeasonStats } from '../types/player';
import { zeroSeasonStats } from '../types/player';
import { zeroTeamSeasonStats } from '../types/gameState';
import type { TeamTactics } from '../types/team';
import type { TrainingPlan } from '../types/training';
import { SENIOR_CAP, EFFECTIVE_CAP_CREDITS } from '../engine/balance';
import { playerOverall } from '../engine/RatingEngine';
import { getAge } from '../game/age';

const DEFAULT_SALARY_BUDGET = SENIOR_CAP + EFFECTIVE_CAP_CREDITS;

// Pre-slot single-save key (v21 and earlier). Migrated into slot 1 on first
// boot by migrateLegacySave(), then removed.
const LEGACY_KEY = 'rugby-manager-save';
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
const SAVE_VERSION = 21;
// The current version is always accepted (the older entries are the migratable
// past). Including SAVE_VERSION here is load-bearing — without it a freshly
// written save is rejected on the very next load.
const ACCEPTED_VERSIONS = new Set([SAVE_VERSION, 20, 19, 18, 17, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);

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
// slot loader (and the legacy-save migration). Returns null on any structural
// problem so callers fall back to "no save" rather than corrupting state.
function parseSavedGame(parsed: SavedGame): SavedSeason | null {
  try {
    if (!ACCEPTED_VERSIONS.has(parsed.version)) return null;
    if (typeof parsed.playerTeamId !== 'string') return null;
    if (typeof parsed.seed !== 'number') return null;
    if (typeof parsed.currentWeek !== 'number') return null;
    if (!Array.isArray(parsed.results)) return null;
    // Each recorded result must carry numeric scores / round and string team
    // ids. A non-numeric score (corrupt or hand-edited save) would otherwise
    // flow into FIXTURE_RESULT_RECORDED → NaN standings, which either trips
    // assertSeasonInvariants on load or silently poisons the league table.
    // Reject the whole save (treated as "no save") rather than corrupt state.
    if (!parsed.results.every(r =>
      typeof r.round === 'number' &&
      typeof r.homeId === 'string' &&
      typeof r.awayId === 'string' &&
      typeof r.homeScore === 'number' &&
      typeof r.awayScore === 'number'
    )) return null;
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
    // v17 added `offloadStrategy`; older saves get 'balanced' for the same
    // reason. The cast to Partial<TeamTactics> reflects the runtime truth —
    // JSON from a pre-vN save genuinely lacks the field, even though the
    // SavedGame type pretends it's required.
    const tactics: TeamTactics | undefined =
      parsed.version >= 4 && parsed.tactics
        ? {
            ...(parsed.tactics as Partial<TeamTactics>),
            defensiveLine:   (parsed.tactics as Partial<TeamTactics>).defensiveLine   ?? 'hybrid',
            offloadStrategy: (parsed.tactics as Partial<TeamTactics>).offloadStrategy ?? 'balanced',
          } as TeamTactics
        : undefined;
    const matchdaySquad: PlayerRef[] | undefined =
      parsed.version >= 4 && Array.isArray(parsed.matchdaySquad) && parsed.matchdaySquad.length === 23
        ? parsed.matchdaySquad.map(r => ({ firstName: r.firstName, lastName: r.lastName }))
        : undefined;
    // v18+ persists the manager's last training plan. Pre-v18 saves omit
    // the field; TrainingScreen falls back to DEFAULT_TRAINING_PLAN on
    // first render after load.
    const training: TrainingPlan | undefined =
      parsed.version >= 18 && parsed.training && isValidTrainingPlan(parsed.training)
        ? { ...parsed.training }
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
      ...(training !== undefined ? { training } : {}),
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
  // v14+ — takeoverHistory persists which clubs have been taken over.
  // Pre-v14 saves omit it; load as an empty array (no historical
  // takeovers known). Newcastle Red Bull then re-fires on the next
  // year-1→year-2 transition if the save is in season 1.
  const takeoverHistory = Array.isArray(c.takeoverHistory)
    ? (c.takeoverHistory as unknown[]).filter((x): x is string => typeof x === 'string')
    : undefined;
  // v16+ — mid-season FA rejection cooldowns. Pre-v16 saves omit it;
  // load as {} (no historical cooldowns known). Defensive filter on
  // value type so a malformed entry can't poison the runtime.
  const midseasonRejections = typeof c.midseasonRejections === 'object'
    && c.midseasonRejections !== null
    && !Array.isArray(c.midseasonRejections)
    ? Object.fromEntries(
        Object.entries(c.midseasonRejections as Record<string, unknown>)
          .filter(([k, v]) => Number.isFinite(Number(k)) && typeof v === 'number')
          .map(([k, v]) => [Number(k), v as number]),
      )
    : undefined;
  return {
    seasonsCompleted: c.seasonsCompleted,
    nextRosterId: c.nextRosterId,
    // v14+ clubs carry salaryBudget. Pre-v14 saves default to the
    // effective cap right here so the parse output is always
    // well-typed — no `undefined as unknown as number` lies leaking
    // into GameCoordinator.fromSave. The next rollover recomputes
    // via computeBudgetEvents.
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
      // v13+ field; pre-v13 archive entries omit it and load as null.
      championTeamId: a.championTeamId ?? null,
      ...(a.leaders ? { leaders: cloneLeaders(a.leaders) } : {}),
      // v19+ field. Pre-v19 archive entries omit the map; the profile
      // screen's Career History row for that season then renders an
      // em-dash placeholder. New rollovers always populate it.
      ...(a.playerSeasonHistory ? { playerSeasonHistory: clonePlayerHistory(a.playerSeasonHistory) } : {}),
    })),
    freeAgents,
    market,
    pendingMoves,
    ...(preSeasonStep !== undefined ? { preSeasonStep } : {}),
    ...(takeoverHistory !== undefined ? { takeoverHistory } : {}),
    ...(midseasonRejections !== undefined ? { midseasonRejections } : {}),
  };
}

// Backfill new PlayerSeasonStats fields onto an old-save roster. The v8
// shape only carried 11 fields (appearances / tries / 2 cards / 3 goal-kick
// reserves / 3 tackle-flavoured + ratingSum). Newer fields (carries,
// metresCarried, line breaks, etc.) default to 0 so applySeasonEvent's
// additive deltas don't NaN out on the next match. v18 also back-fills
// `condition: 100` for every roster entry (training-system addition).
function backfillRosterSeasonStats(roster: Record<number, Player>): Record<number, Player> {
  const zero = zeroSeasonStats();
  for (const k of Object.keys(roster)) {
    const p = roster[Number(k)];
    if (!p.seasonStats) {
      p.seasonStats = { ...zero };
    } else {
      const merged: PlayerSeasonStats = { ...zero };
      for (const f of Object.keys(zero) as (keyof PlayerSeasonStats)[]) {
        const v = p.seasonStats[f];
        if (typeof v === 'number') merged[f] = v;
      }
      p.seasonStats = merged;
    }
    if (typeof p.condition !== 'number') p.condition = 100;
    if (typeof p.potential !== 'number') {
      const todayIso = new Date().toISOString().slice(0, 10);
      const ageNow = p.dob ? (getAge(p.dob, todayIso) ?? 28) : 28;
      const ovr = playerOverall(p.baseStats, p.position);
      const headroom = ageNow <= 21 ? 8 : ageNow <= 24 ? 5 : ageNow <= 28 ? 2 : 1;
      p.potential = Math.min(99, ovr + headroom);
    }
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
  // mid-window resumes on the correct screen. v16+ added the mid-season
  // signings variant.
  const phase: MarketState['phase'] =
    m.phase === 'signings'           ? 'signings'
  : m.phase === 'signings-midseason' ? 'signings-midseason'
  :                                    'renewals';
  // v15+ field. Pre-v15 saves omit the array; default empty so the
  // resumed window has no competing bids in flight (any pre-v15 mid-
  // window signings were already applied as CONTRACT_SIGNED — the new
  // bid layer just starts fresh). Each bid is structurally validated
  // before being trusted — a truncated / hand-edited save with malformed
  // bid objects would otherwise carry undefined fields straight into
  // runtime state.
  const bids = Array.isArray(m.bids)
    ? (m.bids as unknown[]).filter(isValidBid).map(b => ({ ...b }))
    : [];
  // Same validation pass for offers — same risk surface from a v6+
  // partial / corrupt save.
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
// migrated SavedSeason, or null if the JSON / version / shape is unusable.
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

// One-shot: fold a pre-slot single save into slot 1 if no slot is occupied.
// Called once at boot before the first Home render.
export function migrateLegacySave(): void {
  let legacy: string | null = null;
  try {
    legacy = localStorage.getItem(LEGACY_KEY);
  } catch {
    return;
  }
  if (!legacy) return;
  const anyOccupied = SLOT_IDS.some(id => getRawSlot(id) !== null);
  if (!anyOccupied) {
    try {
      const env = JSON.parse(legacy) as SavedGame;
      if (parseSavedGame(env)) {
        env.slotName = defaultSlotName(1);
        env.savedAt = Date.now();
        setRawSlot(1, JSON.stringify(env));
        setActiveSlot(1);
      }
    } catch {
      // Corrupt legacy save — drop it below.
    }
  }
  try {
    localStorage.removeItem(LEGACY_KEY);
  } catch {
    // ignore
  }
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
