// Stepped pre-match flow. Replaces the old single-screen tab-based
// preview. Internal state machine walks the user through four steps:
//
//   1. 'mine'    — confirmation of the user's starting XV + bench
//   2. 'opp'     — same format for the opponent
//   3. 'scout'   — opponent scouting report (form, approach, threats, trends)
//   4. 'tactics' — the existing compact TacticsMenu
//
// Each step shares a small top header (back arrow + context label +
// compact two-crest banner). Forward CTA labels: Continue → Continue
// → Choose Tactics → Start Match. The back arrow decrements one step;
// at step 1 it invokes the caller's onBack (returns to Hub or
// PlayoffBracket).
//
// The exported initPreMatchScreen signature is unchanged so main.ts's
// wiring carries over. A new optional onEditSquad opens Squad
// Management with a back arrow that returns straight back to the
// 'mine' step (via showSquadManagement(onBack?) override). An optional
// onPlayerProfile wires line-up name taps to PlayerProfileScreen with
// a back target that re-enters PreMatch at the same step.

import type { PlayerStats, Position } from '../types/player';
import type { TeamTactics } from '../types/team';
import { DEFAULT_TACTICS } from '../types/team';
import { renderTacticsMenu } from './TacticsMenu';
import { eventBus } from '../utils/eventBus';
import { shortName } from '../utils/playerName';
import { teamTextColor } from '../utils/teamColor';
import type { RawTeamInput } from '../types/teamData';
import { playerOverall } from '../engine/RatingEngine';
import { oopSeverity, oopPenaltyPct, SLOT_POSITION } from '../engine/balance';
import { computeOverallRating } from '../team/teamProfile';
import { recentForm, headToHead, matchSpread, formAdjustment, HOME_ADVANTAGE_PTS, type FormResult } from '../game/teamStats';
import { applyMatchdaySquad, makeInjuredPredicate } from '../game/playerSquad';
import { buildTeamFromRoster, buildAutoSelectedTeamFromRoster } from '../game/rosterTeamBuilder';
import { teamPossessionPct, teamTerritoryPct, averageRating } from '../game/seasonLeaderboards';
import { playerLinkHtml, wirePlayerLinks } from './components/playerLink';
import { createRowExpander } from './components/rowExpand';
import type { GameCoordinator } from '../game/GameCoordinator';
import type { GameState } from '../types/gameState';
import type { PlayerInjury } from '../types/player';

type RawPlayer = {
  id: number;
  rosterId?: number;
  squadNumber?: number;
  firstName: string;
  lastName: string;
  dob: string | null;
  nationality: string;
  position: Position;
  baseStats: PlayerStats;
};

type RawTeam = RawTeamInput;
type Step = 'mine' | 'opp' | 'scout' | 'tactics';

// Human-readable labels for the seven tactical dimensions. Duplicates
// the map in TeamInfoScreen.ts — small enough to inline rather than
// pull both screens onto a shared helper file. Same labels TacticsMenu
// uses on its compact pills.
const TACTIC_LABELS: Record<keyof TeamTactics, Record<string, string>> = {
  attackingGamePlan:  { kicking: 'Territorial', balanced: 'Balanced', possession: 'Possession' },
  attackingStyle:     { keep_it_tight: 'Keep It Tight', balanced: 'Balanced', wide_wide: 'Wide Wide' },
  attackingBreakdown: { commit_numbers: 'Commit Numbers', balanced: 'Balanced Ruck', minimal_ruck: 'Minimal Ruck' },
  defendingBreakdown: { jackal: 'Jackal Steal', counter_ruck: 'Counter Ruck', shadow: 'Shadow Line' },
  backfieldDefence:   { one_back: 'One Back', two_back: 'Two Back', three_back: 'Three Back' },
  defensiveLine:      { blitz: 'Blitz', hybrid: 'Hybrid', drift: 'Drift' },
  offloadStrategy:    { cautious: 'Cautious', balanced: 'Balanced', offload_freely: 'Offload Freely' },
};

const TACTIC_DIMS: (keyof TeamTactics)[] = [
  'attackingGamePlan', 'attackingStyle', 'attackingBreakdown',
  'defendingBreakdown', 'defensiveLine',
];

function getSquadNum(p: RawPlayer): number {
  return p.squadNumber ?? p.id;
}

