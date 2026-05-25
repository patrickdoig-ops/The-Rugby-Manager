// Shared toast pill. Pinned bottom-centre via `var(--safe-bottom)`, slides up,
// auto-dismisses at 1.8s, tap to dismiss early. One element reused across
// screens; subsequent calls re-anchor the existing node and reset the timer.

let toastEl: HTMLElement | null = null;
let dismissTimer: number | null = null;

export type ToastVariant = 'success' | 'info' | 'danger';

export function showToast(message: string, variant: ToastVariant = 'success'): void {
  if (!toastEl) {
    toastEl = document.createElement('div');
    toastEl.id = 'rm-toast';
    document.body.appendChild(toastEl);
  }
  toastEl.className = `rm-toast rm-toast--${variant}`;
  toastEl.textContent = message;
  // Force a reflow so the `visible` modifier always triggers the transition,
  // even when the same toast is shown twice in quick succession.
  void toastEl.offsetWidth;
  toastEl.classList.add('rm-toast--visible');

  if (dismissTimer !== null) window.clearTimeout(dismissTimer);
  dismissTimer = window.setTimeout(() => {
    toastEl?.classList.remove('rm-toast--visible');
    dismissTimer = null;
  }, 1800);

  toastEl.onclick = () => {
    if (dismissTimer !== null) {
      window.clearTimeout(dismissTimer);
      dismissTimer = null;
    }
    toastEl?.classList.remove('rm-toast--visible');
  };
}
