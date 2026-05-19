import type { MatchCoordinator } from '../engine/MatchCoordinator';
import { eventBus } from '../utils/eventBus';

let unsubs: Array<() => void> = [];

export function initSimController(engine: MatchCoordinator): void {
  // Re-init is per-match; clean up the previous match's eventBus subscriptions
  // so handlers don't drive a stale engine instance.
  for (const unsub of unsubs) unsub();
  unsubs = [];

  const btnPlay    = document.getElementById('btn-play')    as HTMLButtonElement;
  const btnPause   = document.getElementById('btn-pause')   as HTMLButtonElement;
  const btnTactics = document.getElementById('btn-tactics') as HTMLButtonElement;
  const btnSubs    = document.getElementById('btn-subs')    as HTMLButtonElement;
  const slider     = document.getElementById('speed-slider') as HTMLInputElement;
  const speedDisplay = document.getElementById('speed-display')!;

  // Reset button enabled-state — the previous match left Play disabled on finish.
  btnPlay.disabled    = false;
  btnPause.disabled   = true;
  btnTactics.disabled = false;
  btnSubs.disabled    = false;

  let wasPausedBeforeTactics = false;
  let wasPausedBeforeSubs    = false;

  btnPlay.onclick = () => {
    engine.start();
    btnPlay.disabled  = true;
    btnPause.disabled = false;
  };

  btnPause.onclick = () => {
    engine.pause();
    btnPlay.disabled  = false;
    btnPause.disabled = true;
  };

  btnTactics.onclick = () => {
    wasPausedBeforeTactics = !engine.getState().engine.isRunning;
    engine.pause();
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
    btnPlay.disabled    = false;
    btnPause.disabled   = true;
    btnSubs.disabled    = true;
    btnTactics.disabled = true;
    const side = engine.getHumanSide();
    const state = engine.getState();
    const team = side === 'home' ? state.homeTeam : state.awayTeam;
    eventBus.emit('ui:openSubsModal', { team });
  };

  speedDisplay.textContent = `${slider.value}ms`;

  slider.oninput = () => {
    const ms = Number(slider.value);
    engine.setTickDelay(ms);
    speedDisplay.textContent = `${ms}ms`;
    eventBus.emit('ui:speedChange', { delayMs: ms });
  };

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
    if (!wasPausedBeforeSubs) {
      engine.resume();
      btnPlay.disabled  = true;
      btnPause.disabled = false;
    } else {
      btnPlay.disabled  = false;
      btnPause.disabled = true;
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
