// Read-only reference view of the season schedule.
//
// Three modes selectable via the toggle bar above the list:
//   'team' — every fixture for the player's team across the season
//   'next' — the upcoming round across the whole league
//   'all'  — full 18-round schedule, grouped by round
//
// Initialised once per page lifetime; mode persists across re-renders
// triggered by `game:*` events. Reached from the Hub's Fixtures tile;
// back navigates to the Hub.

import type { RawTeamInput } from '../types/teamData';
import type { GameCoordinator } from '../game/GameCoordinator';
import type { Fixture, FixtureResult, GameState } from '../types/gameState';
import { eventBus } from '../utils/eventBus';
import { recentForm, type FormResult } from '../game/teamStats';
import { renderFormPipStrip } from './components/formPip';
import { ROUND_LABELS } from '../engine/balance/season';

type Mode = 'team' | 'next' | 'all';

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
  if (days === null) return null;
  if (days < 0) return null;
  if (days === 0) return 'TODAY';
  if (days === 1) return 'TOMORROW';
  return `KICKS OFF IN ${days} DAYS`;
}

// Form computed against results that played BEFORE this fixture's round
// — so a deep-round preview row shows the form going INTO that round,
// not a team's full-season form. For the upcoming next round this is
// identical to a straight recentForm() call; for played rounds it
// gives the historical context at the time of the match.
function formBeforeRound(teamId: string, round: number, results: FixtureResult[]): Array<FormResult | null> {
  return recentForm(teamId, results.filter(r => r.round < round));
}

function miniCrest(team: RawTeamInput): string {
  const grad = `linear-gradient(160deg, ${team.color} 0%, color-mix(in oklch, ${team.color} 30%, black) 100%)`;
  const initial = team.shortName[0] ?? '?';
  return `<div class="fl-crest" style="background:${grad};border:1px solid color-mix(in oklch,${team.color} 45%,transparent)"><span>${initial}</span></div>`;
}

