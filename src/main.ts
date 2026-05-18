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
import type { RawTeamInput }  from './engine/MatchEngine';

import homeTeamRaw from './data/team-home.json';
import awayTeamRaw from './data/team-away.json';

document.addEventListener('DOMContentLoaded', () => {
  buildAppShell();
  initScoreboard();
  initPitchStrip();
  initCommentaryFeed();
  initStatsPanel();
  initModalManager();

  initHomeScreen(() => {
    initPreMatchScreen(
      homeTeamRaw as RawTeamInput,
      awayTeamRaw as RawTeamInput,
      (configuredHome, configuredAway, homeTactics) => {
        const engine = new MatchEngine(configuredHome, configuredAway, { tickDelayMs: 1500, homeTactics });
        initSimController(engine);
        engine.initialize();
      },
    );
  });
});
