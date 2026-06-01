// International Break recap. Inserted into the post-match Continue chain after
// PostTrainingResults at the Autumn (Round 6) / Six Nations (Round 11) break,
// when the training result carries an InternationalBreakSummary. Shows the
// user's club call-ups (return condition, appearances, injuries, PGA rest
// obligations) plus a league-wide summary. One-shot init from main.ts;
// showInternationalBreak sets summary + onContinue then renders.

import type { GameCoordinator } from '../game/GameCoordinator';
import type { RawTeamInput } from '../types/teamData';
import type { InternationalBreakSummary, InternationalCallUpResult } from '../types/training';
import type { PlayerStats } from '../types/player';
import { INTERNATIONAL_WINDOWS } from '../engine/balance/international';
import { playerLinkHtml, wirePlayerLinks } from './components/playerLink';

function statLabel(s: keyof PlayerStats): string {
  if (s === 'setPiece') return 'Set Piece';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

let activeSummary: InternationalBreakSummary | null = null;
let activeOnContinue: (() => void) | null = null;
let renderImpl: (() => void) | null = null;

export function showInternationalBreak(
  summary: InternationalBreakSummary,
  onContinue: () => void,
): void {
  activeSummary = summary;
  activeOnContinue = onContinue;
  renderImpl?.();
}

function windowLabel(window: InternationalBreakSummary['window']): string {
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

export function initInternationalBreakScreen(
  getGameEngine: () => GameCoordinator,
  allTeams: RawTeamInput[],
  onPlayerClick: (rosterId: number) => void,
): void {
  const el = document.getElementById('international-break');
  if (!el) return;

  const teamsById = new Map(allTeams.map(t => [t.id, t]));

  function callUpRow(c: InternationalCallUpResult, window: InternationalBreakSummary['window']): string {
    const cond = Math.round(c.conditionAfter);
    const condCls = cond < 55 ? 'intl-cond-fill--low' : cond < 75 ? 'intl-cond-fill--mid' : 'intl-cond-fill--ok';
    const tests = INTERNATIONAL_WINDOWS[window].tests;
    const tags: string[] = [];
    if (c.injured) tags.push('<span class="intl-tag intl-tag--injury">Injured on duty</span>');
    if (c.restObligated) {
      const r0 = INTERNATIONAL_WINDOWS[window].returnRound;
      const rN = r0 + INTERNATIONAL_WINDOWS[window].restWindowRounds - 1;
      tags.push(`<span class="intl-tag intl-tag--rest">Rest 1 of R${r0}–R${rN}</span>`);
    }
    const statEntries = Object.entries(c.statDeltas) as [keyof PlayerStats, number][];
    const gainChips = statEntries
      .map(([k, v]) => `<span class="intl-tag intl-tag--gain">+${v} ${statLabel(k)}</span>`)
      .join('');
    return `
      <div class="intl-row">
        <div class="intl-row-head">
          <span class="intl-flag" aria-hidden="true">${nationFlag(c.nation)}</span>
          ${playerLinkHtml(`${c.firstName} ${c.lastName}`, c.rosterId)}
          <span class="intl-nation">${c.nation}</span>
          <span class="intl-apps">${c.appearances}/${tests} Tests</span>
        </div>
        <div class="intl-cond">
          <span class="intl-cond-label">Returns</span>
          <div class="intl-cond-track"><div class="intl-cond-fill ${condCls}" style="width:${cond}%"></div></div>
          <span class="intl-cond-val">${cond}%</span>
        </div>
        ${gainChips ? `<div class="intl-tags">${gainChips}</div>` : ''}
        ${tags.length > 0 ? `<div class="intl-tags">${tags.join('')}</div>` : ''}
      </div>`;
  }

  function render(): void {
    const summary = activeSummary;
    const onContinue = activeOnContinue;
    if (!summary || !onContinue) return;

    const engine = getGameEngine();
    const state = engine.getState();
    const teamJson = teamsById.get(state.player.teamId);
    if (teamJson) el!.style.setProperty('--team-color', teamJson.color);

    const mine = summary.callUps.filter(c => c.clubId === state.player.teamId);
    mine.sort((a, b) => (b.appearances - a.appearances) || a.lastName.localeCompare(b.lastName));

    // League-wide nation counts for context.
    const byNation = new Map<string, number>();
    for (const c of summary.callUps) byNation.set(c.nation, (byNation.get(c.nation) ?? 0) + 1);
    const nationChips = [...byNation.entries()]
      .map(([n, count]) => `<span class="intl-nation-chip">${nationFlag(n)} ${n} <b>${count}</b></span>`)
      .join('');

    const mineInjured = mine.filter(c => c.injured).length;
    const mineRest = mine.filter(c => c.restObligated).length;
    const mineTotalGains = mine.reduce((s, c) => s + Object.keys(c.statDeltas).length, 0);

    const heroSub = mine.length === 0
      ? `No ${teamJson?.shortName ?? 'your'} players away — a chance to gain ground on rivals.`
      : `${teamJson?.shortName ?? 'Your'} players are back from duty${mineTotalGains > 0 ? ` · ${mineTotalGains} stat ${mineTotalGains === 1 ? 'gain' : 'gains'} in camp` : ''}${mineInjured > 0 ? ` · ${mineInjured} returned injured` : ''}${mineRest > 0 ? ` · ${mineRest} need a rest` : ''}.`;

    const myRows = mine.length > 0
      ? mine.map(c => callUpRow(c, summary.window)).join('')
      : `<div class="intl-empty">Your squad trained as normal through the window — no international call-ups.</div>`;

    el!.innerHTML = `
      <div class="app-header">
        <div class="app-topbar">
          <div class="app-topbar-spacer"></div>
          <span class="app-title">International Break</span>
          <div class="app-topbar-spacer"></div>
        </div>
        <div class="app-eyebrow">${windowLabel(summary.window)} · ${state.calendar.seasonLabel}</div>
      </div>

      <div id="intl-content">
        <div class="intl-hero">
          <span class="intl-hero-num">${mine.length}</span>
          <span class="intl-hero-label">${mine.length === 1 ? 'Player' : 'Players'} Called Up</span>
          <div class="intl-hero-sub">${heroSub}</div>
        </div>

        ${mine.length > 0 ? `<div class="intl-section-title">Your returning internationals</div>` : ''}
        <div class="intl-list">${myRows}</div>

        <div class="intl-section-title">Across the league</div>
        <div class="intl-league">
          <div class="intl-nation-chips">${nationChips}</div>
          <div class="intl-league-note">${summary.callUps.length} players league-wide were away on duty — every club's internationals return tired, though the international environment brings its own development gains.</div>
        </div>
      </div>

      <div id="intl-footer">
        <button id="intl-continue" class="cta-pulse">
          <span>Continue</span>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 5l7 7-7 7"/></svg>
        </button>
      </div>
    `;

    el!.querySelector<HTMLButtonElement>('#intl-continue')!.addEventListener('click', () => onContinue());
    wirePlayerLinks(el!, onPlayerClick);
  }

  renderImpl = render;
}