function crestSm(letter: string, color: string): string {
  return `<div class="pm-crest pm-crest--sm" style="
    background:linear-gradient(160deg,${color} 0%,color-mix(in oklch,${color} 30%,black) 100%);
    border:1px solid color-mix(in oklch,${color} 50%,transparent);
  "><span>${letter}</span></div>`;
}

function formPins(form: Array<FormResult | null>): string {
  return form.map(r => {
    if (r === null) return `<span class="pm-form-pin pm-form-pin--empty">–</span>`;
    const cls = r === 'W' ? 'pm-form-pin--w' : r === 'L' ? 'pm-form-pin--l' : 'pm-form-pin--d';
    return `<span class="pm-form-pin ${cls}">${r}</span>`;
  }).join('');
}

function ordinalSuffix(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return 'th';
  switch (n % 10) {
    case 1: return 'st';
    case 2: return 'nd';
    case 3: return 'rd';
    default: return 'th';
  }
}

function h2hValue(h: { wins: number; draws: number; losses: number; meetings: number }): string {
  if (h.meetings === 0) return '—';
  const parts = [`${h.wins}W`];
  if (h.draws > 0) parts.push(`${h.draws}D`);
  parts.push(`${h.losses}L`);
  return parts.join(' · ');
}

// "2025-09-13" → "SAT 13 SEP"
const MONTH_ABBR = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
const DOW_ABBR   = ['SUN','MON','TUE','WED','THU','FRI','SAT'];
function formatMatchDate(iso: string | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return `${DOW_ABBR[d.getUTCDay()]} ${String(d.getUTCDate()).padStart(2,'0')} ${MONTH_ABBR[d.getUTCMonth()]}`;
}

function renderLineupRow(
  p: RawPlayer,
  color: string,
  onProfile: boolean,
  state: GameState,
  expanded: boolean,
  flagOop: boolean,
): string {
  const num = getSquadNum(p);
  const surname = shortName(p);
  // Out-of-position warning — only on the user's own starting XV (slots 1-15),
  // where the familiarity penalty (balance/positionFamiliarity.ts) bites at
  // kick-off. flagOop gates it to the editable "mine" lineup.
  const sev = flagOop ? oopSeverity(p.position, num) : null;
  const sevLabel = { mild: 'minor', moderate: 'notable', severe: 'major' };
  const oopBadge = sev
    ? `<span class="pm-oop-badge pm-oop-badge--${sev}" title="Out of position (${sevLabel[sev]}, −${oopPenaltyPct(p.position, num)}%) — natural ${p.position}, selected at ${SLOT_POSITION[num]}">OOP</span>`
    : '';
  const nameHtml = onProfile && p.rosterId !== undefined
    ? playerLinkHtml(surname, p.rosterId)
    : surname;
  // Expand only meaningful when the row maps back to a roster entry —
  // the deterministic-harness path supplies players without rosterId.
  const expandable = p.rosterId !== undefined;
  const rosterEntry = expandable ? state.career.roster[p.rosterId!] : undefined;
  const rowAttrs = expandable ? ` data-row-id="rid-${p.rosterId}"` : '';
  const chevron = expandable
    ? `<button type="button" class="row-expand-chevron pm-lineup-chevron" aria-expanded="${expanded}" aria-label="${expanded ? 'Hide details' : 'Show details'}">
         <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>
       </button>`
    : '';
  const expandBody = expandable && rosterEntry
    ? `<div class="row-expand-panel pm-lineup-expand" data-expanded="${expanded}">
         <div class="row-expand-inner">${renderLineupExpand(p, rosterEntry)}</div>
       </div>`
    : '';
  return `
    <div class="pm-lineup-row${expandable ? ' pm-lineup-row--expandable' : ''}"${rowAttrs}>
      <div class="pm-lineup-row-main">
        <span class="pm-lineup-num" style="color:${teamTextColor(color)}">${String(num).padStart(2,'0')}</span>
        <span class="pm-lineup-name">${nameHtml}</span>
        <span class="pm-lineup-pos">${p.position}${oopBadge}</span>
        ${chevron}
      </div>
      ${expandBody}
    </div>
  `;
}

