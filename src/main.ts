import '../style/main.css';
import '../style/homescreen.css';
import '../style/settings.css';
import '../style/teamselector.css';
import '../style/teaminfo.css';
import '../style/fixturelist.css';
import '../style/leaguetable.css';
import '../style/hub.css';
import '../style/matchresult.css';
import '../style/roundresults.css';
import '../style/seasonrollover.css';
import '../style/contracts.css';
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
import { initTeamInfoScreen }      from './ui/TeamInfoScreen';
import { initFixtureListScreen }   from './ui/FixtureListScreen';
import { initLeagueTableScreen, showLeagueTablePostMatch } from './ui/LeagueTableScreen';
import { initHubScreen }           from './ui/HubScreen';
import { initMatchResultScreen }   from './ui/MatchResultScreen';
import { initRoundResultsScreen, showRoundResults } from './ui/RoundResultsScreen';
import { initEndOfSeasonScreen, showEndOfSeason }   from './ui/EndOfSeasonScreen';
import { initRolloverScreen, showRollover }         from './ui/RolloverScreen';
import { initContractsScreen, showContracts }       from './ui/ContractsScreen';
import { screenRouter }            from './ui/ScreenRouter';
import { loadSave, saveGame, clearSave } from './ui/SaveManager';
import { loadTickDelayMs }           from './ui/uiPrefs';
import { MatchCoordinator }        from './engine/MatchCoordinator';
import type { RawTeamInput }       from './types/teamData';
import type { TeamTactics }        from './types/team';
import type { MatchState }         from './types/match';
import * as teamProfile            from './team/teamProfile';
import type { TeamJson }           from './team/teamProfile';
import { applyStarBoost }          from './team/applyStarBoost';
import { GameCoordinator }         from './game/GameCoordinator';
import { extractMatchdaySquad }    from './game/playerSquad';
import { buildTeamFromRoster }     from './game/rosterTeamBuilder';
import { snapshotMatch }           from './game/seasonStatsCollector';
import { SEASON_VALUES }           from './engine/balance';
import { generateSeed }            from './utils/rng';
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

const allTeamsRaw = ([
  bathRaw, bristolRaw, exeterRaw, gloucesterRaw, harlequinsRaw,
  leicesterRaw, newcastleRaw, northamptonRaw, saleRaw, saracensRaw,
] as unknown as TeamJson[]).map(applyStarBoost);
const allTeams = allTeamsRaw as unknown as RawTeamInput[];

