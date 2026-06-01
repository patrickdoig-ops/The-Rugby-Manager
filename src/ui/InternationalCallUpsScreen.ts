// International Call-Ups — the first screen of the international-break flow.
// Shows which of the user's players are heading off on duty (and a
// league-wide nation summary) BEFORE the block plays out. Distinct from
// InternationalBreakScreen, which is the returns recap shown afterwards.
// One-shot init from main.ts; showInternationalCallUps sets the context.

import type { BreakBeginResult, GameCoordinator } from '../game/GameCoordinator';
import type { RawTeamInput } from '../types/teamData';
import { INTERNATIONAL_WINDOWS } from '../engine/balance/international';
import { playerLinkHtml, wirePlayerLinks } from './components/playerLink';

let activeBegin: BreakBeginResult | null = null;
let activeOnContinue: (() => void) | null = null;
let renderImpl: (() => void) | null = null;

export function showInternationalCallUps(begin: BreakBeginResult, onContinue: () => void): void {
  activeBegin = begin;
  activeOnContinue = onContinue;
  renderImpl?.();
}

function windowLabel(window: BreakBeginResult['window']): string {
  return window === 'autumn' ? 'Autumn Nations Series' : 'Six Nations';
}

function nationFlag(nation: string): string {
  switch (nation) {
    case 'England':      return '🏴';
    case 'Scotland':     return '🏴';
    case 'Wales':        return '🏴';
    case 'South Africa': return '🇿🇦';
    default:             return '🌍';
  }
}

export function initInternationalCallUpsScreen(
  getGameEngine: () => GameCoordinator,
  allTeams: RawTeamInput[],
  onPlayerClick: (rosterId: number) => void,
): void {
  const el = document.getElementById('intl-callups');
  if (!el) return;

  const teamsById = new Map(allTeams.map(t => [t.id, t]));

  function render(): void {
    const begin = activeBegin;
    const onContinue = activeOnContinue;
    if (!begin || !onContinue) return;

    const engine = getGameEngine();
    const state = engine.getState();
    const teamJson = teamsById.get(state.player.teamId);
    if (teamJson) el!.style.setProperty('--team-color', teamJson.color);

    // The user's own players away on duty.
    const mine = begin.callUps
      .map(c => ({ c, p: state.career.roster[c.rosterId] }))
      .filter(x => x.p && x.p.contract.clubId === state.player.teamId)
      .sort((a, b) => a.c.selectionRank - b.c.selectionRank || a.p.lastName.localeCompare(b.p.lastName));

    const tests = INTERNATIONAL_WINDOWS[begin.window].tests;

    // League-wide nation counts.
    const byNation = new Map<string, number>();
    for (const c of begin.callUps) byNation.set(c.nation, (byNation.get(c.nation) ?? 0) + 1);
    const nationChips = [...byNation.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([n, count]) => `<span class="intl-nation-chip">${nationFlag(n)} ${n} <b>${count}</b></span>`)
      .join('');

    const myRows = mine.length > 0
      ? mine.map(({ c, p }) => `
        <div class="intl-row">
          <div class="intl-row-head">
            <span class="intl-flag" aria-hidden="true">${nationFlag(c.nation)}</span>
            ${playerLinkHtml(`${p.firstName} ${p.lastName}`, c.rosterId)}
            <span class="intl-nation">${c.nation}</span>
            ${c.selectionRank === 1 ? '<span class="intl-apps">First choice</span>' : `<span class="intl-apps">Squad</span>`}
          </div>
        </div>`).join('')
      : `<div class="intl-empty">No ${teamJson?.shortName ?? 'your'} players called up — your full squad is available for the Prem Cup.</div>`;

    el!.innerHTML = `
      <div class="app-header">
        <div class="app-topbar">
          <div class="app-topbar-spacer"></div>
          <span class="app-title">International Call-Ups</span>
          <div class="app-topbar-spacer"></div>
        </div>
        <div class="app-eyebrow">${windowLabel(begin.window)} · ${state.calendar.seasonLabel}</div>
      </div>

      <div class="cup-content">
        <div class="intl-hero">
          <span class="intl-hero-num">${mine.length}</span>
          <span class="intl-hero-label">${mine.length === 1 ? 'Player' : 'Players'} Called Up</span>
          <div class="intl-hero-sub">Up to ${tests} Tests over the window — they miss the Prem Cup block and your training.</div>
        </div>

        ${mine.length > 0 ? `<div class="intl-section-title">Your players away on duty</div>` : ''}
        <div class="intl-list">${myRows}</div>

        <div class="intl-section-title">Across the league</div>
        <div class="intl-league">
          <div class="intl-nation-chips">${nationChips}</div>
          <div class="intl-league-note">${begin.callUps.length} players league-wide are away — every club's internationals miss the cup block.</div>
        </div>
      </div>

      <div class="cup-footer">
        <button id="callups-continue" class="cta-pulse">
          <span>Prem Cup fixtures</span>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 5l7 7-7 7"/></svg>
        </button>
      </div>
    `;

    el!.querySelector<HTMLButtonElement>('#callups-continue')!.addEventListener('click', () => onContinue());
    wirePlayerLinks(el!, onPlayerClick);
  }

  renderImpl = render;
}
