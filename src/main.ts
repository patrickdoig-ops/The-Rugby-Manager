import '../style/main.css';
import '../style/homescreen.css';
import '../style/settings.css';
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
import { initSettingsScreen }      from './ui/SettingsScreen';
import { initTeamSelectorScreen }  from './ui/TeamSelectorScreen';
import { initFixtureListScreen }   from './ui/FixtureListScreen';
import type { FixtureInitialState } from './ui/FixtureListScreen';
import { initMatchResultScreen }   from './ui/MatchResultScreen';
import { screenRouter }            from './ui/ScreenRouter';
import { loadSave, saveGame, clearSave } from './ui/SaveManager';
import { MatchCoordinator }        from './engine/MatchCoordinator';
import type { RawTeamInput }       from './engine/MatchCoordinator';
import type { TeamTactics }        from './types/team';
import type { MatchState }         from './types/match';
import { eventBus }                from './utils/eventBus';

import bathRaw         from './data/team-bath.json';
import bristolRaw      from './data/team-bristol.json';
import exeterRaw       from './data/team-exeter.json';
import gloucesterRaw   from './data/team-gloucester.json';
import harlequinsRaw   from './data/team-harlequins.json';
import leicesterRaw    from './data/team-leicester.json';
import newcastleRaw    from './data/team-newcastle.json';
import northamptonRaw  from './data/team-northampton.json';
import saleRaw         from './data/team-sale.json';
import saracensRaw     from './data/team-saracens.json';

const allTeams = [
  bathRaw, bristolRaw, exeterRaw, gloucesterRaw, harlequinsRaw,
  leicesterRaw, newcastleRaw, northamptonRaw, saleRaw, saracensRaw,
] as unknown as RawTeamInput[];

document.addEventListener('DOMContentLoaded', () => {
  buildAppShell();
  initScoreboard();
  initPitchStrip();
  initCommentaryFeed();
  initStatsPanel();
  initModalManager();

  let fixtureList: ReturnType<typeof initFixtureListScreen> | null = null;

  function goHome(): void {
    // Re-init so the Continue button state reflects the latest save (e.g. just
    // returned from a season the user is now resuming).
    initHomeScreen(goTeamSelector, continueGame, goSettings);
    screenRouter.show('home');
  }

  function goSettings(): void {
    initSettingsScreen(goHome);
    screenRouter.show('settings');
  }

  function goTeamSelector(): void {
    initTeamSelectorScreen(allTeams, onTeamPicked, goHome);
    screenRouter.show('team-selector');
  }

  function onTeamPicked(team: RawTeamInput): void {
    // A new team pick replaces any prior save — the user is explicitly starting
    // a new season. Seed the save immediately so Continue is enabled even if
    // they back out before playing the first match.
    saveGame({ playerTeamId: team.id, currentRound: 1, results: [] });
    fixtureList = initFixtureListScreen(team, allTeams, onPlayRound, goTeamSelector);
    screenRouter.show('fixture-list');
  }

  function continueGame(): void {
    const save = loadSave();
    if (!save) return;
    const playerTeam = allTeams.find(t => t.id === save.playerTeamId);
    if (!playerTeam) {
      // Saved team no longer exists in the league (e.g. data churn). Drop the
      // stale save and bounce the user back home.
      clearSave();
      goHome();
      return;
    }
    const opponents = allTeams.filter(t => t.id !== playerTeam.id);
    const TOTAL_ROUNDS = opponents.length * 2;
    const resultMap = new Map<number, { home: number; away: number }>();
    for (const r of save.results) {
      resultMap.set(r.round, { home: r.homeScore, away: r.awayScore });
    }
    const initialState: FixtureInitialState = {
      currentRound: Math.min(Math.max(save.currentRound, 1), TOTAL_ROUNDS + 1),
      results: resultMap,
    };
    fixtureList = initFixtureListScreen(playerTeam, allTeams, onPlayRound, goTeamSelector, initialState);
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
    initMatchResultScreen(state, round, () => {
      fixtureList!.recordResult(round, state.score.home, state.score.away);
      engine.destroy();
      screenRouter.show('fixture-list');
    });
    screenRouter.show('match-result');
  }

  initHomeScreen(goTeamSelector, continueGame, goSettings);
  screenRouter.show('home');
});
