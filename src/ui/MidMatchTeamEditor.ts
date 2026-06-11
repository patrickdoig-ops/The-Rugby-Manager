import type { Team } from '../types/team';
import { eventBus } from '../utils/eventBus';
import { shortName } from '../utils/playerName';
import { teamTextColor } from '../utils/teamColor';
import { SLOT_POSITION } from '../engine/balance';
import { showToast } from './Toast';

const BACK_ARROW = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" width="14" height="14"><path stroke-linecap="round" stroke-linejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18"/></svg>`;

export function renderMidMatchTeamEditor(
  container: HTMLElement,
  team: Team,
  offFieldPlayerIds: number[],
  onBack: () => void,
): void {
  const color = teamTextColor(team.color);
  // Sin-binned / sent-off / injured players are still in team.players (filtered
  // only by onFieldPlayers); excluding them here keeps the editor to genuine
  // on-field players, so a swap can't reassign which slot is off the pitch.
  const offField = new Set(offFieldPlayerIds);
  const onFieldPlayers = team.players.filter(p => !offField.has(p.id));

  // Draft tracks the slot ROLE each player is filling (keyed by their stable
  // squadNumber jersey) as swaps are queued — SLOT_POSITION[id], not the natural
  // `position`, so the preview matches what the engine shows after the id swap.
  const draft = new Map<number, string>(onFieldPlayers.map(p => [p.squadNumber, SLOT_POSITION[p.id] ?? p.position]));
  const swaps: Array<[number, number]> = [];
  let selectedSquadNum: number | null = null;

  function render(): void {
    const hasSwaps = swaps.length > 0;
    const fieldPlayers = [...onFieldPlayers].sort((a, b) => a.id - b.id);

    const fieldRows = fieldPlayers.map(p => {
      const isSelected = selectedSquadNum === p.squadNumber;
      const draftPos = draft.get(p.squadNumber) ?? p.position;
      const f = Math.round(p.fatiguePct);
      const barClass = f > 60 ? 'fatigue-ok' : f > 30 ? 'fatigue-warn' : 'fatigue-low';
      return `
        <button class="mte-player-btn${isSelected ? ' mte-selected' : ''}" data-squad="${p.squadNumber}">
          <span class="sub-num" style="color:${color}">${p.squadNumber}</span>
          <span class="sub-name">${shortName(p)}</span>
          <span class="sub-pos">${draftPos}</span>
          <div class="sub-fatigue-bar-bg">
            <div class="fatigue-bar ${barClass}" style="width:${f}%"></div>
          </div>
        </button>`;
    }).join('');

    const benchRows = team.bench.map(p => `
      <div class="mte-bench-row">
        <span class="sub-num" style="color:${color}">${p.squadNumber}</span>
        <span class="sub-name">${shortName(p)}</span>
        <span class="sub-pos">${p.position}</span>
      </div>`).join('');

    container.innerHTML = `
      <div class="mte-header">
        <button class="mte-back-btn" id="mte-back" aria-label="Back to substitutions">${BACK_ARROW}</button>
        <div class="mte-header-center">
          <h2 class="mte-title">Edit Team</h2>
          <p class="mte-subtitle">${team.name}</p>
        </div>
        <button class="pm-edit-squad${hasSwaps ? ' mte-confirm-active' : ''}" id="mte-confirm">${hasSwaps ? 'Confirm' : 'Done'}</button>
      </div>
      <div class="sub-section-label">On field — tap two players to swap positions</div>
      <div id="mte-field-list">${fieldRows}</div>
      ${team.bench.length > 0 ? `
        <div class="sub-section-label">Bench</div>
        <div id="mte-bench-list">${benchRows}</div>
      ` : ''}
    `;

    container.querySelector('#mte-back')!.addEventListener('click', onBack, { once: true });

    container.querySelector('#mte-confirm')!.addEventListener('click', () => {
      if (hasSwaps) {
        for (const [sq1, sq2] of swaps) {
          eventBus.emit('ui:positionSwap', { squadNum1: sq1, squadNum2: sq2 });
        }
        showToast(`${swaps.length} position swap${swaps.length === 1 ? '' : 's'} applied`);
      }
      onBack();
    }, { once: true });

    container.querySelectorAll<HTMLButtonElement>('.mte-player-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const sq = Number(btn.dataset.squad);
        if (selectedSquadNum === null) {
          selectedSquadNum = sq;
        } else if (selectedSquadNum === sq) {
          selectedSquadNum = null;
        } else {
          const sq1 = selectedSquadNum;
          const sq2 = sq;
          const pos1 = draft.get(sq1)!;
          const pos2 = draft.get(sq2)!;
          draft.set(sq1, pos2);
          draft.set(sq2, pos1);
          swaps.push([sq1, sq2]);
          selectedSquadNum = null;
        }
        render();
      });
    });
  }

  render();
}
