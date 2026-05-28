import type { Player } from '../types/player';

type NamedPlayer = Pick<Player, 'firstName' | 'lastName'>;

// Roster/bench display: "F. Lastname". Disambiguates league sibling pairs
// (Chessum / Curry / Roots / du Preez / Smith etc.) that would otherwise render
// as identical lastName-only strings.
export function shortName(p: NamedPlayer): string {
  const initial = p.firstName?.[0] ?? '';
  return initial ? `${initial}. ${p.lastName}` : p.lastName;
}
