// Renders a copy-pastable error block when MatchCoordinator.tick() throws
// in live mode. Without this, an uncaught tick exception silently freezes
// the UI mid-match. Initialised once at startup; the overlay element is
// created lazily on the first engine:error.

import { eventBus } from '../utils/eventBus';

export function initCrashOverlay(): void {
  eventBus.on('engine:error', (data) => {
    const body = [
      `Match crashed at ${data.clockMinute.toFixed(1)}' in phase ${data.phase}`,
      `Score: home ${data.score.home} - away ${data.score.away} (possession: ${data.possession})`,
      ``,
      `Error: ${data.message}`,
      ``,
      `Last events:`,
      ...data.lastEvents.map(e => `  ${e}`),
      ``,
      `Stack:`,
      data.stack,
    ].join('\n');

    const overlay = document.createElement('div');
    overlay.className = 'crash-overlay';
    overlay.innerHTML = `
      <div class="crash-overlay-panel">
        <div class="crash-overlay-title">Match engine crashed</div>
        <pre class="crash-overlay-body"></pre>
        <div class="crash-overlay-actions">
          <button class="crash-overlay-copy">Copy</button>
          <button class="crash-overlay-dismiss">Dismiss</button>
        </div>
      </div>
    `;
    const pre = overlay.querySelector('.crash-overlay-body') as HTMLPreElement;
    pre.textContent = body;
    const copyBtn = overlay.querySelector('.crash-overlay-copy') as HTMLButtonElement;
    copyBtn.addEventListener('click', () => {
      navigator.clipboard?.writeText(body).then(
        () => { copyBtn.textContent = 'Copied'; },
        () => { copyBtn.textContent = 'Copy failed — select and copy manually'; },
      );
    });
    const dismissBtn = overlay.querySelector('.crash-overlay-dismiss') as HTMLButtonElement;
    dismissBtn.addEventListener('click', () => overlay.remove());
    document.body.appendChild(overlay);
  });
}
