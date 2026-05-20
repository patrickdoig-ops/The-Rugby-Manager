let _eventCounter = 0;

export function makeId(): string {
  return `evt_${++_eventCounter}`;
}

// Called once per match in MatchCoordinator's constructor so event IDs
// restart from evt_1 for each match.
export function resetEventCounter(): void {
  _eventCounter = 0;
}
