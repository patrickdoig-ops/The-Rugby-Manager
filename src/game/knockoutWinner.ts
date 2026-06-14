// Resolves the advancing side's teamId from a knockout result, shared by every
// bracket cascade (playoff / Prem Cup / European) and the bracket UI screens.
//
// The score decides it normally; if extra time finished level, the kicking-
// competition winner (`kickWinner`) does. Knockout matches are played with
// extra time, so a genuine draw is impossible — there is no home-side tiebreak.
// A level score with no `kickWinner` can only be an unresolved or legacy
// record; it resolves to the home side defensively (unreachable for any match
// that actually played extra time).
export function knockoutWinnerId(
  homeId: string,
  awayId: string,
  homeScore: number,
  awayScore: number,
  kickWinner?: 'home' | 'away',
): string {
  if (homeScore > awayScore) return homeId;
  if (awayScore > homeScore) return awayId;
  return kickWinner === 'away' ? awayId : homeId;
}
