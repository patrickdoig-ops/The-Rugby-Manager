import { MatchPhase } from '../types/engine';

type TransitionMap = Partial<Record<MatchPhase, MatchPhase[]>>;

const VALID_TRANSITIONS: TransitionMap = {
  [MatchPhase.KickOff]:        [MatchPhase.KickReturn, MatchPhase.Scrum],
  [MatchPhase.PhasePlay]:      [MatchPhase.Breakdown, MatchPhase.TacticalKick, MatchPhase.TryScored, MatchPhase.Penalty, MatchPhase.HalfTime, MatchPhase.FullTime, MatchPhase.Scrum],
  [MatchPhase.FirstPhase]:     [MatchPhase.Breakdown, MatchPhase.TacticalKick, MatchPhase.TryScored, MatchPhase.Penalty, MatchPhase.HalfTime, MatchPhase.FullTime, MatchPhase.Scrum],
  [MatchPhase.KickReturn]:     [MatchPhase.Breakdown, MatchPhase.TacticalKick, MatchPhase.TryScored, MatchPhase.Penalty, MatchPhase.HalfTime, MatchPhase.FullTime, MatchPhase.Scrum],
  [MatchPhase.Breakdown]:      [MatchPhase.PhasePlay, MatchPhase.Scrum, MatchPhase.Lineout, MatchPhase.Penalty, MatchPhase.BoxKick],
  [MatchPhase.BoxKick]:        [MatchPhase.KickReturn, MatchPhase.Scrum],
  [MatchPhase.Scrum]:          [MatchPhase.FirstPhase, MatchPhase.Penalty, MatchPhase.Scrum],
  [MatchPhase.Lineout]:        [MatchPhase.FirstPhase, MatchPhase.Scrum],
  [MatchPhase.TacticalKick]:   [MatchPhase.KickReturn, MatchPhase.Lineout, MatchPhase.Scrum],
  [MatchPhase.Penalty]:        [MatchPhase.Lineout, MatchPhase.FirstPhase, MatchPhase.KickOff],
  [MatchPhase.TryScored]:      [MatchPhase.ConversionKick],
  [MatchPhase.ConversionKick]: [MatchPhase.KickOff],
  [MatchPhase.HalfTime]:       [MatchPhase.KickOff],
  [MatchPhase.FullTime]:       [],
};

export class StateMachine {
  private _current: MatchPhase;

  constructor(initial: MatchPhase = MatchPhase.KickOff) {
    this._current = initial;
  }

  get current(): MatchPhase {
    return this._current;
  }

  canTransitionTo(next: MatchPhase): boolean {
    return VALID_TRANSITIONS[this._current]?.includes(next) ?? false;
  }

  transition(next: MatchPhase): void {
    if (!this.canTransitionTo(next)) {
      throw new Error(`Invalid transition: ${this._current} → ${next}`);
    }
    this._current = next;
  }

  forceTransition(next: MatchPhase): void {
    this._current = next;
  }
}
