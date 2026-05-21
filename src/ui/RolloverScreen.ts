// Off-season recap. Reached from EndOfSeasonScreen's Continue CTA. By
// the time this screen renders, gameEngine.rollSeason() has already
// applied the rollover events — this screen displays the diff from the
// returned event list, then bridges to the new season's Hub.
//
// Sections (each suppressed when its event list is empty):
//   1. Retirements — every PLAYER_RETIRED event.
//   2. Your academy graduates — ACADEMY_GRADUATED events for your club.
//   3. Your squad — Development — PLAYER_AGED events for the player's club.
//   4. Inbound transfers — TRANSFER_ACTIVATED events into the player's club.

import type { GameCoordinator } from '../game/GameCoordinator';
import type { RawTeamInput } from '../types/teamData';
import type { GameState, SeasonEvent } from '../types/gameState';
import type { Player, PlayerStats } from '../types/player';
import { getAge } from '../game/age';

let activeEvents: SeasonEvent[] = [];
let activeOnContinue: () => void = () => {};
let renderImpl: (() => void) | null = null;

export function showRollover(events: SeasonEvent[], onContinue: () => void): void {
  activeEvents = events;
  activeOnContinue = onContinue;
  renderImpl?.();
}


function statLabel(s: keyof PlayerStats): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function statDeltaText(deltas: Partial<PlayerStats>): string {
  return (Object.entries(deltas) as [keyof PlayerStats, number][])
    .filter(([, v]) => v !== 0)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .map(([k, v]) => {
      const cls = v > 0 ? 'roll-delta-pos' : 'roll-delta-neg';
      const sign = v > 0 ? '+' : '';
      return `<span class="${cls}">${statLabel(k)} ${sign}${v}</span>`;
    })
    .join(' ');
}

export function initRolloverScreen(
  gameEngine: GameCoordinator,
  allTeams: RawTeamInput[],
): void {
  const el = document.getElementById('rollover');
  if (!el) return;

  const teamsById = new Map(allTeams.map(t => [t.id, t]));

  function render(): void {
    const state: GameState = gameEngine.getState();
    const today = state.calendar.date;

    const retirements = activeEvents.filter(e => e.type === 'PLAYER_RETIRED');
    const agings = activeEvents.filter(e => e.type === 'PLAYER_AGED');
    const myClubId = state.player.teamId;
    const academyGrads = activeEvents.filter(e => e.type === 'ACADEMY_GRADUATED' && e.clubId === myClubId);
    const inboundTransfers = activeEvents.filter(e => e.type === 'TRANSFER_ACTIVATED' && e.toClubId === myClubId);

    // Restrict the squad-development list to the player's club, sorted by
    // largest absolute delta so the most notable changes surface first.
    const playerClub = state.career.clubs.find(c => c.id === state.player.teamId);
    const playerSquadSet = new Set(playerClub?.squad ?? []);
    const playerAgings = agings
      .filter(e => e.type === 'PLAYER_AGED' && playerSquadSet.has(e.rosterId))
      .sort((a, b) => {
        if (a.type !== 'PLAYER_AGED' || b.type !== 'PLAYER_AGED') return 0;
        const am = Math.max(...Object.values(a.statDeltas).map((v) => Math.abs(v ?? 0)));
        const bm = Math.max(...Object.values(b.statDeltas).map((v) => Math.abs(v ?? 0)));
        return bm - am;
      });

    const retiredHtml = retirements.length === 0
      ? `<p class="roll-empty">No retirements this off-season.</p>`
      : retirements.map(e => {
          if (e.type !== 'PLAYER_RETIRED') return '';
          const p: Player | undefined = state.career.roster[e.rosterId];
          if (!p) return '';
          const age = p.dob ? getAge(p.dob, today) : '—';
          const club = teamsById.get(e.clubId);
          return `
            <div class="roll-row">
              <span class="roll-name">${p.firstName} ${p.lastName}</span>
              <span class="roll-meta">${club?.shortName ?? e.clubId} · ${p.position} · ${age}</span>
            </div>`;
        }).join('');

    const agingHtml = playerAgings.length === 0
      ? `<p class="roll-empty">No notable changes for your squad.</p>`
      : playerAgings.map(e => {
          if (e.type !== 'PLAYER_AGED') return '';
          const p = state.career.roster[e.rosterId];
          if (!p) return '';
          return `
            <div class="roll-row">
              <span class="roll-name">${p.firstName} ${p.lastName}</span>
              <span class="roll-deltas">${statDeltaText(e.statDeltas)}</span>
            </div>`;
        }).join('');

    const academyHtml = academyGrads.map(e => {
      if (e.type !== 'ACADEMY_GRADUATED') return '';
      const p = e.player;
      const ovrSum = Object.values(p.baseStats).reduce((a, b) => a + b, 0);
      const ovr = Math.round(ovrSum / 12);
      return `
        <div class="roll-row">
          <span class="roll-name">${p.firstName} ${p.lastName}</span>
          <span class="roll-meta">${p.position} · OVR ${ovr}</span>
        </div>`;
    }).join('');

    const transfersHtml = inboundTransfers.map(e => {
      if (e.type !== 'TRANSFER_ACTIVATED') return '';
      const p = state.career.roster[e.rosterId];
      if (!p) return '';
      return `
        <div class="roll-row">
          <span class="roll-name">${p.firstName} ${p.lastName}</span>
          <span class="roll-meta">${p.position} · joins from previous club</span>
        </div>`;
    }).join('');

    el!.innerHTML = `
      <div id="roll-topbar">
        <div style="width:72px"></div>
        <span id="roll-title">Off-Season</span>
        <div style="width:72px"></div>
      </div>
      <div id="roll-eyebrow">${state.calendar.seasonLabel}</div>

      <section class="roll-section">
        <h3 class="roll-h3">Retirements <span class="roll-count">${retirements.length}</span></h3>
        <div class="roll-list">${retiredHtml}</div>
      </section>

      ${inboundTransfers.length > 0 ? `
      <section class="roll-section">
        <h3 class="roll-h3">Inbound Transfers <span class="roll-count">${inboundTransfers.length}</span></h3>
        <div class="roll-list">${transfersHtml}</div>
      </section>` : ''}

      ${academyGrads.length > 0 ? `
      <section class="roll-section">
        <h3 class="roll-h3">Academy Graduates <span class="roll-count">${academyGrads.length}</span></h3>
        <div class="roll-list">${academyHtml}</div>
      </section>` : ''}

      <section class="roll-section">
        <h3 class="roll-h3">Your Squad — Development</h3>
        <div class="roll-list">${agingHtml}</div>
      </section>

      <div id="roll-footer">
        <button id="roll-continue" class="cta-pulse">
          <span>Begin ${state.calendar.seasonLabel.split(' ')[0]}</span>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 5l7 7-7 7"/></svg>
        </button>
      </div>
    `;

    el!.querySelector<HTMLButtonElement>('#roll-continue')!.addEventListener('click', () => activeOnContinue());
  }

  renderImpl = render;
}
