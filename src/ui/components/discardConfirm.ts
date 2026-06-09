// Discard-changes confirmation bottom-sheet. Reuses the SquadManagement
// (.sq-discard-*) styling so every edit screen that can be left with unsaved
// changes shows the same sheet and messaging. Resolves true to discard
// (leave), false to keep editing.

const X_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>`;
const TRASH_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z"/></svg>`;

export function discardConfirm(body: string): Promise<boolean> {
  return new Promise(resolve => {
    const backdrop = document.createElement('div');
    backdrop.className = 'sq-discard-backdrop';
    backdrop.innerHTML = `
      <div class="sq-discard" role="dialog" aria-modal="true">
        <div class="sq-discard-title">Discard changes?</div>
        <div class="sq-discard-body">${body}</div>
        <div class="sq-discard-actions">
          <button class="sq-discard-btn sq-discard-cancel" type="button">${X_ICON} Keep editing</button>
          <button class="sq-discard-btn sq-discard-confirm" type="button">${TRASH_ICON} Discard</button>
        </div>
      </div>`;
    document.body.appendChild(backdrop);

    const close = (result: boolean): void => { backdrop.remove(); resolve(result); };
    backdrop.querySelector<HTMLButtonElement>('.sq-discard-cancel')!.addEventListener('click', () => close(false));
    backdrop.querySelector<HTMLButtonElement>('.sq-discard-confirm')!.addEventListener('click', () => close(true));
    backdrop.addEventListener('click', e => { if (e.target === backdrop) close(false); });
  });
}
