// KickAtGoal micro-phase resolver. Mirrors CardHandler ownership pattern:
// owned by MatchCoordinator, called once per tick when state.phase ===
// MatchPhase.KickAtGoal. Resolves the deferred goal kick (conversion or
// penalty), emits a 2-step `[kicker_compose, success | miss | kick_for_goal]`
// commentary event that CommentaryFeed stagger-reveals, applies the score
// mutation, and transitions phase out to KickOff.
//
// Why a separate handler vs inlining in MatchCoordinator: keeps the tick loop
// thin and groups the kick-resolution side-effects (score event, possession
// swap, ball reposition, phase transition) behind a single advance() call,
// the same shape as CardHandler.advanceTmoReview().

import type { MatchState, GameEvent } from '../types/match';
import type { NarrationStep } from '../types/narration';
import type { PossessionSide } from '../types/engine';
import { MatchPhase } from '../types/engine';
import { makeId } from './eventId';
import { applyMatchEvent } from './applyMatchEvent';
import { resolveGoalKick } from './resolvers/KickingResolver';
import { ownTwentyTwoX } from './FieldPosition';
import type { CommentaryStreamer } from './CommentaryStreamer';

export interface KickAtGoalHandlerDeps {
  state: MatchState;
  silent: boolean;
  streamer: CommentaryStreamer;
}

export class KickAtGoalHandler {
  constructor(private deps: KickAtGoalHandlerDeps) {}

  // Called once per tick when state.phase === MatchPhase.KickAtGoal.
  // Resolves the goal kick that the entry handler deferred, emits the
  // compose + result beats around the score mutation, applies all mutations,
  // and transitions to KickOff.
  advance(): void {
    const { state, silent } = this.deps;
    const kag = state.kickAtGoal;
    if (!kag) return;

    const side: PossessionSide = state.possession;
    const teamName = (side === 'home' ? state.homeTeam : state.awayTeam).name;
    const res = resolveGoalKick(kag.kicker, kag.distFromPosts);

    // The phase_outcome step's `phase` is the semantic phase the result
    // belongs to (ConversionKick or Penalty), NOT KickAtGoal — that's how
    // CommentaryRenderer looks up the template bank. The GameEvent's outer
    // phase field is set the same so feed entry styling (event-conversion /
    // event-penalty) is unchanged.
    const semanticPhase = kag.kind === 'conversion' ? MatchPhase.ConversionKick : MatchPhase.Penalty;
    const resultKey = kag.kind === 'conversion'
      ? (res.success ? 'success' : 'miss')
      : (res.success ? 'kick_for_goal' : 'miss');

    const makeBeat = (steps: NarrationStep[]): GameEvent => ({
      id: makeId(),
      gameMinute: state.clock.gameMinute,
      phase: semanticPhase,
      side,
      sideName: teamName,
      primaryPlayer: kag.kicker,
      ballX: state.ball.x,
      ballY: state.ball.y,
      narration: { steps },
    });

    // The compose line and the result line are TWO beats with the score
    // mutation between them. The display snapshot is captured at enqueue time
    // (CommentaryStreamer.enqueue), so the compose beat — enqueued before the
    // score event — shows the pre-kick score, and the result beat shows the
    // new score. Were both lines one beat, the single per-beat snapshot would
    // carry the new score onto the "lines it up…" line, ticking the scoreboard
    // a full lineGap before "…it's there!" was read (and pre-revealing
    // make/miss). The two beats still drain one lineGap apart, so the visible
    // pacing is unchanged.
    const composeEvent = makeBeat([{ kind: 'announcement', key: 'kicker_compose', primary: kag.kicker }]);
    applyMatchEvent(state, { type: 'COMMENTARY_LOGGED', event: composeEvent });
    if (!silent) this.deps.streamer.enqueue(composeEvent);

    // Score event (conversion vs penalty goal — two separate MatchEvent
    // variants today; reducers handle the score increment + stats).
    if (kag.kind === 'conversion') {
      applyMatchEvent(state, { type: 'CONVERSION_KICKED', kicker: kag.kicker, side, success: res.success });
    } else {
      applyMatchEvent(state, { type: 'PENALTY_GOAL_KICKED', kicker: kag.kicker, side, success: res.success });
    }
    applyMatchEvent(state, { type: 'RATINGS_RECALCULATED' });

    const resultEvent = makeBeat([{ kind: 'phase_outcome', phase: semanticPhase, key: resultKey, primary: kag.kicker }]);
    applyMatchEvent(state, { type: 'COMMENTARY_LOGGED', event: resultEvent });
    if (!silent) this.deps.streamer.enqueue(resultEvent);

    // Restart play. Missed penalty → defending team takes a 22 drop-out from
    // their own 22 (World Rugby rule). Everything else (successful penalty,
    // either conversion outcome) → halfway kick-off restart, same as before.
    applyMatchEvent(state, { type: 'POSSESSION_SWAPPED' });
    if (kag.kind === 'penalty' && !res.success) {
      applyMatchEvent(state, { type: 'BALL_REPOSITIONED', x: ownTwentyTwoX(state), y: 50 });
      applyMatchEvent(state, { type: 'KICK_AT_GOAL_RESOLVED' });
      applyMatchEvent(state, { type: 'PHASE_CHANGED', phase: MatchPhase.DropOut22 });
    } else {
      applyMatchEvent(state, { type: 'BALL_REPOSITIONED', x: 50, y: 50 });
      applyMatchEvent(state, { type: 'KICK_AT_GOAL_RESOLVED' });
      applyMatchEvent(state, { type: 'PHASE_CHANGED', phase: MatchPhase.KickOff });
    }
  }
}
