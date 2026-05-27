import { MatchPhase } from '../types/engine';

export function phaseClass(phase: MatchPhase): string {
  switch (phase) {
    case MatchPhase.TryScored:
    case MatchPhase.ConversionKick:   return 'phase-try';
    case MatchPhase.Penalty:          return 'phase-penalty';
    case MatchPhase.Scrum:            return 'phase-scrum';
    case MatchPhase.Maul:             return 'phase-maul';
    case MatchPhase.Lineout:
    case MatchPhase.BoxKick:
    case MatchPhase.TacticalKick:
    case MatchPhase.KickOff:
    case MatchPhase.DropOut22:        return 'phase-kick';
    case MatchPhase.HalfTime:
    case MatchPhase.FullTime:         return 'phase-terminal';
    default:                          return '';
  }
}
