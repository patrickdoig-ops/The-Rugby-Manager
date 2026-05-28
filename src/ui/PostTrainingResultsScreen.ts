// Post-training recap. Reached from TrainingScreen's Continue handler in
// the post-match chain (between TrainingScreen and Hub). Shows per-player
// attribute gains, new training injuries, and a condition summary for the
// user's club only. One-shot init from main.ts; showPostTrainingResults
// sets results + onContinue then renders.

import type { GameCoordinator } from '../game/GameCoordinator';
import type { RawTeamInput } from '../types/teamData';
import type { PlayerTrainingResult, TrainingWeekResult } from '../types/training';
import type { PlayerStats } from '../types/player';
import { playerLinkHtml, wirePlayerLinks } from './components/playerLink';

let activeResults: TrainingWeekResult | null = null;
let activeOnContinue: (() => void) | null = null;
let renderImpl: (() => void) | null = null;

export function showPostTrainingResults(
  results: TrainingWeekResult,
  onContinue: () => void,
): void {
  activeResults = results;
  activeOnContinue = onContinue;
  renderImpl?.();
}

function statLabel(s: keyof PlayerStats): string {
  if (s === 'setPiece') return 'Set Piece';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function focusLabel(s: string): string {
  return s.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function injuryLabel(kind: string): string {
  return kind.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

export function initPostTrainingResultsScreen(
  getGameEngine: () => GameCoordinator,
  allTeams: RawTeamInput[],
  onPlayerClick: (rosterId: number) => void,
): void {
  const el = document.getElementById('training-results');
  if (!el) return;

  const teamsById = new Map(allTeams.map(t => [t.id, t]));

  function render(): void {
    const results = activeResults;
    const onContinue = activeOnContinue;
    if (!results || !onContinue) return;

    const engine = getGameEngine();
    const state = engine.getState();
    const teamJson = teamsById.get(state.player.teamId);
    if (teamJson) el!.style.setProperty('--team-color', teamJson.color);
    const userClub = state.career.clubs.find(c => c.id === state.player.teamId);
    if (!userClub) return;

    const userSquadSet = new Set(userClub.squad);
    const trainedIds = new Set(results.players.map(p => p.rosterId));
    const userTrained = results.players.filter(p => userSquadSet.has(p.rosterId));

    // Partition trained players
    const withGains     = userTrained.filter(p => Object.keys(p.statDeltas).length > 0);
    const withInjNoGain = userTrained.filter(
      p => p.newlyInjured && Object.keys(p.statDeltas).length === 0,
    );
    const condOnly = userTrained.filter(
      p => Object.keys(p.statDeltas).length === 0 && !p.newlyInjured,
    );
    const satOutCount = userClub.squad.filter(rid => !trainedIds.has(rid)).length;

    // Split gains: standout = 2+ stat gains (notable); single = exactly 1
    const standout   = withGains.filter(p => Object.keys(p.statDeltas).length >= 2);
    const singleGain = withGains.filter(p => Object.keys(p.statDeltas).length === 1);

    const totalStatGains = withGains.reduce((s, p) => s + Object.keys(p.statDeltas).length, 0);
    const injuryCount = userTrained.filter(p => p.newlyInjured).length;

    let avgBefore = 0;
    let avgAfter  = 0;
    if (condOnly.length > 0) {
      avgBefore = Math.round(condOnly.reduce((s, p) => s + p.conditionBefore, 0) / condOnly.length);
      avgAfter  = Math.round(condOnly.reduce((s, p) => s + p.conditionAfter,  0) / condOnly.length);
    }

    function condSpan(r: PlayerTrainingResult): string {
      const before = Math.round(r.conditionBefore);
      const after  = Math.round(r.conditionAfter);
      const cls = after > before ? ' trs-cond--up' : '';
      return `<span class="trs-cond${cls}">${before}%<span class="trs-arrow">→</span>${after}%</span>`;
    }

    function gainRow(r: PlayerTrainingResult, i: number): string {
      const p = state.career.roster[r.rosterId];
      if (!p) return '';
      const name = `${p.firstName} ${p.lastName}`;
      const chips = (Object.entries(r.statDeltas) as [keyof PlayerStats, number][])
        .map(([k, v], j) => `<span class="trs-gain" style="--delta-delay:${j * 60}ms">+${v} ${statLabel(k)}</span>`)
        .join('');
      const injTag = r.newlyInjured && p.injury
        ? `<span class="trs-injury-tag">⚠ ${injuryLabel(p.injury.kind)} · ${p.injury.weeksRemaining}w</span>`
        : '';
      return `
        <div class="trs-row" style="--row-delay:${i * 40}ms">
          <div class="trs-row-head">
            ${playerLinkHtml(name, r.rosterId)}
            <span class="trs-pos">${p.position}</span>
            ${condSpan(r)}
          </div>
          <div class="trs-row-body">${chips}${injTag}</div>
        </div>`;
    }

    function compactGainRow(r: PlayerTrainingResult, i: number): string {
      const p = state.career.roster[r.rosterId];
      if (!p) return '';
      const name = `${p.firstName} ${p.lastName}`;
      const [[k, v]] = Object.entries(r.statDeltas) as [keyof PlayerStats, number][];
      const injTag = r.newlyInjured && p.injury
        ? `<span class="trs-injury-tag">⚠ ${injuryLabel(p.injury.kind)}</span>`
        : '';
      return `
        <div class="trs-row trs-row--compact" style="--row-delay:${i * 20}ms">
          <div class="trs-row-inline">
            ${playerLinkHtml(name, r.rosterId)}
            <span class="trs-pos">${p.position}</span>
            <span class="trs-gain">+${v} ${statLabel(k)}</span>
            ${injTag}
            ${condSpan(r)}
          </div>
        </div>`;
    }

    function injuryRow(r: PlayerTrainingResult, i: number): string {
      const p = state.career.roster[r.rosterId];
      if (!p) return '';
      const name = `${p.firstName} ${p.lastName}`;
      const injTag = p.injury
        ? `<span class="trs-injury-tag">⚠ ${injuryLabel(p.injury.kind)} · ${p.injury.weeksRemaining}w</span>`
        : '';
      return `
        <div class="trs-row" style="--row-delay:${i * 40}ms">
          <div class="trs-row-head">
            ${playerLinkHtml(name, r.rosterId)}
            <span class="trs-pos">${p.position}</span>
            ${condSpan(r)}
          </div>
          <div class="trs-row-body">${injTag}</div>
        </div>`;
    }

    const summaryParts: string[] = [];
    if (totalStatGains > 0) summaryParts.push(`<span class="trs-sum-gains">${totalStatGains} ${totalStatGains === 1 ? 'stat gain' : 'stat gains'}</span>`);
    if (injuryCount    > 0) summaryParts.push(`<span class="trs-sum-injuries">${injuryCount} ${injuryCount === 1 ? 'injury' : 'injuries'}</span>`);
    if (satOutCount    > 0) summaryParts.push(`<span class="trs-sum-sat">${satOutCount} sat out</span>`);

    el!.innerHTML = `
      <div class="app-header">
        <div class="app-topbar">
          <div class="app-topbar-spacer"></div>
          <span class="app-title">Training Results</span>
          <div class="app-topbar-spacer"></div>
        </div>
        <div class="app-eyebrow">${state.calendar.seasonLabel} · WK ${state.calendar.week}</div>
      </div>

      <div class="trs-plan-bar">
        ${results.weeks > 1
          ? `<span class="trs-plan-chip trs-block-chip">${results.weeks}-WEEK BLOCK</span>`
          : `<span class="trs-plan-chip trs-intensity-${results.plan.intensity}">${results.plan.intensity.toUpperCase()}</span>`}
        <span class="trs-plan-sep">·</span>
        <span class="trs-plan-chip">Fwds: ${focusLabel(results.plan.forwardsFocus)}</span>
        <span class="trs-plan-sep">·</span>
        <span class="trs-plan-chip">Backs: ${focusLabel(results.plan.backsFocus)}</span>
      </div>

      ${summaryParts.length > 0
        ? `<div class="trs-summary">${summaryParts.join('<span class="trs-sum-sep">·</span>')}</div>`
        : `<div class="trs-no-news">No attribute gains this ${results.weeks > 1 ? 'block' : 'week'}.</div>`
      }

      <div class="trs-content">
        ${standout.length > 0 ? `
          <section class="trs-section">
            <h2 class="trs-section-title">${singleGain.length > 0 ? 'Standout gains' : 'Attribute gains'} — ${standout.length} ${standout.length === 1 ? 'player' : 'players'}</h2>
            <div class="trs-list">
              ${standout.map((r, i) => gainRow(r, i)).join('')}
            </div>
          </section>` : ''}

        ${singleGain.length > 0 ? `
          <section class="trs-section">
            <h2 class="trs-section-title">${standout.length > 0 ? 'Also improved' : 'Attribute gains'} — ${singleGain.length} ${singleGain.length === 1 ? 'player' : 'players'}</h2>
            <div class="trs-list">
              ${singleGain.map((r, i) => compactGainRow(r, i)).join('')}
            </div>
          </section>` : ''}

        ${withInjNoGain.length > 0 ? `
          <section class="trs-section">
            <h2 class="trs-section-title trs-section-title--warn">Training injuries — ${withInjNoGain.length}</h2>
            <div class="trs-list">
              ${withInjNoGain.map((r, i) => injuryRow(r, i)).join('')}
            </div>
          </section>` : ''}

        ${condOnly.length > 0 ? `
          <div class="trs-cond-summary">
            ${condOnly.length} ${condOnly.length === 1 ? 'player' : 'players'} trained — no attribute gains.
            Avg condition ${avgBefore}%→${avgAfter}%.
          </div>` : ''}

        ${satOutCount > 0 ? `
          <div class="trs-sat-out">
            ${satOutCount} ${satOutCount === 1 ? 'player' : 'players'} sat out injured this week.
          </div>` : ''}
      </div>

      <div id="trs-footer">
        <button id="trs-continue" class="cta-pulse">
          <span>Continue</span>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 5l7 7-7 7"/></svg>
        </button>
      </div>
    `;

    el!.querySelector<HTMLButtonElement>('#trs-continue')!.addEventListener('click', () => {
      onContinue();
    });

    wirePlayerLinks(el!, onPlayerClick);
  }

  renderImpl = render;
}
