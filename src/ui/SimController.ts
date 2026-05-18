import type { MatchEngine } from '../engine/MatchEngine';
import { eventBus } from '../utils/eventBus';

export function initSimController(engine: MatchEngine): void {
  const btnPlay    = document.getElementById('btn-play')    as HTMLButtonElement;
  const btnPause   = document.getElementById('btn-pause')   as HTMLButtonElement;
  const btnTactics = document.getElementById('btn-tactics') as HTMLButtonElement;
  const btnSubs    = document.getElementById('btn-subs')    as HTMLButtonElement;
  const slider     = document.getElementById('speed-slider') as HTMLInputElement;
  const speedDisplay = document.getElementById('speed-display')!;

  let wasPausedBeforeTactics = false;
  let wasPausedBeforeSubs    = false;

  btnPlay.addEventListener('click', () => {
    engine.start();
    btnPlay.disabled  = true;
    btnPause.disabled = false;
  });

  btnPause.addEventListener('click', () => {
    engine.pause();
    btnPlay.disabled  = false;
    btnPause.disabled = true;
  });

  btnTactics.addEventListener('click', () => {
    wasPausedBeforeTactics = !engine.getState().isRunning;
    engine.pause();
    btnPlay.disabled    = false;
    btnPause.disabled   = true;
    btnTactics.disabled = true;
    eventBus.emit('ui:openTacticsModal', { tactics: engine.getState().homeTeam.tactics });
  });

  btnSubs.addEventListener('click', () => {
    wasPausedBeforeSubs = !engine.getState().isRunning;
    engine.pause();
    btnPlay.disabled    = false;
    btnPause.disabled   = true;
    btnSubs.disabled    = true;
    btnTactics.disabled = true;
    eventBus.emit('ui:openSubsModal', { homeTeam: engine.getState().homeTeam });
  });

  speedDisplay.textContent = `${slider.value}ms`;

  slider.addEventListener('input', () => {
    const ms = Number(slider.value);
    engine.setTickDelay(ms);
    speedDisplay.textContent = `${ms}ms`;
    eventBus.emit('ui:speedChange', { delayMs: ms });
  });

  eventBus.on('engine:finished', () => {
    btnPlay.disabled    = true;
    btnPause.disabled   = true;
    btnTactics.disabled = true;
    btnSubs.disabled    = true;
  });

  eventBus.on('engine:paused', () => {
    btnPause.disabled   = true;
    btnPlay.disabled    = true;
    btnTactics.disabled = true;
    btnSubs.disabled    = true;
  });

  eventBus.on('engine:resumed', () => {
    btnPlay.disabled    = true;
    btnPause.disabled   = false;
    btnTactics.disabled = false;
    btnSubs.disabled    = false;
  });

  eventBus.on('ui:tacticsClosed', () => {
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
  });

  eventBus.on('ui:subsClosed', () => {
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
  });
}
