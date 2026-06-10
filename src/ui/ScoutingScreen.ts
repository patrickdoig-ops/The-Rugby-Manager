import type { GameCoordinator } from '../game/GameCoordinator';
import type { GameState } from '../types/gameState';
import type { RawTeamInput } from '../types/teamData';
import type { PlayerStats, Position } from '../types/player';
import { playerOverall } from '../engine/RatingEngine';
import { PLAYER_OVERALL_WEIGHTS } from '../engine/balance/rating';
import { scoutingBand } from '../game/scouting';
import { getAge } from '../game/age';
import { injectTeamColors } from './teamColors';
import { swipeToDismiss } from './swipeToDismiss';
import { playerLinkHtml, wirePlayerLinks } from './components/playerLink';
import { helpButtonHtml } from './help/helpButton';

const STAT_SHORT: Record<keyof PlayerStats, string> = {
  stamina:     'STM',
  strength:    'STR',
  pace:        'PAC',
  agility:     'AGI',
  handling:    'HND',
  tackling:    'TKL',
  breakdown:   'BRK',
  kicking:     'KCK',
  setPiece:    'SET',
  discipline:  'DIS',
  positioning: 'POS',
  composure:   'COM',
};

const TRASH_ICON = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18m-2 0l-1.5 13.5a2 2 0 01-2 1.5H8.5a2 2 0 01-2-1.5L5 6m4-3h6"/></svg>`;

function top4Stats(position: Position): (keyof PlayerStats)[] {
  const weights = PLAYER_OVERALL_WEIGHTS[position];
  return (Object.entries(weights) as [keyof PlayerStats, number][])
    .filter(([, w]) => w > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([k]) => k);
}

function statDisplay(trueVal: number, accuracy: number): string {
  const [lo, hi] = scoutingBand(trueVal, accuracy);
  return lo === hi ? String(lo) : `${lo}–${hi}`;
}

let _getEngine: (() => GameCoordinator) | null = null;
let _allTeams: RawTeamInput[] = [];
let _onBack: (() => void) | null = null;
let _onPlayerClick: ((rosterId: number) => void) | null = null;

export function initScoutingScreen(
  getGameEngine: () => GameCoordinator,
  allTeams: RawTeamInput[],
  onBack: () => void,
  onPlayerClick: (rosterId: number) => void,
): void {
  _getEngine     = getGameEngine;
  _allTeams      = allTeams;
  _onBack        = onBack;
  _onPlayerClick = onPlayerClick;
}

export function showScouting(): void {
  render();
}

