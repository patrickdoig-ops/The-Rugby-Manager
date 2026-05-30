import type { MatchCoordinator } from '../engine/MatchCoordinator';
import { eventBus } from '../utils/eventBus';
import { loadTickDelayMs, saveTickDelayMs, loadKeyMomentMode } from './uiPrefs';
import { isAutoPauseEvent } from './keyMoment';
import { renderMatchSettingsPanel } from './MatchSettingsPanel';

let unsubs: Array<() => void> = [];

const SLOW_MS          = 2500;  // 1× preset
const SLOW_DURATION_MS = 5000;  // ~2 ticks at 1×; plenty for a commentary beat

export function initSimController(engine: MatchCoordinator): void {
  // Re-init is per-match; clean up the previous match's eventBus subscriptions
  // so handlers don't drive a stale engine instance.
  for (const unsub of unsubs) unsub();
  unsubs = [];

  const btnPlay    = document.getElementById('btn-play')    as HTMLButtonElement;
  const btnPause   = document.getElementById('btn-pause')   as HTMLButtonElement;
  const btnTactics = document.getElementById('btn-tactics') as HTMLButtonElement;
  const btnSubs    = document.getElementById('btn-subs')    as HTMLButtonElement;
  const subsBadge  = document.getElementById('subs-badge')  as HTMLSpanElement;
  const speedBtns  = Array.from(document.querySelectorAll<HTMLButtonElement>('.speed-btn'));

  // Reset button enabled-state — the previous match left Play disabled on finish.
  btnPlay.disabled    = false;
  btnPause.disabled   = true;
  btnTactics.disabled = false;
  btnSubs.disabled    = false;

  let wasPausedBeforeTactics = false;
  let wasPausedBeforeSubs    = false;

  btnPlay.onclick = () => {
    engine.resume();
    btnPlay.disabled  = true;
    btnPause.disabled = false;
  };

  btnPause.onclick = () => {
    engine.pause();
    eventBus.emit('ui:matchPaused', {});
    btnPlay.disabled  = false;
    btnPause.disabled = true;
  };

  btnTactics.onclick = () => {
    wasPausedBeforeTactics = !engine.getState().engine.isRunning;
    engine.pause();
    eventBus.emit('ui:matchPaused', {});
    btnPlay.disabled    = false;
    btnPause.disabled   = true;
    btnTactics.disabled = true;
    const side = engine.getHumanSide();
    const state = engine.getState();
    const team = side === 'home' ? state.homeTeam : state.awayTeam;
    const oppTeam = side === 'home' ? state.awayTeam : state.homeTeam;
    eventBus.emit('ui:openTacticsModal', { tactics: team.tactics, teamId: side, oppTactics: oppTeam.tactics });
  };

  btnSubs.onclick = () => {
    wasPausedBeforeSubs = !engine.getState().engine.isRunning;
    engine.pause();
    eventBus.emit('ui:matchPaused', {});
    btnPlay.disabled    = false;
    btnPause.disabled   = true;
    btnSubs.disabled    = true;
    btnTactics.disabled = true;
    const side = engine.getHumanSide();
    const state = engine.getState();
    const team = side === 'home' ? state.homeTeam : state.awayTeam;
    eventBus.emit('ui:openSubsModal', { team });
  };

  // Sync the speed presets to the persisted preference on every match start.
  // Map the saved ms to the closest preset; if none matches, default to 1×.
  function applySpeed(ms: number): void {
    speedBtns.forEach(b => b.classList.toggle('speed-btn--active', Number(b.dataset.ms) === ms));
    engine.setTickDelay(ms);
    saveTickDelayMs(ms);
    eventBus.emit('ui:speedChange', { delayMs: ms });
  }

  const savedMs = loadTickDelayMs();
  const presetMs = speedBtns.some(b => Number(b.dataset.ms) === savedMs)
    ? savedMs
    : 1500;
  applySpeed(presetMs);

  speedBtns.forEach(btn => {
    btn.addEventListener('click', () => applySpeed(Number(btn.dataset.ms)));
  });

  function updateSubsBadge(n: number): void {
    if (!subsBadge) return;
    subsBadge.textContent = String(n);
    subsBadge.hidden = n === 0;
  }

  function syncSubsBadge(): void {
    const side = engine.getHumanSide();
    const state = engine.getState();
    const team = side === 'home' ? state.homeTeam : state.awayTeam;
    updateSubsBadge(team.substitutedOff.length);
  }

  syncSubsBadge();

  unsubs.push(eventBus.on('engine:finished', () => {
    btnPlay.disabled    = true;
    btnPause.disabled   = true;
    btnTactics.disabled = true;
    btnSubs.disabled    = true;
    closeSettings();
  }));

  unsubs.push(eventBus.on('engine:paused', () => {
    btnPause.disabled   = true;
    btnPlay.disabled    = true;
    btnTactics.disabled = true;
    btnSubs.disabled    = true;
  }));

  unsubs.push(eventBus.on('engine:resumed', () => {
    btnPlay.disabled    = true;
    btnPause.disabled   = false;
    btnTactics.disabled = false;
    btnSubs.disabled    = false;
  }));

  // Half-time auto-pause: engine stopped itself, user must press Play to
  // start the second half. Distinct from engine:paused (modal hand-off)
  // because the user keeps full control of Play / Pause / Tactics / Subs.
  unsubs.push(eventBus.on('engine:autoPaused', () => {
    btnPlay.disabled    = false;
    btnPause.disabled   = true;
    btnTactics.disabled = false;
    btnSubs.disabled    = false;
  }));

  unsubs.push(eventBus.on('ui:tacticsClosed', () => {
    btnTactics.disabled = false;
    btnSubs.disabled    = false;
    if (!wasPausedBeforeTactics) {
      engine.resume();
      btnPlay.disabled  = true;
      btnPause.disabled = false;
    } else {
      btnPlay.disabled  = false;
      btnPause.disabled = true;
    }
  }));

  unsubs.push(eventBus.on('ui:subsClosed', () => {
    btnSubs.disabled    = false;
    btnTactics.disabled = false;
    syncSubsBadge();
    if (!wasPausedBeforeSubs) {
      engine.resume();
      btnPlay.disabled  = true;
      btnPause.disabled = false;
    } else {
      btnPlay.disabled  = false;
      btnPause.disabled = true;
    }
  }));

  unsubs.push(eventBus.on('engine:stateChange', () => syncSubsBadge()));

  // ─── Settings overlay ───
  const cogBtn         = document.getElementById('btn-auto-settings') as HTMLButtonElement;
  const settingsOverlay = document.getElementById('match-settings-overlay') as HTMLDivElement;

  function openSettings(): void {
    renderMatchSettingsPanel(settingsOverlay, closeSettings);
    settingsOverlay.classList.remove('hidden');
    cogBtn.classList.add('is-open');
    cogBtn.setAttribute('aria-expanded', 'true');
  }
  function closeSettings(): void {
    settingsOverlay.classList.add('hidden');
    cogBtn.classList.remove('is-open');
    cogBtn.setAttribute('aria-expanded', 'false');
  }

  cogBtn.onclick = (e) => {
    e.stopPropagation();
    if (settingsOverlay.classList.contains('hidden')) openSettings();
    else closeSettings();
  };
  // Close when tapping the backdrop (the overlay itself, not the sheet inside it).
  const backdropClick = (e: MouseEvent) => {
    if (e.target === settingsOverlay) closeSettings();
  };
  settingsOverlay.addEventListener('click', backdropClick);
  unsubs.push(() => settingsOverlay.removeEventListener('click', backdropClick));

  let slowTimeout: ReturnType<typeof setTimeout> | null = null;
  unsubs.push(() => {
    if (slowTimeout !== null) { clearTimeout(slowTimeout); slowTimeout = null; }
  });

  unsubs.push(eventBus.on('engine:event', ({ event }) => {
    if (!engine.getState().engine.isRunning) return;
    if (!isAutoPauseEvent(event)) return;
    const mode = loadKeyMomentMode();
    if (mode === 'pause') {
      engine.pause();
      btnPlay.disabled  = false;
      btnPause.disabled = true;
      return;
    }
    if (mode === 'slow') {
      if (slowTimeout !== null) clearTimeout(slowTimeout);
      engine.setTickDelay(SLOW_MS);
      slowTimeout = setTimeout(() => {
        slowTimeout = null;
        if (engine.getState().engine.tickDelayMs === SLOW_MS) {
          engine.setTickDelay(loadTickDelayMs());
        }
      }, SLOW_DURATION_MS);
    }
  }));

  const views = ['dashboard', 'commentary', 'stats', 'players'] as const;
  const viewBtns = views.map(v => document.getElementById(`btn-view-${v}`) as HTMLButtonElement);
  const panelBottom = document.getElementById('panel-bottom')!;

  viewBtns.forEach((btn, i) => {
    btn.onclick = () => {
      viewBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      panelBottom.className = `view-${views[i]}`;
    };
  });
}
