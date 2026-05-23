import { MatchPhase } from '../types/engine';

export function phaseClass(phase: MatchPhase): string {
  switch (phase) {
    case MatchPhase.TryScored:
    case MatchPhase.ConversionKick:   return 'phase-try';
    case MatchPhase.Penalty:          return 'phase-penalty';
    case MatchPhase.Scrum:            return 'phase-scrum';
    case MatchPhase.Lineout:
    case MatchPhase.BoxKick:
    case MatchPhase.TacticalKick:
    case MatchPhase.KickOff:          return 'phase-kick';
    case MatchPhase.HalfTime:
    case MatchPhase.FullTime:         return 'phase-terminal';
    default:                          return '';
  }
}
