import { eventBus } from '../utils/eventBus';
import type { PenaltyChoice } from '../types/engine';
import { renderTacticsMenu } from './TacticsMenu';

const CHOICE_LABELS: Record<PenaltyChoice, string> = {
  kick_for_goal: '⚽ Kick for Goal (3 pts)',
  kick_to_touch: '📐 Kick to Touch (Lineout)',
  tap_and_go:    '🏃 Tap & Go (Run it!)',
};

const CHOICE_DESC: Record<PenaltyChoice, string> = {
  kick_for_goal: 'Attempt a penalty goal kick from this position.',
  kick_to_touch: 'Kick into touch to win a lineout near the opposition try-line.',
  tap_and_go:    'Tap the ball and continue play immediately from the mark.',
};

export function initModalManager(): void {
  const overlay = document.getElementById('modal-overlay')!;
  const box     = document.getElementById('modal-box')!;

  eventBus.on('engine:paused', ({ payload }) => {
    if (payload.type !== 'penalty_choice') return;

    const { context, onChoice } = payload;
    const zone = context.attackingSide === 'home'
      ? `${Math.round(100 - context.ballX)}m from touch`
      : `${Math.round(context.ballX)}m from touch`;

    box.innerHTML = `
      <h2 class="modal-title">🟡 Penalty Awarded!</h2>
      <p class="modal-subtitle">${context.attackingSide === 'home' ? 'Home' : 'Away'} team — ${zone} in opposition 22</p>
      <div class="modal-choices">
        ${(['kick_for_goal', 'kick_to_touch', 'tap_and_go'] as PenaltyChoice[]).map(key => `
          <button class="modal-choice-btn" data-choice="${key}">
            <span class="choice-label">${CHOICE_LABELS[key]}</span>
            <span class="choice-desc">${CHOICE_DESC[key]}</span>
          </button>
        `).join('')}
      </div>
    `;

    overlay.classList.remove('hidden');

    const buttons = box.querySelectorAll<HTMLButtonElement>('.modal-choice-btn');
    buttons.forEach(btn => {
      btn.addEventListener('click', () => {
        overlay.classList.add('hidden');
        onChoice(btn.dataset.choice as PenaltyChoice);
      }, { once: true });
    });
  });

  eventBus.on('ui:openTacticsModal', ({ tactics }) => {
    renderTacticsMenu(box, tactics, true, () => {
      overlay.classList.add('hidden');
      eventBus.emit('engine:resumed', {});
    });
    overlay.classList.remove('hidden');
  });

  eventBus.on('engine:resumed', () => {
    overlay.classList.add('hidden');
  });
}