// Per-row expand content: OVR, condition bar, season mini-stats, form
// delta + injury chip when present. Sourced from the roster entry —
// the matchday RawPlayer is a slim copy, the persistent state lives
// behind `rosterId`.
function renderLineupExpand(p: RawPlayer, r: import('../types/player').Player): string {
  const ovr = playerOverall(p.baseStats, p.position);
  const condition = Math.round(r.condition ?? 100);
  const ss = r.seasonStats;
  const avr = ss.appearances > 0 ? averageRating(ss) : null;
  const avrPct = avr !== null ? Math.max(0, Math.min(100, (avr / 10) * 100)) : 0;
  const formPctRaw = (r.formModifier ?? 0) * 100;
  const formLabel = `${formPctRaw >= 0 ? '+' : ''}${formPctRaw.toFixed(1)}%`;
  const injuryChip = r.injury ? injuryChipHtml(r.injury) : '';
  return `
    <div class="pm-expand-grid">
      <div class="pm-expand-bar-row">
        <div class="pm-expand-bar-label">OVR</div>
        <div class="pm-expand-bar"><div class="pm-expand-bar-fill" style="width:${ovr}%"></div></div>
        <div class="pm-expand-bar-val">${ovr}</div>
      </div>
      <div class="pm-expand-bar-row">
        <div class="pm-expand-bar-label">CONDITION</div>
        <div class="pm-expand-bar"><div class="pm-expand-bar-fill" style="width:${condition}%"></div></div>
        <div class="pm-expand-bar-val">${condition}%</div>
      </div>
      <div class="pm-expand-bar-row">
        <div class="pm-expand-bar-label">AVG RATING</div>
        <div class="pm-expand-bar"><div class="pm-expand-bar-fill pm-expand-bar-fill--rating" style="width:${avrPct.toFixed(0)}%"></div></div>
        <div class="pm-expand-bar-val">${avr !== null ? avr.toFixed(1) : '—'}</div>
      </div>
      <div class="pm-expand-stats">
        <div class="pm-expand-stat"><span>${ss.appearances}</span><label>Apps</label></div>
        <div class="pm-expand-stat"><span>${ss.tries}</span><label>Tries</label></div>
        <div class="pm-expand-stat"><span>${ss.tackles}</span><label>Tackles</label></div>
        <div class="pm-expand-stat"><span>${formLabel}</span><label>Form</label></div>
      </div>
      ${injuryChip}
    </div>
  `;
}

function injuryChipHtml(inj: PlayerInjury): string {
  const kind = inj.kind.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  return `<div class="pm-expand-injury">${kind} · ${inj.weeksRemaining}w remaining</div>`;
}

function renderLineupBody(
  title: string,
  team: RawTeam,
  starters: RawPlayer[],
  bench: RawPlayer[],
  stadium: string | undefined,
  matchDate: string,
  roundLabel: string,
  showEditSquad: boolean,
  hasOnProfile: boolean,
  state: GameState,
  isExpanded: (rosterId: number) => boolean,
): string {
  const hc = teamTextColor(team.color);
  const editSquadLink = showEditSquad
    ? `<button class="pm-edit-squad" id="pm-edit-squad" type="button">Edit Squad</button>`
    : '';
  const rowExpanded = (p: RawPlayer): boolean => p.rosterId !== undefined && isExpanded(p.rosterId);
  const startersHtml = starters.map(p => renderLineupRow(p, team.color, hasOnProfile, state, rowExpanded(p), showEditSquad)).join('');
  const benchHtml    = bench.map(p => renderLineupRow(p, team.color, hasOnProfile, state, rowExpanded(p), false)).join('');
  const metaParts = [stadium, matchDate, roundLabel].filter(Boolean).join(' · ');
  return `
    <div class="pm-lineup-card">
      <div class="pm-lineup-header">
        <div class="pm-lineup-title-row">
          <h1 class="pm-lineup-title">${title}</h1>
          ${editSquadLink}
        </div>
        <div class="pm-lineup-team" style="color:${hc}">${team.name}</div>
        ${metaParts ? `<div class="pm-lineup-meta">${metaParts}</div>` : ''}
      </div>
      <div class="pm-lineup-section">
        <div class="pm-lineup-section-label">Starting XV</div>
        ${startersHtml}
      </div>
      <div class="pm-lineup-section">
        <div class="pm-lineup-section-label">Bench</div>
        ${benchHtml}
      </div>
    </div>
  `;
}

