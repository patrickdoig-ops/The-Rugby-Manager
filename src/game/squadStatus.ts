// Squad status inference and resolution helpers.
//
// resolveSquadStatus is the canonical accessor — call this everywhere
// morale, wages, and renewal logic need a player's status. The explicit
// player.squadStatus (manager-set) takes priority; when absent the status
// is inferred from OVR rank within the club's squad (top-2 → star, etc.).

import type { Player, SquadStatusKey } from '../types/player';
import { playerOverall } from '../engine/RatingEngine';

// Infer status from OVR rank among club squad members. Counts how many
// other players in the squad have strictly higher OVR — that is the
// player's 0-based rank. Ties are resolved by both tied players getting
// the same rank (conservative: both may be inferred as star).
export function inferSquadStatus(
  player: Player,
  clubSquad: number[],
  roster: Record<number, Player>,
): SquadStatusKey {
  const myOvr = playerOverall(player.baseStats, player.position);
  let rank = 0;
  for (const rid of clubSquad) {
    if (rid === player.rosterId) continue;
    const other = roster[rid];
    if (!other) continue;
    if (playerOverall(other.baseStats, other.position) > myOvr) rank++;
  }
  if (rank < 2)  return 'star';
  if (rank < 15) return 'firstTeam';
  if (rank < 23) return 'impact';
  return 'squad';
}

// Canonical status accessor. Returns the manager-assigned status when
// present, otherwise falls back to OVR-rank inference.
export function resolveSquadStatus(
  player: Player,
  clubSquad: number[],
  roster: Record<number, Player>,
): SquadStatusKey {
  return player.squadStatus ?? inferSquadStatus(player, clubSquad, roster);
}

// Human-readable label for each status key.
export const SQUAD_STATUS_LABEL: Record<SquadStatusKey, string> = {
  star:      'Star Player',
  firstTeam: 'First-Team Regular',
  impact:    'Impact Player',
  squad:     'Squad Player',
  backup:    'Backup',
};

// Short label (used in squad management chip).
export const SQUAD_STATUS_SHORT: Record<SquadStatusKey, string> = {
  star:      '★ STAR',
  firstTeam: '1ST',
  impact:    'IMP',
  squad:     'SQD',
  backup:    'BKP',
};

// Sub-label shown below the status on the profile card.
export const SQUAD_STATUS_SUB: Record<SquadStatusKey, string> = {
  star:      'Expected to feature in nearly every match',
  firstTeam: 'Expected to start regularly',
  impact:    'Primarily a bench or rotation option',
  squad:     'Occasional rotation and cover',
  backup:    'Cover for injuries and unavailability only',
};

// Ordered from lowest to highest for tier comparison.
export const SQUAD_STATUS_ORDER: SquadStatusKey[] = ['backup', 'squad', 'impact', 'firstTeam', 'star'];
