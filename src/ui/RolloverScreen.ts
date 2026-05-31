// Off-season recap. Reached from EndOfSeasonScreen's Continue CTA. By
// the time this screen renders, gameEngine.rollSeason() has already
// applied the rollover events — this screen displays the diff from the
// returned event list, then bridges to the new season's Hub.
//
// Sections (each suppressed when its event list is empty):
//   1. Retirements — every PLAYER_RETIRED event.
//   2. Inbound transfers  — TRANSFER_ACTIVATED events into the player's club.
//   3. Outbound transfers — TRANSFER_ACTIVATED events out of the player's club.
//   4. Academy graduates  — ACADEMY_GRADUATED events for the player's club.
//   5. Your squad — Development — PLAYER_AGED events for the player's club.

import type { GameCoordinator } from '../game/GameCoordinator';
import type { RawTeamInput } from '../types/teamData';
import type { GameState, SeasonEvent } from '../types/gameState';
import type { Player, PlayerStats } from '../types/player';
import { getAge } from '../game/age';
import { animateCounter } from './components/counterUp';
import { playId } from './SoundManager';

const BREAKOUT_OVR_THRESHOLD = 80;

let activeEvents: SeasonEvent[] = [];
let activeOnContinue: () => void = () => {};
let renderImpl: (() => void) | null = null;

export function showRollover(events: SeasonEvent[], onContinue: () => void): void {
  activeEvents = events;
  activeOnContinue = onContinue;
  // A wistful sting if anyone retired this off-season (once, not per player).
  if (events.some(e => e.type === 'PLAYER_RETIRED')) playId('stinger.retired');
  renderImpl?.();
}


function statLabel(s: keyof PlayerStats): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function statDeltaText(deltas: Partial<PlayerStats>): string {
  return (Object.entries(deltas) as [keyof PlayerStats, number][])
    .filter(([, v]) => v !== 0)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .map(([k, v], j) => {
      const cls = v > 0 ? 'roll-delta-pos' : 'roll-delta-neg';
      const major = Math.abs(v) >= 4 ? ' roll-delta--major' : '';
      const sign = v > 0 ? '+' : '';
      return `<span class="${cls}${major}" style="--delta-delay:${j * 80}ms">${statLabel(k)} ${sign}${v}</span>`;
    })
    .join(' ');
}

