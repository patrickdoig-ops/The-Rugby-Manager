// The manager's whole-season schedule across every competition, in one
// chronological list — League, League Cup, European Cup, European Shield and
// the play-offs. Played fixtures show their score; upcoming ones show "vs". The
// next upcoming match is highlighted and auto-scrolled into view. The list
// grows automatically as cup knockouts / play-offs / European knockouts seed.
//
// Reached from the FIRST tile of the Competitions sub-menu; back returns there.
// Reuses the league Fixture screen's row styling (style/fixturelist.css) with a
// per-row competition badge + meta line. Initialised once per page lifetime;
// re-renders on the relevant game:* events and whenever the screen is shown
// (the on-show re-render is the primary freshness path, since the play flow
// returns to the Hub between matchdays).

import type { RawTeamInput } from '../types/teamData';
import type { GameCoordinator } from '../game/GameCoordinator';
import { eventBus } from '../utils/eventBus';
import { onScreenShow } from './ScreenRouter';
import { collectSeasonFixtures, type SeasonFixtureRow } from '../game/seasonFixtures';
import {
  competitionLabel, competitionTag, competitionAccentClass, stageNameLong, stageBadge,
} from '../game/stageLabel';
import { formatDateMedium } from '../utils/formatDate';
import { helpButtonHtml } from './help/helpButton';

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_ABBR   = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function shortFixtureDate(iso: string | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return `${DAY_ABBR[d.getUTCDay()]} ${d.getUTCDate()} ${MONTH_ABBR[d.getUTCMonth()]}`;
}

function daysBetween(fromIso: string, toIso: string | undefined): number | null {
  if (!toIso) return null;
  const from = new Date(fromIso).getTime();
  const to   = new Date(toIso).getTime();
  if (isNaN(from) || isNaN(to)) return null;
  return Math.round((to - from) / 86_400_000);
}

function countdownLabel(days: number | null): string | null {
  if (days === null || days < 0) return null;
  if (days === 0) return 'TODAY';
  if (days === 1) return 'TOMORROW';
  return `KICKS OFF IN ${days} DAYS`;
}

export function initSeasonFixturesScreen(
  // Always called fresh via the getter — see HubScreen for the rationale.
  getGameEngine: () => GameCoordinator,
  allTeams: RawTeamInput[],   // pass allTeamsWithEuropean — opponents may be European clubs
  onBack: () => void,
): void {
  const el = document.getElementById('season-fixtures');
  if (!el) return;

  const teamsById = new Map(allTeams.map(t => [t.id, t]));

  function crest(team: RawTeamInput | undefined, fallbackName: string): string {
    const initial = (team?.shortName ?? fallbackName)[0] ?? '?';
    if (!team) return `<div class="fl-crest"><span>${initial}</span></div>`;
    const grad = `linear-gradient(160deg, ${team.color} 0%, color-mix(in oklch, ${team.color} 30%, black) 100%)`;
    return `<div class="fl-crest" style="background:${grad};border:1px solid color-mix(in oklch,${team.color} 45%,transparent)"><span>${initial}</span></div>`;
  }

  function row(r: SeasonFixtureRow, isActive: boolean, today: string, index: number): string {
    const home = teamsById.get(r.homeId);
    const away = teamsById.get(r.awayId);
    const homeName = home?.name ?? r.homeId;
    const awayName = away?.name ?? r.awayId;
    const stateCls = r.played ? 'fl-row--complete' : isActive ? 'fl-row--active' : 'fl-row--locked';
    const midEl = r.played && r.result
      ? `<span class="fl-score">${r.result.homeScore}–${r.result.awayScore}</span>`
      : `<span class="fl-vs">vs</span>`;
    const days = isActive ? daysBetween(today, r.date) : null;
    const countdown = countdownLabel(days);
    const rowDelay = Math.min(index, 16) * 25;
    return `
      <div class="fl-row ${stateCls} ${competitionAccentClass(r)}" ${isActive ? 'data-sf-active' : ''} style="--row-delay: ${rowDelay}ms">
        <div class="fl-round">
          <span class="fl-round-label">${competitionTag(r)}</span>
          <span class="fl-round-num">${stageBadge(r)}</span>
        </div>
        <div class="fl-matchup">
          <div class="fl-team fl-team--home">
            ${crest(home, homeName)}
            <span class="fl-team-body"><span class="fl-team-name">${homeName}</span></span>
          </div>
          ${midEl}
          <div class="fl-team fl-team--away">
            <span class="fl-team-body fl-team-body--away"><span class="fl-team-name">${awayName}</span></span>
            ${crest(away, awayName)}
          </div>
        </div>
        <div class="fl-date-row">
          <span class="fl-comp-name">${competitionLabel(r)} · ${stageNameLong(r)}</span>
          ${r.date ? `<span class="fl-date-pill">${shortFixtureDate(r.date)}</span>` : ''}
          ${countdown ? `<span class="fl-countdown-chip">${countdown}</span>` : ''}
        </div>
      </div>`;
  }

  function render(): void {
    const state = getGameEngine().getState();
    const playerTeamId = state.player.teamId;
    const playerTeam = teamsById.get(playerTeamId);
    if (playerTeam) el!.style.setProperty('--team-color', playerTeam.color);

    const rows = collectSeasonFixtures(state, playerTeamId);
    const activeIdx = rows.findIndex(r => !r.played); // earliest unplayed = next match
    const today = state.calendar.date;

    const listHtml = rows.length === 0
      ? `<div class="fl-empty">No fixtures yet for this season.</div>`
      : rows.map((r, i) => row(r, i === activeIdx, today, i)).join('');

    el!.innerHTML = `
      <div class="app-header">
        <div class="app-topbar">
          <button id="sf-back" class="app-back" aria-label="Back to competitions">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
            <span>Back</span>
          </button>
          <span class="app-title">Fixture List</span>
          <div class="app-topbar-spacer">${helpButtonHtml('season-fixtures')}</div>
        </div>
        <div class="app-eyebrow">${state.calendar.seasonLabel} · ${formatDateMedium(state.calendar.date)}</div>
      </div>
      <div id="fl-list">${listHtml}</div>
    `;

    el!.querySelector<HTMLButtonElement>('#sf-back')!.addEventListener('click', () => onBack());

    // Auto-scroll the highlighted next match into view. Only when the screen is
    // actually visible (the deferred path re-runs render() on show, scrolling then).
    if (el!.offsetParent !== null) {
      el!.querySelector<HTMLElement>('[data-sf-active]')?.scrollIntoView({ block: 'center', behavior: 'auto' });
    }
  }

  // Hidden-screen renders are deferred: mark dirty and replay on the next show
  // (render() reads live engine state, so the deferred render is always current).
  let needsRender = false;
  const renderOrDefer = (): void => {
    if (el.offsetParent !== null) render();
    else needsRender = true;
  };
  eventBus.on('game:fixtureRecorded',  renderOrDefer);
  eventBus.on('game:weekAdvanced',     renderOrDefer);
  eventBus.on('game:bracketSeeded',    renderOrDefer);
  eventBus.on('game:playoffsUpdated',  renderOrDefer);
  eventBus.on('game:initialized',      renderOrDefer);
  eventBus.on('game:seasonRolledOver', renderOrDefer);
  // Always re-render on show: guarantees fresh state AND that the auto-scroll
  // lands on the next match (the init render runs while hidden, so it can't
  // scroll). Live `game:*` events while the screen is open go through
  // renderOrDefer above.
  onScreenShow(id => {
    if (id === 'season-fixtures') {
      needsRender = false;
      render();
    }
  });

  render();
}
