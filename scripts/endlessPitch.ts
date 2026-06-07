import '../style/main.css';
import '../style/commentary.css';

import { eventBus } from '../src/utils/eventBus';
import { initPitchView } from '../src/ui/PitchView';
import { initCommentaryFeed } from '../src/ui/CommentaryFeed';
import { MatchCoordinator } from '../src/engine/MatchCoordinator';
import type { RawTeamInput } from '../src/types/teamData';

import harlequinsRaw from '../src/data/team-harlequins.json';
import bristolRaw from '../src/data/team-bristol.json';

// Initialize core isolated UI components
initPitchView();
initCommentaryFeed();

// Handle our own simplified sim controls to avoid coupling with AppShell DOM
let currentEngine: MatchCoordinator | null = null;
const btnPlay = document.getElementById('btn-play') as HTMLButtonElement;
const btnPause = document.getElementById('btn-pause') as HTMLButtonElement;
const speedBtns = Array.from(document.querySelectorAll<HTMLButtonElement>('.speed-btn'));

btnPlay.onclick = () => {
  if (currentEngine) {
    currentEngine.resume();
    btnPlay.disabled = true;
    btnPause.disabled = false;
  }
};

btnPause.onclick = () => {
  if (currentEngine) {
    currentEngine.pause();
    btnPlay.disabled = false;
    btnPause.disabled = true;
  }
};

speedBtns.forEach(btn => {
  btn.onclick = () => {
    speedBtns.forEach(b => b.classList.remove('speed-btn--active'));
    btn.classList.add('speed-btn--active');
    const ms = Number(btn.dataset.ms);
    if (currentEngine) {
      currentEngine.setTickDelay(ms);
    }
    // Broadcast speed change so commentary staggers correctly
    eventBus.emit('ui:speedChange', { delayMs: ms });
  };
});

// Auto-answer prompts to keep the engine running automatically
eventBus.on('engine:paused', ({ payload }) => {
  const p = payload as { type: string; onChoice: (v: unknown) => void };
  if (!p || typeof p.onChoice !== 'function') return;
  switch (p.type) {
    case 'kickoff_choice': {
      const koChoices = ['high_ball', 'deep_kick', 'short_kick'];
      p.onChoice(koChoices[Math.floor(Math.random() * koChoices.length)]);
      break;
    }
    case 'penalty_choice': {
      const penChoices = ['kick_to_touch', 'kick_at_goal', 'scrum', 'tap_and_go'];
      p.onChoice(penChoices[Math.floor(Math.random() * penChoices.length)]);
      break;
    }
    case 'team_talk_choice':            p.onChoice({ attack: 0, defend: 0, decayMinutes: 0 }); break;
    case 'forced_substitution_choice': {
      const pSub = payload as any;
      p.onChoice(pSub.bench && pSub.bench.length > 0 ? pSub.bench[0].squadNumber : null);
      break;
    }
    default:                            p.onChoice(null); break;
  }
});

// Auto-resume on half time pause
eventBus.on('engine:autoPaused', () => {
  if (currentEngine) {
    currentEngine.resume();
  }
});

const animPhaseLabel = document.getElementById('anim-phase-label');

eventBus.on('engine:event', ({ event }) => {
  const e = event as any;
  if (animPhaseLabel) {
    const phaseName = e.phase.replace(/_/g, ' ');
    const outcomeKeys = (e.narration?.steps || [])
      .filter((s: any) => s.kind === 'phase_outcome' && s.key)
      .map((s: any) => s.key);
    
    if (outcomeKeys.length > 0) {
      animPhaseLabel.textContent = `Animating: ${phaseName} · ${outcomeKeys.join('/')}`;
    } else {
      animPhaseLabel.textContent = `Animating: ${phaseName}`;
    }
  }
});

const home = harlequinsRaw as unknown as RawTeamInput;
const away = bristolRaw as unknown as RawTeamInput;

function startMatch() {
  if (currentEngine && 'destroy' in currentEngine) {
    (currentEngine as any).destroy();
  }

  // Find active speed preset
  const activeBtn = speedBtns.find(b => b.classList.contains('speed-btn--active')) || speedBtns[1];
  const currentSpeedMs = Number(activeBtn.dataset.ms);

  currentEngine = new MatchCoordinator(home, away, { 
    tickDelayMs: currentSpeedMs, 
    seed: Date.now(), 
    humanSide: 'home' 
  });

  currentEngine.initialize();
  
  // Set the commentary feed speed to match the chosen speed
  eventBus.emit('ui:speedChange', { delayMs: currentSpeedMs });
  
  currentEngine.start();
  
  btnPlay.disabled = true;
  btnPause.disabled = false;
}

eventBus.on('engine:finished', () => {
  setTimeout(() => {
    startMatch();
  }, 2000); // Wait 2s then loop
});

// Start loop
startMatch();
