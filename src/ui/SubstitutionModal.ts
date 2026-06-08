import type { Team } from '../types/team';
import type { Player } from '../types/player';
import { eventBus } from '../utils/eventBus';
import { shortName } from '../utils/playerName';
import { teamTextColor } from '../utils/teamColor';
import { showToast } from './Toast';
import { renderMidMatchTeamEditor } from './MidMatchTeamEditor';

type PendingSub = {
  benchSquadNum: number;
  fieldSquadNum: number;
  benchLabel: string;
  fieldLabel: string;
};

function ratingClass(r: number): string {
  if (r >= 7.5) return 'rating-high';
  if (r >= 5.5) return 'rating-mid';
  if (r >= 3.5) return 'rating-low';
  return 'rating-poor';
}

export function renderSubstitutionPanel(container: HTMLElement, team: Team, offFieldPlayerIds: number[] = []): void {
  const offField = new Set(offFieldPlayerIds);
  const color = teamTextColor(team.color);
  const pendingSubs: PendingSub[] = [];
  let selectedBenchSquadNum: number | null = null;

  function render(): void {
    const pendingBenchNums = new Set(pendingSubs.map(s => s.benchSquadNum));
    const pendingFieldNums = new Set(pendingSubs.map(s => s.fieldSquadNum));

    const availBench = team.bench.filter(p => !pendingBenchNums.has(p.squadNumber));
    const availField = team.players.filter(p => !pendingFieldNums.has(p.squadNumber) && !offField.has(p.id));

    const benchRows = availBench.length > 0
      ? availBench.map(p => {
          const isSelected = selectedBenchSquadNum === p.squadNumber;
          return `
            <button class="sub-player-btn sub-bench-btn${isSelected ? ' sub-selected' : ''}" data-squad="${p.squadNumber}">
              <span class="sub-num" style="color:${color}">${p.squadNumber}</span>
              <span class="sub-name">${shortName(p)}</span>
              <span class="sub-pos">${p.position}</span>
            </button>`;
        }).join('')
      : '<p class="sub-empty">No substitutes remaining.</p>';

    const starterRows = availField.map(p => {
      const f = Math.round(p.fatiguePct);
      const barClass = f > 60 ? 'fatigue-ok' : f > 30 ? 'fatigue-warn' : 'fatigue-low';
      const rClass = ratingClass(p.rating);
      return `
        <button class="sub-player-btn sub-starter-btn" data-squad="${p.squadNumber}">
          <span class="sub-num" style="color:${color}">${p.squadNumber}</span>
          <span class="sub-name">${shortName(p)}</span>
          <div class="sub-fatigue-bar-bg">
            <div class="fatigue-bar ${barClass}" style="width:${f}%"></div>
          </div>
          <span class="rating-badge ${rClass}">${p.rating.toFixed(1)}</span>
        </button>`;
    }).join('');

    const xIcon = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" width="12" height="12" aria-hidden="true" style="pointer-events:none"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>`;

    const pendingHtml = pendingSubs.length > 0
      ? `<div class="sub-section-label">Pending</div>
         <div id="sub-pending-list">
           ${pendingSubs.map((s, i) => `
             <div class="sub-pending-row">
               <span class="sub-pending-text">${s.benchLabel} <span class="sub-pending-arrow">→</span> ${s.fieldLabel}</span>
               <button class="sub-pending-remove" data-idx="${i}" aria-label="Remove">${xIcon}</button>
             </div>`).join('')}
         </div>`
      : '';

    const confirmDisabled = pendingSubs.length === 0 ? ' disabled' : '';

    container.innerHTML = `
      <div class="sub-topbar">
        <div>
          <h2 class="modal-title">Substitutions</h2>
          <p class="modal-subtitle">${team.name}</p>
        </div>
        <button class="pm-edit-squad" id="sub-edit-team">Edit Team</button>
      </div>
      ${pendingHtml}
      <div class="sub-section-label">Bench — select incoming player</div>
      <div id="sub-bench-list">${benchRows}</div>
      ${availBench.length > 0 ? `
        <div class="sub-section-label">On field — select player to replace</div>
        <div id="sub-starter-list">${starterRows}</div>
      ` : ''}
      <div class="sub-action-row">
        <button id="btn-subs-cancel" class="sub-action-btn sub-action-cancel">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" width="16" height="16" aria-hidden="true" style="pointer-events:none"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
          <span>Cancel</span>
        </button>
        <button id="btn-subs-confirm" class="sub-action-btn sub-action-confirm"${confirmDisabled}>
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" width="16" height="16" aria-hidden="true" style="pointer-events:none"><path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
          <span>Confirm</span>
        </button>
      </div>
    `;

    container.querySelectorAll<HTMLButtonElement>('.sub-bench-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const sq = Number(btn.dataset.squad);
        selectedBenchSquadNum = selectedBenchSquadNum === sq ? null : sq;
        render();
      });
    });

    if (selectedBenchSquadNum !== null) {
      container.querySelectorAll<HTMLButtonElement>('.sub-starter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const fieldSq = Number(btn.dataset.squad);
          const benchPlayer = team.bench.find(p => p.squadNumber === selectedBenchSquadNum);
          const fieldPlayer = team.players.find(p => p.squadNumber === fieldSq);
          if (!benchPlayer || !fieldPlayer) return;
          pendingSubs.push({
            benchSquadNum: benchPlayer.squadNumber,
            fieldSquadNum: fieldPlayer.squadNumber,
            benchLabel: `${shortName(benchPlayer)} (${benchPlayer.squadNumber})`,
            fieldLabel: `${shortName(fieldPlayer)} (${fieldPlayer.squadNumber})`,
          });
          selectedBenchSquadNum = null;
          render();
        });
      });
    }

    container.querySelectorAll<HTMLButtonElement>('.sub-pending-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        pendingSubs.splice(Number(btn.dataset.idx), 1);
        render();
      });
    });

    container.querySelector<HTMLButtonElement>('#sub-edit-team')!.addEventListener('click', () => {
      renderMidMatchTeamEditor(container, team, () => renderSubstitutionPanel(container, team, offFieldPlayerIds));
    }, { once: true });

    container.querySelector('#btn-subs-cancel')!.addEventListener('click', () => {
      eventBus.emit('ui:subsClosed', {});
    });

    container.querySelector('#btn-subs-confirm')!.addEventListener('click', () => {
      if (pendingSubs.length === 0) return;

      // FLIP first: snapshot row positions before the swap.
      const beforePositions = new Map<number, DOMRect>();
      for (const sub of pendingSubs) {
        const benchRow = document.querySelector<HTMLElement>(`.pm-player-row[data-squad="${sub.benchSquadNum}"]`);
        const fieldRow = document.querySelector<HTMLElement>(`.pm-player-row[data-squad="${sub.fieldSquadNum}"]`);
        if (benchRow) beforePositions.set(sub.benchSquadNum, benchRow.getBoundingClientRect());
        if (fieldRow) beforePositions.set(sub.fieldSquadNum, fieldRow.getBoundingClientRect());
      }

      const count = pendingSubs.length;
      for (const s of pendingSubs) {
        eventBus.emit('ui:substitution', { benchSquadNum: s.benchSquadNum, fieldSquadNum: s.fieldSquadNum });
      }
      showToast(`${count} substitution${count === 1 ? '' : 's'} made`);
      eventBus.emit('ui:subsClosed', {});

      // FLIP last: after the parent re-renders, animate rows from old → new.
      requestAnimationFrame(() => {
        for (const [squadNum, oldRect] of beforePositions) {
          const row = document.querySelector<HTMLElement>(`.pm-player-row[data-squad="${squadNum}"]`);
          if (!row) continue;
          const newRect = row.getBoundingClientRect();
          const dy = oldRect.top - newRect.top;
          if (Math.abs(dy) < 4) continue;
          row.style.transform = `translateY(${dy}px)`;
          row.style.transition = 'none';
          void row.offsetHeight;
          row.style.transition = 'transform 320ms cubic-bezier(0.22, 1, 0.36, 1)';
          row.style.transform = 'translateY(0)';
          setTimeout(() => {
            row.style.transition = '';
            row.style.transform = '';
          }, 380);
        }
      });
    });
  }

  render();
}

