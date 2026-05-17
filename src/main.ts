import '../style/main.css';
import '../style/homescreen.css';
import '../style/commentary.css';
import '../style/stats.css';
import '../style/prematch.css';
import '../style/tactics.css';

import { buildAppShell }      from './ui/AppShell';
import { initScoreboard }     from './ui/Scoreboard';
import { initPitchStrip }     from './ui/PitchStrip';
import { initCommentaryFeed } from './ui/CommentaryFeed';
import { initStatsPanel }     from './ui/StatsPanel';
import { initSimController }  from './ui/SimController';
import { initModalManager }   from './ui/ModalManager';
import { initPreMatchScreen } from './ui/PreMatchScreen';
import { initHomeScreen }     from './ui/HomeScreen';
import { MatchEngine }        from './engine/MatchEngine';

import homeTeamRaw from './data/team-home.json';
import awayTeamRaw from './data/team-away.json';

document.addEventListener('DOMContentLoaded', () => {
  // Build the game shell and wire all UI listeners in the background.
  // Home screen overlays everything; pre-match overlays the game shell.
  buildAppShell();
  initScoreboard();
  initPitchStrip();
  initCommentaryFeed();
  initStatsPanel();
  initModalManager();

  const engine = new MatchEngine(
    homeTeamRaw as ConstructorParameters<typeof MatchEngine>[0],
    awayTeamRaw as ConstructorParameters<typeof MatchEngine>[1],
    { tickDelayMs: 1500 },
  );
  initSimController(engine);

  // Home screen → Start Game → pre-match preview → Kick Off → engine starts.
  initHomeScreen(() => {
    initPreMatchScreen(homeTeamRaw, awayTeamRaw, () => {
      engine.initialize();
    });
  });
});
