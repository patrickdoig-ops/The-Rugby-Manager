// The block fixtures preview — the "this week" screen shown when the manager
// taps Continue on the Hub. Lists every fixture in the next CalendarBlock
// (all competitions, clustered by date) with the manager's own games
// highlighted, then a Continue CTA hands off to the per-competition play flow.
//
// One-shot init from main.ts (mirrors CupResultsScreen): `initMatchdayScreen`
// registers the renderer; `showMatchdayPreview(block, onContinue)` sets the
// block + callback and paints before `screenRouter.show('matchday')`.

import type { GameCoordinator } from '../game/GameCoordinator';
import type { RawTeamInput } from '../types/teamData';
import type { CalendarBlock } from '../game/calendarBlocks';
import { formatDateMedium } from '../utils/formatDate';
import { helpButtonHtml } from './help/helpButton';

const COMP_TAG: Record<CalendarBlock['competitions'][number], string> = {
  league: 'LGE', cup: 'CUP', european: 'EUR', playoff: 'P/O',
};
const COMP_NAME: Record<CalendarBlock['competitions'][number], string> = {
  league: 'League', cup: 'League Cup', european: 'European', playoff: 'Playoffs',
};

let activeBlock: CalendarBlock | null = null;
let activeOnContinue: (() => void) | null = null;
let activeOnBack: (() => void) | null = null;
let renderImpl: (() => void) | null = null;

export function showMatchdayPreview(block: CalendarBlock, onContinue: () => void, onBack: () => void): void {
  activeBlock = block;
  activeOnContinue = onContinue;
  activeOnBack = onBack;
  renderImpl?.();
}

export function initMatchdayScreen(
  getGameEngine: () => GameCoordinator,
  allTeams: RawTeamInput[],
): void {
  const el = document.getElementById('matchday');
  if (!el) return;

  const teamsById = new Map(allTeams.map(t => [t.id, t]));

  function crest(team: RawTeamInput | undefined, fallbackName: string): string {
    const initial = (team?.shortName ?? fallbackName)[0] ?? '?';
    if (!team) return `<div class="fl-crest"><span>${initial}</span></div>`;
    const grad = `linear-gradient(160deg, ${team.color} 0%, color-mix(in oklch, ${team.color} 30%, black) 100%)`;
    return `<div class="fl-crest" style="background:${grad};border:1px solid color-mix(in oklch,${team.color} 45%,transparent)"><span>${initial}</span></div>`;
  }

  function render(): void {
    const block = activeBlock;
    const onContinue = activeOnContinue;
    const onBack = activeOnBack;
    if (!block || !onContinue || !onBack) return;

    const state = getGameEngine().getState();
    const myId = state.player.teamId;
    const myTeam = teamsById.get(myId);
    if (myTeam) el!.style.setProperty('--team-color', myTeam.color);

    const rows = block.fixtures.map((f, i) => {
      const home = teamsById.get(f.homeId);
      const away = teamsById.get(f.awayId);
      const homeName = home?.shortName ?? f.homeId;
      const awayName = away?.shortName ?? f.awayId;
      const isMine = f.homeId === myId || f.awayId === myId;
      const rowDelay = Math.min(i, 16) * 25;
      return `
        <div class="fl-row${isMine ? ' fl-row--me' : ''}" style="--row-delay: ${rowDelay}ms">
          <div class="fl-round"><span class="fl-round-label">${COMP_TAG[f.comp]}</span></div>
          <div class="fl-matchup">
            <div class="fl-team fl-team--home">
              ${crest(home, homeName)}
              <span class="fl-team-body"><span class="fl-team-name">${homeName}</span></span>
            </div>
            <span class="fl-vs">vs</span>
            <div class="fl-team fl-team--away">
              <span class="fl-team-body fl-team-body--away"><span class="fl-team-name">${awayName}</span></span>
              ${crest(away, awayName)}
            </div>
          </div>
        </div>`;
    }).join('');

    const comps = block.competitions.map(c => COMP_NAME[c]).join(' · ');
    const dateLabel = block.startDate === block.endDate
      ? formatDateMedium(block.startDate)
      : `${formatDateMedium(block.startDate)} – ${formatDateMedium(block.endDate)}`;
    const mineCount = block.fixtures.filter(f => f.homeId === myId || f.awayId === myId).length;
    const sub = mineCount === 0
      ? `${myTeam?.name ?? 'Your club'} have no fixture this week — the rest of the schedule plays out.`
      : '';

    // When the manager has a League Cup game this block, note who's in charge —
    // mirrors the persistent Club → Assistant Manager setting.
    const myCupGame = block.fixtures.some(f => f.comp === 'cup' && (f.homeId === myId || f.awayId === myId));
    const assistNote = !myCupGame
      ? ''
      : (state.player.cupManageLive
          ? `You're managing this League Cup match.`
          : `Your Assistant Manager will take charge${state.player.cupDirection === 'rest_first_15' ? ', resting your first-choice XV' : ''}.`);

    el!.innerHTML = `
      <div class="app-header">
        <div class="app-topbar">
          <button id="matchday-back" class="app-back" aria-label="Back to hub">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
            <span>Hub</span>
          </button>
          <span class="app-title">This Week</span>
          <div class="app-topbar-spacer">${helpButtonHtml('matchday')}</div>
        </div>
        <div class="app-eyebrow">${comps} · ${dateLabel}</div>
      </div>

      <div class="cup-content">
        ${(sub || assistNote) ? `<div class="cup-hero">
          ${sub ? `<div class="cup-hero-sub">${sub}</div>` : ''}
          ${assistNote ? `<div class="cup-hero-sub" style="margin-top:0.35rem;color:#9aa0a6;font-style:italic">${assistNote}</div>` : ''}
        </div>` : ''}
        <div id="fl-list">${rows}</div>
      </div>

      <div class="cup-footer">
        <button id="matchday-continue" class="cta-pulse">
          <span>Continue</span>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 5l7 7-7 7"/></svg>
        </button>
      </div>
    `;

    el!.querySelector<HTMLButtonElement>('#matchday-continue')!.addEventListener('click', () => onContinue());
    el!.querySelector<HTMLButtonElement>('#matchday-back')!.addEventListener('click', () => onBack());
  }

  renderImpl = render;
}
