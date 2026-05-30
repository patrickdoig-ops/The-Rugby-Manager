import type { MatchCoordinator } from '../engine/MatchCoordinator';
import { eventBus } from '../utils/eventBus';
import {
  loadTickDelayMs, saveTickDelayMs,
  loadKeyMomentMode, saveKeyMomentMode, type KeyMomentMode,
} from './uiPrefs';
import { isAutoPauseEvent } from './keyMoment';

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
    eventBus.emit('ui:openTacticsModal', { tactics: team.tactics, teamId: side });
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

  // ─── Key-moment mode (off / slow / pause) ───
  const cogBtn  = document.getElementById('btn-auto-settings') as HTMLButtonElement;
  const popover = document.getElementById('auto-settings-popover') as HTMLDivElement;
  const kmRadios = Array.from(
    document.querySelectorAll<HTMLInputElement>('input[name="key-moment-mode"]'),
  );

  const initMode = loadKeyMomentMode();
  for (const r of kmRadios) r.checked = r.value === initMode;

  function closePopover(): void {
    popover.hidden = true;
    cogBtn.classList.remove('is-open');
    cogBtn.setAttribute('aria-expanded', 'false');
  }
  cogBtn.onclick = (e) => {
    e.stopPropagation();
    const open = !!popover.hidden;
    popover.hidden = !open;
    cogBtn.classList.toggle('is-open', open);
    cogBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
  };
  // popover lives in the persistent AppShell; initSimController runs once per
  // match, so register the removal on unsubs to avoid accumulating an
  // identical stopPropagation listener every match across a session.
  const stopProp = (e: Event): void => e.stopPropagation();
  popover.addEventListener('click', stopProp);
  unsubs.push(() => popover.removeEventListener('click', stopProp));
  const outsideClick = (): void => { if (!popover.hidden) closePopover(); };
  document.addEventListener('click', outsideClick);
  unsubs.push(() => document.removeEventListener('click', outsideClick));

  for (const r of kmRadios) {
    r.onchange = () => { if (r.checked) saveKeyMomentMode(r.value as KeyMomentMode); };
  }

  let slowTimeout: ReturnType<typeof setTimeout> | null = null;
  unsubs.push(() => {
    if (slowTimeout !== null) { clearTimeout(slowTimeout); slowTimeout = null; }
  });

  unsubs.push(eventBus.on('engine:event', ({ event }) => {
    if (!engine.getState().engine.isRunning) return;
    if (!isAutoPauseEvent(event)) return;
    const mode = kmRadios.find(r => r.checked)?.value ?? 'off';
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
