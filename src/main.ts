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
import '../style/squad.css';
import '../style/renewals.css';
import '../style/transfermarket.css';
import '../style/modepicker.css';
import '../style/squadoverview.css';
import '../style/commentary.css';
import '../style/stats.css';
import '../style/prematch.css';
import '../style/tactics.css';
import '../style/playoffbracket.css';
import '../style/signingresults.css';
import '../style/budgetreveal.css';

import { buildAppShell }           from './ui/AppShell';
import { preloadAllCues, playCue } from './ui/SoundManager';
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
import { initLeagueTableScreen, showLeagueTable, showLeagueTablePostMatch } from './ui/LeagueTableScreen';
import { initHubScreen }           from './ui/HubScreen';
import { initMatchResultScreen }   from './ui/MatchResultScreen';
import { initRoundResultsScreen, showRoundResults } from './ui/RoundResultsScreen';
import { initPlayoffBracketScreen, showPlayoffBracket } from './ui/PlayoffBracketScreen';
import { initBudgetRevealScreen, showBudgetReveal } from './ui/BudgetRevealScreen';
import { initTakeoverRevealScreen, showTakeoverReveal, type TakeoverEntry } from './ui/TakeoverRevealScreen';
import { initEndOfSeasonScreen, showEndOfSeason }   from './ui/EndOfSeasonScreen';
import { initRenewalsScreen, showRenewals }         from './ui/RenewalsScreen';
import { initTransferMarketScreen, showTransferMarket, showTransferMarketMidseason, showTransferMarketPreSeason } from './ui/TransferMarketScreen';
import { initSigningResultsScreen, showSigningResults } from './ui/SigningResultsScreen';
import { initRetentionDecisionScreen, showRetentionDecision } from './ui/RetentionDecisionScreen';
import { initModePickerScreen }    from './ui/ModePickerScreen';
import { initSquadOverviewScreen, showSquadOverview } from './ui/SquadOverviewScreen';
import { PRE_SEASON_TRANSFERS_2025_26 } from './data/transfers-2025-26';
import { initRolloverScreen, showRollover }         from './ui/RolloverScreen';
import { initContractsScreen, showContracts, showContractsMarqueeEdit } from './ui/ContractsScreen';
import { initSquadManagementScreen, showSquadManagement } from './ui/SquadManagementScreen';
import { screenRouter }            from './ui/ScreenRouter';
import { loadSave, saveGame, clearSave } from './ui/SaveManager';
import { loadTickDelayMs }           from './ui/uiPrefs';
import { MatchCoordinator }        from './engine/MatchCoordinator';
import type { RawTeamInput }       from './types/teamData';
import type { TeamTactics }        from './types/team';
import type { MatchState }         from './types/match';
import type { PlayoffMatch }       from './types/gameState';
import * as teamProfile            from './team/teamProfile';
import type { TeamJson }           from './team/teamProfile';
import { applyStarBoost }          from './team/applyStarBoost';
import { GameCoordinator }         from './game/GameCoordinator';
import { extractMatchdaySquad }    from './game/playerSquad';
import { buildTeamFromRoster, buildAutoSelectedTeamFromRoster } from './game/rosterTeamBuilder';
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
  preloadAllCues();
  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (target.closest('button, .hub-tile, .ts-card, .mp-card')) {
      playCue('uiClick');
    }
  });
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
  //
  // Each screen takes a `() => GameCoordinator` getter rather than the
  // engine reference itself, so the live `gameEngine` value reaches every
  // render — even when the user starts a fresh game and the reference
  // swaps without re-init.
  let inSeasonInited = false;
  const getGameEngine = (): GameCoordinator => {
    if (!gameEngine) throw new Error('gameEngine accessed before initialisation');
    return gameEngine;
  };
  let seasonCompletePending = false;
  // Latched on game:bracketSeeded so the post-final-regular-round
  // Continue chain detours through PlayoffBracketScreen rather than
  // straight back to Hub. Cleared once the chain enters runPlayoffStage.
  let bracketSeededPending = false;

  function goHome(): void {
    // Re-init so the Continue button state reflects the latest save (e.g. just
    // returned from a season the user is now resuming).
    initHomeScreen(goTeamSelector, continueGame, goSettingsFromHome, allTeams);
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

  // Mid-season entry into the TeamInfo screen from the League Table.
  // Reads the live calendar date so ages reflect the current point in
  // the season, and rebuilds the team from the career roster so the
  // squad list shows the actual current players (signings, retirements,
  // aging, injuries all reflected). Back navigates to the League
  // Table, which preserves its own mode (standard / form / post-match)
  // across the round-trip.
  function goTeamInfoMidSeason(team: RawTeamInput): void {
    if (!gameEngine) return;
    const profile = teamProfile.getProfile(team.id);
    const state = gameEngine.getState();
    const liveTeam = buildTeamFromRoster(state, team);
    initTeamInfoScreen(profile, liveTeam, state.calendar.date, goLeagueTable);
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
      getGameEngine,
      allTeams,
      onPlayMatch: onPlayRound,
      onPlayoffs: runPlayoffStage,
      onFixtures: goFixtures,
      onLeague:   goLeagueTable,
      onSquad:    goSquad,
      onTraining: () => { /* placeholder until Training screen lands */ },
      onContracts: goContracts,
      onTransfers: goTransfersMidseason,
      onSettings: goSettingsFromHub,
    });
    initFixtureListScreen(getGameEngine, allTeams, goHub);
    initLeagueTableScreen(getGameEngine, allTeams, goHub, (teamId) => {
      const teamJson = allTeams.find(t => t.id === teamId);
      if (!teamJson) return;
      goTeamInfoMidSeason(teamJson);
    });
    initRoundResultsScreen(getGameEngine, allTeams);
    initPlayoffBracketScreen(getGameEngine, allTeams);
    initBudgetRevealScreen(getGameEngine, allTeams);
    initTakeoverRevealScreen(getGameEngine, allTeams);
    initEndOfSeasonScreen(getGameEngine, allTeams);
    initRenewalsScreen(getGameEngine, allTeams);
    initTransferMarketScreen(getGameEngine, allTeams);
    initSigningResultsScreen(getGameEngine, allTeams);
    initRetentionDecisionScreen(getGameEngine, allTeams);
    initRolloverScreen(getGameEngine, allTeams);
    initContractsScreen(getGameEngine, allTeams, goHub);
    initSquadManagementScreen({ getGameEngine, allTeams, onBack: goHub });
    initSquadOverviewScreen(getGameEngine, allTeams);

    // The post-match Continue chain (LeagueTable → ...) reads these flags.
    // game:bracketSeeded fires after the last regular-season fixture —
    // routes through PlayoffBracketScreen instead of straight to Hub.
    // game:seasonComplete fires once the Premiership final resolves —
    // routes through EndOfSeason → Renewals → Signings → Rollover.
    eventBus.on('game:bracketSeeded',  () => { bracketSeededPending = true; });
    eventBus.on('game:seasonComplete', () => { seasonCompletePending = true; });
  }

  function goHub(): void {
    screenRouter.show('hub');
  }

  function goFixtures(): void {
    screenRouter.show('fixture-list');
  }

  function goLeagueTable(): void {
    showLeagueTable();
    screenRouter.show('league-table');
  }

  function goContracts(): void {
    showContracts();
    screenRouter.show('contracts');
  }

  function goSquad(): void {
    showSquadManagement();
    screenRouter.show('squad-management');
  }

  // Hub → Transfers. Opens an interactive mid-season FA market: user
  // queues offers, hits Submit, each is rolled against an appeal-based
  // acceptance probability, results flow into SigningResults → Hub.
  // Rejected players go on a one-round cooldown
  // (career.midseasonRejections). The Reg 7 tab is hidden mid-season
  // — Reg 7 pre-agreements stay an off-season concept.
  function goTransfersMidseason(): void {
    if (!gameEngine) return;
    gameEngine.openMidseasonSigningWindow();
    // Empty FA pool (or every FA on cooldown) → openMidseasonSigningWindow
    // leaves state.career.market null. We still navigate to the screen
    // so the user sees the empty state + a Continue button back to the
    // Hub, rather than the tile silently round-tripping.
    if (gameEngine.getState().career.market) {
      saveGame(gameEngine.toSavePayload());
    }
    const onSubmit = (): void => {
      if (!gameEngine) { goHub(); return; }
      const outcomes = gameEngine.runMidseasonSigning();
      gameEngine.closeMidseasonSigningWindow();
      saveGame(gameEngine.toSavePayload());
      showSigningResults(outcomes, () => goHub());
      screenRouter.show('signing-results');
    };
    const onFinish = (): void => {
      if (gameEngine) {
        gameEngine.closeMidseasonSigningWindow();
        saveGame(gameEngine.toSavePayload());
      }
      goHub();
    };
    showTransferMarketMidseason(onSubmit, onFinish);
    screenRouter.show('transfer-market');
  }

  function onTeamPicked(team: RawTeamInput): void {
    initModePickerScreen(team, () => onQuickStart(team), () => onSquadBuilder(team), goTeamSelector);
    screenRouter.show('mode-picker');
  }

  function onQuickStart(team: RawTeamInput): void {
    // Existing new-game path: seed the save immediately so Continue is enabled
    // even if the user backs out before playing the first match.
    gameEngine = GameCoordinator.newSeason(team.id, generateSeed(), allTeams);
    saveGame(gameEngine.toSavePayload());
    initInSeasonScreens();
    goHub();
  }

  // Squad Builder: BudgetReveal (year-1 seeded budget) → unwind 2025-26
  // inbound transfers → squad overview (read-only depth chart) →
  // pre-season signing window (FA-only) → marquee selection → Hub. Each
  // step marks state.career.preSeasonStep before saving so a closed tab
  // resumes at the right screen via continueGame.
  function onSquadBuilder(team: RawTeamInput): void {
    gameEngine = GameCoordinator.newSeason(team.id, generateSeed(), allTeams);
    initInSeasonScreens();
    // Unwind the 2025-26 inbound transfers FIRST so the Owner's Budget
    // reveal sees the post-unwind squad. Without this, the budget pill
    // includes wages for players who are about to be released into the
    // FA pool, which renders as "over budget" and contradicts the
    // headroom shown on the very next screen (SquadOverview / Transfer
    // Market). The unwind doesn't touch salaryBudget itself, so the
    // headline number on the reveal is unchanged.
    gameEngine.unwindPreSeasonTransfers(PRE_SEASON_TRANSFERS_2025_26);
    // Reveal the year-1 owner budget — no delta or reasons since
    // this is the seeded value, not a year-on-year adjustment.
    const club = gameEngine.getState().career.clubs.find(c => c.id === team.id);
    showBudgetReveal({
      budget: club?.salaryBudget ?? 0,
      onContinue: () => {
        if (!gameEngine) { goHub(); return; }
        runPreSeasonOverview();
      },
    });
    screenRouter.show('budget-reveal');
  }

  function runPreSeasonOverview(): void {
    if (!gameEngine) return;
    gameEngine.setPreSeasonStep('overview');
    saveGame(gameEngine.toSavePayload());
    showSquadOverview(() => runPreSeasonSignings());
    screenRouter.show('squad-overview');
  }

  function runPreSeasonSignings(): void {
    if (!gameEngine) return;
    gameEngine.openSigningWindow({ skipPoaches: true });
    if (!gameEngine.getState().career.market) {
      // Nothing to sign — skip straight to marquee. Still run the
      // AI-marquee repair: unwind may have stripped marquees off AI
      // clubs even if no FA pool resulted.
      gameEngine.repairAIMarquees();
      runPreSeasonMarquee();
      return;
    }
    gameEngine.setPreSeasonStep('signings');
    saveGame(gameEngine.toSavePayload());
    // Pre-season signing flow uses the same competitive loop as the
    // mid-season chain, but the openSigningWindow was opened with
    // skipPoaches so there are no Reg 7 candidates and therefore no
    // retention decisions. Close call also takes skipPoaches.
    const runPreSeasonRound = (): void => {
      if (!gameEngine) { goHub(); return; }
      gameEngine.runAIBidPass();
      // No retentions in pre-season (no poach bids), but call the pass
      // for shape symmetry — it's a no-op when no poaches are in flight.
      gameEngine.runAIRetentionPass();
      saveGame(gameEngine.toSavePayload());
      const outcomes = gameEngine.resolveSigningRound();
      saveGame(gameEngine.toSavePayload());
      showSigningResults(outcomes, () => {
        if (!gameEngine) { goHub(); return; }
        if (gameEngine.hasViableSigningOptions()) {
          showPreSeasonLoop();
        } else {
          finishPreSeasonWindow();
        }
      });
      screenRouter.show('signing-results');
    };
    const finishPreSeasonWindow = (): void => {
      if (!gameEngine) { goHub(); return; }
      gameEngine.closeSigningWindow({ skipPoaches: true });
      // Some AI clubs may now have no marquee — their authored marquee
      // was a 2025-26 in-signing that got unwound. Re-designate top
      // earner per marquee-less AI club so cap pressure stays sane.
      gameEngine.repairAIMarquees();
      runPreSeasonMarquee();
    };
    const showPreSeasonLoop = (): void => {
      showTransferMarketPreSeason(runPreSeasonRound, finishPreSeasonWindow);
      screenRouter.show('transfer-market');
    };
    showPreSeasonLoop();
  }

  function runPreSeasonMarquee(): void {
    if (!gameEngine) return;
    gameEngine.setPreSeasonStep('marquee');
    saveGame(gameEngine.toSavePayload());
    showContractsMarqueeEdit(() => {
      if (!gameEngine) { goHub(); return; }
      gameEngine.setPreSeasonStep(null);
      saveGame(gameEngine.toSavePayload());
      goHub();
    });
    screenRouter.show('contracts');
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
    // v12 → v13 shim: a save made after R18 but pre-playoffs era won't
    // have a bracket field. Seed it now if conditions are met (no-op
    // when the bracket is already restored, or when the regular season
    // isn't done yet).
    gameEngine.seedPlayoffBracket();
    // Squad Builder mid-pre-season resumption. The flag is only ever set
    // while the user is between team-selection and Round 1; after marquee
    // Continue the engine clears it via setPreSeasonStep(null).
    const step = gameEngine.getState().career.preSeasonStep;
    if (step === 'overview') {
      runPreSeasonOverview();
      return;
    }
    if (step === 'signings') {
      runPreSeasonSignings();
      return;
    }
    if (step === 'marquee') {
      runPreSeasonMarquee();
      return;
    }
    // Mid-season signing window mid-flow → resume on the same screen.
    // openMidseasonSigningWindow is idempotent so the existing market
    // is preserved; the onSubmit/onFinish closures are re-bound.
    const liveMarket = gameEngine.getState().career.market;
    if (liveMarket && liveMarket.phase === 'signings-midseason') {
      goTransfersMidseason();
      return;
    }
    goHub();
  }

  // Off-season chain after the playoff final resolves. Identical to the
  // pre-playoffs end-of-season flow — EndOfSeason → Renewals → Signings
  // → Rollover → Hub. Each market window is skipped when empty (the
  // open*Window calls leave state.career.market null in that case).
  function runEndOfSeasonChain(): void {
    const proceedToRollover = (): void => {
      if (!gameEngine) { goHub(); return; }
      const rolloverEvents = gameEngine.rollSeason();
      saveGame(gameEngine.toSavePayload());
      showRollover(rolloverEvents, () => {
        if (gameEngine) saveGame(gameEngine.toSavePayload());
        goHub();
      });
      screenRouter.show('rollover');
    };
    // Drives the competitive signing loop:
    //   - Show TransferMarketScreen. User makes offers, then presses
    //     Submit (resolves one round, looping back here) or Finish
    //     (closes the window, advancing to rollover).
    //   - On Submit: runRound() handles AI bids + retention decisions
    //     (with the user prompted via RetentionDecisionScreen if any of
    //     their players are under poach attack) + resolution + results.
    //   - After results: auto-finish if no viable next round, otherwise
    //     loop back to TransferMarketScreen.
    const runSigningLoop = (onFinishCallback: () => void): void => {
      const runRound = (): void => {
        if (!gameEngine) { onFinishCallback(); return; }
        // AI bid pass (free agents + poaches) then AI auto-retention.
        gameEngine.runAIBidPass();
        gameEngine.runAIRetentionPass();
        saveGame(gameEngine.toSavePayload());
        const userPrompts = gameEngine.getUserRetentionPrompts();
        const proceedToResolve = (): void => {
          if (!gameEngine) { onFinishCallback(); return; }
          const outcomes = gameEngine.resolveSigningRound();
          saveGame(gameEngine.toSavePayload());
          showSigningResults(outcomes, () => {
            if (!gameEngine) { onFinishCallback(); return; }
            // Loop back unless the user has nothing left to offer.
            if (gameEngine.hasViableSigningOptions()) {
              showLoop();
            } else {
              finishWindow();
            }
          });
          screenRouter.show('signing-results');
        };
        if (userPrompts.length > 0) {
          showRetentionDecision(proceedToResolve);
          screenRouter.show('retention-decision');
        } else {
          proceedToResolve();
        }
      };
      const finishWindow = (): void => {
        if (!gameEngine) { onFinishCallback(); return; }
        gameEngine.closeSigningWindow();
        saveGame(gameEngine.toSavePayload());
        onFinishCallback();
      };
      const showLoop = (): void => {
        showTransferMarket(runRound, finishWindow);
        screenRouter.show('transfer-market');
      };
      showLoop();
    };

    const proceedToSignings = (): void => {
      if (!gameEngine) { goHub(); return; }
      gameEngine.openSigningWindow();
      if (gameEngine.getState().career.market) {
        saveGame(gameEngine.toSavePayload());
        // Depth-chart checkpoint between Renewals (just closed) and the
        // signings window. Lets the manager see where they're thin after
        // releases land, before they decide who to recruit.
        showSquadOverview(() => {
          if (!gameEngine) { goHub(); return; }
          runSigningLoop(proceedToRollover);
        });
        screenRouter.show('squad-overview');
      } else {
        proceedToRollover();
      }
    };
    // proceedToRenewals: open the renewal window if there are expiring
    // contracts, then route to RenewalsScreen / TransferMarket / Rollover.
    // Pulled out so the BudgetReveal + TakeoverReveal can re-use it as
    // their Continue handler.
    const proceedToRenewals = (): void => {
      if (!gameEngine) { goHub(); return; }
      gameEngine.openRenewalWindow();
      if (gameEngine.getState().career.market) {
        saveGame(gameEngine.toSavePayload());
        showRenewals((decisions) => {
          if (!gameEngine) { goHub(); return; }
          gameEngine.closeRenewalWindow(decisions);
          saveGame(gameEngine.toSavePayload());
          proceedToSignings();
        });
        screenRouter.show('renewals');
      } else {
        proceedToSignings();
      }
    };

    showEndOfSeason(() => {
      if (!gameEngine) { goHub(); return; }
      // Compute next season's budgets (performance + takeovers) BEFORE
      // any renewal / signing decisions. The events fire CLUB_BUDGET_SET
      // for every club + CLUB_TAKEOVER for any Red Bull-style boost.
      const budgetEvents = gameEngine.prepareBudgetsForNextSeason();
      saveGame(gameEngine.toSavePayload());

      const userClubId = gameEngine.getState().player.teamId;
      const userBudgetEv = budgetEvents.find(
        (e): e is Extract<typeof e, { type: 'CLUB_BUDGET_SET' }> =>
          e.type === 'CLUB_BUDGET_SET' && e.clubId === userClubId,
      );
      const takeoverEntries: TakeoverEntry[] = budgetEvents
        .filter((e): e is Extract<typeof e, { type: 'CLUB_TAKEOVER' }> => e.type === 'CLUB_TAKEOVER')
        .map(e => ({ clubId: e.clubId, boostAmount: e.boostAmount, flavor: e.flavor }));

      const afterBudgetReveal = (): void => {
        if (takeoverEntries.length === 0) { proceedToRenewals(); return; }
        showTakeoverReveal({ takeovers: takeoverEntries, onContinue: () => proceedToRenewals() });
        screenRouter.show('takeover-reveal');
      };

      const userClub = gameEngine.getState().career.clubs.find(c => c.id === userClubId);
      showBudgetReveal({
        budget: userClub?.salaryBudget ?? 0,
        delta: userBudgetEv?.delta,
        reasons: userBudgetEv?.reasons,
        onContinue: afterBudgetReveal,
      });
      screenRouter.show('budget-reveal');
    });
    screenRouter.show('end-of-season');
  }

  // Routes the playoff chain. State-driven — picks the next action based
  // on the live bracket: play the player's pending match, sim the AI
  // matches in the current stage, or run the end-of-season chain when
  // the champion has been crowned. Re-enters itself after every state
  // change until the chain bottoms out.
  function runPlayoffStage(): void {
    if (!gameEngine) { goHub(); return; }
    const state = gameEngine.getState();
    const playoffs = state.league.playoffs;
    if (!playoffs) { goHub(); return; }

    // 1. Champion decided → off-season chain.
    if (playoffs.championTeamId !== null) {
      if (seasonCompletePending) seasonCompletePending = false;
      showPlayoffBracket(() => runEndOfSeasonChain(), 'Continue');
      screenRouter.show('playoff-bracket');
      return;
    }

    // 2. Player has a pending playoff match → show bracket then PreMatch.
    const playerMatch = gameEngine.getPlayerPlayoffMatch();
    if (playerMatch && playerMatch.homeId && playerMatch.awayId) {
      showPlayoffBracket(() => onPlayPlayoff(playerMatch), 'Continue');
      screenRouter.show('playoff-bracket');
      return;
    }

    // 3. AI-only matches pending in the current stage → sim them.
    const stage: 'sf' | 'final' = playoffs.semifinals.every(m => m.result)
      ? 'final'
      : 'sf';
    const ctaLabel = stage === 'sf' ? 'Watch the Semi-Finals' : 'Watch the Final';
    showPlayoffBracket(async () => {
      if (!gameEngine) { goHub(); return; }
      await gameEngine.simulatePendingPlayoffMatches(stage);
      saveGame(gameEngine.toSavePayload());
      runPlayoffStage();
    }, ctaLabel);
    screenRouter.show('playoff-bracket');
  }

  function onPlayPlayoff(match: PlayoffMatch): void {
    if (!gameEngine) return;
    if (!match.homeId || !match.awayId) return;
    const state = gameEngine.getState();
    const homeTeam = allTeams.find(t => t.id === match.homeId);
    const awayTeam = allTeams.find(t => t.id === match.awayId);
    if (!homeTeam || !awayTeam) return;
    const playerSide: 'home' | 'away' = match.homeId === state.player.teamId ? 'home' : 'away';
    const rosteredHome = playerSide === 'home'
      ? buildTeamFromRoster(state, homeTeam)
      : buildAutoSelectedTeamFromRoster(state, homeTeam);
    const rosteredAway = playerSide === 'away'
      ? buildTeamFromRoster(state, awayTeam)
      : buildAutoSelectedTeamFromRoster(state, awayTeam);
    const isFinal = match.kind === 'final';
    const contextLabel = isFinal
      ? 'Premiership Final · Twickenham'
      : `Premiership Semi-Final · ${match.homeSeed} v ${match.awaySeed}`;
    initPreMatchScreen(
      rosteredHome,
      rosteredAway,
      playerSide,
      0, // round is unused in playoff mode — context label overrides it
      gameEngine,
      (configuredHome, configuredAway, playerTactics) => {
        if (gameEngine) {
          const playerConfigured = playerSide === 'home' ? configuredHome : configuredAway;
          gameEngine.setPlayerTactics(playerTactics);
          gameEngine.setPlayerMatchdaySquad(extractMatchdaySquad(playerConfigured));
          saveGame(gameEngine.toSavePayload());
        }
        onPlayoffMatchStart(configuredHome, configuredAway, playerSide, match, playerTactics);
      },
      runPlayoffStage,
      { contextLabel, neutralVenue: isFinal, backLabel: 'Bracket' },
    );
    screenRouter.show('pre-match');
  }

  function onPlayoffMatchStart(
    configuredHome: RawTeamInput,
    configuredAway: RawTeamInput,
    playerSide: 'home' | 'away',
    match: PlayoffMatch,
    playerTactics: TeamTactics,
  ): void {
    const engine = new MatchCoordinator(configuredHome, configuredAway, {
      tickDelayMs: loadTickDelayMs(),
      playerTactics,
      humanSide: playerSide,
      neutralVenue: match.kind === 'final',
    });
    initSimController(engine);

    const unsub = eventBus.on('engine:finished', ({ state }) => {
      unsub();
      showPlayoffMatchResult(engine, state, match);
    });
    // Initialise BEFORE revealing #app — see onMatchStart for the rationale.
    engine.initialize();
    screenRouter.show('app');
  }

  function showPlayoffMatchResult(engine: MatchCoordinator, state: MatchState, match: PlayoffMatch): void {
    // No "next fixture" tile on the playoff result screen — the bracket
    // is the canonical "what's next" surface. Pass null so MatchResult's
    // peek tile collapses.
    initMatchResultScreen(state, 0, null, async () => {
      const snapshot = snapshotMatch(state, state.homeTeam.id, state.awayTeam.id);
      engine.destroy();
      if (gameEngine) {
        await gameEngine.recordPlayerPlayoffResult(match.kind, state.score.home, state.score.away, snapshot);
        saveGame(gameEngine.toSavePayload());
      }
      // Back into the orchestrator. State now reflects the new result;
      // the next iteration picks the right next step (next match, sim
      // pending stage, or end-of-season chain).
      runPlayoffStage();
    });
    screenRouter.show('match-result');
  }

  function onPlayRound(homeTeam: RawTeamInput, awayTeam: RawTeamInput, playerSide: 'home' | 'away', round: number): void {
    if (!gameEngine) return;
    // Source player data from the persistent career roster — team identity
    // (color, name, stadium, suggestedTactics) still comes from the JSON
    // passed in by HubScreen.
    const state = gameEngine.getState();
    // Human side comes through buildTeamFromRoster so PreMatchScreen can
    // layer the manager's curated matchdaySquad on top (with surgical
    // injury repair). AI side comes through buildAutoSelectedTeamFromRoster
    // so the opponent always fields its best 23 by OVR-per-position —
    // re-derived every match week from the current roster.
    const rosteredHome = playerSide === 'home'
      ? buildTeamFromRoster(state, homeTeam)
      : buildAutoSelectedTeamFromRoster(state, homeTeam);
    const rosteredAway = playerSide === 'away'
      ? buildTeamFromRoster(state, awayTeam)
      : buildAutoSelectedTeamFromRoster(state, awayTeam);
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

    const unsub = eventBus.on('engine:finished', ({ state }) => {
      unsub();
      showMatchResult(engine, state, round);
    });
    // Initialise BEFORE revealing #app so the scoreboard / commentary / pitch
    // panels reset on engine:initialized and repaint on the first
    // engine:stateChange while the screen is still hidden. Otherwise the user
    // sees the previous match's score / clock / commentary flash for a beat.
    engine.initialize();
    screenRouter.show('app');
  }

  function showMatchResult(engine: MatchCoordinator, state: MatchState, round: number): void {
    // Compute the player's next fixture preview (the one *after* the round
    // just played). The result hasn't been recorded yet at this point, so
    // walking the schedule for rounds > round is the cleanest source.
    const nextFixture = (() => {
      if (!gameEngine) return null;
      const gs = gameEngine.getState();
      const playerId = gs.player.teamId;
      const upcoming = gs.league.fixtures
        .filter(f => f.round > round && (f.homeId === playerId || f.awayId === playerId))
        .sort((a, b) => a.round - b.round)[0];
      if (!upcoming) return null;
      const isHome   = upcoming.homeId === playerId;
      const oppId    = isHome ? upcoming.awayId : upcoming.homeId;
      const opponent = allTeams.find(t => t.id === oppId);
      if (!opponent) return null;
      return {
        opponentName:    opponent.name,
        opponentInitial: (opponent.shortName[0] ?? '?').toUpperCase(),
        opponentColor:   opponent.color,
        isHome,
        round:           upcoming.round,
        date:            upcoming.date,
      };
    })();

    initMatchResultScreen(state, round, nextFixture, async () => {
      // Snapshot the per-player + per-team stats before destroy() tears
      // down the match state — feeds PLAYER_SEASON_STATS_ACCUMULATED and
      // TEAM_SEASON_STATS_ACCUMULATED inside recordPlayerMatchResult so the
      // league top-scorer / MVP / leaderboards / team-stat tables can
      // surface real season aggregates.
      const snapshot = snapshotMatch(state, state.homeTeam.id, state.awayTeam.id);
      engine.destroy();
      if (gameEngine) {
        await gameEngine.recordPlayerMatchResult(round, state.score.home, state.score.away, snapshot);
        saveGame(gameEngine.toSavePayload());
      }
      // Post-match nav chain. Normally: RoundResults → LeagueTable → Hub.
      // If `bracketSeededPending` was latched during
      // recordPlayerMatchResult (final regular-season fixture just
      // resolved), the chain detours through PlayoffBracketScreen →
      // playoff stages → EndOfSeason → Renewals → Signings → Rollover.
      const onLeagueContinue = (): void => {
        if (bracketSeededPending) {
          bracketSeededPending = false;
          runPlayoffStage();
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

  initHomeScreen(goTeamSelector, continueGame, goSettingsFromHome, allTeams);
  screenRouter.show('home');
});