function render(): void {
  const el = document.getElementById('scouting');
  if (!el || !_getEngine || !_onBack || !_onPlayerClick) return;

  const engine = _getEngine();
  const state  = engine.getState();
  const onBack        = _onBack;
  const onPlayerClick = _onPlayerClick;

  const playerTeam = _allTeams.find(t => t.id === state.player.teamId);
  const totalRounds = state.league.fixtures.reduce((m, f) => Math.max(m, f.round), 0);

  // Build sorted card data.
  type CardData = {
    rosterId: number;
    name: string;
    position: Position;
    age: number | null;
    clubName: string;
    accuracy: number;
    scoutName: string;
    ovr: number;
    stats: { key: keyof PlayerStats; label: string; display: string }[];
  };

  const cards: CardData[] = [];
  for (const [rIdStr, rec] of Object.entries(state.player.scouting ?? {})) {
    const rosterId = Number(rIdStr);
    const p = state.career.roster[rosterId];
    if (!p) continue;

    const accuracy  = rec.accuracy;
    const ovr       = playerOverall(p.baseStats, p.position as Position);
    const clubEntry = state.career.clubs.find(c => c.squad.includes(rosterId));
    const clubName  = clubEntry
      ? (_allTeams.find(t => t.id === clubEntry.id)?.name ?? clubEntry.id)
      : 'Free Agent';
    const scout = rec.assignedScoutId
      ? (state.career.staff ?? []).find(m => m.id === rec.assignedScoutId && m.clubId === state.player.teamId)
      : undefined;

    const keyStats = top4Stats(p.position as Position).map(key => ({
      key,
      label:   STAT_SHORT[key],
      display: statDisplay(p.baseStats[key], accuracy),
    }));

    cards.push({
      rosterId,
      name:      `${p.firstName} ${p.lastName}`,
      position:  p.position as Position,
      age:       getAge(p.dob, state.calendar.date),
      clubName,
      accuracy,
      scoutName: scout ? ` · ${scout.name}` : '',
      ovr,
      stats: keyStats,
    });
  }

  cards.sort((a, b) => b.ovr - a.ovr);

  const cardsHtml = cards.length === 0
    ? `<div class="empty-state">
        <svg class="empty-state__icon" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"/><path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
        <div class="empty-state__title">No scouted players</div>
        <div class="empty-state__desc">Assign a scout to a player from the Transfer Market or Player Profile to start tracking them.</div>
      </div>`
    : cards.map((c, i) => {
        const delay = i * 40;
        const isRep = c.accuracy < 100;
        const ovrDisplay = isRep
          ? `~${statDisplay(c.ovr, c.accuracy)}`
          : String(c.ovr);
        const statsHtml = c.stats.map(s => `
          <div class="scout-stat">
            <span class="scout-stat-label">${s.label}</span>
            <span class="scout-stat-value">${s.display}</span>
          </div>`).join('');

        return `
          <div class="scout-card" data-roster-id="${c.rosterId}" style="--row-delay:${delay}ms">
            <div class="scout-card-dismiss-bg" aria-hidden="true">${TRASH_ICON}</div>
            <div class="scout-card-content">
              <div class="scout-card-header">
                ${playerLinkHtml(c.name, c.rosterId)}
                <span class="scout-card-pos">${c.position}</span>
                ${c.age !== null ? `<span class="scout-card-age">${c.age}</span>` : ''}
                <span class="scout-card-club">${c.clubName}</span>
              </div>
              <div class="scout-accuracy">
                <div class="scout-accuracy-bar">
                  <div class="scout-accuracy-fill" style="width:${c.accuracy}%"></div>
                </div>
                <span class="scout-accuracy-label">${Math.round(c.accuracy)}% scouted${c.scoutName}</span>
              </div>
              <div class="scout-card-stats">
                <div class="scout-stat scout-stat--ovr${isRep ? ' scout-stat--rep' : ''}">
                  <span class="scout-stat-label">OVR</span>
                  <span class="scout-stat-value">${ovrDisplay}</span>
                </div>
                ${statsHtml}
              </div>
            </div>
          </div>`;
      }).join('');

  el.innerHTML = `
    <div class="app-header">
      <div class="app-topbar">
        <button id="scouting-back" class="app-back" aria-label="Back to Contracts &amp; Transfers">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          <span>Back</span>
        </button>
        <span class="app-title">Scouting</span>
        <div class="app-topbar-spacer">${helpButtonHtml('scouting')}</div>
      </div>
      <div class="app-eyebrow">${state.calendar.seasonLabel} · WK ${state.calendar.week} / ${totalRounds}</div>
    </div>
    <div class="scout-list">${cardsHtml}</div>
  `;

  if (playerTeam) injectTeamColors(el, playerTeam);

  el.querySelector<HTMLButtonElement>('#scouting-back')!
    .addEventListener('click', () => onBack());

  // Whole-card tap → player profile (on content layer to avoid swipe host).
  el.querySelectorAll<HTMLElement>('.scout-card-content').forEach(content => {
    const card = content.closest<HTMLElement>('.scout-card');
    const rosterId = Number(card?.dataset.rosterId);
    if (!Number.isFinite(rosterId)) return;
    content.addEventListener('click', (ev) => {
      // Let playerLink handle its own click via stopPropagation;
      // any other tap on the card also opens the profile.
      if ((ev.target as HTMLElement).closest('.player-link')) return;
      onPlayerClick(rosterId);
    });
  });

  // Player name deeplinks.
  wirePlayerLinks(el, onPlayerClick);

  // Swipe to remove.
  swipeToDismiss(
    el,
    '.scout-card[data-roster-id]',
    item => item.querySelector<HTMLElement>('.scout-card-content'),
    item => {
      const rosterId = Number(item.dataset.rosterId);
      engine.removeScouting(rosterId);
      render();
    },
  );
}
