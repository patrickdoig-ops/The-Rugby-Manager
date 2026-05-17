import type { MatchEngine } from '../engine/MatchEngine';
import { eventBus } from '../utils/eventBus';

export function initSimController(engine: MatchEngine): void {
  const btnPlay  = document.getElementById('btn-play')  as HTMLButtonElement;
  const btnPause = document.getElementById('btn-pause') as HTMLButtonElement;
  const slider   = document.getElementById('speed-slider') as HTMLInputElement;
  const speedDisplay = document.getElementById('speed-display')!;

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

  speedDisplay.textContent = `${slider.value}ms`;

  slider.addEventListener('input', () => {
    const ms = Number(slider.value);
    engine.setTickDelay(ms);
    speedDisplay.textContent = `${ms}ms`;
    eventBus.emit('ui:speedChange', { delayMs: ms });
  });

  eventBus.on('engine:finished', () => {
    btnPlay.disabled  = true;
    btnPause.disabled = true;
  });

  eventBus.on('engine:paused', () => {
    btnPause.disabled = true;
    btnPlay.disabled  = true;
  });

  eventBus.on('engine:resumed', () => {
    btnPlay.disabled  = true;
    btnPause.disabled = false;
  });
}
