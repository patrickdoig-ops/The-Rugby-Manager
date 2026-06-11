// Shared help overlay (.rm-help-*, styled in style/help.css). A single
// bottom-sheet/centred-card reused across the app — modelled on the
// discardConfirm singleton. openHelp(id) reads the topic from helpContent.ts
// and renders it; dismiss via the close button, a backdrop tap, or Escape.
//
// Pure UI — no engine/state dependency, so it is safe to open from any screen.

import { getHelpTopic, type HelpTopicId } from './helpContent';

const X_ICON = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>`;

let backdrop: HTMLElement | null = null;
let keyHandler: ((e: KeyboardEvent) => void) | null = null;

export function closeHelp(): void {
  if (keyHandler) {
    document.removeEventListener('keydown', keyHandler);
    keyHandler = null;
  }
  backdrop?.remove();
  backdrop = null;
}

export function openHelp(id: HelpTopicId): void {
  // Re-opening replaces any existing sheet (e.g. a stray double-tap).
  closeHelp();
  const topic = getHelpTopic(id);

  backdrop = document.createElement('div');
  backdrop.className = 'rm-help-backdrop';
  backdrop.innerHTML = `
    <div class="rm-help-sheet" role="dialog" aria-modal="true" aria-label="${topic.title} help">
      <div class="rm-help-head">
        <div class="rm-help-headings">
          <span class="rm-help-eyebrow">Help</span>
          <h2 class="rm-help-title">${topic.title}</h2>
        </div>
        <button class="rm-help-close" type="button" aria-label="Close help">${X_ICON}</button>
      </div>
      <div class="rm-help-scroll">
        <p class="rm-help-purpose">${topic.purpose}</p>
        ${topic.features.length ? `
          <div class="rm-help-section">
            <h3 class="rm-help-section-title">On this screen</h3>
            <ul class="rm-help-features">
              ${topic.features.map(f => `
                <li>
                  <span class="rm-help-feat-label">${f.label}</span>
                  <span class="rm-help-feat-desc">${f.desc}</span>
                </li>`).join('')}
            </ul>
          </div>` : ''}
        ${topic.tips && topic.tips.length ? `
          <div class="rm-help-section">
            <h3 class="rm-help-section-title">Tips</h3>
            <ul class="rm-help-tips">
              ${topic.tips.map(t => `<li>${t}</li>`).join('')}
            </ul>
          </div>` : ''}
      </div>
    </div>`;
  document.body.appendChild(backdrop);

  backdrop.querySelector<HTMLButtonElement>('.rm-help-close')!.addEventListener('click', closeHelp);
  backdrop.addEventListener('click', e => { if (e.target === backdrop) closeHelp(); });
  keyHandler = e => { if (e.key === 'Escape') closeHelp(); };
  document.addEventListener('keydown', keyHandler);
}
