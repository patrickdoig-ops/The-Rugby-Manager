import type { Team } from '../types/team';
import { eventBus } from '../utils/eventBus';

function ratingClass(r: number): string {
  if (r >= 7.5) return 'rating-high';
  if (r >= 5.5) return 'rating-mid';
  if (r >= 3.5) return 'rating-low';
  return 'rating-poor';
}

export function renderSubstitutionPanel(container: HTMLElement, homeTeam: Team): void {
  const { bench, players, color } = homeTeam;

  const benchRows = bench.length > 0
    ? bench.map(p => `
        <button class="sub-player-btn sub-bench-btn" data-squad="${p.squadNumber}">
          <span class="sub-num" style="color:${color}">${p.squadNumber}</span>
          <span class="sub-name">${p.name.split(' ').pop()}</span>
          <span class="sub-pos">${p.position}</span>
        </button>
      `).join('')
    : '<p class="sub-empty">No substitutes remaining.</p>';

  const starterRows = players.map(p => {
    const f = Math.round(p.fatiguePct);
    const barClass = f > 60 ? 'fatigue-ok' : f > 30 ? 'fatigue-warn' : 'fatigue-low';
    const rClass   = ratingClass(p.rating);
    return `
      <button class="sub-player-btn sub-starter-btn" data-squad="${p.squadNumber}">
        <span class="sub-num" style="color:${color}">${p.squadNumber}</span>
        <span class="sub-name">${p.name.split(' ').pop()}</span>
        <div class="sub-fatigue-bar-bg">
          <div class="fatigue-bar ${barClass}" style="width:${f}%"></div>
        </div>
        <span class="rating-badge ${rClass}">${p.rating.toFixed(1)}</span>
      </button>
    `;
  }).join('');

  container.innerHTML = `
    <h2 class="modal-title">Substitutions</h2>
    <p class="modal-subtitle">${homeTeam.name}</p>
    <div class="sub-section-label">Bench — select incoming player</div>
    <div id="sub-bench-list">${benchRows}</div>
    ${bench.length > 0 ? `
      <div class="sub-section-label">On field — select player to replace</div>
      <div id="sub-starter-list">${starterRows}</div>
    ` : ''}
    <button id="btn-subs-cancel" class="modal-choice-btn sub-cancel-btn">Cancel</button>
  `;

  let selectedBenchSquadNum: number | null = null;

  container.querySelectorAll<HTMLButtonElement>('.sub-bench-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedBenchSquadNum = Number(btn.dataset.squad);
      container.querySelectorAll('.sub-bench-btn').forEach(b => b.classList.remove('sub-selected'));
      btn.classList.add('sub-selected');
    });
  });

  container.querySelectorAll<HTMLButtonElement>('.sub-starter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (selectedBenchSquadNum === null) return;
      eventBus.emit('ui:substitution', {
        benchSquadNum: selectedBenchSquadNum,
        fieldSquadNum: Number(btn.dataset.squad),
      });
      eventBus.emit('ui:subsClosed', {});
    });
  });

  container.querySelector('#btn-subs-cancel')!.addEventListener('click', () => {
    eventBus.emit('ui:subsClosed', {});
  });
}
