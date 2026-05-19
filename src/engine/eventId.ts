let _eventCounter = 0;

export function makeId(): string {
  return `evt_${++_eventCounter}`;
}
