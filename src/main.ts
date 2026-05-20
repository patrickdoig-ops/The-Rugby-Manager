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
import { screenRouter }            from './ui/ScreenRouter';
import { MatchCoordinator }        from './engine/MatchCoordinator';
import type { RawTeamInput }       from './engine/MatchCoordinator';
import type { TeamTactics }        from './types/team';
import type { MatchState }         from './types/match';
import { eventBus }                from './utils/eventBus';

import gloucesterRaw   from './data/team-gloucester.json';
import bristolRaw      from './data/team-bristol.json';
import leicesterRaw    from './data/team-leicester.json';
import saracensRaw     from './data/team-saracens.json';

const allTeams = [gloucesterRaw, bristolRaw, leicesterRaw, saracensRaw] as unknown as RawTeamInput[];

document.addEventListener('DOMContentLoaded', () => {
  buildAppShell();
  initScoreboard();
  initPitchStrip();
  initCommentaryFeed();
  initStatsPanel();
  initModalManager();

  let fixtureList: ReturnType<typeof initFixtureListScreen> | null = null;

  function goHome(): void {
    screenRouter.show('home');
  }

  function goTeamSelector(): void {
    initTeamSelectorScreen(allTeams, onTeamPicked, goHome);
    screenRouter.show('team-selector');
  }

  function onTeamPicked(team: RawTeamInput): void {
    fixtureList = initFixtureListScreen(team, allTeams, onPlayRound, goTeamSelector);
    screenRouter.show('fixture-list');
  }

  function onPlayRound(homeTeam: RawTeamInput, awayTeam: RawTeamInput, playerSide: 'home' | 'away', round: number): void {
    initPreMatchScreen(
      homeTeam,
      awayTeam,
      playerSide,
      round,
      (configuredHome, configuredAway, playerTactics) => onMatchStart(configuredHome, configuredAway, playerSide, round, playerTactics),
      () => screenRouter.show('fixture-list'),
    );
    screenRouter.show('pre-match');
  }

  function onMatchStart(
    configuredHome: RawTeamInput,
    configuredAway: RawTeamInput,
    playerSide: 'home' | 'away',
    round: number,
    playerTactics: TeamTactics,
  ): void {
    const engine = new MatchCoordinator(configuredHome, configuredAway, { tickDelayMs: 2000, playerTactics, humanSide: playerSide });
    initSimController(engine);
    screenRouter.show('app');

    const unsub = eventBus.on('engine:finished', ({ state }) => {
      unsub();
      showMatchResult(engine, state, round);
    });
    engine.initialize();
  }

  function showMatchResult(engine: MatchCoordinator, state: MatchState, round: number): void {
    document.getElementById('mr-score')!.textContent = `${state.score.home} – ${state.score.away}`;
    document.getElementById('mr-teams')!.textContent = `${state.homeTeam.name}  ·  ${state.awayTeam.name}`;
    screenRouter.show('match-result');

    (document.getElementById('mr-return') as HTMLButtonElement).onclick = () => {
      fixtureList!.recordResult(round, state.score.home, state.score.away);
      engine.destroy();
      screenRouter.show('fixture-list');
    };
  }

  initHomeScreen(goTeamSelector);
  screenRouter.show('home');
});
