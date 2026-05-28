// The match presenter: a beat buffer drained at a single steady cadence.
//
// The engine emits one event per phase resolution, but a single tick can
// produce several (kick-off announce + kick resolution, penalty + card +
// lineout award, etc). Rather than firing them all in one visual burst, each
// is enqueued as a Beat (event + display snapshot) and the presenter drains
// the buffer at a steady, floored gap.
//
// Cadence: per beat the gap targets `tickDelayMs / bufferDepth` clamped to
// `[minGap, tickDelayMs]`, where `minGap = tickDelayMs × minGapFraction`. So
// a quiet 1-beat tick shows its line at the tick rate; a multi-beat burst
// drains faster but never tighter than the floor, and any overflow is NOT
// reset per tick — it carries forward into the next (likely quieter) tick's
// idle window. Deeper buffer → smaller gap (down to the floor) → faster
// catch-up, so the backlog stays bounded without the engine running ahead of
// the feed. (When step 4 decouples the producer from the tick timer, this
// same buffer is what it fills ahead; today the producer still drives one
// tick per tickDelayMs, so cadence stays in lockstep with production.)
//
// Each beat carries a DisplaySnapshot captured at production time (the world
// frame — score, clock, ball, possession, cards). On drain we emit
// `engine:event` followed by `engine:stateChange` carrying that snapshot
// alongside the live state reference, preserving the event-before-state
// contract. Panels that read the snapshot (Scoreboard, PitchStrip) track the
// line being narrated rather than the live state; StatsPanel still reads the
// live state for its per-player tables.
//
// Silent mode (headless AI fixtures, determinism harness, telemetry)
// bypasses the presenter entirely — the engine's existing `if (silent)
// return` guards in each emit site already gate this; the presenter adds
// its own check as a safety net.

import { eventBus } from '../utils/eventBus';
import type { GameEvent, MatchState, Beat } from '../types/match';
import { buildDisplaySnapshot } from './displaySnapshot';
import { COMMENTARY_PACING } from './balance';

export class CommentaryStreamer {
  private buffer: Beat[] = [];
  private drainTimer: ReturnType<typeof setTimeout> | null = null;
  // Absolute timestamp at which the currently-scheduled drain would fire.
  // Used by pause() to compute how much time remains so resume() can pick up
  // the same beat.
  private drainTimerFiresAt = 0;
  // Live tickDelayMs, refreshed on every flush — the basis for the cadence.
  private tickDelayMs = 0;
  private liveState: MatchState | null = null;
  private drainResolvers: Array<() => void> = [];
  private readonly silent: boolean;
  // Live MatchState reference (stable for the match lifetime — assigned once
  // in MatchCoordinator's constructor, never reassigned). Read at enqueue
  // time to snapshot the world frame for each beat.
  private readonly state: MatchState;
  private paused = false;
  private pauseRemainingMs = 0;

  constructor(silent: boolean, state: MatchState) {
    this.silent = silent;
    this.state = state;
  }

  enqueue(event: GameEvent): void {
    if (this.silent) return;
    // Snapshot the display frame NOW (production time) so the paced drain
    // emits the world-state as it was when this event happened, not the live
    // state — which, once the producer runs ahead of the presenter, is
    // further along than the line being narrated.
    this.buffer.push({ event, display: buildDisplaySnapshot(this.state) });
  }

  // Starts (or continues) draining the buffer. Returns a promise that resolves
  // when the buffer empties — await before opening a modal so the user reads
  // the commentary that led to it. For the background drain at end-of-tick,
  // don't await; the presenter paces in the background and the next tick has
  // tickDelayMs to absorb it. If a drain is already in flight, this just
  // refreshes tickDelayMs / liveState and lets the running loop pick up the
  // newly-enqueued beats (overflow carries forward rather than resetting).
  flush(tickDelayMs: number, state: MatchState): Promise<void> {
    if (this.silent || this.buffer.length === 0) return Promise.resolve();
    this.tickDelayMs = tickDelayMs;
    this.liveState = state;
    const p = new Promise<void>(resolve => { this.drainResolvers.push(resolve); });
    // Kick the loop only when idle — a running drain already covers the new
    // beats, and a fresh first beat fires immediately (no leading gap).
    if (this.drainTimer === null && !this.paused) this.drainOne();
    return p;
  }

  // Pause: stop the drain timer, remember how long until the next beat would
  // have fired so resume() can pick up the same beat.
  pause(): void {
    if (this.silent || !this.drainTimer) return;
    this.paused = true;
    clearTimeout(this.drainTimer);
    this.drainTimer = null;
    this.pauseRemainingMs = Math.max(0, this.drainTimerFiresAt - Date.now());
  }

  resume(): void {
    if (this.silent || !this.paused) return;
    this.paused = false;
    if (this.buffer.length === 0) return;
    this.scheduleNext(this.pauseRemainingMs);
  }

  // Wipe buffered beats and pending timers. Called on new match init so beats
  // from a prior match don't leak into the next.
  clear(): void {
    if (this.drainTimer) {
      clearTimeout(this.drainTimer);
      this.drainTimer = null;
    }
    this.buffer = [];
    this.drainResolvers.splice(0);
    this.liveState = null;
    this.paused = false;
  }

  private drainOne(): void {
    this.drainTimer = null;
    if (this.buffer.length === 0) {
      this.resolveDrain();
      return;
    }
    const { event, display } = this.buffer.shift()!;
    eventBus.emit('engine:event', { event });
    if (this.liveState) eventBus.emit('engine:stateChange', { state: this.liveState, display });
    if (this.buffer.length === 0) {
      this.resolveDrain();
      return;
    }
    this.scheduleNext(this.nextGap());
  }

  // Steady, floored gap to the next beat: tickDelayMs / remainingDepth, clamped
  // to [minGap, tickDelayMs]. A lone remaining beat dwells ~one tick (matching
  // the production rate); a deep backlog drains at the floor and carries any
  // remainder into the next tick.
  private nextGap(): number {
    const minGap = this.tickDelayMs * COMMENTARY_PACING.minGapFraction;
    const gap = this.tickDelayMs / this.buffer.length;
    return Math.max(minGap, Math.min(this.tickDelayMs, gap));
  }

  private scheduleNext(delay: number): void {
    if (this.paused) return;
    this.drainTimerFiresAt = Date.now() + delay;
    this.drainTimer = setTimeout(() => this.drainOne(), delay);
  }

  private resolveDrain(): void {
    const resolvers = this.drainResolvers.splice(0);
    for (const r of resolvers) r();
  }
}
