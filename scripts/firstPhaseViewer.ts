import '../style/main.css';
import '../style/commentary.css';

import { eventBus } from '../src/utils/eventBus';
import { initPitchView } from '../src/ui/PitchView';
import { MatchCoordinator } from '../src/engine/MatchCoordinator';
import type { RawTeamInput } from '../src/types/teamData';

import harlequinsRaw from '../src/data/team-harlequins.json';
import bristolRaw from '../src/data/team-bristol.json';
import { MatchPhase } from '../src/types/engine';

initPitchView();

let currentEngine: MatchCoordinator | null = null;
const btnTrigger = document.getElementById('btn-trigger') as HTMLButtonElement;
const selectPlay = document.getElementById('play-select') as HTMLSelectElement;
const statusText = document.getElementById('status') as HTMLSpanElement;

// Auto-answer prompts to keep the engine running automatically
eventBus.on('engine:paused', ({ payload }) => {
  const p = payload as { type: string; onChoice: (v: unknown) => void };
  if (!p || typeof p.onChoice !== 'function') return;
  switch (p.type) {
    case 'kickoff_choice':              p.onChoice('high_ball'); break;
    case 'penalty_choice':              p.onChoice('kick_to_touch'); break;
    case 'team_talk_choice':            p.onChoice({ attack: 0, defend: 0, decayMinutes: 0 }); break;
    case 'forced_substitution_choice':  p.onChoice(null); break;
    case 'first_phase_tactic_choice':   p.onChoice(selectPlay.value); break; // Force the tactic!
    default:                            p.onChoice(null); break;
  }
});

eventBus.on('engine:autoPaused', () => {
  if (currentEngine) {
    currentEngine.resume();
  }
});

let seekingFirstPhase = false;

btnTrigger.onclick = () => {
  if (currentEngine) {
    statusText.textContent = `Simulating to next ${selectPlay.value} First Phase...`;
    seekingFirstPhase = true;
    currentEngine.setTickDelay(5);
    eventBus.emit('ui:speedChange', { delayMs: 5 });
    currentEngine.resume();
  } else {
    startMatch();
    btnTrigger.click();
  }
};

eventBus.on('engine:event', ({ event }) => {
  const e = event as any;
  if (seekingFirstPhase && e.phase === MatchPhase.FirstPhase) {
    const outcomeKeys = (e.narration?.steps || [])
      .filter((s: any) => s.kind === 'phase_outcome' && s.key)
      .map((s: any) => s.key);
      
    if (outcomeKeys.includes(selectPlay.value)) {
      seekingFirstPhase = false;
      statusText.textContent = `Animating First Phase: ${selectPlay.value}`;
      
      // Pause engine to let UI catch up, then resume slowly for next time?
      // Actually we just pause the engine so the user can see the event finish.
      if (currentEngine) {
        currentEngine.pause();
        currentEngine.setTickDelay(2000);
        eventBus.emit('ui:speedChange', { delayMs: 2000 });
      }
    }
  }
});

const home = harlequinsRaw as unknown as RawTeamInput;
const away = bristolRaw as unknown as RawTeamInput;

function startMatch() {
  if (currentEngine && 'destroy' in currentEngine) {
    (currentEngine as any).destroy();
  }
  currentEngine = new MatchCoordinator(home, away, { 
    tickDelayMs: 2000, 
    seed: Date.now(), 
    humanSide: 'home' 
  });
  currentEngine.initialize();
  eventBus.emit('ui:speedChange', { delayMs: 2000 });
  currentEngine.start();
}

// Don't auto-start. Wait for trigger.
statusText.textContent = 'Ready.';
