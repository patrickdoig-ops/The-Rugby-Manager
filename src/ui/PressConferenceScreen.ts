// Post-match press conference overlay. Shown between the match-result
// dismissal and the round-results screen. The user answers 2 questions
// (or skips the entire conference), then onDone() continues the nav chain.

import type { Presser, PressAnswer, AnswerTone } from '../game/pressConference';

export interface PressChoices {
  skipped: boolean;
  answers: [AnswerTone | null, AnswerTone | null];
}

// Entry point — called from main.ts when shouldFirePresser() is true.
// `presser` is the built Presser; `onDone` receives the user's choices.
export function showPressConference(presser: Presser, onDone: (choices: PressChoices) => void): void {
  const el = document.getElementById('press-conference')!;

  let sel: [AnswerTone | null, AnswerTone | null] = [null, null];

  function render(): void {
    const [q1, q2] = presser.questions;
    const bothAnswered = sel[0] !== null && sel[1] !== null;

    el.innerHTML = `
      <div class="pc-panel">
        <div class="pc-header">
          <span class="pc-eyebrow">POST-MATCH</span>
          <span class="pc-title">Press Conference</span>
        </div>
        <div class="pc-scoreline">
          <span class="pc-club">${presser.clubName}</span>
          <span class="pc-score">${presser.myScore} – ${presser.oppScore}</span>
          <span class="pc-opp">${presser.oppName}</span>
        </div>
        <div class="pc-questions">
          ${renderQuestion(q1, 0, sel[0])}
          ${renderQuestion(q2, 1, sel[1])}
        </div>
        <div class="pc-footer">
          <button class="pc-publish-btn${bothAnswered ? '' : ' pc-publish-btn--disabled'}" id="pc-publish" ${bothAnswered ? '' : 'disabled'}>
            Publish &rarr;
          </button>
          <button class="pc-skip-btn" id="pc-skip">Skip press conference</button>
        </div>
      </div>
    `;

    el.querySelectorAll<HTMLButtonElement>('.pc-answer-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const qi = Number(btn.dataset.qi);
        const tone = btn.dataset.tone as AnswerTone;
        sel[qi] = tone;
        render();
      });
    });

    const publishBtn = document.getElementById('pc-publish') as HTMLButtonElement | null;
    if (publishBtn && bothAnswered) {
      publishBtn.addEventListener('click', () => {
        dismiss();
        onDone({ skipped: false, answers: sel });
      }, { once: true });
    }

    const skipBtn = document.getElementById('pc-skip') as HTMLButtonElement | null;
    if (skipBtn) {
      skipBtn.addEventListener('click', () => {
        dismiss();
        onDone({ skipped: true, answers: [null, null] });
      }, { once: true });
    }
  }

  function renderQuestion(q: Presser['questions'][number], qi: number, selected: AnswerTone | null): string {
    return `
      <div class="pc-question">
        <div class="pc-q-context">${q.context}</div>
        <div class="pc-q-text">&ldquo;${q.text}&rdquo;</div>
        <div class="pc-answers">
          ${q.answers.map(a => renderAnswer(a, qi, selected)).join('')}
        </div>
      </div>
    `;
  }

  function renderAnswer(a: PressAnswer, qi: number, selected: AnswerTone | null): string {
    const isSelected = a.tone === selected;
    const boardStr = a.boardDelta > 0 ? `+${a.boardDelta}` : String(a.boardDelta);
    const moraleStr = a.moraleDelta > 0 ? `+${a.moraleDelta}` : String(a.moraleDelta);
    const effects = a.boardDelta !== 0 || a.moraleDelta !== 0
      ? `<span class="pc-effects">${a.boardDelta !== 0 ? `Board ${boardStr}` : ''}${a.boardDelta !== 0 && a.moraleDelta !== 0 ? ' · ' : ''}${a.moraleDelta !== 0 ? `Morale ${moraleStr}` : ''}</span>`
      : `<span class="pc-effects pc-effects--neutral">No effect</span>`;
    return `
      <button class="pc-answer-btn${isSelected ? ' pc-answer-btn--selected' : ''}" data-qi="${qi}" data-tone="${a.tone}">
        <span class="pc-answer-label">${a.label}</span>
        <span class="pc-answer-text">${a.text}</span>
        ${effects}
      </button>
    `;
  }

  function dismiss(): void {
    el.classList.add('hidden');
  }

  el.classList.remove('hidden');
  render();
}
