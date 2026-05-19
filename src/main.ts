import '../style/main.css';
import '../style/homescreen.css';
import '../style/teamselector.css';
import '../style/fixturelist.css';
import '../style/matchresult.css';
import '../style/commentary.css';
import '../style/stats.css';
import '../style/prematch.css';
import '../style/tactics.css';

import { buildAppShell }           from './ui/AppShell';
import { initScoreboard }          from './ui/Scoreboard';
import { initPitchStrip }          from './ui/PitchStrip';
import { initCommentaryFeed }      from './ui/CommentaryFeed';
import { initStatsPanel }          from './ui/StatsPanel';
import { initSimController }       from './ui/SimController';
import { initModalManager }        from './ui/ModalManager';
import { initPreMatchScreen }      from './ui/PreMatchScreen';
import { initHomeScreen }          from './ui/HomeScreen';
import { initTeamSelectorScreen }  from './ui/TeamSelectorScreen';
import { initFixtureListScreen }   from './ui/FixtureListScreen';
import { MatchCoordinator }        from './engine/MatchCoordinator';
import type { RawTeamInput }       from './engine/MatchCoordinator';
import { eventBus }                from './utils/eventBus';

import homeTeamRaw     from './data/team-home.json';
import awayTeamRaw     from './data/team-away.json';
import leicesterRaw    from './data/team-leicester.json';
import saracensRaw     from './data/team-saracens.json';

const allTeams = [homeTeamRaw, awayTeamRaw, leicesterRaw, saracensRaw] as unknown as RawTeamInput[];

document.addEventListener('DOMContentLoaded', () => {
  buildAppShell();
  initScoreboard();
  initPitchStrip();
  initCommentaryFeed();
  initStatsPanel();
  initModalManager();

  initHomeScreen(() => {
    initTeamSelectorScreen(allTeams, (playerTeam) => {
      const fixtureList = initFixtureListScreen(playerTeam, allTeams, (homeTeam, awayTeam, playerSide, round) => {
        initPreMatchScreen(
          homeTeam as RawTeamInput,
          awayTeam as RawTeamInput,
          playerSide,
          round,
          (configuredHome, configuredAway, playerTactics) => {
            const engine = new MatchCoordinator(configuredHome, configuredAway, { tickDelayMs: 2000, playerTactics, humanSide: playerSide });
            initSimController(engine);

            const mrEl     = document.getElementById('match-result')!;
            const mrScore  = document.getElementById('mr-score')!;
            const mrTeams  = document.getElementById('mr-teams')!;
            const mrReturn = document.getElementById('mr-return') as HTMLButtonElement;
            const flEl     = document.getElementById('fixture-list')!;

            const unsub = eventBus.on('engine:finished', ({ state }) => {
              unsub();
              mrScore.textContent = `${state.score.home} – ${state.score.away}`;
              mrTeams.textContent = `${state.homeTeam.name}  ·  ${state.awayTeam.name}`;
              mrEl.style.display = 'flex';

              mrReturn.onclick = () => {
                mrEl.style.display = 'none';
                fixtureList.recordResult(round, state.score.home, state.score.away);
                flEl.style.display = '';
              };
            });

            engine.initialize();
          },
        );
      });
    });
  });
});
