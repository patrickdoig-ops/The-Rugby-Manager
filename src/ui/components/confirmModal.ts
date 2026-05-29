// Generic bottom-sheet confirmation dialog. Resolves true on confirm, false on
// cancel / backdrop tap. Styling lives in style/saves.css (.rm-confirm-*),
// loaded by main.ts. Used by the Saves screen for delete / overwrite prompts.

export interface ConfirmOptions {
  title: string;
  body: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

function checkIcon(): string {
  return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m4.5 12.75 6 6 9-13.5"/></svg>`;
}
function xIcon(): string {
  return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>`;
}

export function confirmModal(opts: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    const backdrop = document.createElement('div');
    backdrop.className = 'rm-confirm-backdrop';
    backdrop.innerHTML = `
      <div class="rm-confirm" role="dialog" aria-modal="true">
        <div class="rm-confirm-handle"></div>
        <div class="rm-confirm-title">${opts.title}</div>
        <div class="rm-confirm-body">${opts.body}</div>
        <div class="rm-confirm-actions">
          <button class="rm-confirm-btn rm-confirm-cancel" type="button">
            ${xIcon()} ${opts.cancelLabel ?? 'Cancel'}
          </button>
          <button class="rm-confirm-btn rm-confirm-proceed${opts.danger ? ' rm-confirm-danger' : ''}" type="button">
            ${checkIcon()} ${opts.confirmLabel ?? 'Confirm'}
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(backdrop);

    const close = (result: boolean): void => {
      backdrop.remove();
      resolve(result);
    };
    backdrop.querySelector<HTMLButtonElement>('.rm-confirm-cancel')!
      .addEventListener('click', () => close(false));
    backdrop.querySelector<HTMLButtonElement>('.rm-confirm-proceed')!
      .addEventListener('click', () => close(true));
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) close(false);
    });
  });
}