interface ScoutData {
  oppForm: Array<FormResult | null>;
  oppRecord: { wins: number; draws: number; losses: number; meetings: number };
  spreadLabel: string;
  spreadSub: string;
  tactics: TeamTactics;
  threats: Array<{ p: RawPlayer; primary: string; primaryLabel: string }>;
  trends: {
    possessionPct: number | null;
    territoryPct: number | null;
    lineoutPct: number | null;
    scrumPct: number | null;
  };
}

function renderScoutBody(opp: RawTeam, oppShort: string, s: ScoutData): string {
  const oc = teamTextColor(opp.color);

  const tacticsChips = TACTIC_DIMS.map(dim => {
    const value = s.tactics[dim] as string;
    const label = TACTIC_LABELS[dim][value] ?? value;
    return `<span class="pm-tactic-chip">${label}</span>`;
  }).join('');

  const threatsHtml = s.threats.length === 0
    ? `<div class="pm-empty">No squad data.</div>`
    : s.threats.map(t => {
        const num = getSquadNum(t.p);
        const nameHtml = t.p.rosterId !== undefined
          ? playerLinkHtml(shortName(t.p), t.p.rosterId)
          : shortName(t.p);
        return `
          <div class="pm-watch-card">
            <span class="pm-watch-num" style="color:${oc}">${String(num).padStart(2,'0')}</span>
            <div class="pm-watch-text">
              <span class="pm-watch-name">${nameHtml}</span>
              <span class="pm-watch-pos">${t.p.position}</span>
            </div>
            <div class="pm-watch-stat">
              <span class="pm-watch-stat-val">${t.primary}</span>
              <span class="pm-watch-stat-lbl">${t.primaryLabel}</span>
            </div>
          </div>
        `;
      }).join('');

  const fmtPct = (v: number | null): string => v === null ? '—' : `${Math.round(v)}%`;

  return `
    <div class="pm-scout-card">
      <div class="pm-scout-section">
        <h3 class="pm-scout-section-label">Form &amp; Outlook</h3>
        <div class="pm-form-row">${formPins(s.oppForm)}</div>
        <div class="pm-scout-meta-row">
          <div class="pm-scout-meta">
            <span class="pm-scout-meta-lbl">H2H this season</span>
            <span class="pm-scout-meta-val">${h2hValue(s.oppRecord)}</span>
          </div>
          <div class="pm-scout-meta">
            <span class="pm-scout-meta-lbl">Spread</span>
            <span class="pm-scout-meta-val">${s.spreadLabel}</span>
            <span class="pm-scout-meta-sub">${s.spreadSub}</span>
          </div>
        </div>
      </div>

      <div class="pm-scout-section">
        <h3 class="pm-scout-section-label">Likely Approach</h3>
        <div class="pm-tactic-chips">${tacticsChips}</div>
        <p class="pm-scout-note">In-match adjustments aren't visible until the game is in progress.</p>
      </div>

      <div class="pm-scout-section">
        <h3 class="pm-scout-section-label">Players to Watch</h3>
        <div class="pm-watch-grid">${threatsHtml}</div>
      </div>

      <div class="pm-scout-section">
        <h3 class="pm-scout-section-label">Season Trends</h3>
        <div class="pm-trend-grid">
          <div class="pm-trend-tile"><span class="pm-trend-val">${fmtPct(s.trends.possessionPct)}</span><span class="pm-trend-lbl">Possession</span></div>
          <div class="pm-trend-tile"><span class="pm-trend-val">${fmtPct(s.trends.territoryPct)}</span><span class="pm-trend-lbl">Territory</span></div>
          <div class="pm-trend-tile"><span class="pm-trend-val">${fmtPct(s.trends.lineoutPct)}</span><span class="pm-trend-lbl">Lineout %</span></div>
          <div class="pm-trend-tile"><span class="pm-trend-val">${fmtPct(s.trends.scrumPct)}</span><span class="pm-trend-lbl">Scrum %</span></div>
        </div>
        <div class="pm-scout-sub">${oppShort}'s averages so far this season.</div>
      </div>
    </div>
  `;
}