document.addEventListener('DOMContentLoaded', () => {
  buildAppShell();
  initScoreboard();
  initPitchStrip();
  initCommentaryFeed();
  initStatsPanel();
  initModalManager();

  teamProfile.init(allTeamsRaw);

  let gameEngine: GameCoordinator | null = null;
  // In-season screens (Hub, Fixtures, League) register permanent `game:*`
  // subscriptions at init time without an unsub seam. Running init more than
  // once per session (e.g. New Game → Home → Continue) would compound those
  // subscriptions and double-render on every game-state change. Gate the
  // init so it runs exactly once across the lifetime of the page.
  let inSeasonInited = false;
  let seasonCompletePending = false;

  function goHome(): void {
    // Re-init so the Continue button state reflects the latest save (e.g. just
    // returned from a season the user is now resuming).
    initHomeScreen(goTeamSelector, continueGame, goSettingsFromHome);
    screenRouter.show('home');
  }

  function goSettingsFromHome(): void {
    initSettingsScreen(goHome);
    screenRouter.show('settings');
  }

  function goSettingsFromHub(): void {
    initSettingsScreen(goHub);
    screenRouter.show('settings');
  }

  function goTeamSelector(): void {
    initTeamSelectorScreen(allTeams, onTeamPicked, goHome, (team) => goTeamInfo(team, goTeamSelector));
    screenRouter.show('team-selector');
  }

  function goTeamInfo(team: RawTeamInput, onBack: () => void): void {
    const profile = teamProfile.getProfile(team.id);
    // Pre-game team browsing: use the season start date so ages line up with
    // what the player will see on the opening weekend.
    initTeamInfoScreen(profile, team, SEASON_VALUES.startDate, onBack);
    screenRouter.show('team-info');
  }

  // Initialise the three in-season screens (Hub, Fixtures, League) for the
  // current game engine instance. Done once per game so each screen registers
  // its game:* event subscriptions exactly once; later navigations between
  // them go through `screenRouter.show(...)` without re-initialising.
  function initInSeasonScreens(): void {
    if (!gameEngine) return;
    if (inSeasonInited) return;
    inSeasonInited = true;
    initHubScreen({
      gameEngine,
      allTeams,
      onPlayMatch: onPlayRound,
      onFixtures: goFixtures,
      onLeague:   goLeagueTable,
      onSquad:    () => { /* placeholder until Squad selector screen lands */ },
      onTraining: () => { /* placeholder until Training screen lands */ },
      onContracts: goContracts,
      onTransfers:() => { /* placeholder until Transfer market screen lands */ },
      onSettings: goSettingsFromHub,
    });
    initFixtureListScreen(gameEngine, allTeams, goHub);
    initLeagueTableScreen(gameEngine, allTeams, goHub);
    initRoundResultsScreen(gameEngine, allTeams);
    initEndOfSeasonScreen(gameEngine, allTeams);
    initRolloverScreen(gameEngine, allTeams);
    initContractsScreen(gameEngine, allTeams, goHub);

    // The post-match Continue chain (LeagueTable → ...) reads this flag.
    // GameCoordinator emits game:seasonComplete after the last round's
    // WEEK_ADVANCED; we latch it here and clear it once the chain has
    // routed through EndOfSeason → Rollover.
    eventBus.on('game:seasonComplete', () => { seasonCompletePending = true; });
  }

  function goHub(): void {
    screenRouter.show('hub');
  }

  function goFixtures(): void {
    screenRouter.show('fixture-list');
  }

  function goLeagueTable(): void {
    screenRouter.show('league-table');
  }

  function goContracts(): void {
    showContracts();
    screenRouter.show('contracts');
  }

  function onTeamPicked(team: RawTeamInput): void {
    // A new team pick replaces any prior save — the user is explicitly starting
    // a new season. Seed the save immediately so Continue is enabled even if
    // they back out before playing the first match.
    gameEngine = GameCoordinator.newSeason(team.id, generateSeed(), allTeams);
    saveGame(gameEngine.toSavePayload());
    initInSeasonScreens();
    goHub();
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
    gameEngine = GameCoordinator.fromSave(save, allTeams);
    initInSeasonScreens();
    goHub();
  }

  function onPlayRound(homeTeam: RawTeamInput, awayTeam: RawTeamInput, playerSide: 'home' | 'away', round: number): void {
    if (!gameEngine) return;
    // Source player data from the persistent career roster — team identity
    // (color, name, stadium, suggestedTactics) still comes from the JSON
    // passed in by HubScreen.
    const state = gameEngine.getState();
    const rosteredHome = buildTeamFromRoster(state, homeTeam);
    const rosteredAway = buildTeamFromRoster(state, awayTeam);
    initPreMatchScreen(
      rosteredHome,
      rosteredAway,
      playerSide,
      round,
      gameEngine,
      (configuredHome, configuredAway, playerTactics) => {
        // Persist the manager's pre-match commits so the next match opens
        // with these as defaults. Saved here (on Kick Off) rather than after
        // the result so backing out mid-match keeps the chosen line-up.
        if (gameEngine) {
          const playerConfigured = playerSide === 'home' ? configuredHome : configuredAway;
          gameEngine.setPlayerTactics(playerTactics);
          gameEngine.setPlayerMatchdaySquad(extractMatchdaySquad(playerConfigured));
          saveGame(gameEngine.toSavePayload());
        }
        onMatchStart(configuredHome, configuredAway, playerSide, round, playerTactics);
      },
      goHub,
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
    const engine = new MatchCoordinator(configuredHome, configuredAway, { tickDelayMs: loadTickDelayMs(), playerTactics, humanSide: playerSide });
    initSimController(engine);
    screenRouter.show('app');

    const unsub = eventBus.on('engine:finished', ({ state }) => {
      unsub();
      showMatchResult(engine, state, round);
    });
    engine.initialize();
  }

  function showMatchResult(engine: MatchCoordinator, state: MatchState, round: number): void {
    initMatchResultScreen(state, round, async () => {
      // Snapshot the per-player stats before destroy() tears down the
      // match state — feeds PLAYER_SEASON_STATS_ACCUMULATED inside
      // recordPlayerMatchResult so league top-scorer / MVP cards can
      // surface real season aggregates.
      const playerSnapshots = snapshotMatch(state);
      engine.destroy();
      if (gameEngine) {
        await gameEngine.recordPlayerMatchResult(round, state.score.home, state.score.away, playerSnapshots);
        saveGame(gameEngine.toSavePayload());
      }
      // Post-match nav chain. Normally: RoundResults → LeagueTable → Hub.
      // If GameCoordinator latched `seasonCompletePending` during
      // recordPlayerMatchResult (final round just resolved), the chain
      // detours: LeagueTable → EndOfSeasonScreen → RolloverScreen → Hub.
      const onLeagueContinue = (): void => {
        if (seasonCompletePending) {
          seasonCompletePending = false;
          showEndOfSeason(() => {
            if (!gameEngine) { goHub(); return; }
            const rolloverEvents = gameEngine.rollSeason();
            saveGame(gameEngine.toSavePayload());
            showRollover(rolloverEvents, () => {
              if (gameEngine) saveGame(gameEngine.toSavePayload());
              goHub();
            });
            screenRouter.show('rollover');
          });
          screenRouter.show('end-of-season');
        } else {
          goHub();
        }
      };
      showRoundResults(round, () => {
        showLeagueTablePostMatch(onLeagueContinue);
        screenRouter.show('league-table');
      });
      screenRouter.show('round-results');
    });
    screenRouter.show('match-result');
  }

  initHomeScreen(goTeamSelector, continueGame, goSettingsFromHome);
  screenRouter.show('home');
});
