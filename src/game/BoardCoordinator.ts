// Board-confidence collaborator — owns the managed club's board state: seeding
// confidence + objective each season, moving confidence on the human result,
// the mid-season + end-of-season fail-state checks, and press-conference
// effects. Holds the same GameState reference GameCoordinator holds (mutations
// visible across both) plus the teamsById lookup for club ambition / name; all
// writes go through applySeasonEvent. GameCoordinator keeps thin delegating
// methods so screens keep talking to it. RNG-free.

import type { EuropeanObjective, FixtureResult, GameState } from '../types/gameState';
import type { RawTeamInput, BoardAmbition } from '../types/teamData';
import { applySeasonEvent } from './applySeasonEvent';
import { sortStandings } from './leagueTable';
import { seedConfidence, resultDelta, currentObjectiveVerdict, eosSwing, type ObjectiveVerdict } from './board';
import { recentForm, type FormResult } from './teamStats';
import { BOARD_THRESHOLDS, BOARD_EURO_ELIMINATION_DELTA, PRESS_SKIP_BOARD_PENALTY } from '../engine/balance';

export class BoardCoordinator {
  constructor(private state: GameState, private teamsById: Map<string, RawTeamInput>) {}

  // Seed the managed club's board confidence + objective for the season ahead.
  // Year 1 uses the ambition baseline; later seasons map the just-archived
  // finish onto a seed. Resets the final-warning latch each season.
  //
  // NOTE: BOARD_STATE_SEEDED rebuilds `state.player.board` wholesale, so it
  // deliberately CLEARS `europeanObjective` — a club that dropped out of Europe
  // must not carry a stale target. The fresh objective (if the club qualified)
  // is re-seeded immediately after by `seedEuropeanObjectiveAndDrawStory()` via
  // EUROPEAN_OBJECTIVE_SET. Any future caller of seedBoardState() must keep that
  // follow-up, or the European objective is lost for the season.
  seedBoardState(): void {
    const teamId = this.state.player.teamId;
    const ambition: BoardAmbition = this.teamsById.get(teamId)?.boardAmbition ?? 'playoffs';
    const prior = this.state.career.archive[this.state.career.archive.length - 1];
    applySeasonEvent(this.state, {
      type: 'BOARD_STATE_SEEDED',
      confidence: seedConfidence(ambition, prior, teamId),
      objective: ambition,
      warningIssued: false,
      sacked: false,
    });
  }

  // Move board confidence on the human result (the just-recorded fixture),
  // then evaluate the mid-season fail-state. The result is already pushed to
  // standings/results, so recentForm includes it. Also updates fan sentiment
  // and applies a board-confidence pressure when sentiment is very low.
  applyBoardResult(result: FixtureResult, expectedToWin: boolean): void {
    if (!this.state.player.board) return;
    if (result.playerSide === null) return;
    const myScore = result.playerSide === 'home' ? result.homeScore : result.awayScore;
    const oppScore = result.playerSide === 'home' ? result.awayScore : result.homeScore;
    const outcome: FormResult = myScore > oppScore ? 'W' : myScore < oppScore ? 'L' : 'D';
    const last3 = recentForm(this.state.player.teamId, this.state.league.results, 3)
      .filter((r): r is FormResult => r !== null);
    const losingStreak = last3.length === 3 && last3.every(r => r === 'L');
    applySeasonEvent(this.state, {
      type: 'BOARD_CONFIDENCE_ADJUSTED',
      delta: resultDelta(outcome, expectedToWin, losingStreak),
      reason: `result:${outcome}`,
    });

    // Fan sentiment — base delta by outcome, doubled for derby fixtures.
    const isDerby = !!this.state.league.fixtures.find(
      f => f.round === result.round && f.homeId === result.homeId && f.awayId === result.awayId && f.isDerby
    );
    const baseDelta = outcome === 'W' ? 2 : outcome === 'L' ? -2 : 1;
    let sentimentDelta = isDerby ? baseDelta * 2 : baseDelta;
    // Style-of-play bonus: +0.5 on a win with attacking/expansive tactics
    // (wide_wide style or possession game plan — same definition as the media manager).
    if (outcome === 'W' && this.state.player.tactics) {
      const t = this.state.player.tactics;
      if (t.attackingStyle === 'wide_wide' || t.attackingGamePlan === 'possession') {
        sentimentDelta += 0.5;
      }
    }
    applySeasonEvent(this.state, { type: 'FAN_SENTIMENT_UPDATED', delta: sentimentDelta });

    // Board-confidence pressure when fans are very disenchanted.
    const sentiment = this.state.player.fanSentiment ?? 50;
    if (sentiment < 30) {
      applySeasonEvent(this.state, {
        type: 'BOARD_CONFIDENCE_ADJUSTED',
        delta: -1,
        reason: 'fan_sentiment_low',
      });
    }

    this.evaluateJobSecurity();
  }

  // Mid-season fail-state: at/below the sack threshold *with* a prior warning
  // (issued in an earlier round — the check reads the latch before this round's
  // adjustment could have set it) → latch the sack via MANAGER_SACKED; otherwise
  // at/below the warning threshold → issue the one-per-season final warning.
  // The sack is persisted (not a transient flag) so a reload between this result
  // and the game-over screen can't escape it — `isManagerSacked()` re-derives
  // the routing from the saved latch on load.
  private evaluateJobSecurity(): void {
    const board = this.state.player.board;
    if (!board) return;
    if (board.confidence <= BOARD_THRESHOLDS.sack && board.warningIssued) {
      applySeasonEvent(this.state, { type: 'MANAGER_SACKED' });
    } else if (board.confidence <= BOARD_THRESHOLDS.warning && !board.warningIssued) {
      applySeasonEvent(this.state, { type: 'MANAGER_WARNED' });
    }
  }