export interface PreMatchPlayoffContext {
  contextLabel: string;
  neutralVenue: boolean;
  backLabel?: string;
}

// Module-level re-entry hook. PlayerProfile / SquadManagement back
// arrows call this to land back on the right pre-match step without
// re-running the full data build.
let renderImpl: ((step: Step) => void) | null = null;
export function showPreMatchAtStep(step: Step): void {
  renderImpl?.(step);
}

export function initPreMatchScreen(
  home: RawTeam,
  away: RawTeam,
  playerSide: 'home' | 'away',
  roundNumber: number,
  gameEngine: GameCoordinator,
  onStart: (configuredHome: RawTeam, configuredAway: RawTeam, playerTactics: TeamTactics) => void,
  onBack: () => void,
  playoffContext?: PreMatchPlayoffContext,
  onEditSquad?: () => void,
  onPlayerProfile?: (rosterId: number, returnStep: Step) => void,
): void {
  const screen = document.getElementById('pre-match')!;
  screen.classList.remove('pm-exit');

  const playerTeam = playerSide === 'home' ? home : away;
  const oppTeam    = playerSide === 'home' ? away : home;
  screen.style.setProperty('--team-color', playerTeam.color);

  const state = gameEngine.getState();
  const savedTactics = state.player.tactics;
  const savedSquad   = state.player.matchdaySquad;

  // Roster-applied teams — same construction the old screen used so
  // injury repair + manager's matchday curation still flow into the
  // displayed lineups.
  const humanTeamJson = playerSide === 'home' ? home : away;
  const oppTeamJson   = playerSide === 'home' ? away : home;
  const humanRosterBased = buildTeamFromRoster(state, humanTeamJson);
  const oppRosterBased   = buildAutoSelectedTeamFromRoster(state, oppTeamJson);
  const club = state.career.clubs.find(c => c.id === humanTeamJson.id);
  const repair = club ? { roster: state.career.roster, clubSquadIds: club.squad } : undefined;
  const humanApplied = applyMatchdaySquad(humanRosterBased, savedSquad, repair);
  const isInjured = club ? makeInjuredPredicate(state.career.roster, club.squad) : undefined;
  const injuredSavedRefs = (savedSquad && isInjured)
    ? savedSquad.filter(ref => isInjured(ref))
    : [];

  const homeApplied = playerSide === 'home' ? humanApplied : oppRosterBased;
  const awayApplied = playerSide === 'away' ? humanApplied : oppRosterBased;

  // Final pre-render rosters. squadNumber is locked to the slot id
  // because the engine routes position by id and the line-up UI reads
  // squadNumber; both stay in lock-step.
  const homeStarters: RawPlayer[] = (homeApplied.players as RawPlayer[]).map(p => ({ ...p, squadNumber: getSquadNum(p) }));
  const homeBench:    RawPlayer[] = ((homeApplied.bench ?? []) as RawPlayer[]).map(p => ({ ...p, squadNumber: getSquadNum(p) }));
  const homeSquad:    RawPlayer[] = ((homeApplied.squad ?? []) as RawPlayer[]).map(p => ({ ...p, squadNumber: getSquadNum(p) }));
  const awayStarters: RawPlayer[] = (awayApplied.players as RawPlayer[]).map(p => ({ ...p, squadNumber: getSquadNum(p) }));
  const awayBench:    RawPlayer[] = ((awayApplied.bench ?? []) as RawPlayer[]).map(p => ({ ...p, squadNumber: getSquadNum(p) }));
  const awaySquad:    RawPlayer[] = ((awayApplied.squad ?? []) as RawPlayer[]).map(p => ({ ...p, squadNumber: getSquadNum(p) }));

  const playerStarters = playerSide === 'home' ? homeStarters : awayStarters;
  const playerBench    = playerSide === 'home' ? homeBench    : awayBench;
  const oppStarters    = playerSide === 'home' ? awayStarters : homeStarters;
  const oppBench       = playerSide === 'home' ? awayBench    : homeBench;

  // ── Scouting data (computed once, all read-only) ─────────────────────
  const results = state.league.results;
  const oppForm = recentForm(oppTeam.id, results);

  const homeTeam = playerSide === 'home' ? playerTeam : oppTeam;
  const awayTeam = playerSide === 'home' ? oppTeam : playerTeam;
  const homeStanding = state.league.standings.find(s => s.teamId === homeTeam.id);
  const awayStanding = state.league.standings.find(s => s.teamId === awayTeam.id);
  const homeEdgePts = playoffContext?.neutralVenue ? 0 : HOME_ADVANTAGE_PTS;
  const homeEffective = computeOverallRating(homeTeam.id) + homeEdgePts + formAdjustment(homeStanding, state.league.standings);
  const awayEffective = computeOverallRating(awayTeam.id) + formAdjustment(awayStanding, state.league.standings);
  const spread = matchSpread(homeEffective, awayEffective);
  // Spread is always rendered opponent-perspective on the scouting screen:
  // "OPP by 6" when opponent is favoured, "MY by 4" when user is favoured.
  let spreadLabel: string;
  let spreadSub: string;
  if (spread.home === 0) {
    spreadLabel = 'Even';
    spreadSub = 'No favourite';
  } else {
    const favouredCode = spread.home < 0 ? homeTeam.shortName : awayTeam.shortName;
    spreadLabel = `${favouredCode} by ${Math.abs(spread.home)}`;
    spreadSub = 'PTS';
  }
  // H2H takes opponent's perspective for the scout briefing — flip the
  // user-vs-opp tuple from headToHead so wins read as "opponent wins".
  const h2hFromUser = headToHead(playerTeam.id, oppTeam.id, results);
  const oppRecord = { wins: h2hFromUser.losses, draws: h2hFromUser.draws, losses: h2hFromUser.wins, meetings: h2hFromUser.meetings };

  // Opponent suggestedTactics, falling back to DEFAULT_TACTICS so the
  // chip set never empties out for legacy team JSONs.
  const oppTactics: TeamTactics = { ...DEFAULT_TACTICS, ...(oppTeam.suggestedTactics ?? {}) };

  // Players to Watch — rank opponent's matchday squad. Mid-season:
  // average match rating × appearances (ratingSum is a proxy). Round 1
  // / no appearances: position-weighted OVR. Top 3.
  const oppMatchday: RawPlayer[] = [...oppStarters, ...oppBench];
  const threatRows = oppMatchday.map(p => {
    const seasonStats = p.rosterId !== undefined ? state.career.roster[p.rosterId]?.seasonStats : undefined;
    const appearances = seasonStats?.appearances ?? 0;
    const avg = appearances > 0 && seasonStats ? averageRating(seasonStats) : null;
    const tries = seasonStats?.tries ?? 0;
    const ovr = playerOverall(p.baseStats, p.position);
    const rankScore = avg !== null ? (avg * 10 + tries) : ovr; // mid-season uses rating, round 1 uses OVR
    const primary = avg !== null
      ? { val: avg.toFixed(1), label: tries > 0 ? `AVG · ${tries}T` : 'AVG' }
      : { val: String(ovr), label: 'OVR' };
    return { p, rankScore, primary };
  })
  .sort((a, b) => b.rankScore - a.rankScore)
  .slice(0, 3)
  .map(r => ({ p: r.p, primary: r.primary.val, primaryLabel: r.primary.label }));

  // Season trends — fall back to null (em-dashes in render) when the
  // opponent hasn't played a match yet.
  const oppSeason = state.league.teamSeasonStats[oppTeam.id];
  const trends = (oppSeason && oppSeason.matchesPlayed > 0)
    ? {
        possessionPct: teamPossessionPct(oppSeason),
        territoryPct:  teamTerritoryPct(oppSeason),
        lineoutPct:    oppSeason.lineoutsThrown > 0 ? (oppSeason.lineoutsWon / oppSeason.lineoutsThrown) * 100 : null,
        scrumPct:      oppSeason.scrumsPutIn > 0   ? (oppSeason.scrumsWon   / oppSeason.scrumsPutIn)   * 100 : null,
      }
    : { possessionPct: null, territoryPct: null, lineoutPct: null, scrumPct: null };

  const scoutData: ScoutData = {
    oppForm,
    oppRecord,
    spreadLabel,
    spreadSub,
    tactics: oppTactics,
    threats: threatRows,
    trends,
  };

  // ── Lineup meta strip (stadium + date) ────────────────────────────────
  const fixture = state.league.fixtures.find(f =>
    (f.homeId === homeTeam.id && f.awayId === awayTeam.id) ||
    (f.homeId === awayTeam.id && f.awayId === homeTeam.id),
  );
  const matchDate = formatMatchDate(fixture?.date);
  const roundLabel = playoffContext?.contextLabel ?? `Round ${roundNumber}`;
  const stadiumName = (homeTeam as RawTeam & { stadium?: string }).stadium;

  // ── Tactics state ────────────────────────────────────────────────────
  const initialTactics: TeamTactics = savedTactics ? { ...savedTactics } : { ...DEFAULT_TACTICS };
  let chosenTactics: TeamTactics = { ...initialTactics };
  const unsubTactics = eventBus.on('ui:tacticsChange', ({ teamId, tactics }) => {
    if (teamId === playerSide) chosenTactics = tactics;
  });

  // ── Step state machine ───────────────────────────────────────────────
  let step: Step = 'mine';
  const STEP_ORDER: Step[] = ['mine', 'opp', 'scout', 'tactics'];
  function stepIndex(): number { return STEP_ORDER.indexOf(step); }

  // ── Per-row lineup-expand controller ─────────────────────────────────
  // Keyed by rosterId so expansion state survives step changes (Mine
  // → Opp → back to Mine keeps the same row open). The controller's
  // Set lives in this closure; the click handler is re-attached after
  // every render() because innerHTML is reset on each step.
  const lineupExpander = createRowExpander({
    rowSelector: '.pm-lineup-row',
    onChange: () => render(),
  });
  const isRowExpanded = (rosterId: number): boolean => lineupExpander.isExpanded(`rid-${rosterId}`);

  function topBarHtml(): string {
    const backLabel = step === 'mine'
      ? (playoffContext?.backLabel ?? 'Hub')
      : 'Back';
    const contextText = playoffContext?.contextLabel ?? `Match Preview · Round ${roundNumber}`;
    return `
      <div id="pm-topbar">
        <button id="pm-back" class="app-back" aria-label="Back">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          <span>${backLabel}</span>
        </button>
        <span id="pm-context-label">${contextText}</span>
        <div class="pm-step-dots" aria-label="Step ${stepIndex() + 1} of ${STEP_ORDER.length}">
          ${STEP_ORDER.map((_, i) => `<span class="pm-step-dot ${i === stepIndex() ? 'pm-step-dot--active' : ''}"></span>`).join('')}
        </div>
      </div>
    `;
  }

  function versusBannerHtml(): string {
    const playerInitial = playerTeam.shortName[0] ?? 'P';
    const oppInitial    = oppTeam.shortName[0]    ?? 'O';
    return `
      <div id="pm-versus-mini">
        ${crestSm(playerInitial, playerTeam.color)}
        <span class="pm-versus-code" style="color:${teamTextColor(playerTeam.color)}">${playerTeam.shortName}</span>
        <span class="pm-versus-sep">vs</span>
        <span class="pm-versus-code" style="color:${teamTextColor(oppTeam.color)}">${oppTeam.shortName}</span>
        ${crestSm(oppInitial, oppTeam.color)}
      </div>
    `;
  }

  function footerHtml(): string {
    const isLast = step === 'tactics';
    const ctaLabel = step === 'mine'    ? 'Continue'
                   : step === 'opp'     ? 'Continue'
                   : step === 'scout'   ? 'Choose Tactics'
                   :                       'Start Match';
    const id = isLast ? 'pm-start' : 'pm-next';
    // The final step (Start Match) is a commit action → the confirm cue.
    const sfx = isLast ? ' data-sfx="confirm"' : '';
    return `
      <div id="pm-footer">
        <button id="${id}" class="cta-pulse" type="button"${sfx}>
          <span class="btn-label">${ctaLabel}</span>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 5l7 7-7 7"/></svg>
        </button>
      </div>
    `;
  }

  function injuryBannerHtml(): string {
    if (step !== 'mine' || injuredSavedRefs.length === 0) return '';
    return `
      <div id="pm-injury-banner" role="status">
        <span class="pm-injury-badge" aria-hidden="true">+</span>
        <span class="pm-injury-text">
          ${injuredSavedRefs.length === 1 ? '1 player is' : `${injuredSavedRefs.length} players are`}
          unavailable through injury (${injuredSavedRefs.map(r => r.lastName).join(', ')}).
          Replacements auto-picked &mdash; tap Edit Squad to confirm.
        </span>
      </div>
    `;
  }

  function bodyHtml(): string {
    if (step === 'mine') {
      return renderLineupBody('LINE-UP', playerTeam, playerStarters, playerBench, stadiumName, matchDate, roundLabel, !!onEditSquad, !!onPlayerProfile, state, isRowExpanded);
    }
    if (step === 'opp') {
      return renderLineupBody('LINE-UP', oppTeam, oppStarters, oppBench, stadiumName, matchDate, roundLabel, false, !!onPlayerProfile, state, isRowExpanded);
    }
    if (step === 'scout') {
      return renderScoutBody(oppTeam, oppTeam.shortName, scoutData);
    }
    // tactics
    return `<div id="pm-tactics-host"></div>`;
  }

  function render(): void {
    screen.innerHTML = `
      <div id="pm-header">
        ${topBarHtml()}
        ${versusBannerHtml()}
        ${injuryBannerHtml()}
      </div>
      <div id="pm-body" class="pm-body--${step}">${bodyHtml()}</div>
      ${footerHtml()}
    `;

    // Tactics step mounts the existing TacticsMenu into its host div.
    if (step === 'tactics') {
      const host = screen.querySelector<HTMLElement>('#pm-tactics-host')!;
      renderTacticsMenu(host, chosenTactics, playerSide);
    }

    // Back arrow — decrements step, or invokes caller's onBack at step 0.
    screen.querySelector<HTMLButtonElement>('#pm-back')!.addEventListener('click', () => {
      if (step === 'mine') {
        unsubTactics();
        renderImpl = null;
        onBack();
        return;
      }
      const i = stepIndex();
      step = STEP_ORDER[i - 1];
      render();
    });

    // Forward CTA — advances step, or kicks off the match at the end.
    if (step === 'tactics') {
      screen.querySelector<HTMLButtonElement>('#pm-start')!.addEventListener('click', () => {
        screen.classList.add('pm-exit');
        setTimeout(() => {
          unsubTactics();
          renderImpl = null;
          // Lineups are view-only here — pass the original rosters through
          // unchanged. Squad edits land via SquadManagement.
          const configuredHome = playerSide === 'home'
            ? { ...home, players: homeStarters, bench: homeBench, squad: homeSquad } as unknown as RawTeam
            : home as unknown as RawTeam;
          const configuredAway = playerSide === 'away'
            ? { ...away, players: awayStarters, bench: awayBench, squad: awaySquad } as unknown as RawTeam
            : away as unknown as RawTeam;
          onStart(configuredHome, configuredAway, chosenTactics);
        }, 600);
      });
    } else {
      screen.querySelector<HTMLButtonElement>('#pm-next')!.addEventListener('click', () => {
        const i = stepIndex();
        step = STEP_ORDER[i + 1];
        render();
      });
    }

    // Edit Squad shortcut — appears only on the 'mine' step.
    if (step === 'mine' && onEditSquad) {
      screen.querySelector<HTMLButtonElement>('#pm-edit-squad')?.addEventListener('click', () => {
        onEditSquad();
      });
    }

    // Wire any player-link spans on line-up steps.
    if ((step === 'mine' || step === 'opp') && onPlayerProfile) {
      const currentStep = step;
      wirePlayerLinks(screen, (rosterId) => onPlayerProfile(rosterId, currentStep));
    }

    // Re-attach the row-expand delegated handler. The controller's
    // expansion Set survives this re-attach; only the click listener
    // needs rebinding because the previous render's innerHTML was
    // wiped. Scoped per step to the active lineup card so a stray tap
    // outside doesn't bubble.
    if (step === 'mine' || step === 'opp') {
      const card = screen.querySelector<HTMLElement>('.pm-lineup-card');
      if (card) lineupExpander.attach(card);
    }
  }

  // Expose the re-entry hook so PlayerProfile / SquadManagement back
  // arrows can re-render at a chosen step. Cleared on screen exit
  // (back from step 'mine' or after Start Match).
  renderImpl = (target: Step) => {
    step = target;
    render();
  };

  render();
}
