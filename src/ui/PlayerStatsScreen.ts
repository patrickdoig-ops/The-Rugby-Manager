// Top-10 player leaderboards across the league. Reached from the
// League menu. Category chips swap between focused lists; the
// goal-kicking and avg-rating chips use the SEASON_AWARDS minimum-
// appearances floor so percentage-based stats need a real sample size.
// Tap a row → that player's club's TeamInfo (reuses the route from
// LeagueTable).

import type { GameCoordinator } from '../game/GameCoordinator';
import type { RawTeamInput } from '../types/teamData';
import type { GameState } from '../types/gameState';
import type { Player } from '../types/player';
import { playerLeaderboard, leaderboardAvgRating, type PlayerLeaderKey } from '../game/seasonLeaderboards';
import { SEASON_AWARDS } from '../engine/balance/career';
import { eventBus } from '../utils/eventBus';
import { formatDateMedium } from '../utils/formatDate';
import { playerLinkHtml, wirePlayerLinks } from './components/playerLink';
import { helpButtonHtml } from './help/helpButton';

type CategoryKind =
  | { kind: 'count';   key: PlayerLeaderKey }
  | { kind: 'avgrating' }
  | { kind: 'goalkicks' };

interface CategorySpec {
  id: string;
  label: string;
  sub: string;
  type: CategoryKind;
  // Format the headline value cell from a player's seasonStats.
  format: (p: Player) => string;
  // Optional secondary value (rendered smaller next to the headline).
  secondary?: (p: Player) => string;
}

function fmtInt(n: number): string { return Math.round(n).toLocaleString(); }
function fmtPct(n: number): string { return `${n.toFixed(1)}%`; }

const TOP_N = 10;
const PCT_MIN_APPS = SEASON_AWARDS.mvpMinAppearances;

const CATEGORIES: CategorySpec[] = [
  {
    id: 'tries', label: 'Tries', sub: 'Try-scorers',
    type: { kind: 'count', key: 'tries' },
    format: p => fmtInt(p.seasonStats.tries),
  },
  {
    id: 'carries', label: 'Carries', sub: 'Volume ball carriers',
    type: { kind: 'count', key: 'carries' },
    format: p => fmtInt(p.seasonStats.carries),
  },
  {
    id: 'metres', label: 'Metres', sub: 'Metres carried',
    type: { kind: 'count', key: 'metresCarried' },
    format: p => fmtInt(p.seasonStats.metresCarried),
  },
  {
    id: 'lbs', label: 'Line Breaks', sub: 'Defensive lines broken',
    type: { kind: 'count', key: 'lineBreaks' },
    format: p => fmtInt(p.seasonStats.lineBreaks),
  },
  {
    id: 'tackles', label: 'Tackles', sub: 'Most tackles made',
    type: { kind: 'count', key: 'tackles' },
    format: p => fmtInt(p.seasonStats.tackles),
  },
  {
    id: 'turnovers', label: 'Turnovers', sub: 'Breakdown thieves',
    type: { kind: 'count', key: 'turnoversWon' },
    format: p => fmtInt(p.seasonStats.turnoversWon),
  },
  {
    id: 'kmetres', label: 'Kick Metres', sub: 'Kicking from hand',
    type: { kind: 'count', key: 'kickMetres' },
    format: p => fmtInt(p.seasonStats.kickMetres),
  },
  {
    id: 'goalkicks', label: 'Goal Kicking', sub: `Kicks made / attempted (min ${PCT_MIN_APPS} apps)`,
    type: { kind: 'goalkicks' },
    format: p => {
      const made = p.seasonStats.kicksMade;
      const att  = p.seasonStats.kicksAtGoal;
      return att > 0 ? `${made}/${att}` : '—';
    },
    secondary: p => {
      const made = p.seasonStats.kicksMade;
      const att  = p.seasonStats.kicksAtGoal;
      return att > 0 ? fmtPct((made / att) * 100) : '';
    },
  },
  {
    id: 'avgrating', label: 'Avg Rating', sub: `Best average match rating (min ${PCT_MIN_APPS} apps)`,
    type: { kind: 'avgrating' },
    format: p => p.seasonStats.appearances > 0
      ? (p.seasonStats.ratingSum / p.seasonStats.appearances).toFixed(2)
      : '—',
    secondary: p => `${p.seasonStats.appearances} apps`,
  },
  {
    id: 'yellows', label: 'Yellow Cards', sub: 'Most yellow cards',
    type: { kind: 'count', key: 'yellowCards' },
    format: p => fmtInt(p.seasonStats.yellowCards),
  },
];

let activeCategoryId: string = 'tries';
let renderImpl: (() => void) | null = null;

export function showPlayerStats(): void {
  renderImpl?.();
}

function clubLookup(state: GameState, rosterId: number): string | null {
  const club = state.career.clubs.find(c => c.squad.includes(rosterId));
  return club?.id ?? null;
}

