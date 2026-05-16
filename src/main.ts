import '../style/main.css';
import '../style/commentary.css';
import '../style/stats.css';

import { buildAppShell }    from './ui/AppShell';
import { PitchRenderer }    from './ui/PitchRenderer';
import { initCommentaryFeed } from './ui/CommentaryFeed';
import { initStatsPanel }   from './ui/StatsPanel';
import { initSimController } from './ui/SimController';
import { initModalManager } from './ui/ModalManager';
import { MatchEngine }      from './engine/MatchEngine';

import homeTeamRaw from './data/team-home.json';
import awayTeamRaw from './data/team-away.json';

document.addEventListener('DOMContentLoaded', () => {
  buildAppShell();

  const canvas = document.getElementById('pitch-canvas') as HTMLCanvasElement;
  const pitch  = new PitchRenderer(canvas);
  pitch.subscribe();

  initCommentaryFeed();
  initStatsPanel();
  initModalManager();

  const engine = new MatchEngine(
    homeTeamRaw as ConstructorParameters<typeof MatchEngine>[0],
    awayTeamRaw as ConstructorParameters<typeof MatchEngine>[1],
    { tickDelayMs: 600 },
  );
  initSimController(engine);
  engine.initialize();
});
