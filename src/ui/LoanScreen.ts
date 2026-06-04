// Loan management screen (Feature 2.3). Two sections:
//   - Send on Loan: squad players available to loan to the partnership club
//     (max 5 simultaneous); shows loaned-out players with a Recall button.
//   - Take on Loan: the season's generated loan pool; sign emergency cover.
//
// Initialised once per page lifetime; showLoans() re-renders on every visit.

import type { GameCoordinator } from '../game/GameCoordinator';
import type { RawTeamInput } from '../types/teamData';
import type { Player } from '../types/player';
import { playerOverall } from '../engine/RatingEngine';
import { injectTeamColors } from './teamColors';
import { PARTNERSHIP_CLUB } from '../data/partnershipClubs';

export interface InitLoanScreenOpts {
  getGameEngine: () => GameCoordinator;
  allTeams: RawTeamInput[];
  onBack: () => void;
}

let _opts: InitLoanScreenOpts | null = null;
let _teamsById: Map<string, RawTeamInput> = new Map();

const MAX_LOANS_OUT = 5;

function ovr(p: Player): number {
  return playerOverall(p.baseStats, p.position);
}

function ageStr(p: Player, date: string): string {
  if (!p.dob) return '—';
  const d = new Date(date);
  const b = new Date(p.dob);
  let age = d.getUTCFullYear() - b.getUTCFullYear();
  if (d.getUTCMonth() < b.getUTCMonth() || (d.getUTCMonth() === b.getUTCMonth() && d.getUTCDate() < b.getUTCDate())) age--;
  return String(age);
}

function playerRowHtml(p: Player, date: string, action: string): string {
  const name = `${p.firstName} ${p.lastName}`;
  return `
    <div class="loan-player-row">
      <div class="loan-player-info">
        <span class="loan-player-name">${name}</span>
        <span class="loan-player-meta">${p.position} · OVR ${ovr(p)} · Age ${ageStr(p, date)}</span>
      </div>
      ${action}
    </div>`;
}

