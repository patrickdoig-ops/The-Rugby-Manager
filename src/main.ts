import '../style/main.css';
import '../style/homescreen.css';
import '../style/teamselector.css';
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
import { initHomeScreen }          from './ui/HomeScreen';
import { initTeamSelectorScreen }  from './ui/TeamSelectorScreen';
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
    initTeamSelectorScreen(homeTeamRaw as RawTeamInput, awayTeamRaw as RawTeamInput, (playerSide) => {
      initPreMatchScreen(
        homeTeamRaw as RawTeamInput,
        awayTeamRaw as RawTeamInput,
        playerSide,
        (configuredHome, configuredAway, playerTactics) => {
          const engine = new MatchEngine(configuredHome, configuredAway, { tickDelayMs: 2000, playerTactics, humanSide: playerSide });
          initSimController(engine);
          engine.initialize();
        },
      );
    });
  });
});