export function initFixtureListScreen(
  // Always called fresh — see HubScreen for the rationale.
  getGameEngine: () => GameCoordinator,
  allTeams: RawTeamInput[],
  onBack: () => void,
): void {
  const el = document.getElementById('fixture-list');
  if (!el) return;

  const teamsById = new Map(allTeams.map(t => [t.id, t]));

  let activeMode: Mode = 'team';

  function resultFor(state: GameState, fixture: Fixture): FixtureResult | undefined {
    return state.league.results.find(r =>
      r.round === fixture.round && r.homeId === fixture.homeId && r.awayId === fixture.awayId
    );
  }

  function fixtureRow(fixture: Fixture, result: FixtureResult | undefined, nextRound: number, playerTeamId: string, mode: Mode, index: number, results: FixtureResult[], today: string): string {
    const home = teamsById.get(fixture.homeId)!;
    const away = teamsById.get(fixture.awayId)!;
    const isComplete = !!result;
    // Active highlight only fires in 'team' mode where it points to the
    // player's upcoming match. In 'next' and 'all' tabs every row in
    // the current round would otherwise glow green — visual noise
    // since the round headers / "Next round" tab already convey the
    // context.
    const isActive = !isComplete && fixture.round === nextRound && mode === 'team';
    const isMine = !isActive && (fixture.homeId === playerTeamId || fixture.awayId === playerTeamId);
    const stateCls = isComplete ? 'fl-row--complete' : isActive ? 'fl-row--active' : 'fl-row--locked';
    const meCls = isMine ? ' fl-row--me' : '';
    const midEl = isComplete
      ? `<span class="fl-score">${result.homeScore}–${result.awayScore}</span>`
      : `<span class="fl-vs">vs</span>`;
    const homeForm = renderFormPipStrip(formBeforeRound(fixture.homeId, fixture.round, results), 'sm');
    const awayForm = renderFormPipStrip(formBeforeRound(fixture.awayId, fixture.round, results), 'sm');
    // Active row in team mode gets a date row at the bottom — short
    // weekday + day-of-month and a countdown chip. Skipped for
    // completed / locked rows to keep the list dense.
    const days = isActive ? daysBetween(today, fixture.date) : null;
    const countdown = countdownLabel(days);
    const dateLine = isActive
      ? `<div class="fl-date-row">
           ${fixture.date ? `<span class="fl-date-pill">${shortFixtureDate(fixture.date)}</span>` : ''}
           ${countdown ? `<span class="fl-countdown-chip">${countdown}</span>` : ''}
         </div>`
      : '';
    const rowDelay = Math.min(index, 16) * 25;
    return `
      <div class="fl-row ${stateCls}${meCls}" style="--row-delay: ${rowDelay}ms">
        <div class="fl-round${fixture.isDerby ? ' fl-round--derby' : ''}">
          <span class="fl-round-label">${fixture.isDerby ? 'DERBY' : 'RND'}</span>
          <span class="fl-round-num">${fixture.round}</span>
        </div>
        <div class="fl-matchup">
          <div class="fl-team fl-team--home">
            ${miniCrest(home)}
            <span class="fl-team-body">
              <span class="fl-team-name">${home.name.split(' ')[0]}</span>
              ${homeForm}
            </span>
          </div>
          ${midEl}
          <div class="fl-team fl-team--away">
            <span class="fl-team-body fl-team-body--away">
              <span class="fl-team-name">${away.name.split(' ')[0]}</span>
              ${awayForm}
            </span>
            ${miniCrest(away)}
          </div>
        </div>
        ${dateLine}
      </div>
    `;
  }

  function listHtml(state: GameState, nextRound: number, playerTeamId: string): string {
    const sorted = [...state.league.fixtures].sort((a, b) => a.round - b.round);
    const results = state.league.results;
    const today = state.calendar.date;

    if (activeMode === 'team') {
      const mine = sorted.filter(f => f.homeId === playerTeamId || f.awayId === playerTeamId);
      return mine.map((f, i) => fixtureRow(f, resultFor(state, f), nextRound, playerTeamId, activeMode, i, results, today)).join('');
    }

    if (activeMode === 'next') {
      if (nextRound === -1) return `<div class="fl-empty">Season complete</div>`;
      const fixtures = sorted.filter(f => f.round === nextRound);
      return fixtures.map((f, i) => fixtureRow(f, resultFor(state, f), nextRound, playerTeamId, activeMode, i, results, today)).join('');
    }

    // 'all' — group by round with a section header per block. The
    // stagger index runs across the whole list so the bottom of long
    // groups still caps cleanly at the 16-row delay ceiling. The
    // next-round group is wrapped in `.fl-round-band` with a NEXT
    // ROUND chip so the upcoming round reads as a discrete block.
    const byRound = new Map<number, Fixture[]>();
    for (const f of sorted) {
      if (!byRound.has(f.round)) byRound.set(f.round, []);
      byRound.get(f.round)!.push(f);
    }
    let runningIdx = 0;
    return [...byRound.entries()].map(([round, fs]) => {
      const body = fs.map(f => fixtureRow(f, resultFor(state, f), nextRound, playerTeamId, activeMode, runningIdx++, results, today)).join('');
      const isNext = round === nextRound;
      if (isNext) {
        const firstDate = fs.find(f => f.date)?.date;
        const dateLabel = firstDate ? shortFixtureDate(firstDate).toUpperCase() : '';
        return `
          <div class="fl-round-band">
            <div class="fl-round-header fl-round-header--next">
              <span class="fl-next-chip">NEXT ROUND</span>
              <span>Round ${round}${ROUND_LABELS[round] ? ` — ${ROUND_LABELS[round]}` : ''}</span>
              ${dateLabel ? `<span class="fl-round-date">${dateLabel}</span>` : ''}
            </div>
            ${body}
          </div>`;
      }
      const label = ROUND_LABELS[round] ? ` — ${ROUND_LABELS[round]}` : '';
      return `<div class="fl-round-header">Round ${round}${label}</div>${body}`;
    }).join('');
  }

  function render(): void {
    const gameEngine = getGameEngine();
    const state = gameEngine.getState();
    const playerTeamId = state.player.teamId;
    const playerTeam = teamsById.get(playerTeamId);
    const totalRounds = state.league.fixtures.reduce((max, f) => Math.max(max, f.round), 0);
    const nextFixture = gameEngine.getCurrentFixture();
    const nextRound = nextFixture?.round ?? -1;
    const teamLabel = playerTeam ? playerTeam.name.split(' ')[0] : 'My team';

    if (playerTeam) el!.style.setProperty('--team-color', playerTeam.color);
    el!.innerHTML = `
      <div class="app-header">
        <div class="app-topbar">
          <button id="fl-back" class="app-back" aria-label="Back to hub">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
            <span>Hub</span>
          </button>
          <span class="app-title">Season Fixtures</span>
          <div class="app-topbar-spacer"></div>
        </div>
        <div class="app-eyebrow">${state.calendar.seasonLabel} · WK ${state.calendar.week} / ${totalRounds}</div>
      </div>
      <div id="fl-toggle" role="tablist">
        <button class="fl-toggle-btn${activeMode === 'team' ? ' active' : ''}" data-mode="team" role="tab">${teamLabel}</button>
        <button class="fl-toggle-btn${activeMode === 'next' ? ' active' : ''}" data-mode="next" role="tab">Next round</button>
        <button class="fl-toggle-btn${activeMode === 'all'  ? ' active' : ''}" data-mode="all"  role="tab">All fixtures</button>
      </div>
      <div id="fl-list">${listHtml(state, nextRound, playerTeamId)}</div>
    `;

    el!.querySelector<HTMLButtonElement>('#fl-back')!.addEventListener('click', () => onBack());
    el!.querySelector<HTMLElement>('#fl-toggle')!.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('.fl-toggle-btn');
      if (!btn) return;
      const next = btn.dataset.mode as Mode;
      if (next === activeMode) return;
      activeMode = next;
      render();
    });
  }

  eventBus.on('game:fixtureRecorded', () => render());
  eventBus.on('game:weekAdvanced', () => render());
  eventBus.on('game:initialized', () => render());

  render();
}