export function showLoans(): void {
  const el = document.getElementById('loans');
  if (!el || !_opts) return;
  const opts = _opts;
  const engine = opts.getGameEngine();
  const state = engine.getState();
  const playerTeam = _teamsById.get(state.player.teamId);
  if (!playerTeam) return;

  const clubId = state.player.teamId;
  const club = state.career.clubs.find(c => c.id === clubId);
  if (!club) return;

  const totalRounds = state.league.fixtures.reduce((m, f) => Math.max(m, f.round), 0);
  const partnerClub = PARTNERSHIP_CLUB[clubId] ?? 'Partnership Club';
  const date = state.calendar.date;

  // Categorise squad members.
  const loanedOut: Player[] = [];
  const available: Player[] = [];
  for (const rid of club.squad) {
    const p = state.career.roster[rid];
    if (!p) continue;
    if (p.loanIn) continue; // loan-in players can't be loaned out
    if (p.loanOut) { loanedOut.push(p); continue; }
    if (!p.injury) available.push(p);
  }
  // Sort available by OVR descending.
  available.sort((a, b) => ovr(b) - ovr(a));

  const currentLoanCount = loanedOut.length;
  const canLoanMore = currentLoanCount < MAX_LOANS_OUT;

  // Loan-in (signed) players from the pool.
  const signedLoanIds = new Set(
    club.squad
      .filter(rid => state.career.roster[rid]?.loanIn)
  );

  // Pool players (not yet signed).
  const poolIds = (state.career.loanPool ?? []).filter(rid => !signedLoanIds.has(rid));
  const poolPlayers = poolIds
    .map(rid => state.career.roster[rid])
    .filter((p): p is Player => !!p)
    .sort((a, b) => ovr(b) - ovr(a));

  const signedPoolPlayers = [...signedLoanIds]
    .map(rid => state.career.roster[rid])
    .filter((p): p is Player => !!p);

  el.innerHTML = `
    <div class="app-header app-header--tinted" style="--team-color: var(--team-color, #2d7a3a)">
      <div class="app-topbar">
        <button id="loans-back" class="app-back" aria-label="Back">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          <span>Contracts &amp; Transfers</span>
        </button>
        <span class="app-title">Loans</span>
        <div class="app-topbar-spacer"></div>
      </div>
      <div class="app-eyebrow">${state.calendar.seasonLabel} · WK ${state.calendar.week} / ${totalRounds}</div>
    </div>

    <div class="loan-body">

      <section class="loan-section">
        <div class="loan-section-header">
          <h2 class="loan-section-title">Send on Loan</h2>
          <span class="loan-count-chip">${currentLoanCount} / ${MAX_LOANS_OUT} out</span>
        </div>
        <p class="loan-section-desc">Development loans to <strong>${partnerClub}</strong>. Loaned players get boosted training gains but are unavailable for selection. Recall at any time.</p>

        ${loanedOut.length > 0 ? `
        <div class="loan-subsection-label">Currently on loan</div>
        <div class="loan-player-list">
          ${loanedOut.map(p => playerRowHtml(p, date,
            `<button class="loan-btn loan-btn--recall" data-rosterid="${p.rosterId}">Recall</button>`
          )).join('')}
        </div>` : ''}

        ${available.length > 0 ? `
        <div class="loan-subsection-label">Available to loan</div>
        <div class="loan-player-list">
          ${available.map(p => playerRowHtml(p, date,
            canLoanMore
              ? `<button class="loan-btn loan-btn--out" data-rosterid="${p.rosterId}">Send out</button>`
              : `<button class="loan-btn loan-btn--out" data-rosterid="${p.rosterId}" disabled>Send out</button>`
          )).join('')}
        </div>` : '<p class="loan-empty">No available players to loan out.</p>'}
      </section>

      <section class="loan-section">
        <div class="loan-section-header">
          <h2 class="loan-section-title">Take on Loan</h2>
        </div>
        <p class="loan-section-desc">Emergency cover from lower-league clubs. Loan-in players train normally and are immediately available for selection.</p>

        ${signedPoolPlayers.length > 0 ? `
        <div class="loan-subsection-label">Currently signed</div>
        <div class="loan-player-list">
          ${signedPoolPlayers.map(p => playerRowHtml(p, date,
            `<button class="loan-btn loan-btn--release" data-rosterid="${p.rosterId}">Release</button>`
          )).join('')}
        </div>` : ''}

        ${poolPlayers.length > 0 ? `
        <div class="loan-subsection-label">Available in loan market</div>
        <div class="loan-player-list">
          ${poolPlayers.map(p => playerRowHtml(p, date,
            `<button class="loan-btn loan-btn--sign" data-rosterid="${p.rosterId}">Sign on loan</button>`
          )).join('')}
        </div>` : '<p class="loan-empty">No loan players currently available.</p>'}
      </section>

    </div>
  `;

  injectTeamColors(el, playerTeam);

  el.querySelector<HTMLButtonElement>('#loans-back')!.addEventListener('click', () => opts.onBack());

  el.querySelectorAll<HTMLButtonElement>('.loan-btn--out').forEach(btn => {
    const rosterId = Number(btn.dataset.rosterid);
    btn.addEventListener('click', () => {
      engine.loanOutPlayer(rosterId);
      showLoans();
    });
  });

  el.querySelectorAll<HTMLButtonElement>('.loan-btn--recall').forEach(btn => {
    const rosterId = Number(btn.dataset.rosterid);
    btn.addEventListener('click', () => {
      engine.recallLoanedPlayer(rosterId);
      showLoans();
    });
  });

  el.querySelectorAll<HTMLButtonElement>('.loan-btn--sign').forEach(btn => {
    const rosterId = Number(btn.dataset.rosterid);
    btn.addEventListener('click', () => {
      engine.signLoanPlayer(rosterId);
      showLoans();
    });
  });

  el.querySelectorAll<HTMLButtonElement>('.loan-btn--release').forEach(btn => {
    const rosterId = Number(btn.dataset.rosterid);
    btn.addEventListener('click', () => {
      engine.releaseLoanPlayer(rosterId);
      showLoans();
    });
  });
}

export function initLoanScreen(opts: InitLoanScreenOpts): void {
  _opts = opts;
  _teamsById = new Map(opts.allTeams.map(t => [t.id, t]));
}