// Forced replacement panel shown when a red_20 player's 20 minutes are up
// or when a player picks up an injury. `reason` only drives the title +
// subtitle copy — the picking flow is identical. onChoice receives the
// chosen bench squadNumber, or null if the manager skips (e.g. wants to
// play short).
export function renderForcedSubstitutionPanel(
  container: HTMLElement,
  sentOff: Player,
  bench: Player[],
  reason: 'red_20' | 'injury',
  onChoice: (benchSquadNum: number | null) => void,
): void {
  const benchRows = bench.length > 0
    ? bench.map(p => `
        <button class="sub-player-btn sub-bench-btn" data-squad="${p.squadNumber}">
          <span class="sub-num">${p.squadNumber}</span>
          <span class="sub-name">${shortName(p)}</span>
          <span class="sub-pos">${p.position}</span>
        </button>`).join('')
    : '<p class="sub-empty">No substitutes available.</p>';

  const title = reason === 'injury' ? 'Injury replacement' : 'Replacement required';
  const subtitle = reason === 'injury'
    ? `${shortName(sentOff)} (${sentOff.position}) is off injured`
    : `${shortName(sentOff)} (${sentOff.position}) — 20-minute red has expired`;

  container.innerHTML = `
    <h2 class="modal-title">${title}</h2>
    <p class="modal-subtitle">${subtitle}</p>
    <div class="sub-section-label">Bench — select replacement</div>
    <div id="sub-bench-list">${benchRows}</div>
    <div class="sub-action-row">
      <button id="btn-subs-skip" class="sub-action-btn sub-action-cancel">
        <span>Play short</span>
      </button>
    </div>
  `;

  container.querySelectorAll<HTMLButtonElement>('.sub-bench-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      showToast(`${shortName(sentOff)} replaced`);
      onChoice(Number(btn.dataset.squad));
    }, { once: true });
  });
  container.querySelector('#btn-subs-skip')!.addEventListener('click', () => {
    showToast('Playing short', 'info');
    onChoice(null);
  }, { once: true });
}