export function initPlayerStatsScreen(
  getGameEngine: () => GameCoordinator,
  allTeams: RawTeamInput[],
  onBack: () => void,
  // Tap anywhere on the row except the player name → that player's
  // club info (legacy behaviour, preserved). Tap the player name → the
  // player's profile.
  onTeamClick: (teamId: string) => void,
  onPlayerProfileClick: (rosterId: number) => void,
): void {
  const el = document.getElementById('player-stats');
  if (!el) return;

  const teamsById = new Map(allTeams.map(t => [t.id, t]));

  function clubBadge(teamId: string | null): string {
    if (!teamId) return `<span class="ps-club">—</span>`;
    const team = teamsById.get(teamId);
    if (!team) return `<span class="ps-club">${teamId}</span>`;
    const grad = `linear-gradient(160deg, ${team.color} 0%, color-mix(in oklch, ${team.color} 30%, black) 100%)`;
    const initial = team.shortName[0] ?? '?';
    return `<span class="ps-club"><span class="ps-club-dot" style="background:${grad}"><span>${initial}</span></span><span class="ps-club-name">${team.name.split(' ')[0]}</span></span>`;
  }

  function buildRows(state: GameState, cat: CategorySpec): Array<{ player: Player; clubId: string | null }> {
    if (cat.type.kind === 'count') {
      const rows = playerLeaderboard(state, cat.type.key, TOP_N);
      return rows.map(r => ({ player: r.player, clubId: clubLookup(state, r.rosterId) }));
    }
    if (cat.type.kind === 'avgrating') {
      const rows = leaderboardAvgRating(state, PCT_MIN_APPS, TOP_N);
      return rows.map(r => ({ player: r.player, clubId: clubLookup(state, r.rosterId) }));
    }
    // Goal-kicking accuracy. Engine doesn't track per-player split for
    // conversions / penalties / drops (CLAUDE.md known gap) — this is
    // the *combined* goal-kick percentage from kicksMade / kicksAtGoal.
    // Min-appearances + min-attempts floor so a 1/1 doesn't shoot to
    // the top.
    const minAttempts = Math.max(PCT_MIN_APPS, 5);
    const rosterIds = Object.keys(state.career.roster).map(Number).sort((a, b) => a - b);
    const entries: Array<{ player: Player; pct: number }> = [];
    for (const rid of rosterIds) {
      const p = state.career.roster[rid];
      const s = p.seasonStats;
      if (s.appearances < PCT_MIN_APPS) continue;
      if (s.kicksAtGoal < minAttempts) continue;
      entries.push({ player: p, pct: (s.kicksMade / s.kicksAtGoal) * 100 });
    }
    entries.sort((a, b) => b.pct - a.pct || a.player.rosterId - b.player.rosterId);
    return entries.slice(0, TOP_N).map(e => ({ player: e.player, clubId: clubLookup(state, e.player.rosterId) }));
  }

  function render(): void {
    const state: GameState = getGameEngine().getState();
    const cat = CATEGORIES.find(c => c.id === activeCategoryId) ?? CATEGORIES[0];
    const rows = buildRows(state, cat);

    const playerClubId = state.player.teamId;

    const rowsHtml = rows.length === 0
      ? `<div class="ps-empty">No data yet — play some fixtures.</div>`
      : rows.map((r, i) => {
          const isMyClub = r.clubId === playerClubId;
          const label = `View ${r.player.firstName} ${r.player.lastName} club info`;
          const secondaryVal = cat.secondary?.(r.player);
          const rowDelay = Math.min(i, 16) * 25;
          return `
            <div class="ps-row${isMyClub ? ' ps-row--me' : ''}" role="button" tabindex="0" data-team-id="${r.clubId ?? ''}" aria-label="${label}" style="--row-delay: ${rowDelay}ms">
              <span class="ps-rank">${i + 1}</span>
              <span class="ps-name">${playerLinkHtml(`${r.player.firstName} ${r.player.lastName}`, r.player.rosterId)}</span>
              ${clubBadge(r.clubId)}
              <span class="ps-pos">${r.player.position}</span>
              <span class="ps-val">${cat.format(r.player)}${secondaryVal ? `<span class="ps-val-sub">${secondaryVal}</span>` : ''}</span>
            </div>`;
        }).join('');

    const chips = CATEGORIES.map(c =>
      `<button class="ps-chip${c.id === activeCategoryId ? ' ps-chip--active' : ''}" data-cat="${c.id}">${c.label}</button>`
    ).join('');

    el!.innerHTML = `
      <div class="app-header">
        <div class="app-topbar">
          <button id="ps-back" class="app-back" aria-label="Back to league menu">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
            <span>League</span>
          </button>
          <span class="app-title">Player Stats</span>
          <div class="app-topbar-spacer">${helpButtonHtml('player-stats')}</div>
        </div>
        <div class="app-eyebrow">${state.calendar.seasonLabel} · ${formatDateMedium(state.calendar.date)} · ${cat.sub}</div>
      </div>

      <div id="ps-chips" role="tablist">${chips}</div>

      <div id="ps-list">${rowsHtml}</div>
    `;

    el!.querySelector<HTMLButtonElement>('#ps-back')!.addEventListener('click', () => onBack());

    el!.querySelectorAll<HTMLButtonElement>('.ps-chip[data-cat]').forEach(btn => {
      btn.addEventListener('click', () => {
        const next = btn.dataset.cat!;
        if (next === activeCategoryId) return;
        activeCategoryId = next;
        render();
      });
    });

    el!.querySelectorAll<HTMLElement>('.ps-row[data-team-id]').forEach(row => {
      const teamId = row.dataset.teamId;
      if (!teamId) return;
      row.addEventListener('click', () => onTeamClick(teamId));
      row.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onTeamClick(teamId);
        }
      });
    });
    // Player-name links sit inside each row but their click handler
    // stops propagation so the outer row's team-click doesn't also fire.
    wirePlayerLinks(el!, onPlayerProfileClick);
  }

  renderImpl = render;
  // Skip renders while hidden — showPlayerStats re-renders on navigation.
  const renderIfVisible = (): void => { if (el.offsetParent !== null) render(); };
  eventBus.on('game:fixtureRecorded', renderIfVisible);
  eventBus.on('game:weekAdvanced', renderIfVisible);
  eventBus.on('game:initialized', renderIfVisible);

  render();
}
