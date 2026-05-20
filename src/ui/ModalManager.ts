import { eventBus } from '../utils/eventBus';
import type { PenaltyChoice, KickOffStrategy, PenaltyOffence } from '../types/engine';
import { renderTacticsMenu } from './TacticsMenu';
import { renderSubstitutionPanel } from './SubstitutionModal';

const OFFENCE_LABELS: Record<PenaltyOffence, string> = {
  breakdown_infringement: 'Breakdown infringement',
  scrum_infringement:     'Scrum infringement',
  high_tackle:            'High tackle',
};

const CHOICE_LABELS: Record<PenaltyChoice, string> = {
  kick_for_goal:     'Kick for goal',
  kick_to_touch:     'Kick to touch',
  tap_and_go:        'Tap and go',
  tap_and_kick_dead: 'Tap & kick dead',
};

const CHOICE_DESC: Record<PenaltyChoice, string> = {
  kick_for_goal:     'Attempt a penalty goal kick from this position.',
  kick_to_touch:     'Kick into touch to win a lineout near the opposition try-line.',
  tap_and_go:        'Tap the ball and continue play immediately from the mark.',
  tap_and_kick_dead: 'Tap and kick the ball into touch — ends the half/match immediately.',
};

const KICKOFF_LABELS: Record<KickOffStrategy, string> = {
  short_kick: 'Kick Short',
  grubber:    'Grubber Kick',
  high_ball:  'Kick Deep',
};

const KICKOFF_DESC: Record<KickOffStrategy, string> = {
  short_kick: 'Aggressive short kick just over the 10m line — chase hard and aim to regather.',
  grubber:    'Low, skidding kick along the ground to force a handling error.',
  high_ball:  'Deep kick with hang time — allow chasers to contest cleanly in the air.',
};

export function initModalManager(): void {
  const overlay = document.getElementById('modal-overlay')!;
  const box     = document.getElementById('modal-box')!;

  eventBus.on('engine:paused', ({ payload }) => {
    if (payload.type === 'kickoff_choice') {
      const { onChoice } = payload;
      box.innerHTML = `
        <h2 class="modal-title">Kick-Off Strategy</h2>
        <p class="modal-subtitle">Select how your team will restart play</p>
        <div class="modal-choices">
          ${(['short_kick', 'grubber', 'high_ball'] as KickOffStrategy[]).map(key => `
            <button class="modal-choice-btn" data-choice="${key}">
              <span class="choice-label">${KICKOFF_LABELS[key]}</span>
              <span class="choice-desc">${KICKOFF_DESC[key]}</span>
            </button>
          `).join('')}
        </div>
      `;
      overlay.classList.remove('hidden');
      box.querySelectorAll<HTMLButtonElement>('.modal-choice-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          overlay.classList.add('hidden');
          onChoice(btn.dataset.choice as KickOffStrategy);
        }, { once: true });
      });
      return;
    }

    if (payload.type !== 'penalty_choice') return;

    const { context, onChoice } = payload;
    const zone = context.inOpposition22 ? 'in the opposition 22' : 'in the opposition half';
    const offenceLabel = OFFENCE_LABELS[context.offence];

    const choices: PenaltyChoice[] = ['kick_for_goal', 'kick_to_touch', 'tap_and_go'];
    if (context.clockInTheRed) choices.push('tap_and_kick_dead');

    box.innerHTML = `
      <h2 class="modal-title">Penalty awarded</h2>
      <p class="modal-subtitle">${offenceLabel} — ${context.offenderPosition} ${context.offenderName}</p>
      <p class="modal-subtitle">${context.attackingSide === 'home' ? 'Home' : 'Away'} team — ${zone}</p>
      <div class="modal-choices">
        ${choices.map(key => `
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

  eventBus.on('ui:openTacticsModal', ({ tactics, teamId }) => {
    renderTacticsMenu(box, tactics, teamId, true, () => {
      overlay.classList.add('hidden');
      eventBus.emit('ui:tacticsClosed', {});
    });
    overlay.classList.remove('hidden');
  });

  eventBus.on('ui:openSubsModal', ({ team }) => {
    renderSubstitutionPanel(box, team);
    overlay.classList.remove('hidden');
  });

  eventBus.on('ui:subsClosed', () => {
    overlay.classList.add('hidden');
  });

  eventBus.on('engine:resumed', () => {
    overlay.classList.add('hidden');
  });
}