export function initRolloverScreen(
  // Always called fresh — see HubScreen for the rationale.
  getGameEngine: () => GameCoordinator,
  allTeams: RawTeamInput[],
): void {
  const el = document.getElementById('rollover');
  if (!el) return;

  const teamsById = new Map(allTeams.map(t => [t.id, t]));

  function render(): void {
    const state: GameState = getGameEngine().getState();
    const today = state.calendar.date;
    const playerTeam = teamsById.get(state.player.teamId);
    if (playerTeam) el!.style.setProperty('--team-color', playerTeam.color);

    const myClubId = state.player.teamId;
    const retirements = activeEvents.filter(e => e.type === 'PLAYER_RETIRED' && e.clubId === myClubId);
    const agings = activeEvents.filter(e => e.type === 'PLAYER_AGED');
    const academyGrads = activeEvents.filter(e => e.type === 'ACADEMY_GRADUATED' && e.clubId === myClubId);
    const inboundTransfers = activeEvents.filter(e => e.type === 'TRANSFER_ACTIVATED' && e.toClubId === myClubId);
    const outboundTransfers = activeEvents.filter(e => e.type === 'TRANSFER_ACTIVATED' && e.fromClubId === myClubId);

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

    // Stagger delays drive `.roll-row { animation-delay: var(--row-delay) }`
    // and `.roll-deltas > span { animation-delay: var(--delta-delay) }`. Each
    // section's stagger restarts at row 0, so squads >7 (the previous
    // nth-child cap) keep cascading rather than freezing on the last frame.
    const retiredHtml = retirements.length === 0
      ? `<p class="roll-empty">No retirements this off-season.</p>`
      : retirements.map((e, i) => {
          if (e.type !== 'PLAYER_RETIRED') return '';
          const p: Player | undefined = state.career.roster[e.rosterId];
          if (!p) return '';
          const age = p.dob ? getAge(p.dob, today) : '—';
          const club = teamsById.get(e.clubId);
          return `
            <div class="roll-row" style="--row-delay:${i * 60}ms">
              <span class="roll-name">${p.firstName} ${p.lastName}</span>
              <span class="roll-meta">${club?.shortName ?? e.clubId} · ${p.position} · ${age}</span>
            </div>`;
        }).join('');

    const agingHtml = playerAgings.length === 0
      ? `<p class="roll-empty">No notable changes for your squad.</p>`
      : playerAgings.map((e, i) => {
          if (e.type !== 'PLAYER_AGED') return '';
          const p = state.career.roster[e.rosterId];
          if (!p) return '';
          return `
            <div class="roll-row" style="--row-delay:${i * 60}ms">
              <span class="roll-name">${p.firstName} ${p.lastName}</span>
              <span class="roll-deltas">${statDeltaText(e.statDeltas)}</span>
            </div>`;
        }).join('');

    // Compute per-grad OVRs once; pick the highest as a candidate
    // breakout-talent hero (only when OVR clears the threshold).
    const academyWithOvr = academyGrads.flatMap(e => {
      if (e.type !== 'ACADEMY_GRADUATED') return [];
      const p = e.player;
      const ovrSum = Object.values(p.baseStats).reduce((a, b) => a + b, 0);
      const ovr = Math.round(ovrSum / 12);
      return [{ event: e, player: p, ovr }];
    });
    const breakout = academyWithOvr
      .filter(g => g.ovr >= BREAKOUT_OVR_THRESHOLD)
      .sort((a, b) => b.ovr - a.ovr)[0];
    const breakoutRosterId = breakout?.player.rosterId;

    const breakoutHtml = breakout && playerTeam ? `
      <section class="roll-section">
        <div class="roll-breakout" style="--team-color:${playerTeam.color}">
          <div class="roll-breakout-eyebrow">BREAKOUT TALENT</div>
          <div class="roll-breakout-crest" style="background:linear-gradient(160deg,${playerTeam.color} 0%,color-mix(in oklch,${playerTeam.color} 30%,black) 100%);border:1px solid color-mix(in oklch,${playerTeam.color} 45%,transparent)"><span>${playerTeam.shortName[0] ?? '?'}</span></div>
          <div class="roll-breakout-name">${breakout.player.firstName} ${breakout.player.lastName}</div>
          <div class="roll-breakout-meta">${breakout.player.position} · ${playerTeam.shortName} Academy</div>
          <div class="roll-breakout-ovr">OVR <span data-counter-ovr="${breakout.ovr}">0</span></div>
        </div>
      </section>` : '';

    const academyHtml = academyWithOvr
      .filter(g => g.player.rosterId !== breakoutRosterId)
      .map((g, i) => `
        <div class="roll-row" style="--row-delay:${i * 60}ms">
          <span class="roll-name">${g.player.firstName} ${g.player.lastName}</span>
          <span class="roll-meta">${g.player.position} · OVR <span data-counter-ovr="${g.ovr}" data-counter-delay="${i * 60 + 380}">0</span></span>
        </div>`).join('');

    const transfersHtml = inboundTransfers.map((e, i) => {
      if (e.type !== 'TRANSFER_ACTIVATED') return '';
      const p = state.career.roster[e.rosterId];
      if (!p) return '';
      const fromClub = teamsById.get(e.fromClubId);
      return `
        <div class="roll-row" style="--row-delay:${i * 60}ms">
          <span class="roll-name">${p.firstName} ${p.lastName}</span>
          <span class="roll-meta">${p.position} · from ${fromClub?.shortName ?? e.fromClubId}</span>
        </div>`;
    }).join('');

    const outboundHtml = outboundTransfers.map((e, i) => {
      if (e.type !== 'TRANSFER_ACTIVATED') return '';
      const p = state.career.roster[e.rosterId];
      if (!p) return '';
      const toClub = teamsById.get(e.toClubId);
      return `
        <div class="roll-row" style="--row-delay:${i * 60}ms">
          <span class="roll-name">${p.firstName} ${p.lastName}</span>
          <span class="roll-meta">${p.position} · to ${toClub?.shortName ?? e.toClubId}</span>
        </div>`;
    }).join('');

    el!.innerHTML = `
      <div class="app-header">
        <div class="app-topbar">
          <div class="app-topbar-spacer"></div>
          <span class="app-title">Off-Season</span>
          <div class="app-topbar-spacer"></div>
        </div>
        <div class="app-eyebrow">${state.calendar.seasonLabel}</div>
      </div>

      <section class="roll-section">
        <h3 class="roll-h3">Retirements <span class="roll-count">${retirements.length}</span></h3>
        <div class="roll-list">${retiredHtml}</div>
      </section>

      ${inboundTransfers.length > 0 ? `
      <section class="roll-section">
        <h3 class="roll-h3">Inbound Transfers <span class="roll-count">${inboundTransfers.length}</span></h3>
        <div class="roll-list">${transfersHtml}</div>
      </section>` : ''}

      ${outboundTransfers.length > 0 ? `
      <section class="roll-section">
        <h3 class="roll-h3">Outbound Transfers <span class="roll-count">${outboundTransfers.length}</span></h3>
        <div class="roll-list">${outboundHtml}</div>
      </section>` : ''}

      ${breakoutHtml}

      ${academyGrads.length > 0 && academyHtml ? `
      <section class="roll-section">
        <h3 class="roll-h3">Academy Graduates <span class="roll-count">${academyWithOvr.length - (breakout ? 1 : 0)}</span></h3>
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

    // Counter-up academy OVRs. The breakout-talent hero card runs a
    // slightly longer tween at a 700ms delay so it lands after the
    // card's scale-pop entry; in-list grads use their per-row delay.
    el!.querySelectorAll<HTMLElement>('[data-counter-ovr]').forEach(node => {
      const target = Number(node.dataset.counterOvr ?? '0');
      const delay  = node.dataset.counterDelay !== undefined
        ? Number(node.dataset.counterDelay)
        : 700;
      const duration = delay === 700 ? 900 : 600;
      animateCounter(node, 0, target, v => `${Math.round(v)}`, { duration, delay });
    });
  }

  renderImpl = render;
}
