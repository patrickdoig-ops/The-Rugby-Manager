// Position grouping shared by SquadManagementScreen (filter chips) and
// SquadOverviewScreen (depth chart). Single source of truth for how the
// 12 generic engine positions roll up into the 9 user-facing groups —
// loose forwards combined (Flanker / Number 8 / Back Row are
// interchangeable across jerseys 6-8), Utility Back rolls into Centres.
// The "all" filter id is for the SquadManagement chip row and isn't
// referenced by the depth chart.

import type { Position } from '../types/player';

export type PositionGroupId =
  | 'all' | 'props' | 'hooker' | 'locks' | 'looseforwards'
  | 'scrumhalves' | 'flyhalves' | 'centres' | 'wings' | 'fullbacks';

export interface PositionGroupSpec {
  id: PositionGroupId;
  label: string;
}

// Canonical display order — pack first (1 → 8), then halves, then back-three.
export const POSITION_GROUPS_ORDER: PositionGroupSpec[] = [
  { id: 'all',           label: 'All' },
  { id: 'props',         label: 'Props' },
  { id: 'hooker',        label: 'Hooker' },
  { id: 'locks',         label: 'Locks' },
  { id: 'looseforwards', label: 'Loose Forwards' },
  { id: 'scrumhalves',   label: 'Scrum Halves' },
  { id: 'flyhalves',     label: 'Fly Halves' },
  { id: 'centres',       label: 'Centres' },
  { id: 'wings',         label: 'Wings' },
  { id: 'fullbacks',     label: 'Full Backs' },
];

export const POSITION_TO_GROUP: Record<Position, PositionGroupId> = {
  'Prop':          'props',
  'Hooker':        'hooker',
  'Lock':          'locks',
  'Flanker':       'looseforwards',
  'Number 8':      'looseforwards',
  'Back Row':      'looseforwards',
  'Scrum-Half':    'scrumhalves',
  'Fly-Half':      'flyhalves',
  'Centre':        'centres',
  'Wing':          'wings',
  'Fullback':      'fullbacks',
  'Utility Back':  'centres',
};