  // True once the manager has been sacked mid-season (the persisted latch).
  // Routing reads this both in-session and on load (continue / resume paths).
  isManagerSacked(): boolean {
    return this.state.player.board?.sacked === true;
  }

  // End-of-season judgement: project the objective swing onto confidence and
  // check the season-end sack threshold. Called from the end-of-season chain
  // before rollover. Pure (no mutation): the swing is discarded at rollover
  // anyway (next season reseeds from the archived finish, not carried
  // confidence), so persisting it would have no lasting effect — and the chain
  // re-runs verbatim on a reload from the off-season (bracket crowned-but-
  // unrolled), where a persisted additive swing would double-count. The caller
  // routes to the game-over screen on `sacked`; nothing is saved before that.
  judgeSeasonObjective(): { verdict: ObjectiveVerdict; sacked: boolean } {
    const board = this.state.player.board;
    if (!board) return { verdict: 'met', sacked: false };
    const verdict = currentObjectiveVerdict(this.state, board.objective);
    const projected = Math.max(0, Math.min(100, board.confidence + eosSwing(verdict)));
    return { verdict, sacked: projected <= BOARD_THRESHOLDS.eosSack };
  }

  // Set the board's European objective for the season. Calibrated from the
  // prior season's league finish. Year 1 uses the team's boardAmbition.
  // European Shield always targets 'participate'.
  seedEuropeanObjective(competition: 'europeanCup' | 'europeanShield'): void {
    if (!this.state.player.board) return;
    let objective: EuropeanObjective;
    if (competition === 'europeanShield') {
      objective = 'participate';
    } else {
      const prior = this.state.career.archive[this.state.career.archive.length - 1];
      if (!prior) {
        const ambition: BoardAmbition = this.teamsById.get(this.state.player.teamId)?.boardAmbition ?? 'topHalf';
        objective = ambition === 'title' ? 'semifinal' : ambition === 'playoffs' ? 'r16' : 'participate';
      } else {
        // Same sort as the league table / R16 seeding (points → diff → for).
        const sorted = sortStandings([...prior.standings]);
        const rank = sorted.findIndex(s => s.teamId === this.state.player.teamId) + 1;
        objective = rank === 1 ? 'semifinal' : rank <= 4 ? 'r16' : 'participate';
      }
    }
    applySeasonEvent(this.state, { type: 'EUROPEAN_OBJECTIVE_SET', objective });
  }

  // Apply an immediate board-confidence delta when the player is eliminated from
  // a European competition. `achievedStage` is the highest round they reached
  // ('participate' = knocked out in pool stage).
  applyEuropeanElimination(competition: 'europeanCup' | 'europeanShield', achievedStage: EuropeanObjective): void {
    if (!this.state.player.board) return;
    const STAGES: EuropeanObjective[] = ['participate', 'r16', 'quarterfinal', 'semifinal', 'final', 'win'];
    const achieved = STAGES.indexOf(achievedStage);
    const objective = STAGES.indexOf(this.state.player.board.europeanObjective ?? 'participate');
    const gap = achieved - objective;
    const delta = gap >= 0 ? BOARD_EURO_ELIMINATION_DELTA.metOrExceeded
      : gap === -1 ? BOARD_EURO_ELIMINATION_DELTA.oneStageShort
      : BOARD_EURO_ELIMINATION_DELTA.furtherShort;
    applySeasonEvent(this.state, {
      type: 'BOARD_CONFIDENCE_ADJUSTED',
      delta,
      reason: `european:${competition}:${achievedStage}`,
    });
    this.evaluateJobSecurity();
  }

  // Apply the outcome of a press conference. `skipped = true` applies the
  // board penalty and publishes a stub story. Otherwise `answers` contains
  // one boardDelta+moraleDelta pair per question answered.
  applyPressEffects(skipped: boolean, answers: Array<{ boardDelta: number; moraleDelta: number }>): void {
    const teamId = this.state.player.teamId;
    const lastResult = [...this.state.league.results].reverse()
      .find(r => r.homeId === teamId || r.awayId === teamId);
    const round = lastResult?.round ?? 0;
    const clubName = this.teamsById.get(teamId)?.name ?? 'the club';

    if (skipped) {
      applySeasonEvent(this.state, {
        type: 'BOARD_CONFIDENCE_ADJUSTED',
        delta: PRESS_SKIP_BOARD_PENALTY,
        reason: 'press:skip',
      });
      applySeasonEvent(this.state, {
        type: 'MEDIA_STORY_PUBLISHED',
        story: {
          id: `media:press:skip:${round}`,
          round,
          subject: `${clubName} manager silent after match`,
          body: `The ${clubName} manager declined to face the press, sparking further questions about the mood inside the camp. The board is said to be displeased by the decision.`,
          outlet: 'RugbyInsider',
        },
      });
      return;
    }

    const totalBoardDelta = answers.reduce((sum, a) => sum + a.boardDelta, 0);
    if (totalBoardDelta !== 0) {
      applySeasonEvent(this.state, {
        type: 'BOARD_CONFIDENCE_ADJUSTED',
        delta: totalBoardDelta,
        reason: 'press:answers',
      });
    }

    const totalMoraleDelta = answers.reduce((sum, a) => sum + a.moraleDelta, 0);
    if (totalMoraleDelta !== 0) {
      const club = this.state.career.clubs.find(c => c.id === teamId);
      if (club) {
        for (const rId of club.squad) {
          applySeasonEvent(this.state, {
            type: 'PLAYER_MORALE_ADJUSTED',
            rosterId: rId,
            delta: totalMoraleDelta,
            reason: 'press:answers',
          });
        }
      }
    }
  }
}
